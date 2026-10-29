import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ExperimentImports } from '../src/experiment-imports.mjs';
import { check } from '../scripts/doctor.mjs';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-import-repairs-'));
  const dataDir = path.join(dir, 'source'), workspaceDir = path.join(dir, 'workspace');
  await fs.mkdir(dataDir);
  const python = check();
  const code = `import sys,zipfile
from xml.sax.saxutils import escape
ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
def cell(r,v):return '<c r="'+r+'" t="inlineStr"><is><t>'+escape(v)+'</t></is></c>'
headers=cell('A1','Company')+cell('B1','Email')+cell('D1','USDOT #')+cell('E1','MC docket #')
rows='<row r="1">'+headers+'</row>'
for n in range(2,5):
 rows+='<row r="'+str(n)+'">'+cell('A'+str(n),'Example Fleet LLC')+cell('B'+str(n),'owner'+str(n)+'@example.com')+cell('D'+str(n),'0012345')+cell('E'+str(n),'MC-678')+'</row>'
with zipfile.ZipFile(sys.argv[1],'w') as z:
 z.writestr('xl/workbook.xml','<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
 z.writestr('xl/worksheets/sheet1.xml','<worksheet xmlns="'+ns+'"><sheetData>'+rows+'</sheetData></worksheet>')`;
  assert.equal(spawnSync(python, ['-c', code, path.join(dataDir, 'leads.xlsx')]).status, 0);
  await fs.writeFile(path.join(dataDir, 'state.json'), JSON.stringify({
    campaigns: [{ id: 'c1', name: 'One', workbook: { file: 'leads.xlsx' } }, { id: 'c2', name: 'Two', workbook: { file: 'leads.xlsx' } }],
    history: { 'owner2@example.com': { status: 'Uncertain', body: 'DO_NOT_COPY_MESSAGE' } }, suppression: { 'owner3@example.com': 'remove' },
  }));
  const before = { state: await fs.readFile(path.join(dataDir, 'state.json')), workbook: await fs.readFile(path.join(dataDir, 'leads.xlsx')) };
  const options = { dataDir, workspaceDir, python };
  const service = new ExperimentImports(options);
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return { dir, dataDir, workspaceDir, options, service, before };
}
const provenance = { label: 'Authorized test export', acquiredAt: '2026-10-20', permission: 'unknown' };
const save = (service, preview, source = provenance) => service.apply({ previewId: preview.previewId, confirmExperiment: true, provenance: source });

test('repairs save isolated immutable revisions, provenance, protections and durable cross-import carrier IDs', async (t) => {
  const { service, dataDir, workspaceDir, options, before } = await fixture(t);
  const preview = await service.review({ campaignId: 'c1', mapping: {}, addStatusColumns: { Leads: 'F' } });
  assert.equal(preview.summary.missingStatusSheets, 0); assert.equal(preview.identitySummary.sourceDotCarriers, 1);
  await assert.rejects(service.apply({ previewId: preview.previewId, provenance }), /Confirm/);
  const result = await save(service, preview);
  assert.equal((await save(service, preview)).reused, true);
  const active = await service.status('c1');
  assert.equal(active.total, 3); assert.equal(active.revisions.length, 1);
  assert.equal(active.records[0].provenance.sheet, 'Leads'); assert.equal(active.records[0].provenance.row, 2);
  assert.equal(active.records[0].provenance.permission, 'unknown');
  assert.match(active.records[0].protection.join(), /Uncertain/);
  assert.match(active.records[1].protection.join(), /Do not contact/);
  assert(!JSON.stringify(await service.load()).includes('DO_NOT_COPY_MESSAGE'));
  assert.deepEqual((await service.download(result.revisionId, 'original')).bytes, before.workbook);
  assert.notDeepEqual((await service.download(result.revisionId, 'working')).bytes, before.workbook);
  const restart = new ExperimentImports(options);
  assert.equal((await save(restart, preview)).reused, true);
  const second = await restart.review({ campaignId: 'c2', mapping: {}, addStatusColumns: { Leads: 'F' } });
  await save(restart, second);
  assert.equal((await restart.status('c2')).records[0].carrierId, active.records[0].carrierId);
  assert.equal((await restart.status('c2')).records[0].contactId, active.records[0].contactId);
  assert.deepEqual(await fs.readFile(path.join(dataDir, 'state.json')), before.state);
  assert.deepEqual(await fs.readFile(path.join(dataDir, 'leads.xlsx')), before.workbook);
  assert.equal((await fs.readdir(path.join(workspaceDir, 'revisions'))).length, 2);
});

