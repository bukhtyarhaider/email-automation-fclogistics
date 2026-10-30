import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { loadPlaywright } from '../src/browser.mjs';
import { workspace } from './fixtures/carrier-workspace.mjs';
import { upgrade } from '../src/config.mjs';
import { templates } from '../src/core.mjs';

const root = path.resolve(import.meta.dirname, '..');
const version = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')).version;
const contract = JSON.parse(
  await fs.readFile(path.join(root, 'tests/fixtures/ui-contract.json'), 'utf8'),
);
let fixtureDirectory, ui;
before(async () => {
  fixtureDirectory = await fs.mkdtemp(path.join(root, 'tests/.react-ui-'));
  const output = path.join(fixtureDirectory, 'fixture.mjs');
  await build({
    stdin: {
      resolveDir: root,
      contents: `
    export {App} from './src/ui/app/App';
    export {UIScope} from './src/ui/shared/lifecycle';
    export {viewNames, resolveView} from './src/ui/app/routes';
    export {classifyEvent, eventIdentity} from './src/ui/features/live-activity/controller';
    export {Button, Input, Textarea, Select, Dialog} from './src/ui/design-system/primitives';
  `,
    },
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    logLevel: 'silent',
  });
  ui = await import(pathToFileURL(output).href);
});
after(async () => {
  if (fixtureDirectory) await fs.rm(fixtureDirectory, { recursive: true, force: true });
});

test('React retains every original main-app control ID and all twelve hash routes', () => {
  const markup = renderToStaticMarkup(createElement(ui.App));
  const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'Control IDs must remain unique');
  assert.equal(
    (markup.match(/class="app-container"/g) || []).length,
    1,
    'The shell must have exactly one sidebar/content row',
  );
  assert.deepEqual(
    contract.ids.filter((id) => !ids.includes(id)),
    [],
  );
  assert.deepEqual([...ui.viewNames].sort(), [...contract.views].sort());
  for (const view of ui.viewNames) assert.equal(ui.resolveView(view), view);
  assert.equal(ui.resolveView('missing-route'), 'dashboard');
  assert.equal(ui.resolveView('trackingSeedStudio'), 'tracking');
  assert.equal(ui.resolveView('trackingDomainHealth'), 'tracking');
});

test('activity records keep distinct messages and explicit categories without formatting them as errors', () => {
  const first = { at: '2026-10-30T11:24:52.000Z', kind: 'system', message: 'Mailbox restored.' };
  const second = { ...first, message: 'A different event at the same timestamp.' };
  assert.notEqual(ui.eventIdentity(first), ui.eventIdentity(second));
  assert.equal(ui.eventIdentity(first), ui.eventIdentity({ ...first }));
  assert.notEqual(ui.eventIdentity(first), ui.eventIdentity({ ...first, kind: 'pause' }));
  assert.equal(ui.classifyEvent(first), 'system');
  assert.equal(
    ui.classifyEvent({
      ...first,
      kind: 'import',
      message: 'Revision activated; campaign remains paused.',
    }),
    'system',
  );
  assert.equal(
    ui.classifyEvent({ ...first, kind: 'pacing', message: 'Wait for the next queue check.' }),
    'pause',
  );
  assert.equal(ui.classifyEvent({ ...first, kind: '', message: 'Session restored.' }), 'system');
  assert.equal(
    ui.classifyEvent({ ...first, kind: '', message: 'Resting for 180 seconds.' }),
    'pause',
  );
  assert.equal(ui.classifyEvent({ ...first, kind: 'sent' }), 'send');
  assert.equal(ui.classifyEvent({ ...first, kind: 'error' }), 'error');
});

test('design primitives preserve native form semantics and safely render operator text', () => {
  const markup = renderToStaticMarkup(
    createElement(
      'form',
      {},
      createElement(ui.Input, {
        id: 'port',
        type: 'number',
        min: 1,
        max: 65535,
        defaultValue: 993,
      }),
      createElement(ui.Input, { type: 'checkbox', defaultChecked: true, disabled: true }),
      createElement(ui.Textarea, { defaultValue: '<script>operator text</script>' }),
      createElement(ui.Button, { type: 'submit', variant: 'secondary' }, 'Save'),
    ),
  );
  assert.match(markup, /min="1" max="65535" value="993"/);
  assert.match(markup, /disabled="" checked=""/);
  assert.match(markup, /&lt;script&gt;operator text&lt;\/script&gt;/);
  assert.match(markup, /<button[^>]+type="submit"/);
});

