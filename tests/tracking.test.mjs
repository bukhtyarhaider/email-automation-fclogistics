import test from "node:test";
import assert from "node:assert/strict";
import { createRecord, initTracking, applyDsn, retryReviews, recordOpen, report, safeRecord, seedConfig } from "../src/tracking.mjs";
import { parseDsn, reconcileSent, MailboxMonitor, imapOptions } from "../src/mailbox-monitor.mjs";
import { pixelHandler, PIXEL } from "../src/pixel-server.mjs";
import { domainHealth } from "../src/domain-health.mjs";
import { deliver } from "../src/delivery.mjs";
import { MailBrowser } from "../src/browser.mjs";
const sender = "sender@example.com", recipient = "owner@example.com";
function setup(options = {}) {
  const state = { history: {}, suppression: {} };
  const t = initTracking(state);
  const result = createRecord(t, { to: recipient, subject: "Dispatch support" }, { sender, ...options });
  const r = result.record;
  r.attemptedAt = new Date().toISOString();
  r.confirmedAt = r.attemptedAt;
  r.sendStatus = "webmail_sent";
  r.messageIds.push("<one@example.com>");
  return { state, t, r };
}
function dsnSource(status = "5.1.1", action = "failed", recipients = [recipient]) {
  return Buffer.from(`From: mailer-daemon@example.net\r\nSubject: Delivery failure\r\nMIME-Version: 1.0\r\nContent-Type: multipart/report; report-type=delivery-status; boundary="x"\r\n\r\n--x\r\nContent-Type: text/plain\r\n\r\nFailure\r\n--x\r\nContent-Type: message/delivery-status\r\n\r\nReporting-MTA: dns; mx.example.net\r\n\r\n${recipients.map((to) => `Final-Recipient: rfc822; ${to}\r\nAction: ${action}\r\nStatus: ${status}\r\nDiagnostic-Code: smtp; ${status[0]}50 mailbox response\r\n continuation`).join('\r\n\r\n')}\r\n\r\n--x\r\nContent-Type: text/rfc822-headers\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('From: sender@example.com\r\nMessage-ID: <one@example.com>\r\n').toString('base64')}\r\n--x--\r\n`);
}
test("multipart DSN: permanent failure, temporary delay, encoded original headers and multiple recipients", async () => {
  const hard = await parseDsn(dsnSource("5.1.1", "failed", [recipient, "other@example.com"]));
  assert.equal(hard.length, 2);
  assert.equal(hard[0].kind, "hard_bounced");
  assert.deepEqual(hard[0].messageIds, ["<one@example.com>"]);
  assert.match(hard[0].diagnostic, /continuation/);
  const soft = await parseDsn(dsnSource("4.2.2", "delayed"));
  assert.equal(soft[0].kind, "soft_bounced");
  assert.deepEqual(await parseDsn(dsnSource("2.0.0", "delivered")), []);
});
test("duplicate DSNs are idempotent; a later temporary notification cannot downgrade a hard bounce", async () => {
  const { t, r } = setup();
  const [hard] = await parseDsn(dsnSource());
  assert(applyDsn(t, hard, sender, "same-source"));
  const count = r.events.length;
  assert.equal(applyDsn(t, hard, sender, "same-source"), false);
  assert.equal(r.events.length, count);
  const [soft] = await parseDsn(dsnSource("4.2.2", "delayed"));
  applyDsn(t, soft, sender, "later-source");
  assert.equal(r.bounceStatus, "hard_bounced");
  assert.equal(r.sendStatus, "webmail_sent");
  assert.equal(report(t).summary.delivery_unknown, 0);
});
test("recipient-only, wrong mailbox, wrong recipient and ambiguous identifiers go to review", async () => {
  const { t, r } = setup();
  const [d] = await parseDsn(dsnSource());
  applyDsn(t, { ...d, messageIds: [] }, sender, "no-id");
  applyDsn(t, d, "unrelated@example.com", "wrong-mailbox");
  applyDsn(t, { ...d, recipient: "other@example.com" }, sender, "wrong-recipient");
  const duplicate = createRecord(t, { to: recipient, subject: r.subject }, { sender }).record;
  duplicate.attemptedAt = r.attemptedAt;
  duplicate.messageIds.push(...r.messageIds);
  applyDsn(t, d, sender, "ambiguous");
  assert.equal(r.bounceStatus, null);
  assert.equal(Object.keys(t.review).length, 4);
});
test("Sent uses exact marker + sender + recipient; unmatched DSNs retry after Message-ID reconciliation", async () => {
  const { t, r } = setup();
  r.messageIds = [];
  const [d] = await parseDsn(dsnSource());
  applyDsn(t, d, sender, "early-bounce");
  const source = Buffer.from(`From: ${sender}\r\nTo: ${recipient}\r\nMessage-ID: <one@example.com>\r\nSubject: ${r.subject}\r\nContent-Type: text/html\r\n\r\n<div data-fc-tracking="${r.id}">Body</div>`);
  assert.equal(await reconcileSent(t, source, sender), true);
  retryReviews(t);
  assert.equal(r.bounceStatus, "hard_bounced");
  assert.equal(Object.keys(t.review).length, 0);
  assert.equal(await reconcileSent(t, Buffer.from(source.toString().replace(recipient, 'unrelated@example.com')), sender), false);
});
test("nonstandard bounce notices are recorded for review without fuzzy matching", async () => {
  const parsed = await parseDsn(Buffer.from("Subject: Undeliverable\r\n\r\nFailure to owner@example.com"));
  assert.equal(parsed[0].recipient, null);
  assert.equal(parsed[0].kind, null);
});
test("migration is additive and stable, keeps delivery unknown and recovers unfinished sends", () => {
  const state = { history: { [recipient]: { status: "Sent", accountEmail: sender, at: '2026-10-01T00:00:00.000Z' } } };
  initTracking(state);
  const id = state.history[recipient].trackingId;
  initTracking(state);
  assert.equal(Object.keys(state.tracking.records).length, 1);
  assert.equal(state.history[recipient].trackingId, id);
  assert.equal(state.tracking.records[id].sendStatus, 'webmail_sent');
  assert.equal(state.tracking.records[id].deliveryStatus, 'delivery_unknown');
  assert.equal(report(state.tracking).summary.open_detected, 0);
});
test("open endpoint returns GIF, uses opaque tokens, deduplicates, bounds events, and supports disable", async () => {
  const state = { history: {} }, t = initTracking(state);
  const { record: r, pixelUrl } = createRecord(t, { to: recipient, subject: 'Hello' }, { sender }, {
    openEnabled: true, consent: true, publicUrl: 'https://track.example.com',
  });
  const token = /\/o\/(.+)\.gif/.exec(pixelUrl)[1];
  assert(!pixelUrl.includes(recipient));
  assert(!JSON.stringify(t).includes(token));
  assert.equal(recordOpen(t, token), false, 'composer preview before attempt is ignored');
  r.attemptedAt = new Date().toISOString();
  let writes = 0;
  const handler = pixelHandler({ tracking: t, persist: async () => { writes++; } });
  const request = async (url, method = 'GET') => {
    const res = { writeHead(status, headers) { this.status = status; this.headers = headers; }, end(bytes) { this.bytes = bytes; } };
    await handler({ url, method }, res); return res;
  };
  const first = await request(`/o/${token}.gif`);
  assert.equal(first.status, 200);
  assert.deepEqual(first.bytes, PIXEL);
  for (let i = 0; i < 1000; i++) await request(`/o/${token}.gif`);
  assert.equal(writes, 1);
  assert.equal(r.opens.length, 1);
  assert.equal(recordOpen(t, token, false), false);
  assert.equal((await request('/api/state')).status, 404);
  assert.equal((await request(`/o/${'z'.repeat(43)}.gif`)).status, 200);
  assert.equal((await request(`/o/${token}.gif`, 'HEAD')).bytes, undefined);
  for (let i = 0; i < 500; i++) recordOpen(t, token, true, new Date(Date.UTC(2026, 0, 1, i)).toISOString());
  assert.equal(r.opens.length, 96);
  assert(r.events.length <= 100);
  assert(!('openTokenHash' in safeRecord(r)));
});
test("open endpoint tolerates tracking storage outage", async () => {
  const t = initTracking({ history: {} });
  const { record: r, pixelUrl } = createRecord(t, { to: recipient, subject: 'Hi' }, { sender }, { openEnabled: true, consent: true, publicUrl: 'https://track.example.com' });
  r.attemptedAt = new Date().toISOString();
  const handler = pixelHandler({ tracking: t, persist: async () => { throw new Error('unavailable'); } });
  let status;
  await handler({ method: 'GET', url: new URL(pixelUrl).pathname }, { writeHead(s) { status = s; }, end() {} });
  assert.equal(status, 200);
});
test("tracking hooks unavailable during send never resubmit or lose webmail confirmation", async () => {
  const state = { history: {}, workbook: { file: 'sample.xlsx' } };
  let sends = 0;
  await deliver({ state, lead: { id: '1', email: recipient, company: 'Example' }, message: { subject: 'Hi' },
    persist: async () => {}, syncStatus: async () => {}, event: () => {}, tracking: () => { throw new Error('tracking unavailable'); },
    send: async () => { sends++; return 'Message sent'; } });
  assert.equal(sends, 1);
  assert.equal(state.history[recipient].sendStatus, 'webmail_sent');
  assert.equal(state.history[recipient].trackingSyncNeeded, true);
  assert(state.history[recipient].trackingId);
});
test("known pre-submit failure is distinct from missing confirmation; a click alone is insufficient", async () => {
  const invoke = async (send) => {
    const state = { history: {}, workbook: { file: 'sample.xlsx' } };
    await assert.rejects(deliver({ state, lead: { id: '1', email: recipient, company: 'Example' }, message: { subject: 'Hi' },
      persist: async () => {}, syncStatus: async () => {}, event: () => {}, send }));
    return state.history[recipient];
  };
  assert.equal((await invoke(async () => { const e = new Error('Validation failed'); e.sendNotAttempted = true; throw e; })).sendStatus, 'send_failed');
  assert.equal((await invoke(async () => 'Clicked Send')).sendStatus, 'delivery_unknown');
});
test("MailBrowser requires a fresh visible notice after Send and marks pre-submit validation failures", async () => {
  const mail = new MailBrowser();
  let clicked = 0, waited = 0;
  mail.validate = async () => {};
  mail.prepared = { composer: { getByRole: () => ({ click: async () => { clicked++; } }) } };
  mail.page = { getByText: () => ({ isVisible: async () => false, waitFor: async () => { waited++; }, innerText: async () => 'Message sent' }) };
  assert.equal(await mail.send(), 'Message sent');
  assert.equal(clicked, 1); assert.equal(waited, 1);
  mail.validate = async () => { throw new Error('Bad recipient'); };
  await assert.rejects(mail.send(), (e) => e.sendNotAttempted === true);
});
class FakeClient {
  constructor(placement = 'INBOX') { this.placement = placement; this.reads = []; }
  on() {}
  async connect() {}
  close() {}
  async list() { return [{ path: 'Sent', specialUse: '\\Sent' }, { path: 'Junk', specialUse: '\\Junk' }]; }
  async mailboxOpen(folder, options) { assert.equal(options.readOnly, true); this.folder = folder; return { uidValidity: 1 }; }
  async search() { return this.folder === this.placement ? [10] : []; }
  async fetchOne() { return { envelope: this.envelope }; }
}
for (const [folder, expected] of [['INBOX', 'inbox'], ['Junk', 'spam']]) {
  test(`seed placement: ${expected} requires exact authorized mailbox evidence`, async () => {
    const { state, r } = setup({ seedId: 'gmail' });
    r.subject = `Dispatch [FC seed ${r.id}]`;
    const client = new FakeClient(folder);
    client.envelope = { subject: r.subject, from: [{ address: sender }], to: [{ address: recipient }] };
    const monitor = new MailboxMonitor({ state, persist: async () => {}, env: { TEST_TOKEN: 'fake-token' }, clientFactory: () => client });
    await monitor.inspectSeed({ id: 'gmail', email: recipient, user: recipient, host: 'imap.gmail.com', provider: 'gmail', accessTokenEnv: 'TEST_TOKEN' });
    assert.equal(r.placement.status, expected);
    assert.equal(r.placement.source, 'imap');
  });
}
test("mailbox errors back off without leaking secrets; OAuth is required for Outlook", async () => {
  const { state } = setup();
  const env = { FC_MONITOR_ENABLED: '1', FC_IMAP_USER: sender, FC_IMAP_PASSWORD: 'secret-password' };
  let connections = 0;
  const monitor = new MailboxMonitor({ state, persist: async () => {}, env, clock: () => 1000,
    clientFactory: () => ({ on() {}, async connect() { connections++; throw new Error('secret-password'); }, close() {} }) });
  await monitor.run(); await monitor.run();
  assert.equal(connections, 1);
  assert(!JSON.stringify(state).includes('secret-password'));
  assert.equal(state.tracking.worker['sender:privateemail'].status, 'Needs attention');
  assert.throws(() => imapOptions({ host: 'outlook.office365.com', user: sender, provider: 'outlook', passwordEnv: 'PASS' }, { PASS: 'x' }), /OAuth/);
  const options = imapOptions({ host: 'mail.privateemail.com', user: sender, passwordEnv: 'PASS' }, { PASS: 'x' });
  assert.equal(options.secure, true);
  assert.equal(options.tls.rejectUnauthorized, true);
  assert.equal(options.logger, false);
});
test("IMAP cursor commits with processing, replays safely, and never modifies mailbox messages", async () => {
  const { state, r } = setup();
  let writes = 0;
  const client = new FakeClient();
  client.search = async () => [7];
  client.fetchOne = async (_, query) => query.size ? { size: 1000 } : { source: dsnSource() };
  const monitor = new MailboxMonitor({ state, persist: async () => { writes++; } });
  await monitor.scan(client, { user: sender, host: 'mail.privateemail.com' }, 'INBOX');
  const count = r.events.length;
  await monitor.scan(client, { user: sender, host: 'mail.privateemail.com' }, 'INBOX');
  assert.equal(writes, 1);
  assert.equal(r.events.length, count);
  assert.equal(r.bounceStatus, 'hard_bounced');
  assert.equal(Object.values(state.tracking.cursors)[0].uid, 7);
});
test("domain checks distinguish absent records from lookup failures and never write DNS", async () => {
  const result = await domainHealth('example.com', ['selector'], async (name) => {
    if (name === 'example.com') return [['v=spf1 ', '+all']];
    if (name.startsWith('_dmarc')) return [['v=DMARC1; p=quarantine']];
    const e = new Error('No TXT'); e.code = 'ENODATA'; throw e;
  });
  assert(result.warnings.some((w) => w.includes('+all')));
  assert(result.warnings.some((w) => w.includes('missing or revoked')));
  const unknown = await domainHealth('example.com', [], async () => { throw new Error('timeout'); });
  assert.equal(unknown.spf.state, 'unknown');
});
test("seed config rejects duplicate recipients and inline credentials; report filters independent dimensions", () => {
  assert.throws(() => seedConfig({ FC_SEEDS: JSON.stringify([{ id: 'a', email: recipient, password: 'bad' }]) }), /inline/);
  const { t, r } = setup();
  r.campaignId = 'campaign-1';
  r.firstOpenAt = r.attemptedAt;
  r.bounceStatus = 'soft_bounced'; r.deliveryStatus = 'soft_bounced';
  assert.equal(report(t, new URLSearchParams({ campaign: 'campaign-1', status: 'open_detected' })).total, 1);
  assert.equal(report(t).summary.webmail_sent, 1);
  assert.equal(report(t).summary.soft_bounced, 1);
  assert.equal(report(t).summary.delivery_unknown, 0);
  assert.equal(report(t, new URLSearchParams({ campaign: 'other' })).total, 0);
});
