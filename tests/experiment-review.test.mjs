import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { createExperimentServer } from '../scripts/experiment.mjs';
import { check } from '../scripts/doctor.mjs';
import { loadPlaywright } from '../src/browser.mjs';

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-import-review-'));
  const python = check();
  const child = spawnSync(python, ['tests/fixtures/workbook.py', path.join(dir, 'leads.xlsx')]);
  assert.equal(child.status, 0);
  await fs.writeFile(path.join(dir, 'state.json'), JSON.stringify({
    automation: { enabled: true }, settings: { team: { enabled: true } },
    profiles: [{ email: 'sender@example.com', autoReconnect: true }],
    campaigns: [{ id: 'c1', name: '<b>Example campaign</b>', workbook: { file: 'leads.xlsx' } }, { id: 'missing', workbook: { file: 'gone.xlsx' } }, { id: 'escape', workbook: { file: '../outside.xlsx' } }],
    history: { 'owner2@example.com': { status: 'Sent' } }, suppression: { 'owner3@example.com': 'Do not contact' },
  }));
  const before = { state: await fs.readFile(path.join(dir, 'state.json')), workbook: await fs.readFile(path.join(dir, 'leads.xlsx')) };
  const server = createExperimentServer({ dataDir: dir, python });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); });
  const raw = (route, data, headers = {}) => fetch(url + route, data === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-FC-Request': '1', ...headers }, body: JSON.stringify(data) });
  return { dir, url, raw, before };
}

test('experiment reviews and previews are read-only; sender routes and untrusted requests are unavailable', async (t) => {
  const { dir, url, raw, before } = await fixture(t);
  const campaigns = await (await raw('/api/experiment/campaigns')).json();
  assert.deepEqual(campaigns.campaigns.map((c) => c.available), [true, false, false]);
  assert(!JSON.stringify(campaigns).includes('sender@example.com'));
  const saved = await (await raw('/api/experiment/import-review', { campaignId: 'c1' })).json();
  assert.equal(saved.summary.rows, 3); assert.equal(saved.summary.invalidEmailRows, 0); assert.equal(saved.mode, 'saved');
  const preview = await (await raw('/api/experiment/import-review', { campaignId: 'c1', mapping: { Leads: { email: 'C' } } })).json();
  assert.equal(preview.mode, 'preview'); assert.equal(preview.summary.invalidEmailRows, 3);
  assert.equal((await raw('/api/experiment/import-review', { campaignId: 'c1', mapping: [] })).status, 400);
  assert.equal((await raw('/api/experiment/import-review', { campaignId: 'escape' })).status, 400);
  assert.equal((await raw('/api/send', {})).status, 404);
  assert.equal((await raw('/api/start', {})).status, 404);
  assert.equal((await raw('/api/campaign', {})).status, 404);
  assert.equal((await raw('/api/experiment/import-review', { campaignId: 'c1' }, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await raw('/api/experiment/import-review', { campaignId: 'c1' }, { 'X-FC-Request': '0' })).status, 403);
  const spoofedHostStatus = await new Promise((resolve, reject) => {
    const req = http.get(url + '/api/experiment/campaigns', { headers: { Host: 'untrusted.example' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
  });
  assert.equal(spoofedHostStatus, 403);
  assert.equal((await raw('/state.json')).status, 404);
  assert.equal((await raw('/api/experiment/import-review', { campaignId: 'c1', mapping: 'a'.repeat(130_000) })).status, 413);
  assert.deepEqual(await fs.readFile(path.join(dir, 'state.json')), before.state);
  assert.deepEqual(await fs.readFile(path.join(dir, 'leads.xlsx')), before.workbook);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['leads.xlsx', 'state.json']);
});

test('import experiment UI previews mappings, retains invalid drafts, resets and fits mobile', { skip: process.env.FC_BROWSER_TESTS !== '1' }, async (t) => {
  const { url, dir, before } = await fixture(t);
  const browser = await loadPlaywright().chromium.launch({ channel: process.env.FC_TEST_BROWSER_CHANNEL || 'chrome', headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.locator('#reviewCampaign').selectOption('c1');
  await page.locator('#reviewLoad').click();
  await page.locator('#reviewResults').waitFor();
  assert.match(await page.locator('#reviewStatus').innerText(), /Review complete/);
  assert.match(await page.locator('#reviewSheets').innerText(), /3 parsed rows/);
  assert.equal(await page.locator('#reviewCampaign b').count(), 0);
  await page.locator('#reviewMapping').fill('{bad');
  await page.locator('#reviewPreview').click();
  await page.locator('#reviewError').waitFor();
  assert.equal(await page.locator('#reviewMapping').inputValue(), '{bad');
  await page.locator('#reviewMapping').fill('{"Leads":{"email":"C"}}');
  await page.locator('#reviewPreview').click();
  await page.waitForFunction(() => document.querySelector('#reviewHeading').textContent.includes('Proposed'));
  assert.match(await page.locator('#reviewChange').innerText(), /Nothing applied/);
  await page.locator('#reviewReset').click();
  await page.waitForFunction(() => document.querySelector('#reviewHeading').textContent.startsWith('Saved'));
  assert.equal(await page.locator('#reviewMapping').inputValue(), '{}');
  await page.locator('summary').filter({ hasText: 'Sample source rows' }).click();
  assert.match(await page.locator('#reviewSheets').innerText(), /owner2@example.com/);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1050 });
    assert(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth + 1));
    await page.locator('#reviewPreview').scrollIntoViewIfNeeded();
    assert(await page.locator('#reviewPreview').isVisible());
    await page.getByText('owner4@example.com', { exact: true }).scrollIntoViewIfNeeded();
    assert(await page.getByText('owner4@example.com', { exact: true }).isVisible());
    if (process.env.FC_UI_SCREENSHOT_DIR) {
      await fs.mkdir(process.env.FC_UI_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.FC_UI_SCREENSHOT_DIR, `import-experiment-${width}.png`), fullPage: true });
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(await fs.readFile(path.join(dir, 'state.json')), before.state);
  assert.deepEqual(await fs.readFile(path.join(dir, 'leads.xlsx')), before.workbook);
});
