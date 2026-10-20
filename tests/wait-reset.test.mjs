import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { upgrade } from '../src/config.mjs';
import { loadPlaywright } from '../src/browser.mjs';
import { initTracking } from '../src/tracking.mjs';

async function fixture(t, port) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-wait-reset-'));
  const state = upgrade({});
  const account = state.profiles[0];
  account.email = 'sender@example.com';
  account.autoReconnect = false;
  account.business = { company: 'Example', senderName: 'Alex', legalName: 'Example LLC', address: '123 Example St', services: 'coordination' };
  state.settings.business = account.business;
  Object.assign(state.settings.pacing, { minSeconds: 1, maxSeconds: 1, hourlyCap: 1 });
  state.history['uncertain@example.com'] = { status: 'Uncertain', accountEmail: account.email, at: new Date(Date.now() - 60000).toISOString() };
  state.suppression['optout@example.com'] = 'Opted out';
  Object.assign(state.automation, { enabled: true, status: 'Resting', nextAt: new Date(Date.now() + 600000).toISOString(), sent: 7, sincePause: 7, pauseAfter: 8 });
  initTracking(state);
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify(state));
  let child;
  async function stop() {
    if (child?.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; }
  }
  t.after(async () => { await stop(); await fs.rm(dir, { recursive: true, force: true }); });
  async function api(route, data) {
    const response = await fetch(`http://127.0.0.1:${port}/api/${route}`, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-FC-Request': '1' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error);
    return value;
  }
  async function until(fn) {
    for (let i = 0; i < 100; i++) {
      const value = await fn();
      if (value) return value;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Queue did not reach expected state');
  }
  async function start() {
    child = spawn(process.execPath, ['--import', path.resolve('tests/fixtures/fake-mail.mjs'), path.resolve('src/server.mjs')], {
      env: { ...process.env, FC_DATA_DIR: dir, PORT: String(port), TEST_SEND_LOG: path.join(dir, 'sends.jsonl'), FC_MONITOR_ENABLED: '0', FC_OPEN_TRACKING_ENABLED: '0' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = ''; child.stderr.on('data', (b) => { stderr += b; });
    await until(async () => {
      if (child.exitCode !== null) throw new Error(stderr);
      try { return await api('state'); } catch { return false; }
    });
  }
  await start();
  return { dir, api, until, start, stop, state };
}

test('reset wait persists counters while preserving uncertain history, suppression, quotas and stopped state', async (t) => {
  const { dir, api, until, start, stop, state: initial } = await fixture(t, 14635);
  const reset = await api('reset-wait', {});
  assert.equal(reset.job.nextAt, null);
  assert.equal(reset.job.sincePause, 0);
  assert.equal(reset.job.pauseAfter, 0);
  assert.equal(reset.job.sent, 7);
  assert.equal(reset.job.enabled, true);
  await api('connect', {});
  await until(async () => {
    const state = await api('state');
    return state.job.status === 'Allowance pause' && !state.busy;
  });
  await api('reset-wait', {});
  const limited = await until(async () => {
    const state = await api('state');
    return state.job.status === 'Allowance pause' && !state.busy ? state : false;
  });
  assert.equal(limited.remaining, 0);
  assert(Date.parse(limited.job.nextAt) > Date.now() + 3000000);
  assert.equal(limited.attempts['uncertain@example.com'].status, 'Uncertain');
  assert.equal(limited.suppression['optout@example.com'], 'Opted out');
  await api('stop', {});
  await until(async () => !(await api('state')).busy);
  const stopped = await api('reset-wait', {});
  assert.equal(stopped.job.enabled, false);
  assert.equal(stopped.job.nextAt, null);
  await stop();
  const disk = JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8'));
  assert.deepEqual(disk.history, initial.history);
  assert.deepEqual(disk.suppression, initial.suppression);
  assert.equal(await fs.access(path.join(dir, 'sends.jsonl')).then(() => true, () => false), false);
  await start();
  const restarted = await api('state');
  assert.equal(restarted.job.enabled, false);
  assert.equal(restarted.job.nextAt, null);
  assert.equal(restarted.job.sincePause, 0);
  assert.equal(restarted.job.sent, 7);
});

test('settings reset wait works on desktop/mobile and disables after resetting', { skip: process.env.FC_BROWSER_TESTS !== '1' }, async (t) => {
  const { api } = await fixture(t, 14636);
  const browser = await loadPlaywright().chromium.launch({ channel: process.env.FC_TEST_BROWSER_CHANNEL || 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://127.0.0.1:14636/#settings');
  const button = page.getByRole('button', { name: 'Reset current wait', exact: true });
  await button.waitFor();
  await page.waitForFunction(() => !document.querySelector('#resetWait').disabled);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await button.scrollIntoViewIfNeeded();
    assert.equal(await button.isVisible(), true);
    assert.match(await page.locator('#settingsWaitStatus').innerText(), /\d+s until the next queue check/);
    const sizes = await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth]);
    assert(sizes[1] <= sizes[0] + 1, sizes.join('/'));
  }
  await button.click();
  await page.waitForFunction(() => document.querySelector('#resetWait').disabled && document.querySelector('#settingsWaitStatus').textContent.startsWith('No scheduled wait.'));
  assert.equal((await api('state')).job.sincePause, 0);
  assert.match(await page.locator('#notice').innerText(), /Wait reset/);
  assert.deepEqual(errors, []);
});
