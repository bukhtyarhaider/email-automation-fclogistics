import { upgrade } from '../../src/config.mjs';
import { hash } from '../../src/tracking.mjs';
export function insightState(extra = 0) {
  const state = upgrade({});
  state.templates = { simple: { name: 'Intro', subject: 'Hello', body: 'Synthetic body', enabled: true } };
  state.tracking = { records: {}, openIndex: {} };
  const add = (key, options = {}) => {
    const id = `tracking-${key}`;
    const tokenHash = options.untracked ? null : hash(`synthetic-${key}`);
    const confirmedAt = options.missingTime ? null : '2026-10-20T10:00:00.000Z';
    const to = `${key}@example.com`;
    state.history[to] = { trackingId: id, recipient: to, accountEmail: options.mailbox || 'a@example.com', campaignId: options.campaign || 'c1', campaignName: options.campaign === 'c2' ? 'West campaign' : 'East campaign', templateKey: 'simple', subject: `Synthetic ${key}`, body: 'Synthetic body', status: options.uncertain ? 'Uncertain' : 'Sent', sendStatus: options.uncertain ? 'delivery_unknown' : 'webmail_sent', at: '2026-10-20T09:59:50.000Z', confirmedAt, teamToken: 'PRIVATE_TEAM_TOKEN', ...options.history };
    state.tracking.records[id] = { id, recipient: to, sender: state.history[to].accountEmail, subject: `Synthetic ${key}`, createdAt: '2026-10-20T09:59:50.000Z', attemptedAt: '2026-10-20T09:59:50.000Z', confirmedAt, sendStatus: state.history[to].sendStatus, openTokenHash: tokenHash, firstOpenAt: options.seen || null, lastOpenAt: options.seen || null, opens: options.seen ? [{ at: options.seen, bucket: options.seen.slice(0, 13) }] : [], events: [], messageIds: [], ...options.tracking };
  };
  add('fast', { seen: '2026-10-20T10:05:00.000Z', history: { followUp: { status: 'replied', note: 'Recipient replied; asked for details', source: 'manual' } } });
  add('slow', { seen: '2026-10-20T11:00:00.000Z', history: { followUp: { status: 'no_reply', note: 'Checked the mailbox', source: 'manual' } } });
  add('clock-skew', { seen: '2026-10-20T09:59:00.000Z', mailbox: 'b@example.com', campaign: 'c2', tracking: { bounceStatus: 'hard_bounced', bounceReason: '550 test' } });
  add('untracked', { untracked: true });
  add('no-signal');
  add('uncertain', { uncertain: true, seen: '2026-10-20T10:30:00.000Z' });
  add('missing-time', { missingTime: true, seen: '2026-10-20T10:45:00.000Z' });
  for (let i = 0; i < extra; i++) add(`extra-${String(i).padStart(2, '0')}`, { untracked: true });
  return state;
}
