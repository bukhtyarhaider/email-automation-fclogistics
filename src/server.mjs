import http from "node:http";
import fs from "node:fs/promises";
import { unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
import { MailBrowser } from "./browser.mjs";
import {
  templates,
  render,
  reason,
  assess,
  EMAIL,
  pickTemplate,
} from "./core.mjs";
import { deliver } from "./delivery.mjs";
import { upgrade, validateSettings, DEFAULTS } from "./config.mjs";
import { quota, nextPause } from "./pacing.mjs";
import { TeamClient } from "./team.mjs";
import { initTracking, createRecord, syncRecord, addEvent, report, safeRecord, seedConfig, recordPlacement, hash } from "./tracking.mjs";
import { MailboxMonitor } from "./mailbox-monitor.mjs";
import { startPixelServer } from "./pixel-server.mjs";
import { domainHealth } from "./domain-health.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA = path.resolve(process.env.FC_DATA_DIR || path.join(ROOT, "data"));
const PORT = Number(process.env.PORT || 4317);
const mail = new MailBrowser();
await fs.mkdir(DATA, { recursive: true, mode: 0o700 });
await fs.chmod(DATA, 0o700);
const lockPath = path.join(DATA, "app.lock");
async function lock() {
  try {
    const h = await fs.open(lockPath, "wx", 0o600);
    await h.writeFile(String(process.pid));
    await h.close();
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const pid = Number(await fs.readFile(lockPath, "utf8"));
    try {
      process.kill(pid, 0);
      throw new Error("Another instance is using this data folder.");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
      await fs.unlink(lockPath);
      return lock();
    }
  }
}
await lock();
process.once("exit", () => {
  try {
    unlinkSync(lockPath);
  } catch {}
});
const storePath = path.join(DATA, "state.json");
let state;
try {
  state = JSON.parse(await fs.readFile(storePath, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT")
    throw new Error("Cannot read saved state. Restore state.json from backup.");
  state = {};
}
const oldVersion = state.version;
upgrade(state);
initTracking(state);
// Keep existing edited templates. New installations contain no customer-specific data.
state.templates = !state.templates
  ? structuredClone(templates)
  : oldVersion !== 2
    ? { ...structuredClone(templates), ...state.templates }
    : state.templates;
if (state.templateSchema !== 2) {
  const b = state.settings.business;
  for (const t of Object.values(state.templates)) {
    for (const prefix of ["with", "at"])
      if (b.senderName && b.company)
        t.body = t.body.replaceAll(
          `I’m ${b.senderName} ${prefix} ${b.company}`,
          `I’m {{senderName}} ${prefix} {{businessName}}`,
        );
    if (b.legalName) t.body = t.body.replaceAll(b.legalName, "{{legalName}}");
    if (b.address) t.body = t.body.replaceAll(b.address, "{{address}}");
    if (b.services) t.body = t.body.replaceAll(b.services, "{{services}}");
  }
  state.templateSchema = 2;
}
for (const t of Object.values(state.templates)) {
  t.enabled ??= true;
  t.weight ??= 1;
  t.requiredFields ??= [];
}
const campaignData = new Map();
let campaignRevision = 0;
let busy = false,
  prepared = null,
  loopActive = false,
  shuttingDown = false;
const team = new TeamClient(() => state.settings.team);
let teamSnapshot = { records: {}, suppression: {} };
let persistTail = Promise.resolve();
function persist() {
  const content = JSON.stringify(state, null, 2);
  const run = async () => {
    const tmp = `${storePath}.tmp`;
    const h = await fs.open(tmp, "w", 0o600);
    try {
      await h.writeFile(content);
      await h.sync();
    } finally {
      await h.close();
    }
    await fs.rename(tmp, storePath);
    if (process.platform !== "win32") {
      const d = await fs.open(DATA, "r");
      try {
        await d.sync();
      } finally {
        await d.close();
      }
    }
  };
  persistTail = persistTail.then(run, run);
  return persistTail;
}
const monitor = new MailboxMonitor({ state, persist });
function track(item) {
  let record = state.tracking.records[item.trackingId];
  if (!record) record = createRecord(state.tracking, { to: item.recipient, subject: item.subject }, {
    id: item.trackingId, sender: item.accountEmail, campaignId: item.campaignId,
  }).record;
  syncRecord(record, item);
}
async function prepareTracked(message, campaignId) {
  let result;
  try {
    result = createRecord(state.tracking, message, { sender: profile().email, campaignId }, {
      openEnabled: process.env.FC_OPEN_TRACKING_ENABLED === "1",
      consent: process.env.FC_OPEN_TRACKING_CONSENT === "1", publicUrl: process.env.FC_TRACKING_PUBLIC_URL,
    });
  } catch {
    result = createRecord(state.tracking, message, { sender: profile().email, campaignId });
    state.tracking.worker.pixel = { status: "Needs configuration", message: "Open tracking skipped: configure a public HTTPS URL" };
  }
  message.trackingId = result.record.id;
  if (result.pixelUrl) message.pixelUrl = result.pixelUrl;
  await persist();
  try { return await mail.prepare(message); }
  catch (error) {
    result.record.sendStatus = "send_failed";
    result.record.error = "Composer preparation failed before submission";
    addEvent(result.record, "send_failed");
    await persist();
    throw error;
  }
}
function event(message, details = {}) {
  state.events.push({ at: new Date().toISOString(), message, ...details });
  if (state.events.length > 5000) state.events = state.events.slice(-5000);
}
function python(command, filename, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.env.FC_PYTHON ||
        (process.platform === "win32" ? "python" : "python3"),
      [path.join(ROOT, "src/workbook.py"), command, filename],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "",
      err = "";
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (err += b));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0)
        return reject(new Error(err.trim() || "Workbook processing failed."));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error("Invalid workbook response."));
      }
    });
    child.stdin.end(input ? JSON.stringify(input) : "");
  });
}
function activeCampaign() {
  return state.campaigns.find((c) => c.id === state.activeCampaign);
}
function profile() {
  return state.profiles.find((p) => p.id === state.activeProfile);
}
function business() {
  return profile()?.business || state.settings.business;
}
function activeData() {
  return campaignData.get(state.activeCampaign) || { sheets: [], leads: [] };
}
function selectCampaign(id) {
  const c = state.campaigns.find((c) => c.id === id);
  if (!c) throw new Error("Campaign not found.");
  state.activeCampaign = id;
  state.workbook = c.workbook;
}
async function reload(c = activeCampaign()) {
  if (!c) return;
  const parsed = await python(
    "read",
    path.join(DATA, c.workbook.file),
    c.mapping || {},
  );
  for (const l of parsed.leads) {
    l.hidden = parsed.sheets.find((s) => s.part === l.part)?.hidden;
    l.campaignId = c.id;
  }
  campaignData.set(c.id, parsed);
  campaignRevision++;
}
for (const c of state.campaigns) await reload(c);
if (state.automation.enabled) {
  state.automation.status = "Waiting for mailbox";
  state.automation.message =
    "Reconnect your mailbox to resume the saved queue.";
}
if (oldVersion !== 2)
  event(
    "Workspace upgraded. Existing sends and suppression records preserved.",
  );
