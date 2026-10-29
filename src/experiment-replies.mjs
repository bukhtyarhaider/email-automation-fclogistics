import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseReply, digest, categories, messageIds } from './reply-parser.mjs';
import { isToolConversation } from './tool-conversation-scope.mjs';
import { reconcileSent } from './mailbox-monitor.mjs';
export const replyReviewVersion = (m) => digest(JSON.stringify({ category:m.category, kind:m.kind, match:m.match, rootId:m.rootId, note:m.reviewNote, reviewedAt:m.reviewedAt }));
export const DEMO_ACCOUNT = 'demo.dispatch@example.invalid';
const validEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
const newState = () => ({ version: 1, roots: {}, messages: {}, cursors: {}, monitors: {}, protections: {}, events: [] });
const rootKey = (account, tracking) => digest(`${account}\n${tracking}`);
export function matchReply(state, mail, account, knownEmails = [], toolSentOnly = false) {
  const roots = Object.values(state.roots).filter((r) => r.account === account && (!toolSentOnly || isToolConversation(r)));
  const evidence = new Set([...mail.references, ...mail.dsn.flatMap((d) => d.messageIds || [])]);
  const referencedRoots = new Set(Object.values(state.messages).filter((m) => m.account === account && m.messageId && evidence.has(m.messageId) && !['review','ignored'].includes(m.match)).map((m) => m.rootId));
  const candidates = roots.filter((r) => r.messageIds.some((id) => evidence.has(id)) || referencedRoots.has(r.id));
  const knownContact = ((mail.to.includes(account) || mail.deliveredTo === account) && mail.from.some((email) => knownEmails.includes(email))) || (mail.from[0] === account && mail.to.some((email) => knownEmails.includes(email))) || roots.some((r) => mail.from.includes(r.recipient) || (mail.from[0] === account && mail.to.includes(r.recipient)));
  if (!candidates.length) return knownContact ? { match: 'review', reason: 'Known contact, but no exact message-reference match' } : { match: 'ignore', reason: 'No known contact or message reference; nothing retained' };
  if (candidates.length !== 1) return { match: 'review', reason: 'References match more than one conversation' };
  const root = candidates[0];
  const inbound = mail.from.length === 1 && mail.from[0] === root.recipient && (mail.to.includes(account) || mail.deliveredTo === account);
  const outbound = mail.from.length === 1 && mail.from[0] === account && mail.to.includes(root.recipient);
  const bounce = mail.kind === 'bounce' && mail.dsn.some((d) => d.recipient === root.recipient && (d.messageIds || []).some((id) => evidence.has(id) && root.messageIds.includes(id)));
  if (!inbound && !outbound && !bounce) return { match: 'review', reason: 'Message reference found, but sender/recipient evidence differs' };
  return { rootId: root.id, match: 'exact', direction: outbound ? 'outbound' : 'inbound', reason: bounce ? 'Exact structured delivery notification' : 'Exact references and participants' };
}
export function applyReply(state, mail, account, source, clock = Date.now, knownEmails = [], toolSentOnly = false) {
  const base = digest(`${account}:${mail.messageId || mail.fingerprint}`);
  const existing = Object.values(state.messages).find((m) => m.account === account && m.fingerprint === mail.fingerprint);
  if (existing) {
    // A later read-only Sent observation adds evidence to an imported copy without duplicating the message.
    if (source.type === 'imap' && source.folderRole === 'sent' && existing.direction === 'outbound' && !existing.sentEvidence) existing.sentEvidence = source;
    retryPending(state, toolSentOnly);
    return { duplicate: true, messageId: existing.id };
  }
  const sourceId = mail.messageId && Object.values(state.roots).find((r) => r.account === account && r.messageIds.includes(mail.messageId));
  if (sourceId && mail.from.length === 1 && mail.from[0] === account && mail.to.includes(sourceId.recipient) && mail.subject === sourceId.subject && !mail.references.length) {
    if(source.type==='imap'&&source.folderRole==='sent'&&!mail.bodyUnavailable&&(sourceId.bodyUnavailable||!sourceId.body)){sourceId.body=mail.text;sourceId.bodyTruncated=Boolean(mail.textTruncated);sourceId.bodyUnavailable=false;sourceId.bodyRecovered=true;sourceId.bodyEvidence={...source,date:mail.date};}
    return { sourceCopy: true };
  }
  let match = matchReply(state, mail, account, knownEmails, toolSentOnly);
  if (match.match === 'ignore') return { ignored: true };
  if (mail.bodyUnavailable) match = { match: 'review', reason: 'Message body was oversized or unparseable. Inspect the mailbox before linking/classifying.' };
  const conflict = state.messages[base];
  if (conflict) match = { match: 'review', reason: 'Message-ID reused with different content; inspect both copies' };
  if (sourceId && mail.from[0] !== account) match = { match: 'review', reason: 'Incoming message reuses an outbound Message-ID; inspect the mailbox' };
  const id = conflict ? digest(`${base}:${mail.fingerprint}`) : base;
  const record = { ...mail, ...match, id, account, demo: account === DEMO_ACCOUNT,
    source, knownCarrierContact: mail.from.length === 1 && knownEmails.includes(mail.from[0]) && (mail.to.includes(account) || mail.deliveredTo === account), capturedAt: new Date(clock()).toISOString(), category: mail.suggestion.category, classificationSource: 'rule', reviewNote: '', reviewedAt: null,
    manualMatchRequired: Boolean(conflict || mail.bodyUnavailable || (sourceId && mail.from[0] !== account)) };
  state.messages[id] = record;
  if (record.rootId && record.direction === 'outbound' && record.messageId) state.roots[record.rootId].messageIds = [...new Set([...state.roots[record.rootId].messageIds, record.messageId])];
  protectReply(state, record);
  retryPending(state, toolSentOnly);
  return { messageId: id, match: record.match, kind: record.kind };
}
function protectReply(state, record) {
  if (record.direction === 'outbound' || record.from.length !== 1 || record.from[0] === record.account) return;
  const root = state.roots[record.rootId];
  const contacts = Object.values(state.roots).filter((r) => r.account === record.account && r.recipient === record.from[0] && (record.to.includes(record.account) || record.deliveredTo === record.account));
  if (!contacts.length && !(root && record.match === 'manual') && !record.knownCarrierContact) return;
  if (record.kind === 'human') for (const r of [...contacts, ...(root ? [root] : [])]) r.followUpPaused = true;
  if (record.category === 'opt_out' && record.kind === 'human' && (record.suggestion.definiteOptOut || record.classificationSource === 'manual')) {
    const email = record.from[0];
    if (!validEmail(email)) return;
    const key = `${record.demo ? 'demo' : 'real'}:${email}`;
    state.protections[key] ||= { email, demo: record.demo, reason: 'Opt-out reply captured in experiment', messageId: record.id, at: record.capturedAt };
    if (root) root.followUpPaused = true;
  }
}
function retryPending(state, toolSentOnly = false) {
  // A child can be fetched before its parent (folder order / imported EML order).
  // Revisit unresolved links until this bounded closure is stable; a later scan continues long chains.
  for (let pass = 0; pass < 100; pass++) {
    let changed = false;
    for (const message of Object.values(state.messages).filter((m) => m.match === 'review' && !m.reviewedAt && !m.manualMatchRequired)) {
      const match = matchReply(state, message, message.account, [], toolSentOnly);
      if (match.match === 'exact') { Object.assign(message, match); protectReply(state, message); changed = true; }
    }
    if (!changed) break;
  }
}