test('unmount cancels requests, polling, debounces and event handlers before remount', async () => {
  const savedWindow = globalThis.window;
  const scheduled = new Map();
  let timerId = 0,
    fetchSignal;
  globalThis.window = {
    setTimeout: (callback) => {
      scheduled.set(++timerId, callback);
      return timerId;
    },
    setInterval: (callback) => {
      scheduled.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id) => scheduled.delete(id),
    clearInterval: (id) => scheduled.delete(id),
    fetch: async (_url, options) => {
      fetchSignal = options.signal;
      return new Response('{}');
    },
  };
  try {
    const scope = new ui.UIScope(),
      target = new EventTarget();
    let clicks = 0;
    const element = { onclick: null };
    scope.begin();
    const generation = scope.generation;
    scope.listen(target, 'click', () => clicks++);
    scope.handler(element, 'onclick', () => clicks++);
    scope.interval(() => {}, 1500);
    scope.timeout(() => {}, 250);
    await scope.fetch('/api/state');
    target.dispatchEvent(new Event('click'));
    element.onclick();
    assert.equal(clicks, 2);
    scope.dispose();
    assert.equal(fetchSignal.aborted, true);
    assert.equal(scheduled.size, 0);
    assert.equal(element.onclick, null);
    assert.equal(scope.isCurrent(generation), false);
    target.dispatchEvent(new Event('click'));
    assert.equal(clicks, 2);
    scope.begin();
    scope.listen(target, 'click', () => clicks++);
    target.dispatchEvent(new Event('click'));
    assert.equal(clicks, 3);
    scope.dispose();
  } finally {
    globalThis.window = savedWindow;
  }
});

test('frontend sources use TypeScript and React rendering without legacy script or HTML injection paths', async () => {
  async function files(directory) {
    return (
      await Promise.all(
        (await fs.readdir(directory, { withFileTypes: true })).map((entry) =>
          entry.isDirectory()
            ? files(path.join(directory, entry.name))
            : path.join(directory, entry.name),
        ),
      )
    ).flat();
  }
  for (const file of await files(path.join(root, 'src/ui'))) {
    assert(!file.endsWith('.js') && !file.endsWith('.html'), file);
    if (!/\.tsx?$/.test(file)) continue;
    const source = await fs.readFile(file, 'utf8');
    assert(
      !/\.innerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|@ts-(?:ignore|nocheck)|:\s*any\b|\bas any\b/.test(
        source,
      ),
      file,
    );
  }
});

