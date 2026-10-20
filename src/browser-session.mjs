import path from 'node:path';
import { createHash } from 'node:crypto';

export function connectionSettings(input = {}) {
  const connectionMode = input.connectionMode || 'saved';
  if (!['saved', 'cdp'].includes(connectionMode)) throw new Error('Choose Saved Browser Profile or Connect to Existing Browser.');
  const cdpEndpoint = validateEndpoint(input.cdpEndpoint || 'http://127.0.0.1:9222');
  return { connectionMode, cdpEndpoint, autoReconnect: input.autoReconnect !== false };
}
export function validateEndpoint(value) {
  let u;
  try { u = new URL(value); } catch { throw new Error('Enter a local debugging address such as http://127.0.0.1:9222.'); }
  if (u.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) ||
      !u.port || u.username || u.password || u.search || u.hash || u.pathname !== '/')
    throw new Error('Use a local HTTP debugging origin with a port, such as http://127.0.0.1:9222.');
  // Use a literal loopback address; do not rely on hostname resolution.
  if (u.hostname === 'localhost') u.hostname = '127.0.0.1';
  return u.origin;
}
export function profileDirectory(root, account) {
  const key = createHash('sha256').update(JSON.stringify([
    account.id, account.email.toLowerCase(), new URL(account.url).origin, account.browserChannel || 'chrome',
  ])).digest('hex').slice(0, 32);
  return path.join(root, 'browser-profiles', key);
}
export async function inspectEndpoint(endpoint, timeout = 2000) {
  const origin = validateEndpoint(endpoint);
  const response = await fetch(`${origin}/json/version`, { signal: AbortSignal.timeout(timeout), redirect: 'error' });
  if (!response.ok) throw new Error('Debugging endpoint did not respond.');
  const data = await response.json();
  const ws = new URL(data.webSocketDebuggerUrl);
  const host = new URL(origin);
  if (ws.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(ws.hostname) ||
      ws.port !== host.port || ws.username || ws.password || ws.search || ws.hash || !ws.pathname.startsWith('/devtools/browser/'))
    throw new Error('The debugging endpoint did not provide a local Chromium browser connection.');
  ws.hostname = host.hostname;
  return { endpoint: origin, browser: String(data.Browser || 'Chromium').slice(0, 100), websocket: ws.href };
}
export async function discoverBrowsers(endpoint) {
  const addresses = [...new Set([validateEndpoint(endpoint || 'http://127.0.0.1:9222'), 'http://127.0.0.1:9222', 'http://127.0.0.1:9223'])];
  const results = await Promise.allSettled(addresses.map((address) => inspectEndpoint(address)));
  return results.filter((r) => r.status === 'fulfilled').map(({ value: { endpoint, browser } }) => ({ endpoint, browser }));
}
export function debuggingGuide(root, channel = 'chrome', platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const dir = paths.resolve(root, 'debug-browser', channel === 'msedge' ? 'edge' : 'chrome');
  const flags = '--remote-debugging-address=127.0.0.1 --remote-debugging-port=9222';
  // Commands are displayed as text, never executed by the app. Windows uses PowerShell.
  const quotePS = (s) => `'${s.replaceAll("'", "''")}'`;
  const quoteSH = (s) => `'${s.replaceAll("'", "'\\''")}'`;
  const windows = `& ${channel === 'msedge' ? "\"${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe\"" : "\"$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe\""} ${flags} ${quotePS(`--user-data-dir=${dir}`)}`;
  const mac = `${quoteSH(channel === 'msedge' ? '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')} ${flags} ${quoteSH(`--user-data-dir=${dir}`)}`;
  return { platform, profileDirectory: dir, command: platform === 'win32' ? windows : mac,
    message: 'Start a separate Chrome or Edge with this command, sign in there, then connect. Ordinary browser windows without debugging cannot be attached. Keep the port local and use the same debug profile on later starts. If installed elsewhere, replace the executable path.' };
}
