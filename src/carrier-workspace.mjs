// Production bridge for reviewed workbook revisions and captured carrier replies.
// The sending implementation remains in server.mjs/browser.mjs/delivery.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ExperimentImports } from './experiment-imports.mjs';
import { ExperimentReplies, replyReviewVersion } from './experiment-replies.mjs';
import { ReplyCapture, replyCaptureConfig } from './reply-capture.mjs';
import { collectProtections } from './carrier-identity.mjs';
import { ConversationAssistant } from './conversation-assistant.mjs';
import { digest } from './reply-parser.mjs';
const copy = (value) => structuredClone(value);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const prefix = 'Captured carrier opt-out: ';

class CarrierReplies extends ExperimentReplies {
  constructor(options) { super(options); this.onCommit = options.onCommit; this.onFailure = options.onFailure; this.contacts = options.contacts; this.accountsAllowed = options.accountsAllowed; }
  transaction(fn) {
    const run = () => this.imports.withWrite(async () => {
      const state = await this.load();
      const result = await fn(state);
      for (const p of Object.values(state.protections)) if (!p.demo) p.reason = prefix + p.messageId;
      try { await this.persist(state); } catch(e) { this.onFailure(); throw e; } // A failed evidence write blocks outreach until recovery.
      await this.onCommit(state);
      return result;
    });
    const task = this.tail.then(run, run); this.tail = task.catch(() => {}); return task;
  }
  contactEmails() { return [...new Set(this.contacts().map((c) => c.email).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))]; }
  allowedAccounts() { return this.accountsAllowed(); }
  async rootsFromSource() { return { ...await super.rootsFromSource(), knownEmails:this.contactEmails() }; }
  async detail(id, type) { const result = await super.detail(id,type);for(const m of result.messages)m.reviewVersion=replyReviewVersion(m);return result; }
  async list(params) {
    const result = await super.list(params);
    result.protectionNote = result.protectionNote ? 'Captured opt-outs block outreach on this PC immediately. Shared protection delivery is shown below; other PCs require the team coordinator.' : null;
    return result;
  }
}

