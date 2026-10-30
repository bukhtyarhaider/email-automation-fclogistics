import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChevronDown } from 'lucide-react';
/** Production frontend build. The server's existing static routes and CSP remain compatible. */
import { build, context } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const version = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')).version;
await fs.mkdir(path.join(ROOT, 'public/icons'), { recursive: true });
await fs.writeFile(
  path.join(ROOT, 'public/icons/chevron-down.svg'),
  renderToStaticMarkup(createElement(ChevronDown, { size: 12, color: '#94a3b8', strokeWidth: 2 })),
);
const options = {
  absWorkingDir: ROOT,
  entryPoints: {
    app: 'src/ui/app/main.tsx',
    experiment: 'src/ui/app/experiment-entry.tsx',
    conversations: 'src/ui/app/conversations-entry.tsx',
  },
  outdir: 'public',
  bundle: true,
  external: ['/icons/*'],
  splitting: false,
  format: 'esm',
  platform: 'browser',
  target: ['chrome110', 'edge110', 'safari16'],
  jsx: 'automatic',
  minify: true,
  legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'info',
};
for (const [file, entry, title] of [
  ['index', 'app', 'Outreach Desk · Sales Operations'],
  ['experiment', 'experiment', 'Import mapping review'],
  ['conversations', 'conversations', 'Carrier conversations'],
]) {
  const stylesheet = entry === 'app' ? 'style' : entry;
  await fs.writeFile(
    path.join(ROOT, 'public', `${file}.html`),
    `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/${stylesheet}.css?v=${version}"></head><body${entry === 'app' ? '' : ' class="experiment-body"'}><div id="root"></div><script type="module" src="/${entry}.js?v=${version}"></script></body></html>\n`,
  );
}
if (process.argv.includes('--watch')) {
  const ctx = await context({
    ...options,
    plugins: [
      {
        name: 'compatible-css-name',
        setup(b) {
          b.onEnd(async (result) => {
            if (!result.errors.length)
              await fs.rename(
                path.join(ROOT, 'public/app.css'),
                path.join(ROOT, 'public/style.css'),
              );
          });
        },
      },
    ],
  });
  await ctx.watch();
  console.log(
    'Watching React/TypeScript UI sources. Keep the local server running and reload after changes.',
  );
} else {
  await build(options);
  await fs.rename(path.join(ROOT, 'public/app.css'), path.join(ROOT, 'public/style.css'));
}
