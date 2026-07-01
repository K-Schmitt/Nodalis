import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  noExternal: [],
  external: ['./commands/init.js', './commands/doctor.js', './commands/up.js', './commands/down.js', './commands/uninstall.js'],
});