await persist();
let seededTeamUrl = null;
async function syncTeam() {
  if (state.settings.team.enabled) {
    const seedSignature = `${state.settings.team.url}:${Object.keys(state.history).length}:${campaignRevision}`;
    if (seededTeamUrl !== seedSignature) {
      const records = Object.fromEntries(
        Object.entries(state.history).map(([email, r]) => [
          email,
          {
            status: r.status,
            at: r.at,
            accountEmail: r.accountEmail || profile()?.email,
          },
        ]),
      );
      const suppression = { ...state.suppression };
      for (const dataset of campaignData.values())
        for (const lead of dataset.leads) {
          const notes = `${lead.status} ${lead.fields["historical notes"] || ""}`;
          if (
            /unsubscribe|remove|do not contact|opt.?out|declined|not interested|bounc/i.test(
              notes,
            )
          )
            suppression[lead.email] = "Workbook opt-out / declined / bounce";
          else if (
            /sent|email send|proposal|follow.?up|replied|interested|client|onboard|uncertain/i.test(
              notes,
            )
          )
            suppression[lead.email] ||=
              "Previously contacted or uncertain in workbook";
        }
      await team.call("seed", {
        records,
        suppression,
        workerId: state.workerId,
      });
      seededTeamUrl = seedSignature;
    }
    teamSnapshot = await team.call("snapshot");
  } else {
    teamSnapshot = { records: {}, suppression: {} };
    seededTeamUrl = null;
  }
}
function candidates(campaignId = state.activeCampaign) {
  const data = campaignData.get(campaignId) || { leads: [] },
    c = state.campaigns.find((c) => c.id === campaignId);
  const globalState = {
    ...state,
    suppression: { ...state.suppression, ...teamSnapshot.suppression },
    history: { ...teamSnapshot.records, ...state.history },
  };
  for (const dataset of campaignData.values())
    for (const l of dataset.leads) {
      const notes = `${l.status} ${l.fields["historical notes"] || ""}`;
      if (
        /unsubscribe|remove|do not contact|opt.?out|declined|not interested|bounc/i.test(
          notes,
        )
      )
        globalState.suppression[l.email] =
          "Workbook opt-out / declined / bounce";
      else if (
        /sent|email send|proposal|follow.?up|replied|interested|client|onboard/i.test(
          notes,
        )
      )
        globalState.suppression[l.email] ||= "Previously contacted in workbook";
    }
  const seen = new Set();
  return data.leads.map((l) => ({
    ...l,
    blocked:
      c?.sheets?.length && !c.sheets.includes(l.sheet)
        ? "Worksheet not selected for this campaign"
        : reason(l, globalState, seen),
    lastAttempt:
      state.history[l.email] || teamSnapshot.records[l.email] || null,
  }));
}
function eligible(id, campaignId = state.activeCampaign) {
  const l = candidates(campaignId).find((x) => x.id === id);
  if (!l) throw new Error("Lead not found.");
  if (l.blocked) throw new Error(l.blocked);
  return l;
}
function template(key) {
  if (!state.templates[key]) throw new Error("Template not found.");
  return state.templates[key];
}
function currentQuota() {
  return quota({ ...state.history, ...Object.fromEntries(Object.entries(state.seedHistory).map(([id, h]) => [`seed:${id}`, h])) }, profile()?.email, state.settings.pacing);
}
function checkBusiness() {
  for (const key of [
    "company",
    "senderName",
    "legalName",
    "address",
    "services",
  ])
    if (!business()[key]?.trim())
      throw new Error(
        `Complete your mailbox profile’s business ${key} before sending.`,
      );
}
async function syncStatus(lead, status, campaignId = lead.campaignId) {
  const c = state.campaigns.find((c) => c.id === campaignId);
  if (!c) throw new Error("Original campaign is unavailable.");
  await python("patch", path.join(DATA, c.workbook.file), {
    changes: [{ id: lead.id, email: lead.email, status }],
    mapping: c.mapping || {},
  });
  const l = campaignData.get(c.id)?.leads.find((x) => x.id === lead.id);
  if (l) l.status = status;
}
async function sendPrepared() {
  if (!prepared) throw new Error("Prepare a message first.");
  checkBusiness();
  const p = prepared,
    lead = eligible(p.id, p.campaignId),
    account = profile();
  if (currentQuota().waitMs)
    throw new Error("Mailbox sending allowance reached.");
  await mail.validate();
  let reservation = null;
  if (state.settings.team.enabled) {
    const claim = await team.call("claim", {
      email: lead.email,
      workerId: state.workerId,
      workerName: state.settings.team.workerName,
      accountEmail: account.email,
      campaignId: lead.campaignId,
      templateKey: p.key,
      subject: p.message.subject,
    });
    if (claim.blocked || claim.waitMs) {
      const error = new Error(
        claim.blocked || "Waiting for shared mailbox pacing.",
      );
      error.deferSeconds = claim.waitMs
        ? Math.ceil(claim.waitMs / 1000) + 1
        : state.settings.pacing.pollSeconds;
      throw error;
    }
    reservation = claim.token;
  }
  const c = state.campaigns.find((c) => c.id === lead.campaignId);
  const afterOutcome = reservation
    ? async (item) => {
        await team.call("finish", {
          email: lead.email,
          workerId: state.workerId,
          token: reservation,
          status: item.status,
          evidence: item.evidence,
        });
        item.teamSyncNeeded = false;
      }
    : undefined;
  try {
    await deliver({
      state: { history: state.history, workbook: c.workbook },
      lead,
      message: p.message,
      persist,
      send: () => mail.send(),
      syncStatus,
      event,
      onConfirmed: () => {
        prepared = null;
      },
      sentStatus: state.settings.eligibility.sentStatus,
      tracking: track,
      metadata: {
        trackingId: p.message.trackingId,
        recipient: lead.email,
        accountEmail: account.email,
        profileId: account.id,
        campaignId: c.id,
        campaignName: c.name,
        templateKey: p.key,
        signature: p.signature,
        teamToken: reservation,
        teamUrl: reservation ? state.settings.team.url : null,
      },
      beforeSend: reservation
        ? () =>
            team.call("begin", {
              email: lead.email,
              workerId: state.workerId,
              token: reservation,
            })
        : undefined,
      afterOutcome,
    });
  } catch (e) {
    if (reservation && !state.history[lead.email])
      await team
        .call("release", {
          email: lead.email,
          workerId: state.workerId,
          token: reservation,
        })
        .catch(() => {});
    throw e;
  }
}
function job() {
  const a = state.automation;
  return {
    ...a,
    current: a.sent,
    total: a.selected?.length || a.sent + 1,
    stop: !a.enabled,
  };
}
async function waitFor(seconds, status, message) {
  const a = state.automation;
  a.nextAt = new Date(Date.now() + seconds * 1000).toISOString();
  a.status = status;
  a.message = message;
  await persist();
}
async function runner() {
  if (loopActive) return;
  loopActive = true;
  try {
    while (!shuttingDown && state.automation.enabled) {
      const a = state.automation;
      if (busy) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      if (a.nextAt && Date.parse(a.nextAt) > Date.now()) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      if (!(await mail.isConnected())) {
        a.status = "Waiting for mailbox";
        a.message = "Connect your mailbox to continue.";
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      try {
        busy = true;
        await syncTeam();
        checkBusiness();
        const lastLocal = [...Object.values(state.history), ...Object.values(state.seedHistory)]
          .filter((h) => !h.accountEmail || h.accountEmail === profile().email)
          .reduce(
            (n, h) => Math.max(n, Date.parse(h.confirmedAt || h.at) || 0),
            0,
          );
        if (
          lastLocal &&
          lastLocal + state.settings.pacing.minSeconds * 1000 > Date.now()
        ) {
          await waitFor(
            Math.ceil(
              (lastLocal +
                state.settings.pacing.minSeconds * 1000 -
                Date.now()) /
                1000,
            ),
            "Waiting",
            "Maintaining the mailbox interval from the last attempt.",
          );
          continue;
        }
        const q = currentQuota();
        if (q.waitMs) {
          await waitFor(
            Math.ceil(q.waitMs / 1000) + 1,
            "Allowance pause",
            "Waiting for the rolling mailbox allowance to renew.",
          );
          continue;
        }
        let choice = null;
        const campaigns = state.campaigns.filter((c) => c.enabled);
        for (let i = 0; i < campaigns.length; i++) {
          const c = campaigns[((a.campaignCursor || 0) + i) % campaigns.length];
          const lead = candidates(c.id).find(
            (l) =>
              !l.blocked &&
              (!a.selected || a.selected.includes(`${c.id}:${l.id}`)),
          );
          if (lead) {
            choice = { c, lead };
            a.campaignCursor =
              ((a.campaignCursor || 0) + i + 1) % campaigns.length;
            break;
          }
        }
        if (!choice) {
          if (a.mode === "selected") {
            a.enabled = false;
            a.status = "Complete";
            a.message = "Selected queue complete.";
            a.nextAt = null;
            event(a.message);
            await persist();
            break;
          }
          busy = false;
          await waitFor(
            state.settings.pacing.pollSeconds,
            "Waiting for leads",
            "No eligible leads. The queue will check again; you can add a campaign now.",
          );
          continue;
        }
        const { c, lead } = choice;
        if (state.settings.team.enabled) {
          const records = Object.values(teamSnapshot.records);
          const last = records
            .filter((r) => r.accountEmail === profile().email)
            .reduce((n, r) => Math.max(n, Date.parse(r.at) || 0), 0);
          const teamQ = quota(
            teamSnapshot.records,
            profile().email,
            state.settings.pacing,
          );
          if (teamQ.waitMs) {
            await waitFor(
              Math.ceil(teamQ.waitMs / 1000) + 1,
              "Team allowance pause",
              "Waiting for the shared mailbox allowance.",
            );
            continue;
          }
          if (
            last &&
            Date.now() - last < state.settings.pacing.minSeconds * 1000
          ) {
            await waitFor(
              Math.ceil(
                (last + state.settings.pacing.minSeconds * 1000 - Date.now()) /
                  1000,
              ) + 1,
              "Team pacing",
              "Waiting for the shared mailbox interval.",
            );
            continue;
          }
        }
        a.status = "Preparing";
        a.message = `Preparing ${lead.company} · ${c.name}`;
        a.nextAt = null;
        const key = a.randomTemplates
          ? pickTemplate(state.templates, lead, a.lastTemplate)
          : a.templateKey;
        const message = render(lead, template(key), business());
        const warnings = assess(message);
        if (warnings.length) {
          const tmplName = state.templates[key]?.name || key;
          throw new Error(`Template "${tmplName}": ${warnings.join(" ")}`);
        }
        const proof = await prepareTracked(message, c.id);
        prepared = {
          id: lead.id,
          campaignId: c.id,
          key,
          message,
          signature: proof.signature,
        };
        if (!a.enabled) {
          await mail.release();
          prepared = null;
          break;
        }
        a.status = "Sending";
        a.message = `Sending to ${lead.company}`;
        await sendPrepared();
        a.sent++;
        a.lastTemplate = key;
        const delay = nextPause(a, state.settings.pacing);
        event(`${delay.kind} for ${delay.seconds} seconds.`, {
          kind: "pause",
          seconds: delay.seconds,
        });
        await waitFor(delay.seconds, delay.kind, "Next send scheduled.");
      } catch (e) {
        if (e.deferSeconds) {
          await mail.release();
          prepared = null;
          await waitFor(e.deferSeconds, "Team pacing", e.message);
          continue;
        }
        a.enabled = false;
        a.status = "Needs attention";
        a.message = cleanError(e.message);
        a.nextAt = null;
        event(a.message, { kind: "error" });
        await persist();
      } finally {
        busy = false;
      }
    }
  } finally {
    loopActive = false;
    if (
      !state.automation.enabled &&
      !["Complete", "Needs attention"].includes(state.automation.status)
    ) {
      state.automation.status = "Stopped";
      state.automation.message = "Stopped. Queue and history saved.";
      state.automation.nextAt = null;
    }
    await persist();
  }
}
async function startAutomation(input) {
  if (prepared) throw new Error("Close the prepared message first.");
  checkBusiness();
  if (!profile()?.email) throw new Error("Set up a mailbox profile first.");
  if (!state.campaigns.some((c) => c.enabled))
    throw new Error("Enable at least one campaign.");
  if (input.randomTemplates === false) template(input.key);
  else if (!Object.values(state.templates).some((t) => t.enabled))
    throw new Error("Enable at least one template.");
  await syncTeam();
  const a = state.automation;
  a.enabled = true;
  a.status = "Starting";
  a.message = "Continuous queue starting.";
  a.mode = input.ids ? "selected" : "continuous";
  a.selected = input.ids?.map((id) => `${state.activeCampaign}:${id}`) || null;
  a.randomTemplates = input.randomTemplates !== false;
  a.templateKey = input.key || Object.keys(state.templates)[0];
  a.nextAt = null;
  event(`Started ${a.mode} outreach.`, {
    kind: "start",
    accountEmail: profile().email,
  });
  await persist();
  void runner();
}
async function importWorkbook(source, bytes) {
  if (!bytes && (!source || path.extname(source).toLowerCase() !== ".xlsx"))
    throw new Error("Choose an .xlsx workbook.");
  const file = `leads-${randomUUID()}.xlsx`,
    target = path.join(DATA, file);
  if (bytes) await fs.writeFile(target, bytes, { mode: 0o600 });
  else {
    await fs.copyFile(source, target);
    await fs.chmod(target, 0o600);
  }
  const parsed = await python("read", target);
  await fs.copyFile(target, `${target}.original.xlsx`);
  await fs.chmod(`${target}.original.xlsx`, 0o600);
  const c = {
    id: randomUUID(),
    name: bytes ? source : path.basename(source),
    workbook: { file, name: bytes ? source : path.basename(source) },
    enabled: true,
    sheets: [],
    mapping: {},
  };
  state.campaigns.push(c);
  selectCampaign(c.id);
  campaignData.set(c.id, parsed);
  await reload(c);
  event(`Imported ${parsed.leads.length} lead rows into ${c.name}.`);
  await persist();
}
async function body(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1000000) throw new Error("Request too large.");
  }
  return JSON.parse(data || "{}");
}
function response(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
function cleanError(message) {
  return /locator\.|page\.|browserType\.|Call log:/.test(message)
    ? "Webmail controls need attention. Check your browser and close any compose window before retrying."
    : message;
}
const server = http.createServer(async (req, res) => {
  try {
    const expected = `127.0.0.1:${PORT}`;
    if (![expected, `localhost:${PORT}`].includes(req.headers.host))
      return response(res, { error: "Invalid host" }, 403);
    const url = new URL(req.url, `http://${expected}`),
      pathname = url.pathname;
    if (req.method === "POST") {
      if (
        req.headers.origin &&
        !["http://" + expected, `http://localhost:${PORT}`].includes(
          req.headers.origin,
        )
      )
        return response(res, { error: "Invalid origin" }, 403);
      if (req.headers["x-fc-request"] !== "1")
        return response(res, { error: "Missing request header" }, 403);
      if (pathname === "/api/stop") {
        state.automation.enabled = false;
        state.automation.message = "Stopping after the current operation…";
        event("Stop requested.", { kind: "stop" });
        await persist();
        return response(res, { ok: true });
      }
      if (busy)
        throw new Error(
          "An operation is in progress. Try again when it finishes.",
        );
      busy = true;
      try {
        if (pathname === "/api/upload") {
          if (prepared) throw new Error("Close the prepared message first.");
          let size = 0,
            chunks = [];
          for await (const b of req) {
            size += b.length;
            if (size > 20000000) throw new Error("Upload limit is 20 MB.");
            chunks.push(b);
          }
          const name = decodeURIComponent(
            req.headers["x-filename"] || "leads.xlsx",
          );
          if (!name.toLowerCase().endsWith(".xlsx"))
            throw new Error("Choose an .xlsx file.");
          await importWorkbook(path.basename(name), Buffer.concat(chunks));
          return response(res, { ok: true });
        }
        const input = await body(req);
        if (pathname === "/api/tracking/manual-placement") {
          const record = state.tracking.records[input.trackingId];
          if (!record?.attemptedAt) throw new Error("Choose an attempted seed send.");
          recordPlacement(record, input.status, input.evidence);
          await persist();
          return response(res, { ok: true });
        }
        if (pathname === "/api/tracking/seed-plan") {
          if (state.automation.enabled || prepared) throw new Error("Stop outreach and close compose before seed tests.");
          checkBusiness();
          if (!/^[a-zA-Z0-9_-]{1,80}$/.test(input.testKey || "")) throw new Error("Use a unique test key (letters, digits, dash or underscore; max 80).");
          const seeds = seedConfig();
          if (!seeds.length) throw new Error("Configure FC_SEEDS with your authorized test mailbox recipients.");
          const lead = activeData().leads.find((l) => l.id === input.leadId);
          if (!lead) throw new Error("Choose a lead from the active campaign as the content sample.");
          const message = render(lead, template(input.key), business());
          const campaignId = state.activeCampaign;
          const signature = hash(JSON.stringify({ message, campaignId, sender: profile().email, seeds: seeds.map((s) => [s.id, s.email]) }));
          const existing = state.tracking.seedTests[input.testKey];
          if (existing) {
            if (existing.signature !== signature) throw new Error("This test key already belongs to a different seed plan.");
            return response(res, existing);
          }
          const ids = seeds.map((seed) => {
            const id = randomUUID();
            const subject = `${message.subject.slice(0, 135)} [FC seed ${id}]`;
            let result;
            try {
              result = createRecord(state.tracking, { to: seed.email, subject }, {
                id, sender: profile().email, campaignId, seedId: seed.id, testKey: input.testKey,
              }, {
                openEnabled: process.env.FC_OPEN_TRACKING_ENABLED === "1",
                consent: process.env.FC_OPEN_TRACKING_CONSENT === "1",
                publicUrl: process.env.FC_TRACKING_PUBLIC_URL,
              });
            } catch {
              result = createRecord(state.tracking, { to: seed.email, subject }, {
                id, sender: profile().email, campaignId, seedId: seed.id, testKey: input.testKey,
              });
            }
            result.record.sampleBody = message.body;
            if (result.pixelUrl) result.record.pixelUrl = result.pixelUrl;
            return result.record.id;
          });
          const plan = { testKey: input.testKey, signature, ids, createdAt: new Date().toISOString() };
          state.tracking.seedTests[input.testKey] = plan;
          await persist();
          return response(res, plan);
        }
        if (pathname === "/api/tracking/seed-send") {
          if (state.automation.enabled || prepared || mail.prepared) throw new Error("Stop outreach and close compose before seed tests.");
          if (!(await mail.isConnected())) throw new Error("Connect the mailbox first.");
          checkBusiness();
          const record = state.tracking.records[input.trackingId];
          const seed = seedConfig().find((s) => s.id === record?.seedId && s.email === record?.recipient);
          if (!seed || record.sender !== profile().email) throw new Error("Seed mailbox or sending profile mismatch.");
          if (record.sendStatus !== "pending" || record.preparationStartedAt || record.attemptedAt)
            throw new Error("This seed is reserved or attempted already. Inspect webmail; create a new test key only for an intentional new test.");
          const last = Object.values({ ...state.history, ...state.seedHistory }).filter((h) => h.accountEmail === profile().email)
            .reduce((n, h) => Math.max(n, Date.parse(h.at) || 0), 0);
          if (currentQuota().waitMs || last + state.settings.pacing.minSeconds * 1000 > Date.now())
            throw new Error("Wait for the configured mailbox interval and allowance before the next seed send.");
          if (state.settings.team.enabled) throw new Error("Seed sending is local-only. Use a dedicated mailbox without team coordination for seed tests.");
          record.preparationStartedAt = new Date().toISOString();
          if (!record.pixelUrl && process.env.FC_OPEN_TRACKING_ENABLED === "1" && process.env.FC_TRACKING_PUBLIC_URL) {
            try {
              const base = new URL(process.env.FC_TRACKING_PUBLIC_URL);
              if (base.protocol === "https:") {
                const token = randomBytes(32).toString("base64url");
                record.openTokenHash = hash(token);
                state.tracking.openIndex ||= {};
                state.tracking.openIndex[record.openTokenHash] = record.id;
                record.pixelUrl = `${base.origin}${base.pathname.replace(/\/$/, "")}/o/${token}.gif`;
              }
            } catch {}
          }
          await persist(); // Prevent re-submission even across crashes during composition.
          const message = { to: record.recipient, subject: record.subject, body: record.sampleBody, trackingId: record.id, pixelUrl: record.pixelUrl };
          try {
            await mail.prepare(message);
            await deliver({ state: { history: state.seedHistory, workbook: { file: "seed-test" } },
              historyKey: record.id, lead: { id: record.id, email: record.recipient, company: seed.id }, message,
              persist, send: () => mail.send(), syncStatus: async () => {}, event, tracking: track,
              metadata: { trackingId: record.id, recipient: record.recipient, accountEmail: record.sender, campaignId: record.campaignId } });
          } catch (error) {
            if (!record.attemptedAt) { record.sendStatus = "send_failed"; addEvent(record, "send_failed", { reason: "Seed preparation failed" }); await persist(); }
            throw error;
          }
          return response(res, { ok: true, record: safeRecord(record) });
        }
        if (pathname === "/api/import") {
          await importWorkbook(input.path);
          return response(res, { ok: true });
        }
        if (pathname === "/api/connect") {
          if (typeof input.password !== "string" || !input.password)
            throw new Error("Enter the mailbox password.");
          const account = profile();
          if (!EMAIL.test(account.email))
            throw new Error("Save a valid mailbox email first.");
          state.automation.message =
            "Signing in. Complete any verification in your browser.";
          try {
            const result = await mail.connect(input.password, account);
            if (
              !state.automation.nextAt ||
              Date.parse(state.automation.nextAt) <= Date.now()
            )
              state.automation.nextAt = null;
            event(`Connected ${account.email}.`, { kind: "system" });
            await persist();
            return response(res, result);
          } finally {
            input.password = "";
            prepared = null;
          }
        }
        if (pathname === "/api/resume") {
          const result = await mail.resume();
          if (
            !state.automation.nextAt ||
            Date.parse(state.automation.nextAt) <= Date.now()
          )
            state.automation.nextAt = null;
          return response(res, result);
        }
        if (pathname === "/api/disconnect") {
          await mail.close();
          prepared = null;
          event("Mailbox session disconnected.", { kind: "system" });
          await persist();
          return response(res, { ok: true });
        }
        if (pathname === "/api/profile") {
          if (state.automation.enabled || prepared)
            throw new Error(
              "Stop outreach and close compose before changing mailbox profiles.",
            );
          const old = state.profiles.find((p) => p.id === input.id);
          const email = String(input.email || "")
            .trim()
            .toLowerCase();
          if (!EMAIL.test(email))
            throw new Error("Enter a valid mailbox email.");
          const u = new URL(input.url || DEFAULTS.account.url);
          if (u.protocol !== "https:" || u.username || u.password)
            throw new Error("Use an HTTPS mailbox URL.");
          if (input.provider !== "privateemail")
            throw new Error("Choose the supported Private Email adapter.");
          const b = validateSettings({
            ...state.settings,
            business:
              input.business || old?.business || state.settings.business,
          }).business;
          const next = {
            id: old?.id || randomUUID(),
            name: String(input.name || email).slice(0, 100),
            email,
            provider: input.provider,
            url: u.href,
            browserChannel: ["chrome", "msedge"].includes(input.browserChannel)
              ? input.browserChannel
              : "chrome",
            business: b,
          };
          await mail.close();
          if (old) Object.assign(old, next);
          else state.profiles.push(next);
          state.activeProfile = next.id;
          state.settings.business = b;
          prepared = null;
          event(`Saved mailbox profile ${next.name}.`);
          await persist();
          return response(res, { ok: true });
        }
        if (pathname === "/api/select-profile") {
          if (state.automation.enabled || prepared)
            throw new Error(
              "Stop outreach and close compose before switching accounts.",
            );
          const p = state.profiles.find((p) => p.id === input.id);
          if (!p) throw new Error("Mailbox profile not found.");
          await mail.close();
          state.activeProfile = p.id;
          state.settings.business = p.business;
          await persist();
          return response(res, { ok: true });
        }
        if (pathname === "/api/delete-profile") {
          if (state.automation.enabled || prepared)
            throw new Error(
              "Stop outreach and close compose before deleting mailbox profiles.",
            );
          if (state.profiles.length <= 1)
            throw new Error("At least one mailbox profile must be kept.");
          const pIndex = state.profiles.findIndex((p) => p.id === input.id);
          if (pIndex === -1) throw new Error("Mailbox profile not found.");
          const p = state.profiles[pIndex];
          if (state.activeProfile === p.id) {
            await mail.close();
            const nextP = state.profiles.find((x) => x.id !== p.id);
            state.activeProfile = nextP.id;
            state.settings.business = nextP.business;
          }
          state.profiles.splice(pIndex, 1);
          event(`Deleted mailbox profile ${p.name || p.email}.`);
          await persist();
          return response(res, {
            ok: true,
            activeProfile: state.activeProfile,
          });
        }
        if (pathname === "/api/settings") {
          if (prepared)
            throw new Error(
              "Close the prepared message before changing settings.",
            );
          const next = validateSettings(input.settings),
            previous = state.settings,
            oldToken = team.token,
            oldSnapshot = teamSnapshot,
            oldSeeded = seededTeamUrl;
          state.settings = next;
          if (input.teamToken) team.token = String(input.teamToken);
          teamSnapshot = { records: {}, suppression: {} };
          try {
            await syncTeam();
          } catch (e) {
            state.settings = previous;
            team.token = oldToken;
            teamSnapshot = oldSnapshot;
            seededTeamUrl = oldSeeded;
            throw e;
          }
          if (profile()) profile().business = state.settings.business;
          event("Sending settings updated.");
          await persist();
          return response(res, { ok: true });
        }
        if (pathname === "/api/team-connect") {
          if (input.token) team.token = String(input.token);
          await syncTeam();
          return response(res, { ok: true });
        }
        if (pathname === "/api/campaign") {
          if (prepared)
            throw new Error(
              "Close the prepared message before changing campaigns.",
            );
          const c = state.campaigns.find((c) => c.id === input.id);
          if (!c) throw new Error("Campaign not found.");
          const next = {
            ...c,
            name: String(input.name || c.name).slice(0, 200),
            enabled: !!input.enabled,
            sheets: Array.isArray(input.sheets) ? input.sheets : [],
            mapping: input.mapping || {},
          };
          const names = new Set(
            campaignData.get(c.id).sheets.map((s) => s.name),
          );
          if (next.sheets.some((name) => !names.has(name)))
            throw new Error(
              "Included worksheets must match their exact names.",
            );
          await reload(next);
          Object.assign(c, next);
          await persist();
          return response(res, { ok: true });
        }
        if (pathname === "/api/select-campaign") {
          if (prepared) throw new Error("Close the prepared message first.");
          selectCampaign(input.id);
          await persist();
          return response(res, { ok: true });
        }
        if (pathname === "/api/delete-campaign") {
          if (state.automation.enabled || prepared)
            throw new Error(
              "Stop outreach and close compose before deleting workspaces.",
            );
          const targetId = input.id || state.activeCampaign;
          const cIndex = state.campaigns.findIndex((c) => c.id === targetId);
          if (cIndex === -1) throw new Error("Campaign workspace not found.");
          const c = state.campaigns[cIndex];
          state.campaigns.splice(cIndex, 1);
          campaignData.delete(targetId);
          if (state.activeCampaign === targetId) {
            state.activeCampaign = state.campaigns[0]?.id || null;
            state.workbook = state.campaigns[0]?.workbook || null;
          }
          const stillUsed = state.campaigns.some(
            (other) => other.workbook?.file === c.workbook?.file,
          );
          if (!stillUsed && c.workbook?.file) {
            try {
              await fs.unlink(path.join(DATA, c.workbook.file));
            } catch {}
          }
          event(`Deleted workspace ${c.name}.`);
          await persist();
          return response(res, {
            ok: true,
            activeCampaign: state.activeCampaign,
          });
        }
        if (pathname === "/api/delete-leads") {
          if (state.automation.enabled || prepared)
            throw new Error(
              "Stop outreach and close compose before deleting leads.",
            );
          if (!Array.isArray(input.ids) || !input.ids.length)
            throw new Error("Select at least one lead to delete.");
          const c = activeCampaign();
          if (!c) throw new Error("No active campaign workbook found.");
          await python("delete", path.join(DATA, c.workbook.file), {
            ids: input.ids,
            mapping: c.mapping,
          });
          await reload(c);
          event(`Deleted ${input.ids.length} lead(s) from ${c.name}.`);
          await persist();
          return response(res, { ok: true, deleted: input.ids.length });
        }
        if (pathname === "/api/reload") {
          await reload();
          event("Campaign workbook reloaded.");
          await persist();
          return response(res, { ok: true });
        }
        if (pathname === "/api/template") {
          if (prepared)
            throw new Error(
              "Close the prepared message before changing templates.",
            );
          const key = input.key || randomUUID();
          const old = state.templates[key] || {};
          const t = {
            ...old,
            name: String(input.name || old.name || "Custom template").slice(
              0,
              100,
            ),
            subject: input.subject,
            body: input.body,
            enabled: input.enabled !== false,
            weight: Number(input.weight ?? 1),
            requiredFields: Array.isArray(input.requiredFields)
              ? input.requiredFields
                  .map((field) => String(field).trim().toLowerCase())
                  .filter(Boolean)
              : [],
          };
          if (!Number.isInteger(t.weight) || t.weight < 1 || t.weight > 100)
            throw new Error("Template weight must be from 1 to 100.");
          const sampleMsg = render(
            activeData().leads[0] || {
              company: "Example Company",
              email: "person@example.com",
              fields: {},
            },
            t,
            business(),
          );
          const warnings = assess(sampleMsg);
          state.templates[key] = t;
          event(
            `Saved template ${t.name}.${warnings.length ? " Compliance alert: " + warnings.join(" ") : ""}`,
            {
              kind: "template",
              templateKey: key,
            },
          );
          await persist();
          return response(res, { key, warnings });
        }
        if (pathname === "/api/delete-template") {
          if (prepared) throw new Error("Close the prepared message first.");
          event(
            `Deleted template ${state.templates[input.key]?.name || input.key}.`,
            { kind: "template", templateKey: input.key },
          );
          delete state.templates[input.key];
          await persist();
          return response(res, { ok: true });
        }
        if (pathname === "/api/import-templates") {
          if (prepared)
            throw new Error(
              "Close the prepared message before importing templates.",
            );
          const incoming = input.templates || input;
          let entries = [];
          if (Array.isArray(incoming)) {
            entries = incoming.map((t) => [t.key || randomUUID(), t]);
          } else if (typeof incoming === "object" && incoming !== null) {
            entries = Object.entries(incoming);
          }
          if (!entries.length)
            throw new Error("Provide valid template definitions to import.");
          let importedCount = 0;
          for (const [rawKey, item] of entries) {
            if (!item || typeof item !== "object") continue;
            const subject = String(item.subject || "").trim();
            const body = String(item.body || "").trim();
            if (!subject || !body) continue;
            const key = state.templates[rawKey]
              ? randomUUID()
              : rawKey || randomUUID();
            const weight = Number(item.weight ?? 1);
            const t = {
              name: String(item.name || "Imported template").slice(0, 100),
              subject,
              body,
              enabled: item.enabled !== false,
              weight:
                Number.isInteger(weight) && weight >= 1 && weight <= 100
                  ? weight
                  : 1,
              requiredFields: Array.isArray(item.requiredFields)
                ? item.requiredFields
                    .map((field) => String(field).trim().toLowerCase())
                    .filter(Boolean)
                : [],
            };
            state.templates[key] = t;
            importedCount++;
          }
          if (!importedCount)
            throw new Error(
              "No valid templates with subject and body found in imported file.",
            );
          event(`Imported ${importedCount} template variant(s).`);
          await persist();
          return response(res, {
            ok: true,
            count: importedCount,
            templates: state.templates,
          });
        }
        if (pathname === "/api/prepare") {
          if (state.automation.enabled)
            throw new Error(
              "Stop continuous outreach before preparing a message manually.",
            );
          checkBusiness();
          await syncTeam();
          const l = eligible(input.id);
          const key = input.randomTemplates
            ? pickTemplate(state.templates, l)
            : input.key;
          const message = render(l, template(key), business()),
            warnings = assess(message);
          if (warnings.length) {
            const tmplName = state.templates[key]?.name || key;
            throw new Error(`Template "${tmplName}": ${warnings.join(" ")}`);
          }
          const proof = await prepareTracked(message, l.campaignId);
          prepared = {
            id: l.id,
            campaignId: l.campaignId,
            key,
            message,
            signature: proof.signature,
          };
          return response(res, { ...proof, message, key });
        }
        if (pathname === "/api/release") {
          const record = state.tracking.records[prepared?.message.trackingId];
          if (record) { record.cancelledAt = new Date().toISOString(); addEvent(record, "compose_released"); }
          await persist();
          await mail.release();
          prepared = null;
          return response(res, { ok: true });
        }
        if (pathname === "/api/send") {
          await syncTeam();
          await sendPrepared();
          state.automation.message = "Send confirmed. Workbook updated.";
          return response(res, { ok: true });
        }
        if (pathname === "/api/start" || pathname === "/api/batch") {
          if (input.ids) {
            if (
              !Array.isArray(input.ids) ||
              !input.ids.length ||
              new Set(input.ids).size !== input.ids.length
            )
              throw new Error("Choose distinct eligible leads.");
            input.ids.forEach((id) => eligible(id));
          }
          await startAutomation(input);
          return response(res, { ok: true });
        }
        if (pathname === "/api/suppress") {
          const email = String(input.email || "")
            .trim()
            .toLowerCase();
          if (!EMAIL.test(email)) throw new Error("Enter one valid email.");
          const reason = String(input.reason || "Do not contact").slice(0, 200);
          await team.call("suppress", { email, reason });
          state.suppression[email] = reason;
          event(`Suppressed ${email}.`);
          await persist();
          return response(res, { ok: true });
        }
        if (pathname === "/api/unsuppress") {
          const email = String(input.email || "")
            .trim()
            .toLowerCase();
          if (!EMAIL.test(email)) throw new Error("Enter one valid email.");
          delete state.suppression[email];
          if (teamSnapshot.suppression?.[email])
            delete teamSnapshot.suppression[email];
          if (state.settings.team.enabled) {
            try {
              await team.call("unsuppress", { email });
            } catch (err) {
              console.error("Team unsuppress error:", err.message);
            }
          }
          event(`Removed ${email} from suppression list.`);
          await persist();
          return response(res, { ok: true });
        }
        if (pathname === "/api/reconcile") {
          const item = state.history[input.email];
          if (!item) throw new Error("Attempt not found.");
          if (item.status === "Uncertain" && input.outcome === "sent") {
            item.status = "Sent";
            item.evidence = "Manually verified in Sent folder";
            item.confirmedAt ||= new Date().toISOString();
            item.confirmationSource = "manual_sent_folder";
            item.syncNeeded = true;
          }
          if (item.status === "Uncertain" && input.outcome === "not-sent")
            item.status = "Not sent — manual review";
          if (
            item.teamToken &&
            item.teamUrl === state.settings.team.url &&
            state.settings.team.enabled &&
            ["Sent", "Uncertain"].includes(item.status)
          ) {
            await team.call("finish", {
              email: input.email,
              workerId: state.workerId,
              token: item.teamToken,
              status: item.status,
              evidence: item.evidence,
            });
            item.teamSyncNeeded = false;
          }
          const c = state.campaigns.find(
              (c) =>
                c.id === item.campaignId || c.workbook.file === item.workbook,
            ),
            lead = campaignData
              .get(c?.id)
              ?.leads.find((l) => l.id === item.leadId);
          if (item.status === "Sent" && lead) {
            await syncStatus(lead, state.settings.eligibility.sentStatus, c.id);
            item.syncNeeded = false;
          }
          item.sendStatus = item.status === "Sent" ? "webmail_sent" : item.status === "Not sent — manual review" ? "send_failed" : item.sendStatus;
          track(item);
          event(`Reviewed ${input.email}: ${item.status}.`, { kind: "system" });
          await persist();
          return response(res, { ok: true });
        }
        if (pathname === "/api/clear-events") {
          state.events = [];
          event("System activity log cleared by operator.", { kind: "system" });
          await persist();
          return response(res, { ok: true, events: state.events });
        }
        throw new Error("Unknown action.");
      } finally {
        busy = false;
      }
    }
    if (req.method !== "GET")
      return response(res, { error: "Method not allowed" }, 405);
    if (pathname === "/api/tracking") {
      return response(res, { ...report(state.tracking, url.searchParams),
        monitorEnabled: process.env.FC_MONITOR_ENABLED === "1",
        opensEnabled: process.env.FC_OPEN_TRACKING_ENABLED === "1" && process.env.FC_OPEN_TRACKING_CONSENT === "1",
        seeds: seedConfig().map(({ id, email, provider, host }) => ({ id, email, provider, automated: !!host })) });
    }
    if (pathname === "/api/tracking/domain") {
      const result = await domainHealth(url.searchParams.get("domain"), (url.searchParams.get("selectors") || "").split(",").map((s) => s.trim()).filter(Boolean));
      return response(res, result);
    }
    if (pathname === "/api/state") {
      const leads = candidates();
      const counts = {
        total: leads.length,
        ready: leads.filter((x) => !x.blocked).length,
        excluded: leads.filter((x) => x.blocked).length,
        sent: Object.values(state.history).filter((x) => x.status === "Sent")
          .length,
      };
      return response(res, {
        version: 2,
        workbook: activeCampaign()?.workbook,
        sheets: activeData().sheets,
        counts,
        templates: state.templates,
        settings: state.settings,
        profiles: state.profiles,
        activeProfile: state.activeProfile,
        campaigns: state.campaigns,
        activeCampaign: state.activeCampaign,
        workerId: state.workerId,
        connected: await mail.isConnected(),
        signInOpen: !!mail.page && !mail.page.isClosed(),
        busy,
        job: job(),
        prepared,
        suppression: { ...state.suppression, ...teamSnapshot.suppression },
        attemptCount: Object.keys(state.history).length,
        attempts: Object.fromEntries(
          Object.entries(state.history)
            .filter(
              ([email, h]) =>
                h.status === "Uncertain" ||
                h.syncNeeded ||
                h.teamSyncNeeded ||
                email === prepared?.message.to,
            )
            .map(([email, h]) => {
              const { teamToken, body, signature, ...safe } = h;
              return [email, safe];
            }),
        ),
        events: state.events.slice(-50),
        remaining: currentQuota().hourRemaining,
        dayRemaining: currentQuota().dayRemaining,
        teamConnected: !state.settings.team.enabled || !!team.token,
      });
    }
    if (pathname === "/api/events") {
      let events = [...state.events];
      const q = (url.searchParams.get("q") || "").toLowerCase().trim();
      const kind = url.searchParams.get("kind");
      if (q) {
        events = events.filter(
          (e) =>
            (e.message || "").toLowerCase().includes(q) ||
            (e.kind || "").toLowerCase().includes(q),
        );
      }
      if (kind && kind !== "all") {
        events = events.filter((e) => {
          if (kind === "error")
            return (
              e.kind === "error" ||
              /fail|error|uncertain|needs attention/i.test(e.message)
            );
          if (kind === "pause" || kind === "pacing")
            return (
              e.kind === "pause" ||
              /pause|rest|seconds|waiting for leads|team pacing|interval/i.test(
                e.message,
              )
            );
          if (kind === "send" || kind === "outreach")
            return (
              e.kind === "sent" ||
              e.kind === "start" ||
              /sent to|sending to|started .* outreach/i.test(e.message)
            );
          if (kind === "system" || kind === "config")
            return (
              e.kind === "system" ||
              e.kind === "template" ||
              /saved|imported|connected|disconnected|reloaded|deleted|profile|template|settings|workbook|suppress/i.test(
                e.message,
              )
            );
          return e.kind === kind;
        });
      }
      const limit = Number(url.searchParams.get("limit")) || 0;
      const total = state.events.length;
      if (limit > 0 && limit < events.length) {
        events = events.slice(-limit);
      }
      return response(res, {
        total,
        count: events.length,
        events: events.slice().reverse(),
      });
    }
    if (pathname === "/api/export-events") {
      const format = url.searchParams.get("format") || "json";
      if (format === "txt") {
        const text = state.events
          .map(
            (e) =>
              `[${e.at}] [${(e.kind || "INFO").toUpperCase()}] ${e.message}`,
          )
          .join("\n");
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": 'attachment; filename="system-activity.log"',
          "Cache-Control": "no-store",
        });
        return res.end(text);
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="system-activity.json"',
        "Cache-Control": "no-store",
      });
      return res.end(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            totalEvents: state.events.length,
            events: state.events,
          },
          null,
          2,
        ),
      );
    }
    if (pathname === "/api/leads") {
      let leads = candidates();
      if (url.searchParams.get("sheet"))
        leads = leads.filter((l) => l.sheet === url.searchParams.get("sheet"));
      if (url.searchParams.get("filter") === "ready")
        leads = leads.filter((l) => !l.blocked);
      if (url.searchParams.get("filter") === "excluded")
        leads = leads.filter((l) => l.blocked);
      const q = (url.searchParams.get("q") || "").toLowerCase();
      if (q)
        leads = leads.filter((l) =>
          `${l.company} ${l.email} ${l.fields["owner / principal"] || ""}`
            .toLowerCase()
            .includes(q),
        );
      const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
      return response(res, {
        total: leads.length,
        leads: leads.slice(offset, offset + 50),
      });
    }
    if (pathname === "/api/history") {
      const query = (url.searchParams.get("q") || "").toLowerCase(),
        status = url.searchParams.get("status");
      let records = Object.entries(state.history)
        .map(([to, { teamToken, ...h }]) => {
          const tRecord = h.trackingId ? state.tracking?.records?.[h.trackingId] : null;
          return {
            to,
            ...h,
            firstOpenAt: tRecord?.firstOpenAt || null,
            opensCount: tRecord?.opens?.length || 0,
            bounceStatus: tRecord?.bounceStatus || null,
          };
        })
        .sort((a, b) => b.at.localeCompare(a.at));
      if (query)
        records = records.filter((r) =>
          `${r.to} ${r.accountEmail || ""} ${r.campaignName || ""} ${r.subject}`
            .toLowerCase()
            .includes(query),
        );
      if (status) records = records.filter((r) => r.status === status);
      const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
      return response(res, {
        total: records.length,
        records: records.slice(offset, offset + 25),
      });
    }
    if (pathname === "/api/preview") {
      const id = url.searchParams.get("id");
      const l =
        candidates().find((x) => x.id === id) ||
        activeData().leads.find((x) => x.id === id);
      if (!l) throw new Error("Lead not found.");
      let message = null,
        warnings = [];
      try {
        const key =
          url.searchParams.get("key") || Object.keys(state.templates)[0];
        if (key && state.templates[key]) {
          message = render(l, state.templates[key], business());
          warnings = assess(message);
        }
      } catch (err) {
        warnings.push(err.message);
      }
      return response(res, { lead: l, message, warnings });
    }
    if (pathname === "/api/download") {
      if (busy) throw new Error("Wait for the current operation to finish.");
      if (!activeCampaign()) throw new Error("Import a workbook first.");
      const bytes = await fs.readFile(
        path.join(DATA, activeCampaign().workbook.file),
      );
      res.writeHead(200, {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="outreach-status.xlsx"',
        "Cache-Control": "no-store",
      });
      return res.end(bytes);
    }
    if (pathname === "/api/export-history") {
      const records = Object.entries(state.history).map(
        ([to, { teamToken, ...r }]) => ({ to, ...r }),
      );
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="outreach-history.json"',
        "Cache-Control": "no-store",
      });
      return res.end(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            records,
            tracking: Object.values(state.tracking.records).map(safeRecord),
            unmatchedBounces: state.tracking.review,
            seedTests: state.tracking.seedTests,
            events: state.events,
            suppression: state.suppression,
          },
          null,
          2,
        ),
      );
    }
    if (pathname === "/api/export-templates") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="outreach-templates.json"',
        "Cache-Control": "no-store",
      });
      return res.end(
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            templates: state.templates,
          },
          null,
          2,
        ),
      );
    }
    const files = {
      "/": "index.html",
      "/app.js": "app.js",
      "/style.css": "style.css",
    };
    if (!files[pathname]) return response(res, { error: "Not found" }, 404);
    const file = files[pathname];
    res.writeHead(200, {
      "Content-Type": file.endsWith(".css")
        ? "text/css"
        : file.endsWith(".js")
          ? "text/javascript"
          : "text/html",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(await fs.readFile(path.join(ROOT, "public", file)));
  } catch (e) {
    response(res, { error: cleanError(e.message) }, 400);
  }
});
server.listen(PORT, "127.0.0.1", () =>
  console.log(`Outreach Desk: http://127.0.0.1:${PORT}`),
);
const pixelServer = startPixelServer({ tracking: state.tracking, persist,
  enabled: () => process.env.FC_OPEN_TRACKING_ENABLED === "1" && process.env.FC_OPEN_TRACKING_CONSENT === "1" });
let pixelWriteActive = false;
const monitorTimer = setInterval(() => {
  if (state.tracking.pixelWriteNeeded && !pixelWriteActive) {
    pixelWriteActive = true;
    void persist().then(() => {
      state.tracking.pixelWriteNeeded = false;
      delete state.tracking.worker.pixelStorage;
    }).catch(() => {}).finally(() => { pixelWriteActive = false; });
  }
  for (const item of [...Object.values(state.history), ...Object.values(state.seedHistory)]) {
    if (item.trackingSyncNeeded) {
      try { track(item); item.trackingSyncNeeded = false; void persist().catch(() => {}); } catch {}
    }
  }
  void monitor.run().catch(() => { state.tracking.worker.storage = { status: "Needs attention", message: "Monitoring state could not be saved" }; });
}, 15000);
monitorTimer.unref();
if (process.env.FC_MONITOR_ENABLED === "1") void monitor.run().catch(() => {});
if (state.automation.enabled) void runner();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close();
    pixelServer?.close();
    clearInterval(monitorTimer);
    monitor.stop();
    while (busy || monitor.running) await new Promise((r) => setTimeout(r, 100));
    await mail.close();
    await persist();
  });
