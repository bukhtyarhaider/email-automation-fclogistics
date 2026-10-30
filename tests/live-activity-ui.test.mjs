import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { upgrade } from '../src/config.mjs';
import { templates } from '../src/core.mjs';
import { loadPlaywright } from '../src/browser.mjs';

const root = path.resolve(import.meta.dirname, '..');
test(
  'live events preserve messages, search, categories, paused feed and local clearing at responsive widths',
  { skip: process.env.FC_BROWSER_TESTS !== '1' },
  async (t) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-live-react-'));
    const state = upgrade({});
    state.templates = structuredClone(templates);
    state.automation.enabled = true;
    state.automation.status = 'Waiting';
    state.automation.message = 'Synthetic queue waiting; preview sending is disabled.';
    state.events = [
      { at: '2026-10-30T11:24:52.000Z', kind: 'system', message: 'Mailbox settings saved.' },
      {
        at: '2026-10-30T11:24:52.000Z',
        kind: 'system',
        message: 'A different event at the same timestamp.',
      },
      {
        at: '2026-10-30T11:25:52.000Z',
        kind: 'sent',
        message: 'Sent to North & West <Fleet>. Workbook status updated.',
        company: 'North & West <Fleet>',
        email: 'a-very-long-business-contact-name-for-responsive-testing@example.invalid',
      },
      {
        at: '2026-10-30T11:26:52.000Z',
        kind: 'pause',
        message: 'Waiting for 178 seconds.',
        seconds: 178,
      },
      {
        at: '2026-10-30T11:27:52.000Z',
        kind: 'error',
        message: 'Connection needs attention. Saved history is retained.',
      },
    ];
    await fs.writeFile(path.join(directory, 'state.json'), JSON.stringify(state));
    const port = 14761,
      url = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [path.join(root, 'src/server.mjs')], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        FC_DATA_DIR: directory,
        FC_RELEASE_PREVIEW: '1',
        FC_FIREBASE_DISABLE: '1',
        FC_MONITOR_ENABLED: '0',
        FC_OPEN_TRACKING_ENABLED: '0',
        FC_OPEN_TRACKING_CONSENT: '0',
        FC_REPLY_CAPTURE_ENABLED: '0',
        FC_REPLY_AUTO: '0',
        FC_REPLY_MAILBOXES: '[]',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '',
      browser;
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    t.after(async () => {
      await browser?.close();
      if (child.exitCode === null) {
        const done = once(child, 'exit');
        child.kill('SIGTERM');
        await done;
      }
      await fs.rm(directory, { recursive: true, force: true });
    });
    const api = async (route, data) => {
      const response = await fetch(
        `${url}/api/${route}`,
        data === undefined
          ? {}
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-FC-Request': '1' },
              body: JSON.stringify(data),
            },
      );
      const result = await response.json();
      assert(response.ok, result.error);
      return result;
    };
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(stderr);
      try {
        if ((await fetch(`${url}/api/state`)).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    browser = await loadPlaywright().chromium.launch({
      channel: process.env.FC_TEST_BROWSER_CHANNEL || 'chrome',
      headless: true,
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
      errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${url}/#live-activity`);
    await page.waitForFunction(() => document.querySelectorAll('.event-message').length === 5);
    const messages = await page.locator('.event-message').allTextContents();
    assert.deepEqual(
      messages,
      state.events
        .slice()
        .reverse()
        .map((event) => event.message),
    );
    assert.equal(
      await page.locator('#liveRunnerStateText').innerText(),
      (await api('state')).job.status,
    );
    assert.match(await page.locator('#liveRunnerBadge').getAttribute('class'), /active/);
    assert.match(await page.locator('#events').textContent(), /Mailbox settings saved/);
    assert(!/\[object Object\]/.test(await page.locator('#events').textContent()));
    assert.equal(
      await page.locator('#liveVisualEventsList fleet').count(),
      0,
      'Event text stays literal',
    );
    await page.waitForResponse((response) => response.url().endsWith('/api/state'));
    assert.equal(
      await page.locator('.event-message').count(),
      5,
      'Polling does not duplicate events',
    );

    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('#liveSearchInput').fill('different event');
      assert.equal(await page.locator('.event-message').count(), 1);
      assert.match(
        await page.locator('.event-message').innerText(),
        /different event at the same timestamp/,
      );
      await page.locator('#liveSearchInput').fill('');
      const bounds = await page.evaluate(() => {
        const panel = document.querySelector('.live-activity-panel').getBoundingClientRect();
        const selectors = [
          '#liveSearchInput',
          '.stream-view-toggle-group',
          '.live-stream-toolbar',
          '.live-event-card',
          '.event-meta-tag',
        ];
        return {
          screen: innerWidth,
          document: document.documentElement.scrollWidth,
          overflow: selectors
            .flatMap((selector) =>
              [...document.querySelectorAll(selector)].map((element) => ({
                selector,
                left: element.getBoundingClientRect().left,
                right: element.getBoundingClientRect().right,
              })),
            )
            .filter((box) => box.left < panel.left - 1 || box.right > panel.right + 1),
        };
      });
      assert(bounds.document <= bounds.screen + 1, JSON.stringify(bounds));
      assert.deepEqual(
        bounds.overflow,
        [],
        `All live controls and event metadata fit at ${width}px`,
      );
      if (process.env.FC_UI_SCREENSHOT_DIR) {
        await fs.mkdir(process.env.FC_UI_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({
          path: path.join(process.env.FC_UI_SCREENSHOT_DIR, `live-activity-${width}.png`),
        });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-kind="error"]').click();
    assert.equal(await page.locator('[data-kind="error"]').getAttribute('aria-selected'), 'true');
    assert.match(await page.locator('.event-message').innerText(), /Connection needs attention/);
    await page.locator('[data-kind="all"]').click();
    await page.locator('#btnModeTerminal').click();
    assert.match(await page.locator('#liveTerminalOutput').innerText(), /Mailbox settings saved/);
    assert(!/\[object Object\]/.test(await page.locator('#liveTerminalOutput').innerText()));
    await page.locator('#btnModeVisual').click();
    await page.locator('#livePauseToggleBtn').click();
    await api('suppress', {
      email: 'new-event@example.invalid',
      reason: 'Synthetic UI regression',
    });
    await page.waitForFunction(
      () => document.querySelector('#liveTotalCountBadge').textContent === '6 events',
    );
    assert.equal(
      await page.locator('.event-message').count(),
      5,
      'Paused feed keeps its displayed snapshot',
    );
    await page.locator('#livePauseToggleBtn').click();
    assert.equal(await page.locator('.event-message').count(), 6);
    await page.locator('#liveSearchInput').fill('no-such-event');
    assert.equal(await page.locator('#liveVisualEmptyState').isVisible(), true);
    await page.locator('#liveSearchInput').fill('');

    const beforeClear = (await api('state')).events;
    page.once('dialog', (dialog) => dialog.dismiss());
    await page.locator('#liveClearEventsBtn').click();
    assert.equal(await page.locator('.event-message').count(), 0);
    await page.waitForResponse((response) => response.url().endsWith('/api/state'));
    assert.equal(
      await page.locator('.event-message').count(),
      0,
      'Local clearing survives polling',
    );
    assert.deepEqual(
      (await api('state')).events,
      beforeClear,
      'Cancel keeps the server log unchanged',
    );
    await api('suppress', {
      email: 'later-event@example.invalid',
      reason: 'Synthetic UI regression',
    });
    await page.waitForFunction(() => document.querySelectorAll('.event-message').length === 1);
    assert.match(await page.locator('.event-message').innerText(), /later-event@example.invalid/);
    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#liveClearEventsBtn').click();
    await page.waitForFunction(() =>
      document.querySelector('.event-message')?.textContent.includes('log cleared by operator'),
    );
    assert.equal((await api('state')).events.length, 1);
    assert.deepEqual(errors, []);
  },
);
