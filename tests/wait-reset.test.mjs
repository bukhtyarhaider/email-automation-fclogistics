import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { upgrade } from '../src/config.mjs';
import { loadPlaywright } from '../src/browser.mjs';
import { initTracking } from '../src/tracking.mjs';

async function fixture(t, port, configure = () => {}) {
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
  configure(state);
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
    throw new Error(`Queue did not reach expected state: ${JSON.stringify((await api('state')).job)}`);
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
  assert.equal(reset.waitCleared, false);
  assert.equal(reset.job.status, 'Allowance pause');
  assert.match(reset.message, /rolling hourly cap reached/);
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

for (const status of ['Waiting', 'Resting']) {
  test(`reset clears a six-hour ${status} countdown and the active queue makes progress`, async (t) => {
    const { dir, api, until } = await fixture(t, status === 'Waiting' ? 14637 : 14638, (state) => {
      state.automation.status = status;
      state.automation.randomTemplates = true;
      state.automation.nextAt = new Date(Date.now() + 21600000).toISOString();
      Object.assign(state.settings.pacing, { hourlyCap: 20, pauseEveryMin: 1, pauseEveryMax: 1, pauseMinSeconds: 21600, pauseMaxSeconds: 21600 });
      state.settings.eligibility.requireActive = false;
      state.settings.eligibility.requireNoOutOfService = false;
    });
    const workbook = path.join(dir, 'sample.xlsx');
    execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.resolve('tests/fixtures/workbook.py'), workbook]);
    await api('import', { path: workbook });
    await api('connect', {});
    assert(Date.parse((await api('state')).job.nextAt) > Date.now() + 21000000);
    const reset = await api('reset-wait', {});
    assert.equal(reset.waitCleared, true);
    assert.equal(reset.job.nextAt, null);
    assert.equal(reset.job.sincePause, 0);
    assert.equal(reset.job.pauseAfter, 0);
    const progressed = await until(async () => {
      const s = await api('state');
      return s.job.sent === 8 && !s.busy ? s : false;
    });
    assert.equal(progressed.job.status, 'Resting');
    // A fresh rest after a confirmed send is expected, not the old timer persisting.
    assert.equal(progressed.attempts['uncertain@example.com'].status, 'Uncertain');
    assert.equal(progressed.suppression['optout@example.com'], 'Opted out');
    const sends = (await fs.readFile(path.join(dir, 'sends.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(sends.length, 1);
  });
}

test('reset explains an unavoidable six-hour daily allowance immediately and persists it', async (t) => {
  const { dir, api, stop, start } = await fixture(t, 14639, (state) => {
    Object.assign(state.settings.pacing, { hourlyCap: 20, dailyCap: 1 });
    state.history['uncertain@example.com'].at = new Date(Date.now() - 18 * 3600000).toISOString();
    state.automation.nextAt = new Date(Date.now() + 21600000).toISOString();
  });
  const reset = await api('reset-wait', {});
  assert.equal(reset.waitCleared, false);
  assert.equal(reset.job.status, 'Allowance pause');
  assert.match(reset.message, /rolling 24-hour cap reached/);
  assert(Date.parse(reset.job.nextAt) > Date.now() + 21500000);
  assert(Date.parse(reset.job.nextAt) < Date.now() + 21700000);
  await stop();
  await start();
  assert.equal((await api('state')).job.nextAt, reset.job.nextAt);
  assert.equal(await fs.access(path.join(dir, 'sends.jsonl')).then(() => true, () => false), false);
});

test('reset labels a required minimum interval instead of silently recreating Waiting', async (t) => {
  const { api } = await fixture(t, 14640, (state) => {
    Object.assign(state.settings.pacing, { hourlyCap: 20, minSeconds: 21600, maxSeconds: 21600 });
  });
  const reset = await api('reset-wait', {});
  assert.equal(reset.waitCleared, false);
  assert.equal(reset.job.status, 'Minimum interval');
  assert.match(reset.message, /configured minimum interval still applies/);
  assert(Date.parse(reset.job.nextAt) > Date.now() + 21000000);
});

test('settings reset wait works on desktop/mobile and disables after resetting', { skip: process.env.FC_BROWSER_TESTS !== '1' }, async (t) => {
  const { api } = await fixture(t, 14636, (state) => {
    state.history = {};
    state.automation.nextAt = new Date(Date.now() + 21600000).toISOString();
  });
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
    assert.match(await page.locator('#settingsWaitStatus').innerText(), /5h|6h/);
    const sizes = await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth]);
    assert(sizes[1] <= sizes[0] + 1, sizes.join('/'));
  }
  await button.click();
  await page.waitForFunction(() => document.querySelector('#resetWait').disabled && document.querySelector('#settingsWaitStatus').textContent.startsWith('No scheduled wait.'));
  assert.equal((await api('state')).job.sincePause, 0);
  assert.match(await page.locator('#notice').innerText(), /Wait reset/);
  assert.deepEqual(errors, []);
});

test('settings shows the precise reason when reset retains a required long wait', { skip: process.env.FC_BROWSER_TESTS !== '1' }, async (t) => {
  await fixture(t, 14641, (state) => {
    Object.assign(state.settings.pacing, { hourlyCap: 20, minSeconds: 21600, maxSeconds: 21600 });
  });
  const browser = await loadPlaywright().chromium.launch({ channel: process.env.FC_TEST_BROWSER_CHANNEL || 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:14641/#settings');
  await page.getByRole('button', { name: 'Reset current wait', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('configured minimum interval still applies'));
  assert.match(await page.locator('#settingsWaitStatus').innerText(), /Minimum interval.*5h.*minimum send interval/);
  assert.match(await page.locator('#notice').innerText(), /Next check:/);
});