test('stale previews, invalid provenance and conflicting writes cannot publish a repair', async (t) => {
  const { service, dataDir, options } = await fixture(t);
  const preview = await service.review({ campaignId: 'c1', mapping: {} });
  await assert.rejects(save(service, preview, { label: '', permission: 'unknown' }), /source label/);
  await assert.rejects(save(service, preview, { ...provenance, acquiredAt: '2026-99-99' }), /valid source acquisition/);
  await assert.rejects(save(service, { previewId: 'missing' }), /expired/);
  const expired = await service.review({ campaignId: 'c1', mapping: {} });
  service.previews.get(expired.previewId).at -= 16 * 60_000;
  await assert.rejects(save(service, expired), /expired/);
  await fs.appendFile(path.join(dataDir, 'leads.xlsx'), 'changed');
  await assert.rejects(save(service, preview), /changed/);
  const fresh = await service.review({ campaignId: 'c1', mapping: {} });
  const other = new ExperimentImports(options);
  const concurrent = await other.review({ campaignId: 'c1', mapping: {} });
  const outcomes = await Promise.allSettled([save(service, fresh), save(other, concurrent)]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await service.status('c1')).revisions.length, 1);
  await assert.rejects(save(service, preview), /changed/);
});

test('restore retains newer revisions and protects old records; missing source does not destroy saved work', async (t) => {
  const { service, dataDir, options } = await fixture(t);
  const first = await save(service, await service.review({ campaignId: 'c1', mapping: {} }));
  const state = JSON.parse(await fs.readFile(path.join(dataDir, 'state.json')));
  state.suppression['owner4@example.com'] = 'later opt-out';
  await fs.writeFile(path.join(dataDir, 'state.json'), JSON.stringify(state));
  const second = await save(service, await service.review({ campaignId: 'c1', mapping: {}, addStatusColumns: { Leads: 'F' } }));
  const restart = new ExperimentImports(options);
  await restart.restore({ revisionId: first.revisionId, confirmExperiment: true });
  let view = await restart.status('c1');
  assert.equal(view.activeRevision, first.revisionId); assert.equal(view.revisions.length, 2);
  assert.match(view.records[2].protection.join(), /later opt-out/);
  assert.equal(view.records[0].carrierId, (await service.status('c1')).records[0].carrierId);
  await fs.unlink(path.join(dataDir, 'leads.xlsx'));
  view = await restart.status('c1'); assert.equal(view.sourceUnavailable, true); assert.equal(view.total, 3);
  await restart.restore({ revisionId: second.revisionId, confirmExperiment: true });
  assert.equal((await restart.status('c1')).activeRevision, second.revisionId);
  assert((await restart.download(first.revisionId, 'original')).bytes.length > 0);
});

test('failed publication leaves active revision intact; changed snapshots and overlapping workspaces are rejected', async (t) => {
  const { service, dataDir, workspaceDir, options } = await fixture(t);
  const first = await save(service, await service.review({ campaignId: 'c1', mapping: {} }));
  const next = await service.review({ campaignId: 'c1', mapping: {} });
  service.persist = async () => { throw new Error('Synthetic disk failure'); };
  await assert.rejects(save(service, next), /disk failure/);
  const restart = new ExperimentImports(options);
  assert.equal((await restart.status('c1')).activeRevision, first.revisionId);
  assert.equal((await restart.status('c1')).revisions.length, 1);
  await fs.appendFile(path.join(workspaceDir, 'revisions', first.revisionId, 'working.xlsx'), 'tampered');
  await assert.rejects(restart.restore({ revisionId: first.revisionId, confirmExperiment: true }), /changed/);
  await assert.rejects(restart.download(first.revisionId, 'working'), /changed/);
  assert.throws(() => new ExperimentImports({ ...options, workspaceDir: dataDir }), /separate/);
  const symlink = path.join(path.dirname(dataDir), 'alias');
  await fs.symlink(dataDir, symlink, 'dir');
  const unsafe = new ExperimentImports({ ...options, workspaceDir: path.join(symlink, 'new-folder') });
  await assert.rejects(save(unsafe, {}), /overlaps/);
  await assert.rejects(fs.stat(path.join(dataDir, 'new-folder')), /ENOENT/);
});
