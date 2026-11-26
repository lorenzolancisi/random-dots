// Builds the static site into docs/ (served by GitHub Pages).
//   src/pages/*.html  -> docs/*.html (copied)
//   src/app/*.js      -> docs/js/*.js (bundled with esbuild: Firebase SDK and QR library included,
//                        no CDN needed at the event)
// Never copies local/ or preview/ (reserved counts, DECISIONI D-14).
import { build } from 'esbuild';
import { readdirSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'docs');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'js'), { recursive: true });

for (const f of readdirSync(join(root, 'src/pages'))) {
  copyFileSync(join(root, 'src/pages', f), join(out, f));
}
// GitHub Pages: serve files as-is (no Jekyll processing).
writeFileSync(join(out, '.nojekyll'), '');

const entries = readdirSync(join(root, 'src/app'))
  .filter((f) => f.endsWith('.js') && f !== 'fb.js')
  .map((f) => join(root, 'src/app', f));

await build({
  entryPoints: entries,
  bundle: true,
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  format: 'esm',
  target: 'es2020',
  outdir: join(out, 'js'),
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
});
console.log(`built ${entries.length} bundles into docs/`);
