import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { DEFAULTS, upgrade, validateSettings } from '../src/config.mjs';
import { assessChecks, render } from '../src/core.mjs';
import { loadPlaywright } from '../src/browser.mjs';

const message = { subject: 'Schedule preferences', body: 'Our fee is 5%. ' + 'coordination '.repeat(181) };
test('template checks default to advisory, respect individual modes and master switch, and validate saved choices', () => {
  assert.equal(assessChecks(message).warnings.length, 2);
  assert.deepEqual(assessChecks(message).blockers, []);
  const mixed = { enabled: true, promotionalClaims: 'block', messageLength: 'warn' };
  assert.equal(assessChecks(message, mixed).blockers.length, 1);
  assert.equal(assessChecks(message, { ...mixed, promotionalClaims: 'off' }).warnings.length, 1);
  assert.deepEqual(assessChecks(message, { ...mixed, enabled: false }), { warnings: [], blockers: [] });
  const settings = structuredClone(DEFAULTS);
  delete settings.templateChecks;
  assert.deepEqual(validateSettings(settings).templateChecks, DEFAULTS.templateChecks);
  const migrated = upgrade({ version: 2, settings });
  assert.deepEqual(migrated.settings.templateChecks, DEFAULTS.templateChecks);
  settings.templateChecks = mixed;
  assert.deepEqual(validateSettings(settings).templateChecks, mixed);
  settings.templateChecks.promotionalClaims = 'ignore';
  assert.throws(() => validateSettings(settings), /Invalid template check/);
  settings.templateChecks = { enabled: 'false' };
  assert.throws(() => validateSettings(settings), /true or false/);
  assert.throws(() => render({ fields: {} }, { subject: '{{unknown}}', body: 'Hello' }), /Unknown template/);
});

async function fixture(t, port) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-template-checks-'));
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
    for (let i = 0; i < 200; i++) {
      const value = await fn();
      if (value) return value;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('Expected template-check state not reached');
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
  return { dir, api, until, start, stop };
}

test('advisories allow manual and continuous sends; strict checks stop selected batches; off settings persist across restart', async (t) => {
  const { dir, api, until, start, stop } = await fixture(t, 14637);
  let s = await api('state');
  const business = { company: 'Example', senderName: 'Alex', legalName: 'Example LLC', address: '123 Example St', services: 'coordination' };
  await api('profile', { id: s.activeProfile, email: 'sender@example.com', provider: 'privateemail', business });
  s = await api('state');
  s.settings.eligibility.requireActive = false;
  s.settings.eligibility.requireNoOutOfService = false;
  Object.assign(s.settings.pacing, { minSeconds: 1, maxSeconds: 1, pauseEveryMin: 100, pauseEveryMax: 100 });
  await api('settings', { settings: s.settings });
  const workbook = path.join(dir, 'leads.xlsx');
  execFileSync(process.platform === 'win32' ? 'python' : 'python3', [path.resolve('tests/fixtures/workbook.py'), workbook]);
  await api('import', { path: workbook });
  const saved = await api('template', { key: 'schedule', name: 'Schedule preferences', ...message });
  assert.equal(saved.warnings.length, 2);
  const leads = (await api('leads')).leads;
  const previewRoute = `preview?id=${encodeURIComponent(leads[0].id)}&key=schedule`;
  assert.equal((await api(previewRoute)).warnings.length, 2);
  await api('connect', {});
  const prepared = await api('prepare', { id: leads[0].id, key: 'schedule', randomTemplates: false });
  assert.equal(prepared.warnings.length, 2);
  await api('send', {});
  await assert.rejects(api('prepare', { id: leads[0].id, key: 'schedule' }), /Previously attempted|Already contacted|Previously contacted/);
  s = await api('state');
  s.settings.templateChecks = { enabled: true, promotionalClaims: 'block', messageLength: 'warn' };
  await api('settings', { settings: s.settings });
  await assert.rejects(api('prepare', { id: leads[1].id, key: 'schedule' }), /Template.*Settings/);
  await api('batch', { ids: [leads[1].id], key: 'schedule', randomTemplates: false });
  s = await until(async () => { const x = await api('state'); return x.job.status === 'Needs attention' && !x.busy ? x : false; });
  assert.equal(s.attemptCount, 1);
  s.settings.templateChecks.promotionalClaims = 'warn';
  await api('settings', { settings: s.settings });
  await api('start', { key: 'schedule', randomTemplates: false });
  await until(async () => (await api('state')).counts.sent === 3);
  await api('stop', {});
  s = await until(async () => { const x = await api('state'); return !x.busy ? x : false; });
  const events = (await api('events')).events;
  assert(events.some((e) => /advisory:.*Outreach can continue/.test(e.message)));
  s.settings.templateChecks = { enabled: false, promotionalClaims: 'block', messageLength: 'off' };
  await api('settings', { settings: s.settings });
  assert.deepEqual((await api(previewRoute)).warnings, []);
  const offSaved = await api('template', { key: 'schedule', ...message });
  assert.deepEqual(offSaved.warnings, []);
  await stop(); await start();
  assert.deepEqual((await api('state')).settings.templateChecks, s.settings.templateChecks);
  assert.deepEqual((await api(previewRoute)).warnings, []);
  assert.equal((await fs.readFile(path.join(dir, 'sends.jsonl'), 'utf8')).trim().split('\n').length, 3);
});

test('template check controls save, reload and retain disabled choices in the desktop settings', { skip: process.env.FC_BROWSER_TESTS !== '1' }, async (t) => {
  const { api } = await fixture(t, 14638);
  const browser = await loadPlaywright().chromium.launch({ channel: process.env.FC_TEST_BROWSER_CHANNEL || 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:14638/#settings');
  await page.waitForFunction(() => document.querySelector('#accountUrl').value.includes('privateemail.com'));
  assert.equal(await page.locator('#templateChecksEnabled').isChecked(), true);
  assert.equal(await page.locator('#promotionalClaimsCheck').inputValue(), 'warn');
  await page.locator('#promotionalClaimsCheck').selectOption('block');
  await page.locator('#messageLengthCheck').selectOption('off');
  await page.locator('#templateChecksEnabled').uncheck();
  assert.equal(await page.locator('#promotionalClaimsCheck').isDisabled(), true);
  await page.locator('#saveSettings').click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent === 'Sending settings saved.');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#accountUrl').value.includes('privateemail.com'));
  assert.equal(await page.locator('#templateChecksEnabled').isChecked(), false);
  await page.locator('#templateChecksEnabled').check();
  assert.equal(await page.locator('#promotionalClaimsCheck').inputValue(), 'block');
  assert.equal(await page.locator('#messageLengthCheck').inputValue(), 'off');
  await page.locator('#saveSettings').click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent === 'Sending settings saved.');
  assert.deepEqual((await api('state')).settings.templateChecks, { enabled: true, promotionalClaims: 'block', messageLength: 'off' });
  for (const width of [1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('#templateChecksEnabled').scrollIntoViewIfNeeded();
    const bounds = await page.locator('#promotionalClaimsCheck').boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
    const sizes = await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth]);
    assert(sizes[1] <= sizes[0] + 1, sizes.join('/'));
    if (process.env.FC_UI_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.FC_UI_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.FC_UI_SCREENSHOT_DIR, `template-checks-${width}.png`) });
    }
  }
  assert.deepEqual(errors, []);
});
