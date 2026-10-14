import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { upgrade } from '../src/config.mjs';
import { templates } from '../src/core.mjs';
const root = path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
test('tracking HTTP workflow: durable hooks, public pixel isolation, seed idempotency, manual placement and restart', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-tracking-'));
  const port = 14517, pixelPort = 14519;
  let child;
  const stop = async () => { if (child?.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; } };
  t.after(async () => { await stop(); await fs.rm(dir, { recursive: true, force: true }); });
  const state = upgrade({});
  state.templates = structuredClone(templates);
  state.profiles[0].email = 'sender@example.com';
  state.profiles[0].business = { company: 'Example', senderName: 'Alex', legalName: 'Example LLC', address: '123 Example St', services: 'coordination' };
  Object.assign(state.settings.pacing, { minSeconds: 1, maxSeconds: 1 });
  state.settings.eligibility.requireActive = false;
  state.settings.eligibility.requireNoOutOfService = false;
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify(state));
  const start = async () => {
    child = spawn(process.execPath, ['--import', path.join(root, 'tests/fixtures/fake-mail.mjs'), path.join(root, 'src/server.mjs')], {
      cwd: root, env: { ...process.env, FC_DATA_DIR: dir, PORT: String(port), TEST_SEND_LOG: path.join(dir, 'sends.jsonl'),
        FC_MONITOR_ENABLED: '0', FC_OPEN_TRACKING_ENABLED: '1', FC_OPEN_TRACKING_CONSENT: '1',
        FC_TRACKING_PUBLIC_URL: 'https://tracking.example.invalid', FC_PIXEL_PORT: String(pixelPort), FC_PIXEL_HOST: '127.0.0.1',
        FC_SEEDS: JSON.stringify([{ id: 'gmail-test', email: 'controlled-seed@example.com', provider: 'gmail' }]) },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errors = ''; child.stderr.on('data', (b) => { errors += b; });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(errors);
      try { if ((await fetch(`http://127.0.0.1:${port}/api/state`)).ok) return; } catch {}
      await sleep(50);
    }
    throw new Error('Startup timed out');
  };
  const api = async (route, data) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/${route}`, data === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FC-Request': '1' }, body: JSON.stringify(data),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    return value;
  };
  await start();
  const workbook = path.join(dir, 'sample.xlsx');
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(root, 'tests/fixtures/workbook.py'), workbook]);
  await api('import', { path: workbook });
  await api('connect', { password: 'synthetic-password' });
  const lead = (await api('leads')).leads.find((l) => !l.blocked);
  const proof = await api('prepare', { id: lead.id, key: 'simple' });
  let tracking = await api('tracking');
  assert.equal(tracking.summary.attempts, 0);
  assert.equal(tracking.summary.delivery_unknown, 0);
  assert.equal(tracking.records[0].sendStatus, 'pending');
  await api('send', {});
  tracking = await api('tracking');
  assert.equal(tracking.summary.webmail_sent, 1);
  assert.equal(tracking.summary.delivery_unknown, 1);
  assert(tracking.records[0].confirmedAt);
  const pixelPath = new URL(proof.message.pixelUrl).pathname;
  for (let i = 0; i < 3; i++) {
    const response = await fetch(`http://127.0.0.1:${pixelPort}${pixelPath}`);
    assert.equal(response.headers.get('Content-Type'), 'image/gif');
    assert.equal(response.status, 200);
  }
  assert.equal((await fetch(`http://127.0.0.1:${pixelPort}/api/state`)).status, 404);
  tracking = await api('tracking');
  assert.equal(tracking.summary.open_detected, 1);
  assert.equal(tracking.records[0].opens.length, 1);
  assert(!('openTokenHash' in tracking.records[0]));
  assert(!JSON.stringify(await api('export-history')).includes('openTokenHash'));
  const input = { testKey: 'controlled-test-1', leadId: lead.id, key: 'simple' };
  const plan = await api('tracking/seed-plan', input);
  assert.deepEqual((await api('tracking/seed-plan', input)).ids, plan.ids);
  assert.equal(plan.ids.length, 1);
  await sleep(1100);
  await api('tracking/seed-send', { trackingId: plan.ids[0] });
  await assert.rejects(api('tracking/seed-send', { trackingId: plan.ids[0] }), /reserved or attempted/);
  await api('tracking/manual-placement', { trackingId: plan.ids[0], status: 'spam', evidence: 'Inspected dedicated Spam folder at test time' });
  tracking = await api('tracking');
  assert.equal(tracking.summary.spam, 1);
  assert.equal(tracking.summary.attempts, 2);
  assert.equal((await fs.readFile(path.join(dir, 'sends.jsonl'), 'utf8')).trim().split('\n').length, 2);
  await stop(); await start();
  tracking = await api('tracking');
  assert.equal(tracking.summary.webmail_sent, 2);
  assert.equal(tracking.summary.open_detected, 1);
  assert.equal(tracking.summary.spam, 1);
  assert.deepEqual((await api('tracking/seed-plan', input)).ids, plan.ids);
  await api('connect', { password: 'synthetic-password' });
  await assert.rejects(api('tracking/seed-send', { trackingId: plan.ids[0] }), /reserved or attempted/);
  assert(!(await fs.readFile(path.join(dir, 'state.json'), 'utf8')).includes('synthetic-password'));
});
