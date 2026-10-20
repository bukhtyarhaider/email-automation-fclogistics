import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('connection preferences persist; optional password and startup restore respect saved state and opt-out', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fc-session-api-'));
  const port = 14631;
  let child;
  async function stop() {
    if (child?.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
  }
  async function start(saved = true) {
    child = spawn(process.execPath, ['--import', path.resolve('tests/fixtures/fake-mail.mjs'), path.resolve('src/server.mjs')], {
      env: { ...process.env, FC_DATA_DIR: dir, PORT: String(port), TEST_SAVED_PROFILE: saved ? '1' : '0', FC_MONITOR_ENABLED: '0', FC_OPEN_TRACKING_ENABLED: '0' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = ''; child.stderr.on('data', (b) => { stderr += b; });
    for (let i = 0; i < 200; i++) {
      if (child.exitCode !== null) throw new Error(stderr);
      try { const s = await api('state'); if (!s.busy) return s; } catch {}
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('Server startup timed out');
  }
  async function api(route, data) {
    const response = await fetch(`http://127.0.0.1:${port}/api/${route}`, {
      method: data === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'X-FC-Request': '1' },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }
  t.after(async () => { await stop(); await fs.rm(dir, { recursive: true, force: true }); });
  await start();
  const profile = { email: 'sender@example.com', provider: 'privateemail', connectionMode: 'saved', autoReconnect: true };
  await api('profile', profile);
  assert.equal((await api('connect', {})).connected, true);
  const s = await api('state');
  assert.equal(s.browserSession.status, 'connected');
  assert.match(s.browserGuide.command, /--user-data-dir=/);
  const id = s.activeProfile;
  await assert.rejects(api('profile', { ...profile, id, connectionMode: 'cdp', cdpEndpoint: 'http://example.com:9222' }), /local HTTP/);
  assert.equal((await api('state')).connected, true, 'invalid settings do not disconnect');
  await stop();
  assert.equal((await start()).connected, true, 'saved profile restored without password');
  await stop();
  assert.equal((await start(false)).connected, false, 'missing profile prompts for connection');
  await api('profile', { ...profile, id, autoReconnect: false });
  await stop();
  assert.equal((await start()).connected, false, 'startup preference respected');
  await api('profile', { ...profile, id, connectionMode: 'cdp', cdpEndpoint: 'http://localhost:9223', autoReconnect: false });
  assert.equal((await api('connect', {})).connected, true);
  const saved = JSON.parse(await fs.readFile(path.join(dir, 'state.json'), 'utf8'));
  assert.equal(saved.profiles.find((p) => p.id === id).connectionMode, 'cdp');
  assert.equal(saved.profiles.find((p) => p.id === id).cdpEndpoint, 'http://127.0.0.1:9223');
  assert(!JSON.stringify(saved).includes('webSocketDebuggerUrl'));
});
