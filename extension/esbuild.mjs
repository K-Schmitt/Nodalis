import esbuild from 'esbuild';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// ── 1. Bundle the built web frontend into the extension (webview + Live server) ──
const webDist = resolve('..', 'web', 'dist');
if (!existsSync(webDist)) throw new Error('web/dist missing — run: npm run build -w web');
const webDistDest = resolve('web-dist');
rmSync(webDistDest, { recursive: true, force: true });
cpSync(webDist, webDistDest, { recursive: true });

// ── 2. Bundle the compiled core into a single self-contained .cjs (no node_modules) ──
// Spawned as a child process by the engine → the .vsix runs standalone, without the repo.
const coreDist = resolve('..', 'core', 'dist', 'index.js');
if (!existsSync(coreDist)) throw new Error('core/dist missing — run: npm run build -w core');
await esbuild.build({
  entryPoints: [coreDist],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: resolve('core-bundle', 'index.cjs'),
  logLevel: 'error',
});

// ── 3. Bundle the default definitions so an empty workspace still has rules ──
const defsSrc = resolve('..', 'definitions');
if (!existsSync(defsSrc)) throw new Error('definitions/ missing at repo root');
const defsDest = resolve('definitions');
rmSync(defsDest, { recursive: true, force: true });
cpSync(defsSrc, defsDest, { recursive: true });

// ── 4. Bundle the extension host entry itself ──
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
