import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import { connectionSettings, profileDirectory, validateEndpoint, inspectEndpoint, discoverBrowsers, debuggingGuide } from '../src/browser-session.mjs';
import { MailBrowser, loadPlaywright } from '../src/browser.mjs';
import { upgrade } from '../src/config.mjs';

test('legacy profiles migrate and browser identity paths stay portable, isolated and deterministic', () => {
  const state = upgrade({});
  assert.equal(state.profiles[0].connectionMode, 'saved');
  assert.equal(state.profiles[0].autoReconnect, true);
  const p = { id: '../bad/name', email: 'Sender@example.com', url: 'https://privateemail.com/spm/mail/INBOX/', browserChannel: 'chrome' };
  const root = path.resolve('private-data');
  const a = profileDirectory(root, p);
  assert.equal(a, profileDirectory(root, { ...p, email: p.email.toLowerCase() }));
  assert.equal(path.dirname(a), path.join(root, 'browser-profiles'));
  for (const change of [{ id: 'other' }, { email: 'other@example.com' }, { browserChannel: 'msedge' }, { url: 'https://another.invalid' }])
    assert.notEqual(a, profileDirectory(root, { ...p, ...change }));
  assert.equal(connectionSettings({ connectionMode: 'cdp', autoReconnect: false }).autoReconnect, false);
  assert.throws(() => connectionSettings({ connectionMode: 'unknown' }));
});

test('CDP permits only local origins and rejects credentials, redirect paths and remote hosts', () => {
  assert.equal(validateEndpoint('http://localhost:9222/'), 'http://127.0.0.1:9222');
  assert.equal(validateEndpoint('http://[::1]:9223'), 'http://[::1]:9223');
  for (const value of ['https://127.0.0.1:9222', 'ws://127.0.0.1:9222', 'http://127.0.0.1', 'http://192.168.1.1:9222', 'http://example.com:9222', 'http://user:secret@localhost:9222', 'http://localhost:9222/path', 'http://localhost:9222/?x=1', 'file:///tmp/browser'])
    assert.throws(() => validateEndpoint(value), value);
});

