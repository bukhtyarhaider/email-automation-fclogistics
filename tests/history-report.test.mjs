import test from 'node:test';
import assert from 'node:assert/strict';
import { historyReport, historyCsv, saveFollowUp, csv } from '../src/history-report.mjs';
import { releaseCatalog, saveReleaseNote, APP_VERSION } from '../src/release-catalog.mjs';
import { insightState } from './fixtures/send-insights.mjs';

test('send metrics use explicit confirmed-send denominators and valid first-signal intervals', () => {
  const report = historyReport(insightState());
  const s = report.summary;
  assert.equal(s.attempts, 7); assert.equal(s.sent, 6); assert.equal(s.seen, 5); assert.equal(s.sentSeen, 4);
  assert.equal(s.seenRate, 100 * 4 / 6); assert.equal(s.trackedSent, 5); assert.equal(s.trackedSeenRate, 80);
  assert.equal(s.noSignal, 1); assert.equal(s.untrackedSent, 1); assert.equal(s.bounced, 1);
  assert.equal(s.timingSamples, 2); assert.equal(s.timingExcluded, 2);
  assert.equal(s.averageFirstSeenMs, 1950000); assert.equal(s.medianFirstSeenMs, 1950000);
  assert.equal(s.fastestFirstSeenMs, 300000); assert.equal(s.slowestFirstSeenMs, 3600000);
  assert.equal(s.fastestRecipient, 'fast@example.com');
  assert.equal(s.replied, 1); assert.equal(s.noReply, 1); assert.equal(s.unreviewed, 5);
  assert(!JSON.stringify(report).includes('PRIVATE_TEAM_TOKEN'));
  assert(!JSON.stringify(report).includes('openTokenHash'));
});

test('combined history filters, missing tracking, UTC date boundaries and unknown intervals remain distinct', () => {
  const state = insightState();
  assert.equal(historyReport(state, new URLSearchParams({ seen: 'no_signal' })).records[0].to, 'no-signal@example.com');
  assert.equal(historyReport(state, new URLSearchParams({ seen: 'untracked' })).records[0].to, 'untracked@example.com');
  const result = historyReport(state, new URLSearchParams({ q: 'Checked', seen: 'seen', reply: 'no_reply', mailbox: 'a@example.com', campaign: 'c1', template: 'simple', from: '2026-10-20', until: '2026-10-20' }));
  assert.equal(result.total, 1); assert.equal(result.records[0].to, 'slow@example.com');
  assert.equal(historyReport(state, new URLSearchParams({ from: '2026-10-21' })).total, 0);
  assert.throws(() => historyReport(state, new URLSearchParams({ from: '2026-10-21', until: '2026-10-20' })), /start date/);
  assert.throws(() => historyReport(state, new URLSearchParams({ from: '2026-02-30' })), /valid/);
  assert.throws(() => historyReport(state, new URLSearchParams({ seen: 'unread' })), /seen filter/);
  assert.equal(historyReport(state, new URLSearchParams({ q: 'nothing matches' })).summary.seenRate, null);
});

test('summary and exports cover every matching page; timing sorts keep unknowns last', () => {
  const state = insightState(30);
  const result = historyReport(state, new URLSearchParams({ offset: '25', sort: 'fastest' }));
  assert.equal(result.total, 37); assert.equal(result.summary.attempts, 37); assert.equal(result.offset, 25);
  assert.equal(result.records[0].to, 'fast@example.com'); assert.equal(result.records[1].to, 'slow@example.com');
  assert.equal(historyReport(state, new URLSearchParams({ sort: 'slowest' })).records[0].to, 'slow@example.com');
  assert.equal(historyReport(state, new URLSearchParams({ offset: '999' })).offset, 25);
  const text = historyCsv(result);
  assert(text.includes('extra-29@example.com')); assert(text.includes('fast@example.com'));
  assert.equal(text.trim().split('\r\n').length, 38);
});

test('CSV protects spreadsheet formulas, quotes and multiline notes; manual reviews preserve send safeguards', () => {
  const state = insightState();
  const before = structuredClone(state.history['fast@example.com']);
  saveFollowUp(state, { trackingId: before.trackingId, status: 'no_reply', note: ' =HYPERLINK("https://example.invalid")\nChecked manually' });
  assert.equal(state.history['fast@example.com'].status, before.status);
  assert.equal(state.history['fast@example.com'].trackingId, before.trackingId);
  assert.equal(state.history['fast@example.com'].followUp.source, 'manual');
  assert(historyCsv(historyReport(state)).includes("'=HYPERLINK"));
  assert(csv([['  +SUM(1,2)', 'a"b', 'line\nbreak']]).includes("'  +SUM"));
  assert.throws(() => saveFollowUp(state, { trackingId: 'missing', status: 'replied', note: '' }), /not found/);
  assert.throws(() => saveFollowUp(state, { trackingId: before.trackingId, status: 'inferred', note: '' }), /manual/);
});

test('release catalog distinguishes verified package versions, historical milestones and persistent editable local notes', () => {
  const state = {};
  const initial = releaseCatalog(state);
  assert.equal(APP_VERSION, '2.2.0-rc.9'); assert.equal(initial.packageVersions, 12);
  assert(initial.releases.some((r) => r.kind === 'milestone' && r.changes.some((text) => text.includes('V1.1.0'))));
  const note = saveReleaseNote(state, { version: '2.1.0', date: '2026-10-29', title: 'PC 2 updated', changes: 'Kept local data\nChecked sync' }, 'local-note-1');
  assert.equal(note.changes.length, 2);
  saveReleaseNote(state, { id: note.id, version: '2.1.0', date: '2026-10-29', title: 'PC 2 verified', changes: 'Verified' }, 'unused');
  assert.equal(releaseCatalog(state).notes.length, 1);
  assert.equal(releaseCatalog(state).notes[0].title, 'PC 2 verified');
  assert.throws(() => saveReleaseNote(state, { version: 'two' }, 'bad'), /version/);
});


test('send-date filtering follows confirmation across midnight and falls back for unconfirmed attempts', () => {
  const state = insightState();
  for (const item of Object.values(state.history)) item.at = '2026-10-19T23:59:59.000Z';
  const confirmed = historyReport(state, new URLSearchParams({ from: '2026-10-20', until: '2026-10-20' }));
  assert.equal(confirmed.total, 6);
  assert(!confirmed.records.some((r) => r.to === 'missing-time@example.com'));
  const unconfirmed = historyReport(state, new URLSearchParams({ from: '2026-10-19', until: '2026-10-19' }));
  assert.equal(unconfirmed.total, 1);
  assert.equal(unconfirmed.records[0].to, 'missing-time@example.com');
});
