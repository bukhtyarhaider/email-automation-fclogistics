import test from 'node:test';
import assert from 'node:assert/strict';
import { registerCarriers, collectProtections } from '../src/carrier-identity.mjs';
const lead = (overrides = {}) => ({ company: 'Example Fleet LLC', email: 'owner@example.com', id: 'row-id', part: 'sheet1', sheet: 'Leads', row: 2, fields: { 'usdot #': '0012345', 'mc docket #': 'MC-678' }, ...overrides });
const context = { importId: 'import-1', revisionId: 'revision-1', importedAt: '2026-10-29T00:00:00.000Z' };

test('source USDOT normalizes and keeps carrier/contact IDs across imports and reordered rows', () => {
  const registry = {};
  const first = registerCarriers(registry, [lead()], context, {});
  const next = registerCarriers(registry, [lead({ row: 20, fields: { USDOT: '12345', MC: '678' } })], { ...context, importId: 'import-2' }, {});
  assert.equal(first.records[0].carrierId, next.records[0].carrierId);
  assert.equal(first.records[0].contactId, next.records[0].contactId);
  assert.equal(next.records[0].identityStatus, 'source_dot');
  assert.equal(registry.carriers[first.records[0].carrierId].verification, 'source_reported');
});

test('conflicting DOT/name/MC, absent DOT and malformed layouts never silently merge', () => {
  const registry = {};
  const first = registerCarriers(registry, [lead()], context, {});
  const conflict = registerCarriers(registry, [lead({ company: 'Different company', row: 3 })], context, {});
  assert.equal(conflict.records[0].identityStatus, 'identifier_conflict');
  assert.notEqual(conflict.records[0].carrierId, first.records[0].carrierId);
  const mixed = registerCarriers({}, [lead(), lead({ row: 3, company: 'Different' })], context, {});
  assert.equal(mixed.summary.conflictRows, 2);
  const layout = registerCarriers(registry, [lead({ layoutIssue: 'Shifted fields' })], context, {});
  assert.equal(layout.records[0].identityStatus, 'layout_review'); assert.equal(layout.records[0].dot, null);
  const provisional = registerCarriers({}, [lead({ fields: {}, row: 4 }), lead({ fields: {}, row: 5 })], context, {});
  assert.equal(provisional.summary.provisionalRows, 2); assert.equal(provisional.summary.carriers, 2);
});

test('contact protections accumulate without copying bodies or allowing a repair to remove them', () => {
  const state = { history: { 'owner@example.com': { status: 'Uncertain', body: 'PRIVATE_MESSAGE' } }, suppression: { 'other@example.com': 'Opted out' } };
  let protections = collectProtections(state, [lead({ email: 'old@example.com', status: 'Proposal Sent' })]);
  protections = collectProtections({}, [], protections);
  assert.equal(protections['owner@example.com'][0], 'Prior attempt: Uncertain');
  assert.match(protections['other@example.com'][0], /Do not contact/);
  assert.match(protections['old@example.com'][0], /previously contacted/);
  assert(!JSON.stringify(protections).includes('PRIVATE_MESSAGE'));
});
