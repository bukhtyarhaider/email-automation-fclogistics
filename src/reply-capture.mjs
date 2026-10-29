import fs from 'node:fs/promises';
import path from 'node:path';
import { ImapFlow } from 'imapflow';
import { imapOptions } from './mailbox-monitor.mjs';
import { parseReply, digest, messageIds } from './reply-parser.mjs';

export function replyCaptureConfig(env = process.env, clock = Date.now) {
  const mailboxes = JSON.parse(env.FC_EXPERIMENT_REPLY_MAILBOXES || '[]');
  if (!Array.isArray(mailboxes) || mailboxes.length > 20) throw new Error('Use a reply-mailbox JSON array with at most 20 accounts.');
  const seen = new Set(), accounts = new Set();
  for (const c of mailboxes) {
    if (!c || !/^[a-z0-9_-]{1,50}$/i.test(c.id || '') || ['__proto__','constructor','prototype','_capture'].includes(c.id) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email || '') || typeof c.host !== 'string' || !c.host || seen.has(c.id) || accounts.has(c.email.toLowerCase())) throw new Error('Reply mailboxes need unique IDs/emails and a host.');
    if (c.password || c.pass || c.accessToken || c.token) throw new Error('Use environment-variable references for reply mailbox secrets.');
    for (const key of ['passwordEnv','accessTokenEnv']) if (c[key] && !/^[A-Z_][A-Z0-9_]*$/i.test(c[key])) throw new Error('Use a valid environment-variable name for credentials.');
    c.email = c.email.toLowerCase(); c.user ||= c.email;
    seen.add(c.id); accounts.add(c.email);
  }
  const since = env.FC_EXPERIMENT_REPLY_SINCE || new Date(clock() - 30 * 86400000).toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !Number.isFinite(Date.parse(since)) || new Date(since).toISOString().slice(0,10) !== since || Date.parse(since) > clock()) throw new Error('Use a valid reply backfill start date in the past.');
  const batch = Number(env.FC_EXPERIMENT_REPLY_BATCH || 50);
  if (!Number.isInteger(batch) || batch < 1 || batch > 100) throw new Error('Reply batch must be from 1 to 100 messages per folder/check.');
  return { mailboxes, since, batch, enabled: env.FC_EXPERIMENT_REPLY_CAPTURE_ENABLED === '1', auto: env.FC_EXPERIMENT_REPLY_AUTO === '1' };
}
export class ReplyCapture {
  constructor({ replies, env = process.env, clientFactory = (opts) => new ImapFlow(opts), clock = Date.now }) {
    Object.assign(this, { replies, env, clientFactory, clock }); this.running = false; this.clients = new Set(); this.stopped = false;
  }
  async status() {
    let config;
    try { config = replyCaptureConfig(this.env, this.clock); }
    catch { return { enabled: false, auto: false, running: this.running, configurationError: 'Invalid experiment reply configuration. Check mailbox IDs, dates and credential references.', mailboxes: [] }; }
    const state = await this.replies.load();
    return { enabled: config.enabled, auto: config.enabled && config.auto, running: this.running, since: config.since, batch: config.batch, captureError: this.lastError ? { status: 'Needs attention', message: this.lastError } : state.monitors._capture || null,
      mailboxes: config.mailboxes.map((c) => ({ id: c.id, email: c.email, credentialsConfigured: Boolean((c.passwordEnv && this.env[c.passwordEnv]) || (c.accessTokenEnv && this.env[c.accessTokenEnv])), ...(state.monitors[c.id] || { status: 'Not checked' }) })) };
  }
  start() {
    if (this.running) return { started: false, running: true };
    const config = replyCaptureConfig(this.env, this.clock);
    if (!config.enabled) throw new Error('Live reply capture is disabled. Use samples/EML import or explicitly configure experiment IMAP access.');
    if (!config.mailboxes.length) throw new Error('No experiment reply mailboxes are configured.');
    this.running = true;
    void this.run(config).catch(() => { this.lastError = 'Reply capture did not finish. Inspect workspace storage and capture lock.'; }).finally(() => { this.running = false; });
    return { started: true, running: true };
  }
  async scanFolder(client, c, folder, sent, config, snapshot) {
    const box = await client.mailboxOpen(folder, { readOnly: true });
    const key = digest(`${c.email}:${c.user}:${c.host}:${folder}`);
    const prior = (await this.replies.load()).cursors[key];
    const validity = String(box.uidValidity);
    let uid = prior?.validity === validity && prior.since === config.since ? prior.uid : 0;
    const uids = (await client.search(uid ? { uid: `${uid + 1}:*` } : { since: new Date(config.since + 'T00:00:00Z') }, { uid: true }) || []).filter((n) => Number.isSafeInteger(n) && n > uid).sort((a,b) => a-b);
    let processed = 0;
    for (const next of uids.slice(0, config.batch)) {
      if (this.stopped) throw new Error('Capture stopped.');
      const evidence = { type: 'imap', folder, uid: next, uidValidity: validity };
      const meta = await client.fetchOne(String(next), { size: true, envelope: true }, { uid: true });
      if (!meta || !Number.isFinite(meta.size)) throw new Error('Message metadata unavailable; cursor retained.');
      const state = await this.replies.load(), roots = Object.values(state.roots).filter((r) => r.account === c.email);
      const envelope = meta.envelope;
      const from = (envelope?.from || []).map((a) => a.address?.toLowerCase()).filter(Boolean), to = [...(envelope?.to || []), ...(envelope?.cc || [])].map((a) => a.address?.toLowerCase()).filter(Boolean);
      const reference = messageIds(envelope?.inReplyTo);
      const relevant = !envelope || roots.some((r) => from.includes(r.recipient) || (sent && to.includes(r.recipient)) || r.messageIds.some((id) => reference.includes(id))) || /mailer-daemon|postmaster/.test(from.join(' ')) || /undeliverable|delivery fail|returned mail/i.test(envelope.subject || '');
      const cursor = { key, value: { account: c.email, folder, validity, uid: next, since: config.since, checkedAt: new Date(this.clock()).toISOString() } };
      if (!relevant) { await this.replies.recordParsed(null, c.email, evidence, cursor); uid = next; processed++; continue; }
      let parsed;
      let raw;
      if (meta.size <= 2_000_000) {
        const fetched = await client.fetchOne(String(next), { source: true }, { uid: true });
        if (!fetched?.source) throw new Error('Message unavailable; cursor retained.');
        raw = fetched.source;
        try { parsed = await parseReply(raw); } catch { /* Save a review stub instead of losing the cursor's evidence. */ }
      }
      if (!parsed) {
        if (!envelope) throw new Error('Message metadata cannot support a review record; cursor retained.');
        const fingerprint = digest(JSON.stringify({ account: c.email, messageId: envelope?.messageId, from, to, subject: envelope?.subject }));
        parsed = { messageId: messageIds(envelope?.messageId)[0] || null, references: reference, from, to, deliveredTo: '', subject: String(envelope?.subject || '(Body needs mailbox review)').slice(0,500), text: '', date: null, kind: 'unknown', dsn: [], bodyUnavailable: true, fingerprint, sourceHash: raw ? digest(raw) : null, suggestion: { category: 'unclassified', reason: 'Body unavailable; inspect mailbox' } };
      }
      if (sent && raw && !parsed.bodyUnavailable) await this.replies.sentCopy(raw, c.email, snapshot);
      await this.replies.recordParsed(parsed, c.email, evidence, cursor);
      uid = next; processed++;
    }
    if (!uids.length) await this.replies.recordParsed(null, c.email, null, { key, value: { account: c.email, folder, validity, uid, since: config.since, checkedAt: new Date(this.clock()).toISOString() } });
    return { folder, processed, more: uids.length > config.batch, since: config.since, lastUid: uid };
  }
  async run(config) {
    let captureLock;
    try {
      await this.replies.imports.withWrite(async () => {
        captureLock = await fs.open(path.join(this.replies.imports.workspaceDir, 'reply-capture.lock'), 'wx', 0o600);
        await captureLock.writeFile(String(process.pid));
      });
      const snapshot = await this.replies.rootsFromSource();
      await this.replies.refreshHistory(snapshot);
      this.lastError = null;
      await this.replies.transaction((state) => { delete state.monitors._capture; });
      for (const c of config.mailboxes) {
        if (this.stopped) break;
        const previous = (await this.replies.load()).monitors[c.id] || {};
        if (previous.nextAt && Date.parse(previous.nextAt) > this.clock()) continue;
        let client, folders = [];
        try {
          if (!Object.values((await this.replies.load()).roots).some((r) => r.account === c.email && !r.demo)) throw new Error('No confirmed local sent history for this mailbox.');
          client = this.clientFactory(imapOptions(c, this.env)); client.on('error', () => {}); this.clients.add(client);
          await client.connect();
          const available = await client.list();
          const sent = c.sentFolder || available.find((f) => f.specialUse === '\\Sent')?.path;
          if (!sent) throw new Error('Sent folder missing.');
          folders.push(await this.scanFolder(client, c, sent, true, config, snapshot));
          folders.push(await this.scanFolder(client, c, c.inboxFolder || 'INBOX', false, config, snapshot));
          await this.replies.transaction((state) => { state.monitors[c.id] = { status: folders.some((f) => f.more) ? 'Backfill in progress' : 'Checked', checkedAt: new Date(this.clock()).toISOString(), folders, failures: 0, nextAt: new Date(this.clock() + 60000).toISOString() }; });
        } catch {
          const failures = Math.min((previous.failures || 0) + 1, 10);
          await this.replies.transaction((state) => { state.monitors[c.id] = { status: 'Needs attention', checkedAt: previous.checkedAt || null, attemptedAt: new Date(this.clock()).toISOString(), failures, folders,
            message: 'Read-only mailbox check failed. Check confirmed source history, credentials, folder names and connectivity. Failed fetches/storage never advance the cursor; oversized/unparseable relevant messages enter review.', nextAt: new Date(this.clock() + Math.min(3600000, 60000 * 2 ** failures)).toISOString() }; });
        } finally { client?.close(); this.clients.delete(client); }
      }
    } catch {
      this.lastError = 'Could not acquire the capture lock or persist reply state. Check workspace permissions and stale reply-capture.lock after stopping its process.';
      await this.replies.transaction((state) => { state.monitors._capture = { status: 'Needs attention', message: 'Could not acquire the capture lock or persist reply state. Check workspace permissions and stale reply-capture.lock after stopping its process.' }; }).catch(() => {});
    } finally {
      if (captureLock) { await captureLock.close(); await fs.unlink(path.join(this.replies.imports.workspaceDir, 'reply-capture.lock')); }
    }
  }
  async resetBackfill() {
    if (this.running) throw new Error('Wait for the current capture to finish before restarting backfill.');
    await this.replies.transaction(async (state) => {
      const exists = await fs.access(path.join(this.replies.imports.workspaceDir, 'reply-capture.lock')).then(() => true).catch(() => false);
      if (exists) throw new Error('A capture lock is held. Stop its process before restarting backfill.');
      state.cursors = {}; state.monitors = {}; state.events.push({ kind: 'backfill_reset', at: new Date(this.clock()).toISOString() });
    });
    return { ok: true };
  }
  stop() { this.stopped = true; for (const client of this.clients) client.close(); }
}
