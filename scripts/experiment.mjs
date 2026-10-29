// Separate read-only process: no sender, state upgrade, credentials or workers.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { check } from './doctor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function createExperimentServer({ dataDir, python = check() }) {
  let reviewing = false;
  const send = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(value));
  };
  const readState = async () => {
    try { return JSON.parse(await fs.readFile(path.join(dataDir, 'state.json'), 'utf8')); }
    catch { throw new Error('Cannot read source state.json. Start with the correct FC_EXPERIMENT_SOURCE data folder.'); }
  };
  const workbookPath = async (c) => {
    if (typeof c?.workbook?.file !== 'string') throw new Error('Campaign workbook is unavailable.');
    const base = await fs.realpath(dataDir);
    const file = await fs.realpath(path.resolve(base, c.workbook.file));
    if (path.relative(base, file).startsWith('..') || path.isAbsolute(path.relative(base, file))) throw new Error('Workbook must be inside the source data folder.');
    return file;
  };
  return http.createServer(async (req, res) => {
    try {
      const port = req.socket.localPort;
      const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) return send(res, 403, { error: 'Invalid host.' });
      const url = new URL(req.url, origins[0]);
      if (req.headers.origin && !origins.includes(req.headers.origin)) return send(res, 403, { error: 'Invalid origin.' });
      if (url.pathname === '/api/experiment/campaigns' && req.method === 'GET') {
        const state = await readState();
        const campaigns = await Promise.all((state.campaigns || []).map(async (c) => {
          let available = true;
          try { await workbookPath(c); } catch { available = false; }
          return { id: c.id, name: c.name || 'Untitled campaign', available };
        }));
        return send(res, 200, { campaigns, readOnly: true });
      }
      if (url.pathname === '/api/experiment/import-review' && req.method === 'POST') {
        if (req.headers['x-fc-request'] !== '1') return send(res, 403, { error: 'Missing request header.' });
        if (reviewing) return send(res, 409, { error: 'A review is running. Wait for it to finish.' });
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 128_000) return send(res, 413, { error: 'Mapping is too large.' });
        }
        const input = JSON.parse(body || '{}');
        const state = await readState();
        const campaign = (state.campaigns || []).find((c) => c.id === input.campaignId);
        if (!campaign) throw new Error('Choose a configured campaign.');
        let file;
        try { file = await workbookPath(campaign); } catch { throw new Error('This campaign workbook is missing or outside the source data folder.'); }
        if (reviewing) return send(res, 409, { error: 'A review is running. Wait for it to finish.' });
        reviewing = true;
        try {
          const result = await new Promise((resolve, reject) => {
            const child = spawn(python, ['-B', path.join(root, 'src/workbook.py'), 'review', file], { stdio: ['pipe', 'pipe', 'ignore'] });
            let output = '', settled = false;
            const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(result); };
            const timer = setTimeout(() => { child.kill(); finish(new Error('Workbook review timed out. Try a smaller workbook.')); }, 30_000);
            child.on('error', () => finish(new Error('Could not start Python for workbook review.')));
            child.stdin.on('error', () => {});
            child.stdout.on('data', (b) => { output += b; if (Buffer.byteLength(output) > 8_000_000) { child.kill(); finish(new Error('Review output is too large. Use fewer sheets.')); } });
            child.on('close', () => {
              try {
                const value = JSON.parse(output);
                if (value.error) throw new Error(value.error);
                finish(null, value);
              } catch (error) { finish(new Error(error.message.startsWith('Unexpected') ? 'Cannot parse workbook review. Check the XLSX file and mapping.' : error.message)); }
            });
            child.stdin.end(JSON.stringify(Object.hasOwn(input, 'mapping') ? input.mapping : campaign.mapping || {}));
          });
          return send(res, 200, { ...result, campaignId: campaign.id, campaignName: campaign.name, mode: Object.hasOwn(input, 'mapping') ? 'preview' : 'saved' });
        } finally { reviewing = false; }
      }
      const files = { '/': ['experiment.html', 'text/html'], '/experiment.js': ['experiment.js', 'text/javascript'], '/experiment.css': ['experiment.css', 'text/css'], '/style.css': ['style.css', 'text/css'] };
      if (req.method === 'GET' && files[url.pathname]) {
        const [file, type] = files[url.pathname];
        const content = await fs.readFile(path.join(root, 'public', file));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", 'Referrer-Policy': 'no-referrer' });
        return res.end(content);
      }
      return send(res, 404, { error: 'Read-only experiment: this action is unavailable.' });
    } catch (error) { send(res, 400, { error: error instanceof SyntaxError ? 'Use valid JSON for the mapping.' : error.message }); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = path.resolve(process.env.FC_EXPERIMENT_SOURCE || path.join(root, 'data'));
  const port = Number(process.env.FC_EXPERIMENT_PORT || 4327);
  const server = createExperimentServer({ dataDir });
  server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? 'Experiment port is already in use. Stop the old preview or set FC_EXPERIMENT_PORT.' : 'Cannot start experiment server.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Read-only import experiment: http://127.0.0.1:${port}\nNo workbook writes, mailbox connections or sending. Ctrl+C stops this preview.`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
}
