// Isolated import experiments: source data stays read-only; repairs live in experiment-data.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './doctor.mjs';
import { ExperimentImports } from '../src/experiment-imports.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function createExperimentServer({ dataDir, workspaceDir = path.join(root, 'experiment-data'), python = check() }) {
  const imports = new ExperimentImports({ dataDir, workspaceDir, python });
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
        const workspace = await imports.load();
        const campaigns = await Promise.all((state.campaigns || []).map(async (c) => {
          let available = true;
          try { await workbookPath(c); } catch { available = false; }
          return { id: c.id, name: c.name || 'Untitled campaign', available, hasWorkspace: Object.values(workspace.imports).some((i) => i.campaignId === c.id) };
        }));
        return send(res, 200, { campaigns, sourceReadOnly: true, experiment: 2 });
      }
      if (url.pathname === '/api/experiment/imports' && req.method === 'GET') {
        return send(res, 200, await imports.status(url.searchParams.get('campaignId'), url.searchParams));
      }
      if (url.pathname === '/api/experiment/import-download' && req.method === 'GET') {
        const file = await imports.download(url.searchParams.get('revisionId'), url.searchParams.get('kind'));
        res.writeHead(200, { 'Content-Type': file.type, 'Content-Disposition': `attachment; filename="${file.filename}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end(file.bytes);
      }
      const routes = ['/api/experiment/import-review', '/api/experiment/import-apply', '/api/experiment/import-restore'];
      if (routes.includes(url.pathname) && req.method === 'POST') {
        if (req.headers['x-fc-request'] !== '1') return send(res, 403, { error: 'Missing request header.' });
        if (reviewing) return send(res, 409, { error: 'An experiment operation is running. Wait for it to finish.' });
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 128_000) return send(res, 413, { error: 'Mapping is too large.' });
        }
        const input = JSON.parse(body || '{}');
        if (reviewing) return send(res, 409, { error: 'An experiment operation is running. Wait for it to finish.' });
        reviewing = true;
        try {
          const result = url.pathname.endsWith('import-review') ? await imports.review(input)
            : url.pathname.endsWith('import-apply') ? await imports.apply(input) : await imports.restore(input);
          return send(res, 200, result);
        } finally { reviewing = false; }
      }
      const files = { '/': ['experiment.html', 'text/html'], '/experiment.js': ['experiment.js', 'text/javascript'], '/experiment.css': ['experiment.css', 'text/css'], '/style.css': ['style.css', 'text/css'] };
      if (req.method === 'GET' && files[url.pathname]) {
        const [file, type] = files[url.pathname];
        const content = await fs.readFile(path.join(root, 'public', file));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", 'Referrer-Policy': 'no-referrer' });
        return res.end(content);
      }
      return send(res, 404, { error: 'Import experiment: this action is unavailable.' });
    } catch (error) { send(res, 400, { error: error instanceof SyntaxError ? 'Use valid JSON for the mapping.' : error.message }); }
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = path.resolve(process.env.FC_EXPERIMENT_SOURCE || path.join(root, 'data'));
  const port = Number(process.env.FC_EXPERIMENT_PORT || 4327);
  const server = createExperimentServer({ dataDir, workspaceDir: path.resolve(process.env.FC_EXPERIMENT_DATA_DIR || path.join(root, 'experiment-data')) });
  server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? 'Experiment port is already in use. Stop the old preview or set FC_EXPERIMENT_PORT.' : 'Cannot start experiment server.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Import repair experiment: http://127.0.0.1:${port}\nSource files stay unchanged. Repairs save to experiment copies only. No mailboxes or sending. Ctrl+C stops this preview.`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
}
