import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { loadPlaywright } from '../src/browser.mjs';
import { upgrade } from '../src/config.mjs';
import { templates } from '../src/core.mjs';
import { initTracking, createRecord, recordPlacement } from '../src/tracking.mjs';
const root = path.resolve(import.meta.dirname, '..');
test('tracking dashboard filters, displays evidence and fits desktop/mobile without script errors', { skip: process.env.FC_BROWSER_TESTS !== '1' }, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-tracking-ui-'));
  const state = upgrade({});
  state.templates = structuredClone(templates);
  const tracking = initTracking(state);
  const bounced = createRecord(tracking, { to: 'bounce@example.com', subject: 'Synthetic dispatch sample' }, { sender: 'sender@example.com' }).record;
  bounced.attemptedAt = new Date().toISOString(); bounced.confirmedAt = bounced.attemptedAt;
  bounced.sendStatus = 'webmail_sent'; bounced.bounceStatus = 'hard_bounced';
  bounced.deliveryStatus = 'hard_bounced'; bounced.bounceReason = 'smtp; 550 mailbox unavailable';
  const seed = createRecord(tracking, { to: 'seed@example.com', subject: 'Synthetic seed sample' }, { sender: 'sender@example.com', seedId: 'test-seed' }).record;
  seed.attemptedAt = new Date().toISOString(); seed.confirmedAt = seed.attemptedAt; seed.sendStatus = 'webmail_sent';
  recordPlacement(seed, 'inbox', 'Dedicated Inbox inspected at test time');
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify(state));
  const port = 14521;
  const child = spawn(process.execPath, [path.join(root, 'src/server.mjs')], { cwd: root,
    env: { ...process.env, FC_DATA_DIR: dir, PORT: String(port), FC_MONITOR_ENABLED: '0', FC_OPEN_TRACKING_ENABLED: '0', FC_SEEDS: '[]' },
    stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = ''; child.stderr.on('data', (b) => { stderr += b; });
  let browser;
  t.after(async () => {
    await browser?.close();
    if (child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; }
    await fs.rm(dir, { recursive: true, force: true });
  });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(stderr);
    try { if ((await fetch(`http://127.0.0.1:${port}/api/state`)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  browser = await loadPlaywright().chromium.launch({ channel: process.env.FC_TEST_BROWSER_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/#tracking`);
  await page.locator('#trackingRows tr').nth(1).waitFor();
  assert.equal(await page.locator('#trackingRows tr').count(), 2);
  assert.match(await page.locator('#trackingConfig').innerText(), /disabled/);
  assert.match(await page.locator('#trackingRows').innerText(), /hard_bounced/);
  await page.locator('#trackingStatus').selectOption('hard_bounced');
  await page.waitForFunction(() => document.querySelector('#trackingRows').querySelectorAll('tr').length === 1);
  assert.match(await page.locator('#trackingRows').innerText(), /bounce@example.com/);
  await page.locator('#trackingRows button').first().click();
  assert.match(await page.locator('#trackingDetail').innerText(), /550 mailbox unavailable/);
  await page.locator('#trackingStatus').selectOption('');
  await page.waitForFunction(() => document.querySelector('#trackingRows').querySelectorAll('tr').length === 2);
  if (process.env.FC_UI_SCREENSHOT_DIR) {
    await fs.mkdir(process.env.FC_UI_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(process.env.FC_UI_SCREENSHOT_DIR, 'tracking-desktop.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.locator('#trackingStatus').isVisible());
  const widths = await page.evaluate(() => ({ screen: innerWidth, content: document.documentElement.scrollWidth }));
  assert(widths.content <= widths.screen + 1, JSON.stringify(widths));
  await page.locator('#trackingRefresh').scrollIntoViewIfNeeded();
  if (process.env.FC_UI_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.FC_UI_SCREENSHOT_DIR, 'tracking-mobile.png') });
  await page.locator('#domainForm').scrollIntoViewIfNeeded();
  assert(await page.locator('#domainForm button').isVisible());
  assert.deepEqual(errors, []);
});
