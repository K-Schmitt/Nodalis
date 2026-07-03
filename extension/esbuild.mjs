import esbuild from 'esbuild';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const webDist = resolve('..', 'web', 'dist');
if (!existsSync(webDist)) throw new Error('web/dist missing — run: npm run build -w web');
// Clean first so stale hashed bundles from a previous build don't accumulate.
const webDistDest = resolve('web-dist');
rmSync(webDistDest, { recursive: true, force: true });
cpSync(webDist, webDistDest, { recursive: true });

const watch = process.argv.includes('--watch');
const ctx = await esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['vscode'],
  outfile: 'dist/extension.js',
  sourcemap: true,
  logLevel: 'info',
});

if (watch) { await ctx.watch(); } else { await ctx.rebuild(); await ctx.dispose(); }
