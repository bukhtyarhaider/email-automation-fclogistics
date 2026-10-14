import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { hash, addEvent, applyDsn, retryReviews, recordPlacement, seedConfig } from "./tracking.mjs";

const fields = (text) => Object.fromEntries(text.replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ")
  .split("\n").map((line) => {
    const i = line.indexOf(":");
    return i < 0 ? [] : [line.slice(0, i).toLowerCase(), line.slice(i + 1).trim()];
  }).filter((entry) => entry.length));
const ids = (value = "") => [...String(value).matchAll(/<[^<>\s]+@[^<>\s]+>/g)].map((m) => m[0]);
const parserOptions = { keepDeliveryStatus: true, skipHtmlToText: true, skipTextToHtml: true,
  skipImageLinks: true, maxHtmlLengthToParse: 2_000_000 };
export async function parseDsn(source) {
  const mail = await simpleParser(source, parserOptions);
  const attachments = mail.attachments.filter((a) => a.contentType === "message/delivery-status");
  if (!attachments.length) {
    // Nonstandard notifications are retained for review, never parsed with recipient guesses.
    if (/delivery.*(fail|status)|undeliver|returned mail|mail delivery/i.test(mail.subject || ""))
      return [{ index: 0, kind: null, recipient: null, messageIds: [], diagnostic: "Nonstandard delivery notification; inspect mailbox" }];
    return [];
  }
  const originalIds = [];
  for (const a of mail.attachments) {
    if (["message/rfc822", "text/rfc822-headers"].includes(a.contentType)) {
      const original = fields(a.content.toString().split(/\r?\n\r?\n/)[0]);
      originalIds.push(...ids(original["message-id"]));
    }
  }
  const results = [];
  let successOnly = false;
  for (const a of attachments) {
    const blocks = a.content.toString().trim().split(/\r?\n\r?\n/).map(fields);
    const messageIds = [...new Set([...originalIds, ...ids(blocks[0]?.["original-message-id"])])];
    for (const block of blocks) {
      if (!block["final-recipient"] && !block["original-recipient"]) continue;
      const rawRecipient = block["final-recipient"] || block["original-recipient"];
      const recipient = /^rfc822\s*;\s*([^<>\s]+@[^<>\s]+)\s*$/i.exec(rawRecipient)?.[1].toLowerCase() || null;
      const action = (block.action || "").toLowerCase(), status = block.status || "";
      const kind = action === "failed" && /^5\.\d+\.\d+$/.test(status) ? "hard_bounced" :
        ["delayed", "failed"].includes(action) && /^4\.\d+\.\d+$/.test(status) ? "soft_bounced" : null;
      // Success DSNs are not evidence of inbox placement and do not become bounces.
      if (["delivered", "relayed", "expanded"].includes(action)) { successOnly = true; continue; }
      results.push({ index: results.length, recipient, kind, action, status,
        diagnostic: String(block["diagnostic-code"] || "").slice(0, 1000),
        messageIds: [...new Set([...messageIds, ...ids(block["original-message-id"])])] });
    }
  }
  if (!results.length && !successOnly) return [{ index: 0, kind: null, recipient: null, messageIds: [], diagnostic: "Malformed structured delivery report; inspect mailbox" }];
  return results;
}
export async function reconcileSent(t, source, sender) {
  const mail = await simpleParser(source, parserOptions);
  const recipients = mail.to?.value || [];
  if (!mail.messageId || recipients.length !== 1 || mail.from?.value?.length !== 1 ||
    mail.from.value[0].address?.toLowerCase() !== sender.toLowerCase()) return false;
  const html = typeof mail.html === "string" ? mail.html : "";
  const markers = [...html.matchAll(/data-fc-tracking=["']([a-f0-9-]{36})["']/gi)].map((m) => m[1]);
  const tokens = [...html.matchAll(/\/o\/([\w-]{43})\.gif/g)].map((m) => hash(m[1]));
  const candidates = Object.values(t.records).filter((r) => r.attemptedAt &&
    r.sender === sender.toLowerCase() && r.recipient === recipients[0].address?.toLowerCase() &&
    r.subject === mail.subject && (markers.includes(r.id) || (r.openTokenHash && tokens.includes(r.openTokenHash)) ||
      (r.seedId && mail.subject?.endsWith(`[FC seed ${r.id}]`))));
  if (candidates.length !== 1) return false;
  const r = candidates[0];
  if (!r.messageIds.includes(mail.messageId)) {
    r.messageIds.push(mail.messageId);
    addEvent(r, "sent_message_id", { messageId: mail.messageId });
  }
  return true;
}
export function mailboxConfigs(env = process.env) {
  const configs = JSON.parse(env.FC_IMAP_MAILBOXES || "[]");
  if (!Array.isArray(configs) || configs.length > 20) throw new Error("Invalid FC_IMAP_MAILBOXES array.");
  if (env.FC_IMAP_USER) configs.push({ id: "privateemail", user: env.FC_IMAP_USER,
    host: env.FC_IMAP_HOST || "mail.privateemail.com", passwordEnv: "FC_IMAP_PASSWORD",
    sentFolder: env.FC_IMAP_SENT_FOLDER, inboxFolder: env.FC_IMAP_INBOX_FOLDER || "INBOX" });
  const seen = new Set();
  for (const c of configs) {
    if (!c.user || !/^[a-z0-9_-]{1,50}$/i.test(c.id || "") || seen.has(c.id)) throw new Error("Mailboxes need unique IDs and a username.");
    if (c.password || c.accessToken) throw new Error("Mailbox secrets must use environment variable references.");
    seen.add(c.id);
  }
  return configs;
}
export function imapOptions(config, env = process.env) {
  const user = config.user || config.email;
  const accessToken = config.accessTokenEnv && env[config.accessTokenEnv];
  const pass = config.passwordEnv && env[config.passwordEnv];
  if (!user || !config.host || (!accessToken && !pass)) throw new Error("Mailbox credentials are not configured.");
  if (config.provider === "outlook" && !accessToken) throw new Error("Outlook seeds require OAuth access tokens.");
  if (["gmail", "yahoo"].includes(config.provider) && !accessToken && config.authMode !== "app_password")
    throw new Error("This seed requires OAuth or an explicitly configured provider app password.");
  return { host: config.host, port: 993, secure: true,
    auth: { user, ...(accessToken ? { accessToken } : { pass }) },
    logger: false, logRaw: false, disableAutoIdle: true,
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" } };
}
export class MailboxMonitor {
  constructor({ state, persist, env = process.env, clientFactory = (opts) => new ImapFlow(opts), clock = () => Date.now() }) {
    Object.assign(this, { state, persist, env, clientFactory, clock });
    this.running = false;
    this.clients = new Set();
  }
  async withClient(config, fn) {
    const client = this.clientFactory(imapOptions(config, this.env));
    client.on("error", () => {}); // Never log authentication payloads or mailbox content.
    this.clients.add(client);
    try { await client.connect(); return await fn(client); }
    finally { client.close(); this.clients.delete(client); }
  }
  async scan(client, config, folder, sent = false) {
    const t = this.state.tracking;
    const box = await client.mailboxOpen(folder, { readOnly: true });
    const key = hash(`${config.user.toLowerCase()}\n${config.host}\n${folder}`);
    let cursor = t.cursors[key];
    if (!cursor || cursor.validity !== String(box.uidValidity))
      cursor = { validity: String(box.uidValidity), uid: 0 };
    const since = new Date(this.clock() - 30 * 86400000);
    const uids = await client.search(cursor.uid ? { uid: `${cursor.uid + 1}:*` } : { since }, { uid: true });
    for (const uid of (uids || []).filter((n) => n > cursor.uid).sort((a, b) => a - b).slice(0, 100)) {
      if (this.stopped) return;
      const meta = await client.fetchOne(String(uid), { size: true }, { uid: true });
      if (meta && meta.size <= 2_000_000) {
        const fetched = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (fetched?.source) {
          try {
            if (sent) await reconcileSent(t, fetched.source, config.user);
            else for (const dsn of await parseDsn(fetched.source))
              applyDsn(t, dsn, config.user, hash(fetched.source));
          } catch {
            t.review[hash(`${key}:${cursor.validity}:${uid}`)] = {
              reason: "Message could not be parsed; inspect mailbox", folder, uid,
            };
          }
        }
      } else if (meta) {
        const reviewKey = hash(`${key}:${cursor.validity}:${uid}`);
        t.review[reviewKey] = { reason: "Message exceeds 2 MB scan limit; inspect mailbox", folder, uid };
      }
      // Commit processing and cursor together. Crash before commit replays idempotently.
      const previousUid = cursor.uid;
      cursor.uid = uid;
      t.cursors[key] = { ...cursor };
      try { await this.persist(); }
      catch (error) { cursor.uid = previousUid; t.cursors[key] = { ...cursor }; throw error; }
    }
  }
  async monitorSender(config) {
    await this.withClient(config, async (client) => {
      const folders = await client.list();
      const sent = config.sentFolder || folders.find((f) => f.specialUse === "\\Sent")?.path;
      if (!sent) throw new Error("Configure the Sent folder.");
      await this.scan(client, config, sent, true);
      await this.scan(client, config, config.inboxFolder || "INBOX");
      retryReviews(this.state.tracking);
      // Only permanent failures suppress future contact. Existing attempt records already block retries.
      for (const r of Object.values(this.state.tracking.records)) {
        if (!r.seedId && r.bounceStatus === "hard_bounced")
          this.state.suppression[r.recipient] ||= "Permanent delivery failure (IMAP DSN)";
      }
    });
  }
  async inspectSeed(config) {
    const t = this.state.tracking;
    const records = Object.values(t.records).filter((r) => r.seedId === config.id && r.confirmedAt &&
      this.clock() - Date.parse(r.confirmedAt) < 7 * 86400000 && r.placement?.source !== "manual");
    if (!records.length) return;
    await this.withClient(config, async (client) => {
      const available = await client.list();
      const folders = [
        ["inbox", config.folders?.inbox || "INBOX"],
        ["spam", config.folders?.spam || available.find((f) => f.specialUse === "\\Junk")?.path],
        ...(config.folders?.other || []).map((path) => ["other", path]),
      ];
      if (!folders[1][1]) throw new Error("Configure the seed Spam/Junk folder.");
      for (const r of records) {
        const found = [];
        for (const [status, folder] of folders) {
          await client.mailboxOpen(folder, { readOnly: true });
          const matches = await client.search({ header: { subject: `[FC seed ${r.id}]` } }, { uid: true });
          for (const uid of (matches || []).slice(0, 20)) {
            const m = await client.fetchOne(String(uid), { envelope: true }, { uid: true });
            const e = m?.envelope;
            if (e?.subject === r.subject && e.from?.length === 1 && e.from[0].address?.toLowerCase() === r.sender &&
              e.to?.some((a) => a.address?.toLowerCase() === r.recipient)) found.push({ status, folder, uid, messageId: e.messageId });
          }
        }
        if (found.length === 1) recordPlacement(r, found[0].status, `Folder ${found[0].folder}; UID ${found[0].uid}`, "imap");
        else if (found.length > 1) recordPlacement(r, "other", "Multiple matching copies; placement needs review", "imap");
        else recordPlacement(r, this.clock() - Date.parse(r.confirmedAt) < 3600000 ? "awaiting" : "not_found",
          "No exact match in configured folders; absence does not prove non-delivery", "imap");
      }
    });
  }
  async run() {
    if (this.running || this.stopped || this.env.FC_MONITOR_ENABLED !== "1") return;
    this.running = true;
    try {
      const senders = mailboxConfigs(this.env);
      const seeds = seedConfig(this.env).filter((s) => s.host);
      if (!senders.length && !seeds.length) this.state.tracking.worker.configuration = {
        status: "Needs configuration", message: "No IMAP mailboxes configured" };
      for (const [type, configs] of [["sender", senders], ["seed", seeds]]) {
        for (const config of configs) {
          if (this.stopped) return;
          const key = `${type}:${config.id}`, previous = this.state.tracking.worker[key] || {};
          if (previous.nextAt && Date.parse(previous.nextAt) > this.clock()) continue;
          try {
            await (type === "sender" ? this.monitorSender(config) : this.inspectSeed(config));
            this.state.tracking.worker[key] = { status: "Checked", checkedAt: new Date(this.clock()).toISOString(), failures: 0,
              nextAt: new Date(this.clock() + 60000).toISOString() };
          } catch {
            const failures = Math.min((previous.failures || 0) + 1, 10);
            this.state.tracking.worker[key] = { status: "Needs attention", failures,
              message: "Mailbox check failed; verify credentials, folder names, authorization and connectivity.",
              nextAt: new Date(this.clock() + Math.min(3600000, 60000 * 2 ** failures) + Math.floor(Math.random() * 10000)).toISOString() };
          }
          await this.persist();
        }
      }
    } catch {
      this.state.tracking.worker.configuration = { status: "Needs configuration", message: "Invalid monitoring environment configuration" };
      await this.persist();
    } finally { this.running = false; }
  }
  stop() { this.stopped = true; for (const client of this.clients) client.close(); }
}