export class ExperimentReplies {
  constructor({ imports, clock = Date.now }) { this.imports = imports; this.clock = clock; this.tail = Promise.resolve(); }
  async load() {
    try { const state = JSON.parse(await fs.readFile(path.join(this.imports.workspaceDir, 'replies.json'), 'utf8')); if (state.version !== 1) throw new Error(); return state; }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read experiment replies. Restore the workspace backup before continuing.'); return newState(); }
  }
  async persist(state) {
    const filename = path.join(this.imports.workspaceDir, 'replies.json'), tmp = path.join(this.imports.workspaceDir, `replies-${randomUUID()}.tmp`);
    const file = await fs.open(tmp, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(state)); await file.sync(); } finally { await file.close(); }
    await fs.rename(tmp, filename);
    if (process.platform !== 'win32') { const dir = await fs.open(this.imports.workspaceDir, 'r'); try { await dir.sync(); } finally { await dir.close(); } }
  }
  async transaction(fn) {
    const run = () => this.imports.withWrite(async () => { const state = await this.load(); const result = await fn(state); await this.persist(state); return result; });
    const task = this.tail.then(run, run); this.tail = task.catch(() => {}); return task;
  }
  contactEmails() { return []; }
  allowedAccounts() { return []; }
  async sourceState() {
    if (this.imports.stateReader) return structuredClone(this.imports.stateReader());
    try { return JSON.parse(await fs.readFile(path.join(this.imports.dataDir, 'state.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw new Error('Source sent history is unavailable. Check the experiment source data folder.'); }
  }
  async rootsFromSource() {
    const source = await this.sourceState();
    const imported = await this.imports.load(), identities = new Map();
    for (const entry of Object.values(imported.imports)) {
      const revisionId = this.imports.managed ? source.campaigns?.find((c) => c.id === entry.campaignId)?.importRevision?.revisionId : entry.activeRevision;
      const revision = entry.revisions.find((r) => r.revisionId === revisionId);
      if (!revision) continue;
      try {
        const bytes = await fs.readFile(path.join(this.imports.workspaceDir, 'revisions', revision.revisionId, 'records.json'));
        if (digest(bytes) !== revision.recordsHash) continue;
        for (const row of JSON.parse(bytes)) {
          if (row.identityStatus !== 'source_dot') continue;
          const matches = identities.get(row.email) || new Map();
          matches.set(row.carrierId, row.company); identities.set(row.email, matches);
        }
      } catch { /* Source send evidence remains usable; no inferred carrier identity. */ }
    }
    const roots = {};
    for (const [recipient, h] of Object.entries(source.history || {})) {
      const account = h.accountEmail?.toLowerCase(), email = (h.recipient || recipient).toLowerCase();
      if (!validEmail(account) || account === DEMO_ACCOUNT || !validEmail(email) || !(h.status === 'Sent' || h.sendStatus === 'webmail_sent')) continue;
      const tracked = source.tracking?.records?.[h.trackingId];
      if (tracked?.seedId) continue;
      const id = rootKey(account, h.trackingId || recipient);
      const identity = identities.get(email);
      roots[id] = { id, account, recipient: email, company: h.company || (identity?.size === 1 ? [...identity.values()][0] : email), carrierId: identity?.size === 1 ? [...identity.keys()][0] : null, identityReview: !identity || identity.size !== 1, campaignId: h.campaignId || null,
        campaignName: h.campaignName || source.campaigns?.find((c) => c.id === h.campaignId)?.name || 'Legacy campaign',
        trackingId: h.trackingId || null, subject: String(h.subject || tracked?.subject || '(No subject)').slice(0, 500),
        body: String(h.body || '').slice(0, 24_000), bodyTruncated: (h.body || '').length > 24_000,
        sentAt: h.confirmedAt || tracked?.confirmedAt || h.at || null, messageIds: messageIds([...(tracked?.messageIds || []), h.providerMessageId]),
        demo: false, source: 'local_sent_history', followUpPaused: false };
    }
    return { source, roots };
  }
  mergeRoots(state, roots) {
    for (const root of Object.values(roots)) {
      const prior = state.roots[root.id];
      state.roots[root.id] = { ...root, messageIds: [...new Set([...(prior?.messageIds || []), ...root.messageIds])], followUpPaused: prior?.followUpPaused || false };
    }
    retryPending(state, this.imports.managed);
  }
  async refreshHistory(snapshot = null) {
    const { roots } = snapshot || await this.rootsFromSource();
    return this.transaction((state) => { this.mergeRoots(state, roots); return { roots: Object.keys(roots).length, withMessageIds: Object.values(roots).filter((r) => r.messageIds.length).length }; });
  }
  async ingest(source, account, evidence = { type: 'eml' }) {
    if (!validEmail(account)) throw new Error('Choose a mailbox email address.');
    account = account.toLowerCase();
    const mail = await parseReply(source);
    const { roots } = await this.rootsFromSource();
    const knownEmails = await this.contactEmails();
    const allowedAccounts = await this.allowedAccounts();
    return this.transaction((state) => {
      if (account !== DEMO_ACCOUNT && !Object.values(roots).some((r) => r.account === account) && !(this.imports.managed && allowedAccounts.includes(account) && knownEmails.length)) throw new Error('Mailbox has no confirmed source send history. Load the correct source data first.');
      this.mergeRoots(state, roots);
      return applyReply(state, mail, account, evidence, this.clock, knownEmails, this.imports.managed);
    });
  }
  async sentCopy(source, account, snapshot = null) {
    const { source: original, roots: originalRoots } = snapshot || await this.rootsFromSource();
    const roots = structuredClone(originalRoots);
    const records = Object.fromEntries(Object.values(roots).filter((r) => r.account === account && original.tracking?.records?.[r.trackingId]).map((r) => [r.trackingId, structuredClone(original.tracking.records[r.trackingId])]));
    const matched = await reconcileSent({ records }, source, account);
    if (!matched) return false;
    await this.transaction((state) => {
      for (const root of Object.values(roots)) if (records[root.trackingId]) root.messageIds = records[root.trackingId].messageIds;
      this.mergeRoots(state, roots);
    });
    return true;
  }
  async recordParsed(mail, account, evidence, cursor = null) {
    const knownEmails = await this.contactEmails();
    return this.transaction((state) => {
      const result = mail ? applyReply(state, mail, account, evidence, this.clock, knownEmails, this.imports.managed) : { ignored: true };
      if (cursor) {state.cursors[cursor.key]=cursor.value;if(this.imports.managed&&cursor.progress){state.monitors._progress=cursor.progress;if(cursor.progress.historyId&&state.monitors._history?.id===cursor.progress.historyId)state.monitors._history.scanned=(state.monitors._history.scanned||0)+1;}}
      return result;
    });
  }
  async review(input) {
    if (!/^[a-f0-9]{64}$/.test(input.messageId || '')) throw new Error('Choose a captured reply message.');
    if (['ignore','restore'].includes(input.action)) return this.transaction((state) => {
      const message = state.messages[input.messageId];
      if (this.imports.managed && message && input.expectedReview !== replyReviewVersion(message)) throw Object.assign(new Error('This reply review changed. Refresh the thread before saving.'), { status:409 });
      if (!message || !['review','ignored'].includes(message.match) || typeof input.note !== 'string' || input.note.trim().length < 5 || input.note.length > 2000) throw new Error('Record an evidence note before ignoring or restoring a review item.');
      message.match = input.action === 'ignore' ? 'ignored' : 'review';
      message.reviewNote = input.note.trim(); message.reviewedAt = input.action === 'ignore' ? new Date(this.clock()).toISOString() : null;
      state.events.push({ kind: input.action === 'ignore' ? 'review_ignored' : 'review_restored', messageId: message.id, at: new Date(this.clock()).toISOString(), note: input.note.trim() });
      return { ok: true };
    });
    if (!categories.includes(input.category) || typeof input.note !== 'string' || input.note.length > 2000) throw new Error('Choose a category and a note up to 2,000 characters.');
    return this.transaction((state) => {
      const message = state.messages[input.messageId];
      if (this.imports.managed && message && input.expectedReview !== replyReviewVersion(message)) throw Object.assign(new Error('This reply review changed. Refresh the thread before saving.'), { status:409 });
      if (!message) throw new Error('Reply message not found. Refresh the inbox.');
      if (message.match === 'ignored') throw new Error('Return this item to review before linking or classifying it.');
      if (message.match === 'review') {
        const root = state.roots[input.rootId];
        if (this.imports.managed && !isToolConversation(root)) throw new Error('Link replies only to a confirmed tool-sent conversation.');
        if (!root || root.account !== message.account || root.demo !== message.demo || input.confirmLink !== true || input.note.trim().length < 5) throw new Error('Select a conversation from the same mailbox, confirm the manual link, and record your evidence.');
        if (message.from.length !== 1 || !validEmail(message.from[0])) throw new Error('A message without one valid sender must remain in review.');
        message.rootId = root.id; message.match = 'manual'; message.direction = message.from[0] === message.account ? 'outbound' : 'inbound';
        message.reason = 'Operator linked conversation; not an automatic match';
      }
      state.events.push({ at: new Date(this.clock()).toISOString(), messageId: message.id, oldCategory: message.category, category: input.category, note: input.note.trim(), kind: 'manual_review' });
      message.category = input.category; message.classificationSource = 'manual'; message.reviewNote = input.note.trim(); message.reviewedAt = new Date(this.clock()).toISOString();
      message.kind = ['out_of_office', 'automated', 'bounce'].includes(input.category) ? input.category : 'human';
      protectReply(state, message);
      retryPending(state, this.imports.managed);
      return { ok: true };
    });
  }
  async accounts() {
    const { source, roots } = await this.rootsFromSource();
    return [...new Set([...Object.values(roots).map((r) => r.account), ...(source.profiles || []).map((p) => p.email?.toLowerCase()).filter(validEmail), DEMO_ACCOUNT])].map((email) => ({ email, demo: email === DEMO_ACCOUNT }));
  }
  async list(params = new URLSearchParams()) {
    const state = await this.load(), mode = params.get('mode') === 'demo';
    const messages = Object.values(state.messages).filter((m) => m.demo === mode);
    const mailbox = params.get('mailbox') || '', q = (params.get('q') || '').toLowerCase(), category = params.get('category') || '';
    const rows = [];
    for (const root of Object.values(state.roots).filter((r) => r.demo === mode)) {
      const thread = messages.filter((m) => m.rootId === root.id && m.match !== 'ignored');
      if (!thread.length) continue;
      const last = thread.slice().sort((a,b) => b.capturedAt.localeCompare(a.capturedAt))[0];
      const inbound = thread.filter((m) => m.direction === 'inbound').sort((a,b) => b.capturedAt.localeCompare(a.capturedAt))[0] || last;
      rows.push({ id: root.id, type: 'conversation', account: root.account, recipient: root.recipient, subject: root.subject, category: inbound.category, classificationSource: inbound.classificationSource, match: inbound.match, kind: inbound.kind, at: last.capturedAt, count: thread.length, paused: root.followUpPaused });
    }
    for (const message of messages.filter((m) => m.match === 'review' || (category === 'ignored' && m.match === 'ignored'))) rows.push({ id: message.id, type: 'review', account: message.account, recipient: message.from.join(', '), subject: message.subject, category: message.category, classificationSource: message.classificationSource, match: message.match, kind: message.kind, at: message.capturedAt, count: 1, reason: message.reason });
    const filtered = rows.filter((r) => (!mailbox || r.account === mailbox) && (!category || (category === 'needs_match' ? r.match === 'review' : category === 'ignored' ? r.match === 'ignored' : r.category === category)) && (!q || [r.recipient,r.subject,r.account].some((s) => s.toLowerCase().includes(q)))).sort((a,b) => b.at.localeCompare(a.at));
    const offset = Math.min(Math.max(0, Math.floor(Number(params.get('offset')) || 0)), Math.max(0, Math.floor((filtered.length - 1) / 25) * 25));
    const scope = messages.filter((m) => m.match !== 'ignored' && (!mailbox || m.account === mailbox));
    const protections = Object.values(state.protections).filter((p) => p.demo === mode && (!mailbox || state.messages[p.messageId]?.account === mailbox));
    return { rows: filtered.slice(offset, offset + 25), total: filtered.length, offset, pageSize: 25, mode: mode ? 'demo' : 'real',
      summary: { humanMessages: scope.filter((m) => m.kind === 'human' && m.direction === 'inbound' && m.match !== 'review').length,
        needsMatch: scope.filter((m) => m.match === 'review').length, automatedMessages: scope.filter((m) => ['automated','out_of_office'].includes(m.kind) && m.from[0] !== m.account).length,
        bounceNotices: scope.filter((m) => m.kind === 'bounce' && m.from[0] !== m.account).length, protectedContacts: protections.length },
      protectionNote: protections.length && !mode ? 'Opt-outs are protected in this experiment only. Apply them in the normal app’s Do not contact list before any further production outreach.' : null,
      coverage: { roots: Object.values(state.roots).filter((r) => r.demo === mode && (!mailbox || r.account === mailbox)).length, rootsWithMessageIds: Object.values(state.roots).filter((r) => r.demo === mode && r.messageIds.length && (!mailbox || r.account === mailbox)).length },
      note: 'Metrics cover the selected mailbox and data mode; search/category filters affect conversation rows. Categories are editable suggestions. Counts describe captured messages, not carrier conversion or complete mailbox coverage.' };
  }
  async detail(id, type) {
    if (!/^[a-f0-9]{64}$/.test(id || '') || !['review','conversation'].includes(type)) throw new Error('Choose a conversation or review item from this inbox.');
    const state = await this.load();
    const message = state.messages[id], root = state.roots[id] || (type === 'review' && message?.match !== 'review' ? state.roots[message?.rootId] : null);
    if (type === 'review' && ['review','ignored'].includes(message?.match)) return { root: null, messages: [message], candidates: Object.values(state.roots).filter((r) => r.account === message.account && r.demo === message.demo).map(({ id, recipient, subject }) => ({ id, recipient, subject })) };
    if (!root) throw new Error('Conversation not found. Refresh the inbox.');
    return { root, messages: Object.values(state.messages).filter((m) => m.rootId === root.id).sort((a,b) => a.capturedAt.localeCompare(b.capturedAt)), candidates: [] };
  }
  async seedDemo() {
    return this.transaction(async (state) => {
      const cases = [
        ['pricing', 'owner-pricing@example.invalid', 'What are your fees for a dry van?'],
        ['interested', 'owner-interest@example.invalid', 'I am interested. Send me the details.'],
        ['remove', 'owner-remove@example.invalid', 'Please remove me from your list.'],
        ['quoted', 'owner-quote@example.invalid', 'Tell me more about your service.\n\nOn Tuesday, Dispatch wrote:\n> Reply remove to opt out.'],
        ['ooo', 'owner-away@example.invalid', 'I am away until next week.'],
        ['auto', 'owner-auto@example.invalid', 'Your message has been added to our automated queue.'],
      ];
      for (const [key, recipient, text] of cases) {
        const id = rootKey(DEMO_ACCOUNT, key), sentId = `<demo-${key}@example.invalid>`;
        state.roots[id] ||= { id, account: DEMO_ACCOUNT, recipient, company: 'Sample carrier', subject: `Dispatch support · ${key}`, body: 'Sample outbound introduction. No email was sent.', sentAt: '2026-10-28T12:00:00.000Z', messageIds: [sentId], demo: true, followUpPaused: false, source: 'synthetic_demo' };
        const raw = `Message-ID: <demo-inbound-${key}@example.invalid>\r\nFrom: ${recipient}\r\nTo: ${DEMO_ACCOUNT}\r\nIn-Reply-To: ${sentId}\r\nSubject: ${key === 'ooo' ? 'Out of office' : `Re: Dispatch support ${key}`}\r\n${['ooo','auto'].includes(key) ? 'Auto-Submitted: auto-replied\r\n' : ''}Content-Type: text/plain; charset=utf-8\r\n\r\n${text}`;
        applyReply(state, await parseReply(Buffer.from(raw)), DEMO_ACCOUNT, { type: 'demo' }, this.clock);
      }
      const ambiguous = await parseReply(Buffer.from(`Message-ID: <demo-unmatched@example.invalid>\r\nFrom: owner-pricing@example.invalid\r\nTo: ${DEMO_ACCOUNT}\r\nSubject: Re: Dispatch support\r\n\r\nCan you explain your service?`));
      applyReply(state, ambiguous, DEMO_ACCOUNT, { type: 'demo' }, this.clock);
      const bounceId = rootKey(DEMO_ACCOUNT, 'bounce');
      state.roots[bounceId] ||= { id: bounceId, account: DEMO_ACCOUNT, recipient: 'owner-bounce@example.invalid', subject: 'Dispatch support · bounce', body: 'Sample outbound. No email was sent.', sentAt: '2026-10-28T12:00:00.000Z', messageIds: ['<demo-bounce@example.invalid>'], demo: true, followUpPaused: false, source: 'synthetic_demo' };
      const dsn = `Message-ID: <demo-dsn@example.invalid>\r\nFrom: mailer-daemon@example.invalid\r\nTo: ${DEMO_ACCOUNT}\r\nSubject: Delivery failed\r\nMIME-Version: 1.0\r\nContent-Type: multipart/report; report-type=delivery-status; boundary="demo"\r\n\r\n--demo\r\nContent-Type: text/plain\r\n\r\nSample failure\r\n--demo\r\nContent-Type: message/delivery-status\r\n\r\nReporting-MTA: dns; example.invalid\r\nOriginal-Message-ID: <demo-bounce@example.invalid>\r\n\r\nFinal-Recipient: rfc822; owner-bounce@example.invalid\r\nAction: failed\r\nStatus: 5.1.1\r\n\r\n--demo--\r\n`;
      applyReply(state, await parseReply(Buffer.from(dsn)), DEMO_ACCOUNT, { type: 'demo' }, this.clock);
      return { ok: true, mode: 'demo' };
    });
  }
}
