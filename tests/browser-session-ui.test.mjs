import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { loadPlaywright } from '../src/browser.mjs';

test('browser method controls, discovery, saved preferences and status render on desktop and mobile', { skip: process.env.FC_BROWSER_TESTS !== '1' }, async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-browser-ui-'));
  const discovery = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ Browser: 'Chrome/Synthetic', webSocketDebuggerUrl: `ws://127.0.0.1:${discovery.address().port}/devtools/browser/test` })); });
  discovery.listen(0, '127.0.0.1'); await once(discovery, 'listening');
  const child = spawn(process.execPath, ['--import', path.resolve('tests/fixtures/fake-mail.mjs'), path.resolve('src/server.mjs')], {
    env: { ...process.env, FC_DATA_DIR: dir, PORT: '14632', FC_MONITOR_ENABLED: '0', FC_OPEN_TRACKING_ENABLED: '0' }, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let browser;
  let stderr = ''; child.stderr.on('data', (b) => { stderr += b; });
  t.after(async () => {
    await browser?.close(); discovery.close();
    if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    await fs.rm(dir, { recursive: true, force: true });
  });
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(stderr);
    try { if ((await fetch('http://127.0.0.1:14632/api/state')).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 50));
  }
  browser = await loadPlaywright().chromium.launch({ channel: process.env.FC_TEST_BROWSER_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://127.0.0.1:14632/#settings');
  await page.waitForFunction(() => document.querySelector('#accountUrl').value.includes('privateemail.com'));
  assert.equal(await page.locator('#connectionMode').inputValue(), 'saved');
  assert.equal(await page.locator('#cdpSettings').isVisible(), false);
  await page.locator('#connectionMode').selectOption('cdp');
  assert.equal(await page.locator('#cdpSettings').isVisible(), true);
  await page.locator('#browserChannel').selectOption('msedge');
  assert.match(await page.locator('#browserDebugCommand').innerText(), /Microsoft.Edge|msedge/);
  await page.locator('#browserChannel').selectOption('chrome');
  const endpoint = `http://127.0.0.1:${discovery.address().port}`;
  await page.locator('#cdpEndpoint').fill(endpoint);
  await page.locator('#discoverBrowsers').click();
  await page.locator(`#availableBrowsers option[value="${endpoint}"]`).waitFor({ state: 'attached' });
  await page.locator('#availableBrowsers').selectOption(endpoint);
  await page.locator('#accountEmail').fill('sender@example.com');
  await page.locator('#autoReconnect').uncheck();
  await page.locator('#saveProfile').click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent === 'Profile saved.');
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#connectionMode').value === 'cdp');
  assert.equal(await page.locator('#cdpEndpoint').inputValue(), endpoint);
  assert.equal(await page.locator('#autoReconnect').isChecked(), false);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('#browserDebugCommand').scrollIntoViewIfNeeded();
    const sizes = await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth]);
    assert(sizes[1] <= sizes[0] + 1, sizes.join('/'));
  }
  await page.goto('http://127.0.0.1:14632/#dashboard');
  await page.locator('#connect').click();
  await page.waitForFunction(() => document.querySelector('#browserSessionStatus').textContent.includes('sender@example.com'));
  assert.deepEqual(errors, []);
});
