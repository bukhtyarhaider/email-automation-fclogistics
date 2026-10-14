import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    await sleep(100);
  }
  throw new Error("Timed out");
}

async function start(dir, port, extra = {}) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      path.join(ROOT, "tests/fixtures/fake-mail.mjs"),
      path.join(ROOT, "src/server.mjs"),
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        FC_DATA_DIR: dir,
        PORT: String(port),
        TEST_SEND_LOG: path.join(dir, "sends.jsonl"),
        ...extra,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let err = "";
  child.stderr.on("data", (b) => (err += b));
  await until(async () => {
    if (child.exitCode !== null) throw new Error(err);
    try {
      return (await fetch(`http://127.0.0.1:${port}/api/state`)).ok;
    } catch {
      return false;
    }
  });
  return child;
}

async function stop(child) {
  const done = once(child, "exit");
  child.kill("SIGTERM");
  await done;
}

test("mailbox profiles list, switch and delete features work", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "outreach-profiles-"));
  const port = 14321;
  let child;
  t.after(async () => {
    if (child?.exitCode === null) await stop(child);
    await fs.rm(dir, { recursive: true, force: true });
  });

  child = await start(dir, port);
  async function api(route, data) {
    const r = await fetch(`http://127.0.0.1:${port}/api/${route}`, {
      method: data !== undefined ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-FC-Request": "1" },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    const val = await r.json();
    if (!r.ok) throw new Error(val.error);
    return val;
  }

  let s = await api("state");
  assert.equal(s.profiles.length, 1);
  const initialId = s.profiles[0].id;

  // Cannot delete only profile
  await assert.rejects(
    async () => api("delete-profile", { id: initialId }),
    /At least one mailbox profile must be kept/,
  );

  // Add a second profile
  await api("profile", {
    name: "Secondary Mailbox",
    email: "second@example.com",
    provider: "privateemail",
    url: "https://privateemail.com/spm/mail/INBOX/",
    browserChannel: "chrome",
  });

  s = await api("state");
  assert.equal(s.profiles.length, 2);
  const second = s.profiles.find((p) => p.email === "second@example.com");
  assert.ok(second);
  assert.equal(s.activeProfile, second.id);

  // Switch back to initial profile
  await api("select-profile", { id: initialId });
  s = await api("state");
  assert.equal(s.activeProfile, initialId);

  // Delete the second profile
  await api("delete-profile", { id: second.id });
  s = await api("state");
  assert.equal(s.profiles.length, 1);
  assert.equal(s.profiles[0].id, initialId);
});

test("suppression add and unsuppress remove feature works", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "outreach-suppress-"));
  const port = 14322;
  let child;
  t.after(async () => {
    if (child?.exitCode === null) await stop(child);
    await fs.rm(dir, { recursive: true, force: true });
  });

  child = await start(dir, port);
  async function api(route, data) {
    const r = await fetch(`http://127.0.0.1:${port}/api/${route}`, {
      method: data !== undefined ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-FC-Request": "1" },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    const val = await r.json();
    if (!r.ok) throw new Error(val.error);
    return val;
  }

  // Add suppression
  await api("suppress", { email: "optout@example.com", reason: "Requested opt out" });
  let s = await api("state");
  assert.equal(s.suppression["optout@example.com"], "Requested opt out");

  // Remove suppression
  await api("unsuppress", { email: "optout@example.com" });
  s = await api("state");
  assert.equal(s.suppression["optout@example.com"], undefined);
});

test("templates export and import features work", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "outreach-templates-"));
  const port = 14323;
  let child;
  t.after(async () => {
    if (child?.exitCode === null) await stop(child);
    await fs.rm(dir, { recursive: true, force: true });
  });

  child = await start(dir, port);

  // Export templates
  const res = await fetch(`http://127.0.0.1:${port}/api/export-templates`);
  assert.equal(res.status, 200);
  const exported = await res.json();
  assert.ok(exported.exportedAt);
  assert.ok(exported.templates);
  const initialCount = Object.keys(exported.templates).length;
  assert.ok(initialCount >= 1);

  // Import custom templates
  const toImport = [
    {
      name: "Custom Expedited Carrier Introduction",
      subject: "Quick question for {{company}} dispatch",
      body: "Hi {{firstName}},\n\nDo you run expedite lanes?\n\nBest,\n{{senderName}}",
      weight: 5,
      enabled: true,
      requiredFields: ["company"],
    },
  ];

  const postRes = await fetch(`http://127.0.0.1:${port}/api/import-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-FC-Request": "1" },
    body: JSON.stringify({ templates: toImport }),
  });
  const postVal = await postRes.json();
  assert.equal(postRes.status, 200);
  assert.equal(postVal.ok, true);
  assert.equal(postVal.count, 1);

  const stateRes = await fetch(`http://127.0.0.1:${port}/api/state`);
  const s = await stateRes.json();
  assert.equal(Object.keys(s.templates).length, initialCount + 1);
  const importedTmpl = Object.values(s.templates).find(
    (t) => t.name === "Custom Expedited Carrier Introduction",
  );
  assert.ok(importedTmpl);
  assert.equal(importedTmpl.weight, 5);
});

test("delete leads and delete workspace campaign features work", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "outreach-leads-delete-"));
  const port = 14324;
  let child;
  t.after(async () => {
    if (child?.exitCode === null) await stop(child);
    await fs.rm(dir, { recursive: true, force: true });
  });

  const workbook = path.join(dir, "sample.xlsx");
  execFileSync(process.platform === "win32" ? "python" : "python3", [
    path.join(ROOT, "tests/fixtures/workbook.py"),
    workbook,
  ]);

  child = await start(dir, port);
  async function api(route, data) {
    const r = await fetch(`http://127.0.0.1:${port}/api/${route}`, {
      method: data !== undefined ? "POST" : "GET",
      headers: { "Content-Type": "application/json", "X-FC-Request": "1" },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
    const val = await r.json();
    if (!r.ok) throw new Error(val.error);
    return val;
  }

  // Import workbook
  await api("import", { path: workbook });
  let leadsRes = await api("leads");
  assert.ok(leadsRes.total > 0);
  const initialTotal = leadsRes.total;
  const leadToDelete = leadsRes.leads[0];

  // Delete single lead
  const delRes = await api("delete-leads", { ids: [leadToDelete.id] });
  assert.equal(delRes.deleted, 1);

  leadsRes = await api("leads");
  assert.equal(leadsRes.total, initialTotal - 1);
  assert.ok(!leadsRes.leads.some((l) => l.id === leadToDelete.id));

  // Delete active workspace campaign
  const sBefore = await api("state");
  assert.equal(sBefore.campaigns.length, 1);

  await api("delete-campaign", { id: sBefore.activeCampaign });
  const sAfter = await api("state");
  assert.equal(sAfter.campaigns.length, 0);
  assert.equal(sAfter.activeCampaign, null);
});