export class CarrierWorkspace {
  constructor({ dataDir, state, persist, readWorkbook, team, python, env = process.env, clientFactory, commitCampaign, contacts = () => [], replyGuard = () => null }) {
    Object.assign(this, { dataDir, state, persist, readWorkbook, team, env, contacts });
    this.commitCampaign = commitCampaign || (async (campaign, next) => {
      const before = copy(campaign);
      Object.keys(campaign).forEach((key) => delete campaign[key]);Object.assign(campaign,next);
      if(state.activeCampaign===campaign.id)state.workbook=campaign.workbook;
      try { await this.persist(); } catch(e) { Object.keys(campaign).forEach((key)=>delete campaign[key]);Object.assign(campaign,before);if(state.activeCampaign===campaign.id)state.workbook=campaign.workbook;throw e; }
    });
    this.imports = new ExperimentImports({ dataDir, workspaceDir: path.join(dataDir, 'carrier-workspace'), python, managed: true, stateReader: () => state });
    this.replies = new CarrierReplies({ imports: this.imports, contacts, accountsAllowed: () => [...new Set([...(state.profiles || []).map((p) => p.email?.toLowerCase()), ...this.configuredAccounts()])].filter(Boolean), onCommit: (s) => this.applyProtections(s), onFailure: () => { this.error='Carrier reply storage failed. Restore its health before sending.'; } });
    this.capture = new ReplyCapture({ replies: this.replies, env: this.captureEnv(), clientFactory });
    this.holds = new Map(); this.error = null;
    this.assistant = new ConversationAssistant({ replies:this.replies, state, guard:(email)=>this.guard(email)||replyGuard(email), contacts });
  }
  captureEnv(config = this.state.replyCapture) {
    const environment = { ...this.env };
    for (const key of ['CAPTURE_ENABLED', 'AUTO', 'MAILBOXES', 'SINCE', 'BATCH', 'ALL_HISTORY', 'ALL_FOLDERS', 'PAGES']) {
      delete environment['FC_EXPERIMENT_REPLY_' + key];
      const value = this.env['FC_REPLY_' + key];
      if (value !== undefined) environment['FC_EXPERIMENT_REPLY_' + key] = value;
    }
    if (!config && !this.env.FC_REPLY_SINCE && this.env.FC_REPLY_ALL_HISTORY === undefined) environment.FC_EXPERIMENT_REPLY_ALL_HISTORY='1';
    if (!config && this.env.FC_REPLY_ALL_FOLDERS === undefined) environment.FC_EXPERIMENT_REPLY_ALL_FOLDERS='1';
    if (!config && this.env.FC_REPLY_PAGES === undefined) environment.FC_EXPERIMENT_REPLY_PAGES='5';
    if (config) {
      Object.assign(environment, {
        FC_EXPERIMENT_REPLY_CAPTURE_ENABLED: config.enabled ? '1' : '0',
        FC_EXPERIMENT_REPLY_AUTO: config.auto ? '1' : '0',
        FC_EXPERIMENT_REPLY_MAILBOXES: JSON.stringify(config.mailboxes),
        FC_EXPERIMENT_REPLY_SINCE: config.since,
        FC_EXPERIMENT_REPLY_BATCH: String(config.batch),
        FC_EXPERIMENT_REPLY_ALL_HISTORY: config.allHistory ? '1' : '0',
        FC_EXPERIMENT_REPLY_ALL_FOLDERS: config.allFolders ? '1' : '0',
        FC_EXPERIMENT_REPLY_PAGES: String(config.pages || 5),
      });
    }
    return environment;
  }
  configuredAccounts() { try { return replyCaptureConfig(this.capture.env).mailboxes.map((m)=>m.email); } catch { return []; } }
  async initialize() {
    try { await this.applyProtections(await this.replies.load()); await this.replies.refreshHistory(); }
    catch { this.error = 'Carrier protection storage is unavailable. Restore the carrier-workspace backup before sending.'; }
  }
  guard(email) { return this.error || this.holds.get(email) || null; }
  async applyProtections(replies) {
    const holds = new Map();
    for (const p of Object.values(replies.protections).filter((p) => !p.demo)) {
      holds.set(p.email, 'Captured carrier opt-out');
      const reason = prefix + p.messageId;
      this.state.suppression[p.email] ||= reason;
      this.state.replySuppressionOutbox ||= {};
      if (this.state.replySuppressionSent?.[p.email] !== reason) this.state.replySuppressionOutbox[p.email] ||= { reason, capturedAt: p.at };
    }
    this.holds = holds; this.error = null;
    if (holds.size) await this.persist();
    if (holds.size) void this.flushSuppression().catch(() => {});
  }
  async flushSuppression() {
    if (this.flushing || !this.state.settings.team.enabled) return;
    this.flushing = true;
    try {
      for (const [email, item] of Object.entries(this.state.replySuppressionOutbox || {})) {
        try {
          await this.team.call('suppress', { email, reason: item.reason });
          // Persist-before-send means a failed acknowledgement is safe to replay.
          delete this.state.replySuppressionOutbox[email];
          this.state.replySuppressionSent ||= {};
          const previous = this.state.replySuppressionSent[email]; this.state.replySuppressionSent[email] = item.reason;
          try { await this.persist(); }
          catch (error) { this.state.replySuppressionOutbox[email] = item; if (previous) this.state.replySuppressionSent[email] = previous; else delete this.state.replySuppressionSent[email]; throw error; }
        } catch { return; }
      }
    } finally { this.flushing = false; }
  }
  async status() {
    const capture = await this.capture.status();
    let config; try { config = replyCaptureConfig(this.capture.env); } catch { config = { enabled:false, auto:false, since:new Date(Date.now()-30*86400000).toISOString().slice(0,10), batch:50, mailboxes:[] }; }
    return { ...capture, configurationSource: this.state.replyCapture ? 'Saved on this PC' : 'Environment / defaults',
      configuration: { enabled: config.enabled, auto: config.auto, since: config.since, batch: config.batch, allHistory:config.allHistory, allFolders:config.allFolders, pages:config.pages, mailboxes: config.mailboxes },
      protectionHealth: this.error || 'Local protection guard active',
      sharedProtection: this.state.settings.team.enabled ? { enabled: true, pending: Object.keys(this.state.replySuppressionOutbox || {}).length } : { enabled: false, pending: 0 } };
  }
  async configure(input) {
    if (this.capture.running) throw fail('Wait for the current mailbox check before changing its configuration.', 409);
    if (input.enabled && input.confirmReadOnly !== true) throw fail('Confirm authorized read-only mailbox access before enabling capture.');
    // Validate only supported nonsecret configuration. Unknown fields are never persisted.
    if (!Array.isArray(input.mailboxes)) throw fail('Configure a mailbox list.');
    const mailboxes = input.mailboxes.map((m) => {
      if (Object.keys(m).some((k) => !['id','email','user','host','port','inboxFolder','sentFolder','passwordEnv','accessTokenEnv','provider','authMode'].includes(k))) throw fail('Use credential environment references, not secret values or unsupported mailbox fields.');
      if (typeof m.host !== 'string' || m.host.length > 253 || /[\s/:]/.test(m.host) || (m.port && m.port !== 993)) throw fail('Use an IMAP hostname and TLS port 993.');
      for (const field of ['user','inboxFolder','sentFolder']) if (m[field] && (typeof m[field] !== 'string' || m[field].length > 512 || /[\r\n\0]/.test(m[field]))) throw fail('Use valid mailbox user and folder names.');
      if (m.passwordEnv && m.accessTokenEnv) throw fail('Choose one credential reference per mailbox.');
      if (!['custom','privateemail','gmail','yahoo','outlook',undefined].includes(m.provider) || !['password','app_password','oauth',undefined].includes(m.authMode)) throw fail('Choose a supported provider and authentication mode.');
      if (m.provider === 'outlook' && !m.accessTokenEnv) throw fail('Outlook requires a provider-authorized OAuth token reference.');
      if (['gmail','yahoo'].includes(m.provider) && !m.accessTokenEnv && m.authMode !== 'app_password') throw fail('Gmail/Yahoo require OAuth or an approved app password.');
      if (m.authMode === 'oauth' && !m.accessTokenEnv) throw fail('Enter the OAuth token environment-variable name.');
      return copy(m);
    });
    const config = { enabled: input.enabled === true, auto: input.auto === true, since: input.since, batch: Number(input.batch), allHistory:input.allHistory===true, allFolders:input.allFolders===true, pages:Number(input.pages||5), mailboxes };
    replyCaptureConfig(this.captureEnv(config));
    if(config.enabled&&!config.mailboxes.length)throw fail('Add at least one authorized mailbox before enabling capture.');
    const old = this.state.replyCapture;
    this.state.replyCapture = config;
    try { await this.persist(); }
    catch (e) { this.state.replyCapture = old; throw e; }
    this.capture.env = this.captureEnv(config);
    return { ok: true };
  }
  async fingerprint(campaign) {
    const source = await this.imports.source(campaign.id);
    return digest(JSON.stringify({ campaign, workbook: source.sourceHash }));
  }
  async importStatus(campaignId, params) {
    const c = this.state.campaigns.find((c) => c.id === campaignId);
    if (!c) throw fail('Choose an existing campaign.');
    return { ...await this.imports.status(campaignId, params), publishedRevision: c.importRevision?.revisionId || null,
      activationToken: await this.fingerprint(c).catch(() => null), campaignEnabled: c.enabled, reviewRequired: c.reviewRequired === true,
      currentWorkbook: c.workbook?.name, activations: c.importActivations || [] };
  }
  async activate(input) {
    if (input.confirmActivation !== true) throw fail('Confirm using this revision for the campaign.');
    return this.imports.withWrite(async () => {
      const c = this.state.campaigns.find((c) => c.id === input.campaignId);
      if (!c) throw fail('Campaign not found.');
      if (this.state.automation.enabled) throw fail('Stop outreach before activating an import revision.', 409);
      if (input.expectedToken !== await this.fingerprint(c)) throw fail('Campaign or workbook changed. Refresh the revisions and review before activating.', 409);
      const store = await this.imports.load();
      const entry = Object.values(store.imports).find((e) => e.campaignId === c.id);
      const revision = entry?.revisions.find((r) => r.revisionId === input.revisionId);
      if (!revision) throw fail('Choose a saved revision of this campaign.');
      const folder = path.join(this.imports.workspaceDir, 'revisions', revision.revisionId);
      const bytes = await fs.readFile(path.join(folder, 'working.xlsx'));
      if (digest(bytes) !== revision.workingHash) throw fail('Saved revision changed. Restore a trusted archive backup.');
      const records = await fs.readFile(path.join(folder, 'records.json'));
      if (digest(records) !== revision.recordsHash) throw fail('Saved identity evidence changed. Restore a trusted archive backup.');
      const current = await this.imports.source(c.id);
      const currentParsed = await this.readWorkbook(path.join(this.dataDir, c.workbook.file), c.mapping || {});
      store.protections = collectProtections(this.state, currentParsed.leads, await this.imports.replyProtections(store.protections));
      // Retain guards before changing any pointer; an interrupted activation errs toward protection.
      await this.imports.persist(store);
      const file = `leads-${randomUUID()}.xlsx`, target = path.join(this.dataDir, file);
      const h = await fs.open(target, 'wx', 0o600);
      try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
      let parsed;
      try { parsed = await this.readWorkbook(target, revision.mapping); }
      catch (e) { await fs.unlink(target).catch(() => {}); throw e; }
      const prior = copy(c), previousWorkbook = c.workbook.file;
      const activationId = randomUUID();
      const next = copy(c);
      next.workbook = { ...c.workbook, file };
      next.mapping = copy(revision.mapping); next.enabled = false; next.reviewRequired = false;
      next.importRevision = { revisionId: revision.revisionId, sourceLabel: revision.sourceLabel, acquiredAt: revision.acquiredAt, permission: revision.permission, workingHash: revision.workingHash, activatedAt: new Date().toISOString() };
      next.importActivations = [...(c.importActivations || []), { id: activationId, revisionId: revision.revisionId, at: next.importRevision.activatedAt, previousWorkbook, previousHash: current.sourceHash, file, kind:'activated', previous: { workbook: prior.workbook, mapping: prior.mapping, importRevision: prior.importRevision || null, reviewRequired: prior.reviewRequired || false } }];
      await this.commitCampaign(c, next);
      return { ok: true, campaignId: c.id, activationId, parsed, message: 'Reviewed revision is active. Campaign remains paused; inspect leads, then enable it in Campaigns.' };
    });
  }
  async undo(input) {
    if (input.confirmActivation !== true) throw fail('Confirm undoing the last workbook activation.');
    return this.imports.withWrite(async () => {
      const c = this.state.campaigns.find((c) => c.id === input.campaignId);
      if (!c || this.state.automation.enabled) throw fail('Stop outreach and choose a campaign before undoing an activation.');
      if (input.expectedToken !== await this.fingerprint(c)) throw fail('Campaign changed. Refresh before undoing its activation.', 409);
      const last = c.importActivations?.at(-1);
      if (!last?.previous || last.kind !== 'activated' || last.file !== c.workbook.file) throw fail('There is no current activation to undo.');
      const previousFile = path.resolve(this.dataDir, last.previousWorkbook);
      if (path.dirname(previousFile) !== path.resolve(this.dataDir)) throw fail('Previous workbook path is invalid.');
      const bytes = await fs.readFile(previousFile);
      if (digest(bytes) !== last.previousHash) throw fail('Previous workbook changed. Restore a trusted backup instead.');
      await this.readWorkbook(previousFile, last.previous.mapping);
      const next = copy(c), snapshot = copy(last.previous);
      next.workbook = snapshot.workbook; next.mapping = snapshot.mapping; next.reviewRequired = snapshot.reviewRequired; next.enabled = false;
      if (snapshot.importRevision) next.importRevision = snapshot.importRevision; else delete next.importRevision;
      next.importActivations = [...c.importActivations, { id:randomUUID(), kind:'undone', undoes:last.id, at:new Date().toISOString(), file:next.workbook.file }];
      await this.commitCampaign(c,next);
      return { ok:true, message:'Previous campaign workbook restored. Outreach remains paused; history and protections are retained.' };
    });
  }
  async enrich(c, parsed) {
    if (!c.importRevision) return parsed;
    const store = await this.imports.load(), entry = Object.values(store.imports).find((e) => e.campaignId === c.id);
    const r = entry?.revisions.find((r) => r.revisionId === c.importRevision.revisionId);
    if (!r) throw fail('Active import identity evidence is missing. Restore its archive.');
    const bytes = await fs.readFile(path.join(this.imports.workspaceDir, 'revisions', r.revisionId, 'records.json'));
    if (digest(bytes) !== r.recordsHash) throw fail('Active carrier identity evidence changed. Restore its archive.');
    const records = new Map(JSON.parse(bytes).map((r) => [r.provenance.originalLeadId, r]));
    const protections = await this.imports.replyProtections(store.protections);
    for (const lead of parsed.leads) {
      const record = records.get(lead.id);
      if (record && record.email === lead.email) {
        lead.carrier = { id: record.carrierId, contactId: record.contactId, dot: record.dot, mc: record.mc, identityStatus: record.identityStatus, provenance: record.provenance };
        lead.importProtection = [...new Set([...(record.protection || []), ...(protections[lead.email] || [])])].join('; ');
      } else lead.importProtection = 'Row identity changed since the reviewed revision. Review this workbook again.';
    }
    return parsed;
  }
  stop() { this.capture.stop(); }
}
