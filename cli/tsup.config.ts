import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    target: 'node20',
    clean: true,
    bundle: false,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: [
      'src/config.ts',
      'src/errors.ts',
      'src/commands/*.ts',
      'src/lib/*.ts',
    ],
    format: ['esm'],
    target: 'node20',
    clean: false,
    bundle: false,
    dts: true,
  },
]);
