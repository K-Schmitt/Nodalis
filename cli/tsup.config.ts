import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  bundle: false,
  banner: { js: '#!/usr/bin/env node' },
});
