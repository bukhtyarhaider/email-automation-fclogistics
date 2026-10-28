import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { loadPlaywright } from '../src/browser.mjs';
const root = path.resolve(import.meta.dirname, '..');
test('PC and Firebase settings show effective configuration, warn, save and reload without false success', { skip: process.env.FC_BROWSER_TESTS !== '1' }, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-firebase-ui-'));
  const port = 14668;
  const child = spawn(process.execPath, [path.join(root, 'src/server.mjs')], {
    cwd: root, env: { ...process.env, FC_DATA_DIR: dir, PORT: String(port), FC_FIREBASE_DISABLE: '1', FC_TRACKING_PC_ID: '',
      FC_MONITOR_ENABLED: '0', FC_OPEN_TRACKING_ENABLED: '0', FC_TRACKING_PUBLIC_URL: 'https://track.example.com/t/1', FC_SEEDS: '[]' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = ''; child.stderr.on('data', (data) => { stderr += data; });
  let browser;
  t.after(async () => {
    await browser?.close();
    if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; }
    await fs.rm(dir, { recursive: true, force: true });
  });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(stderr);
    try { if ((await fetch(`http://127.0.0.1:${port}/api/state`)).ok) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  browser = await loadPlaywright().chromium.launch({ channel: process.env.FC_TEST_BROWSER_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${port}/#settings`);
  await page.locator('#firebaseDiagnostics dd').first().waitFor();
  assert.match(await page.locator('#firebaseWarnings').innerText(), /PC ID is not set/);
  assert.match(await page.locator('#firebaseDiagnostics').innerText(), /Legacy default/);
  assert.equal(await page.locator('#settingsFirebaseStatusBadge').innerText(), 'Disabled');
  await page.locator('#trackingPcId').fill('2');
  await page.locator('#firebaseBackend').selectOption('rtdb');
  await page.locator('#firebaseSyncMode').selectOption('manual');
  await page.locator('#saveSettings').click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent === 'Sending settings saved.');
  assert.match(await page.locator('#firebaseWarnings').innerText(), /routes to PC 1, but this PC ID is 2/);
  assert.match(await page.locator('#trackingPcIdHint').innerText(), /Effective PC ID: 2/);
  await page.locator('#trackingPublicUrl').fill('https://track.example.com/t/2');
  await page.locator('#saveSettings').click();
  await page.waitForFunction(() => !document.querySelector('#firebaseWarnings').textContent.includes('routes to PC 1'));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#trackingPcId').value === '2');
  assert.equal(await page.locator('#trackingPublicUrl').inputValue(), 'https://track.example.com/t/2');
  assert.equal(await page.locator('#firebaseBackend').inputValue(), 'rtdb');
  assert.equal(await page.locator('#firebaseSyncMode').inputValue(), 'manual');
  await page.locator('#settingsFirebaseSyncBtn').click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('Disabled by FC_FIREBASE_DISABLE'));
  assert(!/up to date/i.test(await page.locator('#notice').innerText()));
  // A diagnostic refresh must not replace unsaved PC settings.
  await page.locator('#trackingPcId').fill('4');
  await page.waitForResponse((response) => response.url().endsWith("/api/state"));
  assert.equal(await page.locator('#trackingPcId').inputValue(), '4');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('#firebaseDiagnostics').scrollIntoViewIfNeeded();
    const dimensions = await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth]);
    assert(dimensions[1] <= dimensions[0] + 1, dimensions.join('/'));
    const diagnosticBounds = await page.locator('#firebaseDiagnostics').boundingBox();
    assert(diagnosticBounds.x >= 0 && diagnosticBounds.x + diagnosticBounds.width <= width, JSON.stringify(diagnosticBounds));
    if (width < 820) assert((await page.locator('.app-sidebar').boundingBox()).width <= 70);
    if (process.env.FC_UI_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.FC_UI_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.FC_UI_SCREENSHOT_DIR, `firebase-settings-${width}.png`) });
    }
  }
  assert.deepEqual(errors, []);
});
