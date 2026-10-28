import { randomUUID, randomBytes, createHash } from "node:crypto";
import { EMAIL } from "./core.mjs";

export const hash = (value) => createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
export function initTracking(state) {
  state.tracking ||= {};
  const t = state.tracking;
  t.version = 1;
  for (const key of ["records", "dsn", "review", "cursors", "seedTests", "worker"])
    t[key] ||= {};
  state.seedHistory ||= {};
  t.openIndex = Object.fromEntries(Object.values(t.records).filter((r) => r.openTokenHash).map((r) => [r.openTokenHash, r.id]));
  // Additive migration. Never infer delivery or historical open evidence.
  for (const [key, item] of [...Object.entries(state.history || {}), ...Object.entries(state.seedHistory)]) {
    const to = item.recipient || key;
    if (item.status === "Sending" || (item.status === "Uncertain" && item.sendStatus === "send_attempted")) { item.status = "Uncertain"; item.sendStatus = "delivery_unknown"; }
    item.trackingId ||= randomUUID();
    let r = t.records[item.trackingId];
    if (!r) {
      r = createRecord(t, { to, subject: item.subject || "" }, {
        id: item.trackingId, sender: item.accountEmail || "", campaignId: item.campaignId,
      }).record;
      r.createdAt = item.at || now();
      r.migrated = true;
    }
    syncRecord(r, item);
  }
  for (const r of Object.values(t.records)) {
    if (r.sendStatus === "send_attempted") {
      r.sendStatus = "delivery_unknown";
      addEvent(r, "delivery_unknown", { reason: "Process restarted before confirmation" });
    }
  }
  return t;
}
export function addEvent(r, type, details = {}, at = now()) {
  r.events ||= [];
  r.events.push({ at, type, ...details });
  r.events = r.events.slice(-100);
  r.lastEventAt = at;
}
export function createRecord(t, message, metadata = {}, options = {}) {
  const id = metadata.id || randomUUID();
  const r = {
    id, recipient: message.to.toLowerCase(), sender: metadata.sender?.toLowerCase() || "",
    subject: message.subject, campaignId: metadata.campaignId || null,
    seedId: metadata.seedId || null, testKey: metadata.testKey || null,
    createdAt: now(), sendStatus: "pending", deliveryStatus: "delivery_unknown",
    bounceStatus: null, bounceReason: null, messageIds: [], events: [], opens: [],
  };
  let pixelUrl;
  if (options.openEnabled && options.consent) {
    const base = new URL(options.publicUrl);
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
      throw new Error("Open tracking requires a public HTTPS URL without credentials, query or fragment.");
    const token = randomBytes(32).toString("base64url");
    r.openTokenHash = hash(token);
    t.openIndex ||= {};
    t.openIndex[r.openTokenHash] = id;
    pixelUrl = `${base.origin}${base.pathname.replace(/\/$/, "")}/o/${token}.gif`;
  }
  addEvent(r, "pending");
  t.records[id] = r;
  return { record: r, pixelUrl };
}
export function syncRecord(r, item) {
  if (!r) return;
  const status = item.sendStatus || (item.status === "Sent" ? "webmail_sent" :
    item.status === "Sending" ? "send_attempted" : item.status === "Not sent — manual review" ? "send_failed" : "delivery_unknown");
  r.attemptedAt ||= item.at;
  r.confirmedAt ||= item.confirmedAt;
  r.error = item.sendError || r.error;
  if (r.sendStatus !== status) {
    r.sendStatus = status;
    addEvent(r, status, {}, item.confirmedAt || item.at || now());
  }
}
export function recordOpen(t, token, enabled = true, at = now()) {
  if (!enabled || !/^[\w-]{43}$/.test(token)) return false;
  return recordOpenHash(t, hash(token), enabled, at);
}
export function recordOpenHash(t, digest, enabled = true, at = now()) {
  if (!enabled || !/^[a-f0-9]{64}$/.test(digest)) return false;
  const r = t.records[t.openIndex?.[digest]];
  if (!r || !r.attemptedAt) return false;
  if (r.sendStatus === "send_attempted" && !r.confirmedAt) return false;
  const bucket = at.slice(0, 13);
  if (r.opens.some((e) => e.bucket === bucket)) return false;
  r.opens.push({ bucket, at });
  r.opens = r.opens.slice(-96);
  if (!r.firstOpenAt || at < r.firstOpenAt) r.firstOpenAt = at;
  if (!r.lastOpenAt || at > r.lastOpenAt) r.lastOpenAt = at;
  addEvent(r, "open_detected", { signal: "Remote image request; human reading unverified" }, at);
  if (r.seedId && (!r.placement || r.placement.status === "awaiting")) {
    recordPlacement(r, "inbox", "Remote open signal received from seed recipient", "open_signal");
  }
  return true;
}
export function correlateBounce(t, dsn, sender) {
  if (!dsn.recipient || !dsn.messageIds?.length) return [];
  return Object.values(t.records).filter((r) =>
    r.attemptedAt && r.sender === sender.toLowerCase() &&
    r.recipient === dsn.recipient && r.messageIds.some((id) => dsn.messageIds.includes(id)));
}
export function applyDsn(t, dsn, sender, sourceKey) {
  const key = hash(`${sender.toLowerCase()}\n${sourceKey}\n${dsn.index || 0}`);
  if (t.dsn[key]) return false;
  const candidates = correlateBounce(t, dsn, sender);
  const entry = { ...dsn, sender, sourceKey, observedAt: now() };
  if (candidates.length !== 1 || !["hard_bounced", "soft_bounced"].includes(dsn.kind)) {
    t.review[key] = { ...entry, reason: candidates.length > 1 ? "Ambiguous message identifier" :
      candidates.length === 0 ? "No exact message identifier and recipient match" : "Unrecognized DSN action/status" };
    return true; // Retry unmatched review entries after Sent-folder reconciliation.
  }
  const r = candidates[0];
  t.dsn[key] = { ...entry, trackingId: r.id };
  delete t.review[key];
  if (r.bounceStatus !== "hard_bounced" || dsn.kind === "hard_bounced") {
    r.bounceStatus = dsn.kind;
    r.bounceReason = dsn.diagnostic || dsn.status || "Delivery failure notification";
    r.deliveryStatus = dsn.kind;
  }
  addEvent(r, dsn.kind, { status: dsn.status, diagnostic: dsn.diagnostic });
  return true;
}
export function retryReviews(t) {
  for (const d of Object.values(t.review)) {
    if (d.kind) applyDsn(t, d, d.sender, d.sourceKey);
  }
}
export function safeRecord(r) {
  const { openTokenHash, sampleBody, ...safe } = r;
  return safe;
}
export function report(t, params = new URLSearchParams()) {
  let records = Object.values(t.records);
  const q = (params.get("q") || "").toLowerCase();
  const campaign = params.get("campaign"), status = params.get("status");
  if (q) records = records.filter((r) => `${r.recipient} ${r.sender} ${r.subject}`.toLowerCase().includes(q));
  if (campaign) records = records.filter((r) => r.campaignId === campaign);
  for (const [key, compare] of [["from", (a, b) => a >= b], ["until", (a, b) => a <= b]]) {
    const date = params.get(key);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Use YYYY-MM-DD dates.");
    if (date) records = records.filter((r) => compare((r.attemptedAt || r.createdAt).slice(0, 10), date));
  }
  if (status) records = records.filter((r) => r.sendStatus === status || r.bounceStatus === status ||
    (status === "open_detected" && r.firstOpenAt) || (status === "delivery_unknown" && r.deliveryStatus === status));
  const summary = { total: records.length, recipients: new Set(records.map((r) => r.recipient)).size,
    attempts: 0, webmail_sent: 0, send_failed: 0, hard_bounced: 0, soft_bounced: 0,
    open_detected: 0, delivery_unknown: 0, inbox: 0, spam: 0, other: 0, not_found: 0, awaiting: 0 };
  for (const r of records) {
    if (r.attemptedAt) summary.attempts++;
    if (r.sendStatus in summary && r.sendStatus !== "delivery_unknown") summary[r.sendStatus]++;
    if (r.bounceStatus) summary[r.bounceStatus]++;
    if (r.firstOpenAt) summary.open_detected++;
    if (r.attemptedAt && r.deliveryStatus === "delivery_unknown") summary.delivery_unknown++;
    if (r.placement?.status in summary) summary[r.placement.status]++;
  }
  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  return { summary, total: records.length, records: records.slice(offset, offset + 50).map(safeRecord),
    review: Object.entries(t.review).slice(-50).map(([id, value]) => ({ id, ...value })), worker: t.worker };
}
export function seedConfig(env = process.env) {
  const seeds = JSON.parse(env.FC_SEEDS || "[]");
  if (!Array.isArray(seeds) || seeds.length > 20) throw new Error("FC_SEEDS must be an array of at most 20 test mailboxes.");
  const ids = new Set(), emails = new Set();
  for (const s of seeds) {
    if (!/^[a-z0-9_-]{1,50}$/i.test(s.id || "") || !EMAIL.test(s.email || "") || ids.has(s.id) || emails.has(s.email.toLowerCase()))
      throw new Error("Seeds require unique IDs and unique valid email addresses.");
    if (s.password || s.accessToken) throw new Error("Use passwordEnv/accessTokenEnv names, never inline seed secrets.");
    s.email = s.email.toLowerCase();
    ids.add(s.id); emails.add(s.email);
  }
  return seeds;
}
export function recordPlacement(r, status, evidence, source = "manual") {
  if (!r.seedId || !["inbox", "spam", "other", "not_found", "awaiting"].includes(status))
    throw new Error("Choose an existing seed send and a valid placement.");
  if (typeof evidence !== "string" || !evidence.trim() || evidence.length > 500)
    throw new Error("Provide evidence up to 500 characters (no message contents or credentials).");
  const placement = { status, evidence, source, checkedAt: now() };
  if (r.placement?.status === status && r.placement?.source === source && source === "imap") return;
  r.placement = placement;
  addEvent(r, "seed_placement", placement);
}
