import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { collectProtections, registerCarriers } from './carrier-identity.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const inside = (base, target) => { const rel = path.relative(base, target); return !rel || (!rel.startsWith('..') && !path.isAbsolute(rel)); };

export class ExperimentImports {
  constructor({ dataDir, workspaceDir, python, managed = false, stateReader = null }) {
    this.dataDir = path.resolve(dataDir); this.workspaceDir = path.resolve(workspaceDir); this.python = python;
    if ((!managed && inside(this.dataDir, this.workspaceDir)) || inside(this.workspaceDir, this.dataDir)) throw new Error('Experiment workspace must be separate from the source data folder.');
    this.managed = managed; this.stateReader = stateReader;
    this.previews = new Map(); this.busy = false;
  }
  async source(campaignId) {
    const stateBytes = this.stateReader ? JSON.stringify(this.stateReader()) : await fs.readFile(path.join(this.dataDir, 'state.json'));
    const state = JSON.parse(stateBytes);
    const c = (state.campaigns || []).find((c) => c.id === campaignId);
    if (!c) throw new Error('Choose a configured campaign.');
    const base = await fs.realpath(this.dataDir);
    const file = await fs.realpath(path.resolve(base, c.workbook?.file || '')).catch(() => null);
    if (!file || file === base || !inside(base, file)) throw new Error('Campaign workbook is unavailable or outside the source folder.');
    const bytes = await fs.readFile(file);
    return { c, state, bytes, sourceHash: hash(bytes), stateHash: hash(this.managed ? JSON.stringify(c) : stateBytes), importId: hash(`${base}:${c.id}`).slice(0, 24) };
  }
  async load() {
    try { return JSON.parse(await fs.readFile(path.join(this.workspaceDir, 'imports.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot read experiment workspace. Restore its backup before continuing.'); }
    return { version: 1, generation: 0, imports: {}, registry: {}, protections: {}, receipts: {} };
  }
  async pythonRun(file, payload) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.python, ['-B', path.join(root, 'src/workbook.py'), 'experiment', file], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderr = '', done = false;
      const finish = (error, result) => { if (done) return; done = true; clearTimeout(timer); error ? reject(error) : resolve(result); };
      const timer = setTimeout(() => { child.kill(); finish(new Error('Import processing timed out. Try a smaller workbook.')); }, 30_000);
      child.on('error', () => finish(new Error('Could not start Python.'))); child.stdin.on('error', () => {});
      child.stdout.on('data', (b) => { stdout += b; if (Buffer.byteLength(stdout) > 32_000_000) { child.kill(); finish(new Error('Workbook results exceed the experiment size limit.')); } });
      child.stderr.on('data', (b) => { stderr = (stderr + b).slice(0, 1000); });
      child.on('close', (code) => {
        if (code !== 0) return finish(new Error(/Mapping|mapping|column|Status|worksheet|Merged/.test(stderr) ? stderr.trim() : 'Cannot review this workbook. Check the file and mapping.'));
        try { finish(null, JSON.parse(stdout)); } catch { finish(new Error('Invalid workbook review output.')); }
      });
      child.stdin.end(JSON.stringify(payload));
    });
  }
  async review(input) {
    const source = await this.source(input.campaignId), store = await this.load();
    const mapping = Object.hasOwn(input, 'mapping') ? input.mapping : source.c.mapping || {};
    const addStatusColumns = input.addStatusColumns || {};
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-import-preview-'));
    let result;
    try {
      const file = path.join(temp, 'source.xlsx'); await fs.writeFile(file, source.bytes, { mode: 0o600 });
      result = await this.pythonRun(file, { mapping, sourceMapping: source.c.mapping || {}, addStatusColumns, strictStatus:this.managed && Object.hasOwn(input, 'mapping') });
    } finally { await fs.rm(temp, { recursive: true, force: true }); }
    const previewId = randomUUID();
    const importedAt = new Date().toISOString();
    const protections = collectProtections(source.state, [...result.baselineLeads, ...result.leads], await this.replyProtections(store.protections));
    const identity = registerCarriers(structuredClone(store.registry), result.leads, { importId: source.importId, importedAt }, protections);
    while (this.previews.size >= 20) this.previews.delete(this.previews.keys().next().value);
    this.previews.set(previewId, { sourceHash: source.sourceHash, stateHash: source.stateHash, generation: store.generation, campaignId: source.c.id, mapping, addStatusColumns, at: Date.now() });
    return { ...result.report, campaignId: source.c.id, campaignName: source.c.name,
      mode: Object.hasOwn(input, 'mapping') ? 'preview' : 'saved', previewId, identitySummary: identity.summary,
      records: identity.records.slice(0, 10), sourceHash: source.sourceHash, addStatusColumns };
  }
  async withWrite(fn) {
    if (this.busy) throw new Error('An experiment save is running. Wait for it to finish.');
    this.busy = true; let lock;
    try {
      // Resolve symlinks before creating any snapshots. Never write inside source data.
      let ancestor = this.workspaceDir, suffix = [];
      while (true) {
        try { ancestor = await fs.realpath(ancestor); break; }
        catch (error) { if (error.code !== 'ENOENT') throw error; suffix.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor); }
      }
      const resolved = path.join(ancestor, ...suffix), source = await fs.realpath(this.dataDir);
      if ((!this.managed && inside(source, resolved)) || inside(resolved, source) || (this.managed && !inside(source, resolved))) throw new Error('Experiment workspace overlaps source data. Choose a separate folder.');
      await fs.mkdir(this.workspaceDir, { recursive: true, mode: 0o700 });
      lock = await fs.open(path.join(this.workspaceDir, 'write.lock'), 'wx', 0o600).catch(() => { throw new Error('Another experiment writer or interrupted save holds write.lock. Stop that process and inspect the lock before recovery.'); });
      await lock.writeFile(String(process.pid));
      return await fn();
    } finally {
      if (lock) { await lock.close(); await fs.unlink(path.join(this.workspaceDir, 'write.lock')); }
      this.busy = false;
    }
  }
  async persist(store) {
    const filename = path.join(this.workspaceDir, 'imports.json'), tmp = path.join(this.workspaceDir, `${randomUUID()}.tmp`);
    const file = await fs.open(tmp, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(store)); await file.sync(); } finally { await file.close(); }
    await fs.rename(tmp, filename);
    if (process.platform !== 'win32') { const dir = await fs.open(this.workspaceDir, 'r'); try { await dir.sync(); } finally { await dir.close(); } }
  }
  async replyProtections(existing) {
    const protections = structuredClone(existing);
    let replies;
    try { replies = JSON.parse(await fs.readFile(path.join(this.workspaceDir, 'replies.json'), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return protections; throw new Error('Cannot read reply protections. Restore the experiment backup before continuing.'); }
    for (const p of Object.values(replies.protections || {})) if (!p.demo && p.email) protections[p.email] = [...new Set([...(protections[p.email] || []), p.reason])];
    return protections;
  }
  async apply(input) {
    if (input.confirmExperiment !== true) throw new Error('Confirm that this repair will be saved to the experiment copy only.');
    return this.withWrite(async () => {
      const store = await this.load();
      if (store.receipts[input.previewId]) return { ok: true, revisionId: store.receipts[input.previewId], reused: true };
      const preview = this.previews.get(input.previewId);
      if (!preview || Date.now() - preview.at > 15 * 60_000) throw new Error('Preview expired. Review the mapping again before saving.');
      const source = await this.source(preview.campaignId);
      if (source.sourceHash !== preview.sourceHash || source.stateHash !== preview.stateHash || store.generation !== preview.generation) throw new Error('Source data or experiment state changed. Review again before saving.');
      const provenance = input.provenance;
      if (!provenance || typeof provenance.label !== 'string' || !provenance.label.trim() || provenance.label.length > 200 || !['unknown', 'requested_contact', 'existing_relationship'].includes(provenance.permission)) throw new Error('Enter a source label and a valid contact-permission status.');
      const acquiredAt = provenance.acquiredAt || null;
      if (acquiredAt && (!/^\d{4}-\d{2}-\d{2}$/.test(acquiredAt) || !Number.isFinite(Date.parse(`${acquiredAt}T00:00:00Z`)) || new Date(`${acquiredAt}T00:00:00Z`).toISOString().slice(0,10) !== acquiredAt)) throw new Error('Use a valid source acquisition date or leave it unknown.');
      const revisionId = randomUUID(), importedAt = new Date().toISOString();
      const directory = path.join(this.workspaceDir, 'revisions', revisionId);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const original = path.join(directory, 'original.xlsx'), working = path.join(directory, 'working.xlsx');
      await fs.writeFile(original, source.bytes, { mode: 0o600 });
      const result = await this.pythonRun(original, { mapping: preview.mapping, sourceMapping: source.c.mapping || {}, addStatusColumns: preview.addStatusColumns, strictStatus:this.managed, output: working });
      await fs.chmod(working, 0o600);
      store.protections = collectProtections(source.state, [...result.baselineLeads, ...result.leads], await this.replyProtections(store.protections));
      const context = { importId: source.importId, revisionId, campaignId: source.c.id, sourceHash: source.sourceHash, importedAt,
        sourceLabel: provenance.label.trim(), acquiredAt, permission: provenance.permission, sourceWorkbook: path.basename(source.c.workbook.file) };
      const identity = registerCarriers(store.registry, result.leads, context, store.protections);
      const recordBytes = JSON.stringify(identity.records);
      await fs.writeFile(path.join(directory, 'records.json'), recordBytes, { mode: 0o600 });
      const revision = { ...context, mapping: result.report.mapping, addStatusColumns: preview.addStatusColumns, summary: result.report.summary,
        identitySummary: identity.summary, recordsHash: hash(recordBytes), workingHash: hash(await fs.readFile(working)) };
      for (const filename of ['original.xlsx', 'working.xlsx', 'records.json']) {
        const handle = await fs.open(path.join(directory, filename), 'r');
        try { await handle.sync(); } finally { await handle.close(); }
      }
      if (process.platform !== 'win32') {
        for (const folder of [directory, path.dirname(directory)]) {
          const handle = await fs.open(folder, 'r'); try { await handle.sync(); } finally { await handle.close(); }
        }
      }
      const entry = store.imports[source.importId] ||= { id: source.importId, campaignId: source.c.id, campaignName: source.c.name, revisions: [], actions: [] };
      entry.revisions.push(revision); entry.activeRevision = revisionId;
      entry.actions.push({ kind: 'applied', revisionId, at: importedAt });
      store.receipts[input.previewId] = revisionId; store.generation++;
      await this.persist(store);
      return { ok: true, revisionId, reused: false };
    });
  }
  async restore(input) {
    if (input.confirmExperiment !== true) throw new Error('Confirm restoring the experiment revision.');
    return this.withWrite(async () => {
      const store = await this.load();
      const entry = Object.values(store.imports).find((i) => i.revisions.some((r) => r.revisionId === input.revisionId));
      if (!entry) throw new Error('Experiment revision not found.');
      const revision = entry.revisions.find((r) => r.revisionId === input.revisionId);
      const bytes = await fs.readFile(path.join(this.workspaceDir, 'revisions', revision.revisionId, 'working.xlsx'));
      if (hash(bytes) !== revision.workingHash) throw new Error('Revision workbook changed. Restore from a trusted backup.');
      const records = await fs.readFile(path.join(this.workspaceDir, 'revisions', revision.revisionId, 'records.json'));
      if (hash(records) !== revision.recordsHash) throw new Error('Revision records changed. Restore from a trusted backup.');
      if (entry.activeRevision !== revision.revisionId) {
        entry.activeRevision = revision.revisionId; entry.actions.push({ kind: 'restored', revisionId: revision.revisionId, at: new Date().toISOString() }); store.generation++; await this.persist(store);
      }
      return { ok: true };
    });
  }
  async status(campaignId, params = new URLSearchParams()) {
    const base = await fs.realpath(this.dataDir), store = await this.load();
    const entry = store.imports[hash(`${base}:${campaignId}`).slice(0, 24)];
    if (!entry) return { revisions: [], records: [], total: 0, activeRevision: null, offset: 0, pageSize: 25 };
    const active = entry.revisions.find((r) => r.revisionId === entry.activeRevision);
    const recordBytes = await fs.readFile(path.join(this.workspaceDir, 'revisions', active.revisionId, 'records.json'));
    if (hash(recordBytes) !== active.recordsHash) throw new Error('Revision records changed. Restore from a trusted backup.');
    const source = await this.source(campaignId).catch(() => null);
    const combined = await this.replyProtections(store.protections);
    const protections = source ? collectProtections(source.state, [], combined) : combined;
    let records = JSON.parse(recordBytes);
    records = records.map((r) => ({ ...r, protection: [...new Set([...r.protection, ...(protections[r.email] || [])])] }));
    const identitySummary = { ...active.identitySummary, protectedRows: records.filter((r) => r.protection.length).length };
    const q = (params.get('q') || '').trim().toLowerCase();
    if (q) records = records.filter((r) => [r.company, r.email, r.dot, r.carrierId, r.provenance.sourceLabel].some((s) => String(s || '').toLowerCase().includes(q)));
    const offset = Math.min(Math.max(0, Math.floor(Number(params.get('offset')) || 0)), Math.max(0, Math.floor((records.length - 1) / 25) * 25));
    return { revisions: entry.revisions.slice().reverse(), activeRevision: active.revisionId, records: records.slice(offset, offset + 25), total: records.length, offset, pageSize: 25, actions: entry.actions.slice(-20), sourceChanged: source ? active.sourceHash !== source.sourceHash : null, sourceUnavailable: !source, identitySummary };
  }
  async download(revisionId, kind) {
    const store = await this.load();
    const revision = Object.values(store.imports).flatMap((i) => i.revisions).find((r) => r.revisionId === revisionId);
    if (!revision) throw new Error('Experiment revision not found.');
    if (kind === 'mapping') return { bytes: Buffer.from(JSON.stringify(revision, null, 2)), filename: `experiment-${revisionId}-mapping.json`, type: 'application/json' };
    if (!['original', 'working'].includes(kind)) throw new Error('Choose an original or working experiment copy.');
    const bytes = await fs.readFile(path.join(this.workspaceDir, 'revisions', revisionId, `${kind}.xlsx`));
    if (hash(bytes) !== (kind === 'original' ? revision.sourceHash : revision.workingHash)) throw new Error('Revision workbook changed. Restore from a trusted backup.');
    return { bytes, filename: `experiment-${revisionId}-${kind}.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }
}