test(
  'React navigation preserves unsaved edits across all routes and polling at desktop/mobile widths',
  { skip: process.env.FC_BROWSER_TESTS !== '1' },
  async (t) => {
    const cleanups = [];
    const fixture = await workspace({ after: (cleanup) => cleanups.push(cleanup) });
    const directory = fixture.dataDir;
    const state = upgrade(fixture.state);
    state.templates = structuredClone(templates);
    state.profiles.push({
      ...structuredClone(state.profiles[0]),
      id: 'qa-secondary',
      name: 'A longer secondary mailbox profile for responsive layout verification',
      email: 'a-long-secondary-mailbox-for-layout-verification@example.invalid',
      browserChannel: 'msedge',
      autoReconnect: false,
    });
    await fixture.persist();
    const port = 14689;
    const child = spawn(process.execPath, [path.join(root, 'src/server.mjs')], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(port),
        FC_DATA_DIR: directory,
        FC_FIREBASE_DISABLE: '1',
        FC_MONITOR_ENABLED: '0',
        FC_OPEN_TRACKING_ENABLED: '0',
        FC_REPLY_CAPTURE_ENABLED: '0',
        FC_REPLY_AUTO: '0',
      },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errors = '',
      browser;
    child.stderr.on('data', (chunk) => {
      errors += chunk;
    });
    t.after(async () => {
      await browser?.close();
      if (child.exitCode === null) {
        const done = once(child, 'exit');
        child.kill('SIGTERM');
        await done;
      }
      for (const cleanup of cleanups.reverse()) await cleanup();
    });
    const url = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(errors);
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
      scriptErrors = [];
    page.on('pageerror', (error) => scriptErrors.push(error.message));
    await page.goto(`${url}/#settings`);
    await page.waitForFunction(
      (version) => document.getElementById('appVersion').textContent.includes(`v${version}`),
      version,
    );
    const draft = 'Unsent React migration draft <&> "preserve"';
    await page.locator('#trackingPcId').fill('4');
    await page.locator('[data-view=templates]').click();
    await page.locator('#subject').fill(draft);
    await page.locator('#body').fill(draft);
    for (const view of ui.viewNames) {
      await page.locator(`[data-view="${view}"]`).click();
      await page.waitForFunction(
        (view) => document.querySelector('.view-page.active')?.id === `view-${view}`,
        view,
      );
      assert.equal(await page.locator('.view-page.active').getAttribute('id'), `view-${view}`);
    }
    await page.waitForResponse((response) => response.url().endsWith('/api/state'));
    assert.equal(await page.locator('#trackingPcId').inputValue(), '4');
    assert.equal(await page.locator('#subject').inputValue(), draft);
    assert.equal(await page.locator('#body').inputValue(), draft);
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const view of ui.viewNames) {
        await page.locator(`[data-view="${view}"]`).click();
        await page.waitForFunction(
          (view) => document.querySelector('.view-page.active')?.id === `view-${view}`,
          view,
        );
        const shell = await page.evaluate(() => {
          const sidebar = document.querySelector('.app-sidebar').getBoundingClientRect();
          const viewport = document.querySelector('.app-viewport').getBoundingClientRect();
          const container = document.querySelector('.app-container').getBoundingClientRect();
          return {
            count: document.querySelectorAll('.app-container').length,
            gap: viewport.left - sidebar.right,
            rightGap: container.right - viewport.right,
            viewportContent: document.querySelector('.app-viewport').scrollWidth,
            viewportWidth: document.querySelector('.app-viewport').clientWidth,
          };
        });
        assert.equal(shell.count, 1, `${view}: one shell row`);
        assert(
          shell.viewportContent <= shell.viewportWidth + 1,
          `${view}: the content pane must not scroll sideways (${shell.viewportContent}/${shell.viewportWidth})`,
        );
        assert(
          Math.abs(shell.gap) <= 1,
          `${view}: content must start beside the sidebar, got ${shell.gap}px gap`,
        );
        assert(Math.abs(shell.rightGap) <= 1, `${view}: content must fill the shell`);
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${view} at ${width}px`,
        );
      }
    }
    await page.locator('[data-view="settings"]').click();
    await page.locator('#connectionMode').selectOption('cdp');
    await page.locator('#cdpSettings').waitFor({ state: 'visible' });
    for (const width of [1440, 1350, 1280, 1200, 1024, 820, 768, 480, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      const layout = await page.locator('#view-settings').evaluate((view) => {
        const rect = (element) => {
          const { x, y, width, right } = element.getBoundingClientRect();
          return { x, y, width, right };
        };
        const grid = view.querySelector('.settings-grid');
        const panel = view.querySelector('.settings-profiles-panel');
        const panels = [...grid.children].map(rect);
        const presets = view.querySelector('#pacingPresetsGrid');
        const headerOverflow = [...view.querySelectorAll('.panel-head')].some((head) =>
          [...head.children].some((child) => rect(child).right > rect(head).right + 1),
        );
        const controlOverflow = [
          ...view.querySelectorAll('input, select, textarea, button:not(table button)'),
        ]
          .filter(
            (control) => control.closest('.panel') && control.getBoundingClientRect().width > 0,
          )
          .some((control) => rect(control).right > rect(control.closest('.panel')).right - 8);
        const fieldRows = [...view.querySelectorAll('.form-grid-2')].map((row) =>
          [...row.querySelectorAll('input, select')].map(rect),
        );
        return {
          grid: rect(grid),
          panels,
          profileWidth: rect(panel).width,
          presetGridWidth: rect(presets).width,
          cards: [...presets.children].map((card) => ({
            width: rect(card).width,
            overflow: card.scrollWidth - card.clientWidth,
          })),
          headerOverflow,
          controlOverflow,
          fieldRows,
          contentWidth: document.querySelector('.app-viewport').clientWidth,
          contentScroll: document.querySelector('.app-viewport').scrollWidth,
          syncOverflow: [...view.querySelector('.settings-sync-actions').children].some(
            (child) => rect(child).right > rect(child.parentElement).right + 1,
          ),
        };
      });
      assert.equal(layout.panels.length, 9, 'All settings panels remain available');
      assert(
        Math.abs(layout.profileWidth - layout.grid.width) <= 1,
        'Mailbox list spans the workspace',
      );
      if (width > 1280) {
        assert(
          Math.abs(layout.panels[1].y - layout.panels[2].y) <= 1,
          'Profile and pacing panels align',
        );
        assert(
          Math.abs(layout.panels[1].width - layout.panels[2].width) <= 1,
          'Settings columns share width',
        );
        for (let index = 3; index < layout.panels.length; index += 2)
          assert(
            Math.abs(layout.panels[index].y - layout.panels[index + 1].y) <= 1,
            'Later sections share rows',
          );
      } else {
        for (const panel of layout.panels)
          assert(
            Math.abs(panel.width - layout.grid.width) <= 1,
            'Narrow layouts use full-width panels',
          );
      }
      for (const card of layout.cards) {
        assert(
          card.width >= Math.min(190, layout.presetGridWidth) - 1,
          `Preset must stay readable at ${width}px: ${card.width}px`,
        );
        assert(card.overflow <= 1, `Preset contents fit at ${width}px`);
      }
      assert(!layout.headerOverflow, `Settings headings fit at ${width}px`);
      assert(!layout.controlOverflow, `Settings inputs fit at ${width}px`);
      assert(!layout.syncOverflow, `Sync action fits at ${width}px`);
      assert(layout.contentScroll <= layout.contentWidth + 1, `Settings pane fits at ${width}px`);
      if (width > 820) {
        for (const fields of layout.fieldRows) {
          // The provider occupies its own row; all other paired controls align below their labels.
          if (fields.length === 2)
            assert(
              Math.abs(fields[0].y - fields[1].y) <= 1,
              'Paired inputs align even when labels wrap',
            );
        }
      }
    }
    await page.locator('#connectionMode').selectOption('saved');
    await page.locator('#cdpSettings').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#trackingPcId').inputValue(), '4');
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.locator('[data-view="leads"]').click();
    await page.locator('#filter').selectOption('all');
    await page.locator('#leadRows [data-preview]').first().click();
    await page.waitForFunction(() => {
      const footer = document.querySelector('#leadPreviewDrawer .drawer-footer');
      const bounds = footer.getBoundingClientRect();
      return (
        bounds.left >= 0 &&
        bounds.right <= innerWidth + 1 &&
        footer.scrollWidth <= footer.clientWidth + 1 &&
        [...footer.querySelectorAll('button')].every(
          (button) => button.getBoundingClientRect().right <= bounds.right + 1,
        )
      );
    });
    await page.locator('#closeDrawerBtn').click();
    await page.locator('[data-view="tracking"]').click();
    await page.waitForFunction(
      () => document.querySelector('.view-page.active').id === 'view-tracking',
    );
    for (const section of ['trackingSeedStudio', 'trackingDomainHealth']) {
      await page.locator(`a[href="#${section}"]`).click();
      await page.waitForFunction(
        (section) =>
          location.hash === `#${section}` &&
          document.querySelector('.view-page.active').id === 'view-tracking',
        section,
      );
      assert(await page.locator(`#${section}`).isVisible());
      const header = await page.locator(`#${section} .panel-head`).evaluate((element) => {
        const right = element.getBoundingClientRect().right;
        return [...element.children].every(
          (child) => child.getBoundingClientRect().right <= right + 1,
        );
      });
      assert(header, `${section}: header children fit inside the panel at mobile width`);
    }
    await page.goto(`${url}/#trackingSeedStudio`);
    await page.locator('#trackingRows tr').first().waitFor();
    assert.equal(await page.locator('.view-page.active').getAttribute('id'), 'view-tracking');
    assert.deepEqual(scriptErrors, []);
  },
);