test('macOS and Windows debug commands quote custom paths and use a dedicated profile', () => {
  const mac = debuggingGuide("/tmp/O'Brien/My App", 'chrome', 'darwin');
  assert.match(mac.command, /Google Chrome.app/);
  assert.match(mac.command, /--remote-debugging-address=127.0.0.1/);
  assert.match(mac.command, /--user-data-dir=.*debug-browser\/chrome/);
  assert.match(mac.command, /O'\\''Brien/);
  const win = debuggingGuide("C:\\Users\\O'Brien\\My App\\data", 'msedge', 'win32');
  assert.match(win.command, /\$\{env:ProgramFiles\(x86\)\}/);
  assert.match(win.command, /msedge.exe/);
  assert.match(win.command, /'--user-data-dir=/);
  assert.match(win.profileDirectory, /debug-browser[/\\]edge$/);
  assert.equal(win.profileDirectory, "C:\\Users\\O'Brien\\My App\\data\\debug-browser\\edge");
  assert.match(win.command, /O''Brien/);
});

test('failed launch preserves profile data and reports lock errors without leaking browser logs', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-profile-errors-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const account = { id: 'test', email: 'sender@example.com', url: 'https://privateemail.com' };
  const mail = new MailBrowser({ dataDirectory: dir, chromium: { async launchPersistentContext() { throw new Error('SingletonLock in use SECRET'); } } });
  const profile = profileDirectory(dir, account);
  await fs.mkdir(profile, { recursive: true });
  await fs.writeFile(path.join(profile, 'preserve'), 'existing');
  await assert.rejects(mail.connect('SECRET', account), /already open/);
  assert.equal(await fs.readFile(path.join(profile, 'preserve'), 'utf8'), 'existing');
  assert.equal(mail.session.status, 'connection_error');
  assert(!JSON.stringify(mail.session).includes('SECRET'));
  assert.equal(await mail.isConnected(), false);
  await mail.close();
  await mail.close();
});

test('navigation failure keeps the browser available for manual recovery', async () => {
  let closed = false;
  const page = { isClosed: () => closed, setDefaultTimeout() {}, async route() {}, async unroute() {},
    async goto() { throw new Error('Navigation timeout'); } };
  const browser = { isConnected: () => !closed };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-navigation-'));
  const mail = new MailBrowser({ dataDirectory: directory, chromium: { async launchPersistentContext() {
    return { browser: () => browser, pages: () => [page], async close() { closed = true; } };
  } } });
  try {
    const result = await mail.connect('', { id: 'test', email: 'sender@example.com', url: 'https://privateemail.com' });
    assert.equal(result.status, 'navigation_error');
    assert.equal(result.connected, false);
    assert.equal(page.isClosed(), false);
    await mail.close();
    assert.equal(closed, true);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('discovery validates responses and never follows endpoint redirects or remote WebSockets', async (t) => {
  let payload;
  const server = http.createServer((req, res) => {
    if (payload === 'redirect') { res.writeHead(302, { Location: 'http://example.com/' }); res.end(); }
    else { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(payload)); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const port = server.address().port;
  const endpoint = `http://127.0.0.1:${port}`;
  payload = { Browser: 'Chrome/Test', webSocketDebuggerUrl: `ws://127.0.0.1:${port}/devtools/browser/synthetic` };
  assert.equal((await inspectEndpoint(endpoint)).browser, 'Chrome/Test');
  assert((await discoverBrowsers(endpoint)).some((b) => b.endpoint === endpoint));
  payload.webSocketDebuggerUrl = 'ws://example.com:9222/devtools/browser/synthetic';
  await assert.rejects(inspectEndpoint(endpoint), /local Chromium/);
  payload = 'redirect';
  await assert.rejects(inspectEndpoint(endpoint));
});

const inboxHTML = `<!doctype html><title>Test Mail</title><main id="app"></main><script>
function render() {
 const app=document.querySelector('#app');
 if (!localStorage.getItem('signedIn')) {
   app.innerHTML='<label>Email<input id="email"></label><label>Password<input id="password" type="password"></label><button id="login">Log in</button>';
   document.querySelector('#login').onclick=()=>{localStorage.setItem('signedIn','1');document.cookie='persisted=yes; max-age=86400; path=/';render();};
 } else {
   app.innerHTML='<button id="compose">Compose</button><section id="mount"></section>';
   document.querySelector('#compose').onclick=()=>{
     const div=document.createElement('div');div.id='composer_window_1';
     const sender=document.createElement('button');sender.textContent=localStorage.getItem('sender')||'sender@example.com';
     const close=document.createElement('button');close.textContent='Close';close.onclick=()=>div.remove();
     div.append(sender,close);document.querySelector('#mount').append(div);
   };
 }
}
render();</script>`;

test('real saved profile survives restarts; manual challenge and expired login recover without credentials or sends', { skip: process.env.FC_BROWSER_TESTS !== '1' }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-profile-test-'));
  const server = http.createServer((_, res) => { res.setHeader('Content-Type', 'text/html'); res.end(inboxHTML); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const account = { id: 'synthetic', email: 'sender@example.com', url: `http://127.0.0.1:${server.address().port}/`, browserChannel: process.env.FC_TEST_BROWSER_CHANNEL || 'chrome' };
  const mail = new MailBrowser({ dataDirectory: directory, headless: true });
  t.after(async () => { await mail.close(); server.close(); await fs.rm(directory, { recursive: true, force: true }); });
  assert.equal(await mail.hasSavedProfile(account), false);
  assert.equal((await mail.connect('', account)).status, 'login_required');
  const version = await mail.context.newPage();
  try {
    await version.goto('chrome://version');
    const command = await version.locator('#command_line').innerText();
    assert(command.includes('--user-data-dir='), 'read the running browser command line');
    assert(!command.includes('--no-sandbox'), 'app-launched Chrome must retain its sandbox');
    assert(!command.includes('--disable-setuid-sandbox'), 'sandbox must not be disabled through another flag');
  } finally { await version.close(); }
  await mail.page.setContent('<title>Just a moment...</title><div id="challenge-running">Verify you are human</div>');
  assert.equal((await mail.resume()).status, 'verification_required');
  assert.equal(mail.page.isClosed(), false);
  // Operator completes verification and signs in; the app does not solve it.
  await mail.page.goto(account.url);
  await mail.page.getByRole('button', { name: 'Log in' }).click();
  assert.equal((await mail.resume()).connected, true);
  assert.equal(await mail.page.locator('[id^="composer_window_"]').count(), 0);
  const competing = new MailBrowser({ dataDirectory: directory, headless: true });
  await assert.rejects(competing.connect('', account), /already open|Could not open/);
  assert.equal(await mail.isConnected(), true, 'failed second launch keeps the first session alive');
  await competing.close();
  await mail.close();
  assert.equal(await mail.hasSavedProfile(account), true);
  assert.equal((await mail.connect('', account)).connected, true);
  assert((await mail.context.cookies()).some((cookie) => cookie.name === 'persisted'));
  // A different account in the same tab cannot be approved for automation.
  await mail.page.evaluate(() => { localStorage.setItem('sender', 'wrong@example.com'); });
  assert.equal((await mail.resume()).status, 'account_mismatch');
  assert.equal(await mail.isConnected(), false);
  await mail.page.evaluate(() => { localStorage.removeItem('sender'); });
  assert.equal((await mail.resume()).connected, true);
  await mail.page.evaluate(() => { localStorage.removeItem('signedIn'); });
  await mail.page.reload();
  assert.equal(await mail.isConnected(), false);
  assert.equal(mail.session.status, 'login_required');
  await assert.rejects(mail.prepare({}), (error) => error.authenticationRequired && error.sendNotAttempted);
  await mail.page.getByRole('button', { name: 'Log in' }).click();
  assert.equal((await mail.resume()).connected, true);
  await mail.page.evaluate(() => { localStorage.removeItem('signedIn'); });
  await mail.close();
  assert.equal((await mail.connect('synthetic-password-only', account)).connected, true, 'optional password login still works');
  await mail.page.close();
  assert.equal(await mail.isConnected(), false);
  assert.equal(mail.session.status, 'disconnected');
});

test('real CDP attaches to the logged-in inbox, handles ambiguity and detaches without closing browser or other tabs', { skip: process.env.FC_BROWSER_TESTS !== '1' }, async (t) => {
  const { chromium } = loadPlaywright();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-cdp-test-'));
  const server = http.createServer((_, res) => { res.setHeader('Content-Type', 'text/html'); res.end(inboxHTML); });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const owner = await chromium.launchPersistentContext(directory, { headless: true, chromiumSandbox: true, channel: process.env.FC_TEST_BROWSER_CHANNEL || 'chrome', args: ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'] });
  const port = (await fs.readFile(path.join(directory, 'DevToolsActivePort'), 'utf8')).split('\n')[0];
  const account = { email: 'sender@example.com', url: `http://127.0.0.1:${server.address().port}/`, connectionMode: 'cdp', cdpEndpoint: `http://127.0.0.1:${port}` };
  const page = owner.pages()[0];
  await page.goto(account.url); await page.getByRole('button', { name: 'Log in' }).click();
  const other = await owner.newPage(); await other.goto('about:blank');
  const mail = new MailBrowser();
  t.after(async () => { await mail.close(); await owner.close(); server.close(); await fs.rm(directory, { recursive: true, force: true }); });
  assert.equal((await mail.connect('', account)).connected, true);
  assert.equal(await mail.page.evaluate(() => localStorage.getItem('signedIn')), '1');
  await mail.close();
  assert.equal(page.isClosed(), false);
  assert.equal(other.isClosed(), false);
  assert.equal(owner.browser().isConnected(), true);
  const duplicate = await owner.newPage(); await duplicate.goto(account.url);
  await assert.rejects(mail.connect('', account), /Several webmail tabs/);
  assert.equal(duplicate.isClosed(), false);
  await duplicate.close();
  assert.equal((await mail.connect('', account)).connected, true);
  await owner.close();
  assert.equal(await mail.isConnected(), false);
});
