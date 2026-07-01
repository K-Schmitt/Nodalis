# CLI `@archi-os/cli` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `@archi-os/cli` package so `npx archi-os init && archi-os up` configures the MCP client(s) and launches core+web with zero manual steps.

**Architecture:** Standalone TypeScript package in `cli/` (npm workspace). Pure, testable libs (`mcp-config`, `paths`, `ports`) under `lib/`, thin command handlers under `commands/`. `up` spawns core (HTTP) detached + a zero-dep static server for `web/dist`; a signed `run.json` registry lets `down` stop exactly what `up` started. MCP config is edited surgically with `jsonc-parser` to preserve user comments.

**Tech Stack:** TypeScript (strict), commander, @clack/prompts, zod, jsonc-parser, tsup (build), vitest (tests). Node `http`/`fs` for the static server (no extra dep).

**Source spec:** [docs/superpowers/specs/2026-07-01-cli-archi-os-design.md](../specs/2026-07-01-cli-archi-os-design.md)

## Global Constraints

- TypeScript strict mode, **zero implicit `any`** (project rule).
- Node `>=20`.
- Custom errors only — `CliError` and subclasses, never bare `throw new Error` in command flows.
- Single source of truth for types: derive from Zod via `z.infer` where a schema exists.
- No shell spawning (`shell: false`) — single-PID processes, no command injection.
- Servers bind `127.0.0.1` only, never `0.0.0.0`.
- State files live under `.archi/` (config `.archi/cli.json`, runtime `.archi/cli/`), both gitignored.
- ESM (`"type": "module"`), `.js` import specifiers in TS (matches `core/`).
- Tests: vitest, under `cli/tests/unit/`.

---

## File Structure

**Created:**
- `cli/package.json`, `cli/tsconfig.json`, `cli/tsup.config.ts`
- `cli/src/index.ts` — bin entry, commander wiring, global catch
- `cli/src/errors.ts` — `CliError` + subclasses
- `cli/src/config.ts` — Zod schema for `.archi/cli.json`
- `cli/src/lib/paths.ts` — OS-aware client descriptors + detection
- `cli/src/lib/mcp-config.ts` — pure merge/unmerge (jsonc surgical edit)
- `cli/src/lib/ports.ts` — findFreePort, waitForHealth
- `cli/src/lib/process.ts` — bimodal spawn, run.json registry, signed kill
- `cli/src/lib/static-server.ts` — traversal-safe SPA server + injection
- `cli/src/commands/{init,doctor,up,down,uninstall}.ts`
- `cli/tests/unit/{mcp-config,paths,ports,static-server}.test.ts`

**Modified:**
- `package.json` (root) — add `"cli"` to `workspaces`
- `.gitignore` — add `.archi/cli/` and `.archi/cli.json`
- `web/src/config.ts` — runtime `window.__ARCHI_OS__` fallback
- `ARCHITECTURE.md` — document the new `cli/` package

---

## Task 1: Package scaffold + errors + commander skeleton

**Files:**
- Create: `cli/package.json`, `cli/tsconfig.json`, `cli/tsup.config.ts`, `cli/src/index.ts`, `cli/src/errors.ts`
- Modify: `package.json` (root), `.gitignore`

**Interfaces:**
- Produces: `CliError` (base, `constructor(message: string, exitCode?: number)`, default `exitCode = 1`), subclasses `McpConfigError`, `PortError`, `ProcessError` (all extend `CliError`). `runCli(argv: string[]): Promise<void>` in `index.ts`.

- [ ] **Step 1: Create `cli/package.json`**

```json
{
  "name": "@archi-os/cli",
  "version": "1.0.0",
  "description": "ARCHI-OS CLI — install, launch, configure MCP",
  "type": "module",
  "bin": { "archi-os": "dist/index.js" },
  "main": "dist/index.js",
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest watch",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@clack/prompts": "^0.7.0",
    "commander": "^12.0.0",
    "jsonc-parser": "^3.2.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.11.5",
    "tsup": "^8.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.2"
  },
  "engines": { "node": ">=20.0.0" }
}
```

- [ ] **Step 2: Create `cli/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `cli/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
});
```

- [ ] **Step 4: Create `cli/src/errors.ts`**

```ts
export class CliError extends Error {
  readonly exitCode: number;
  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

export class McpConfigError extends CliError {}
export class PortError extends CliError {}
export class ProcessError extends CliError {}
```

- [ ] **Step 5: Create `cli/src/index.ts` (commander skeleton, global catch)**

```ts
import { Command } from 'commander';
import { CliError } from './errors.js';

export async function runCli(argv: string[]): Promise<void> {
  const program = new Command();
  program
    .name('archi-os')
    .description('ARCHI-OS CLI — install, launch, configure MCP')
    .version('1.0.0');

  program.command('init').description('Configure MCP client(s)')
    .option('--client <client>', 'cursor|claude|vscode|all')
    .action(async (opts: { client?: string }) => {
      const { init } = await import('./commands/init.js');
      await init(opts);
    });

  program.command('doctor').description('Diagnostics')
    .action(async () => {
      const { doctor } = await import('./commands/doctor.js');
      await doctor();
    });

  program.command('up').description('Launch core + web')
    .option('--docker', 'delegate to docker compose')
    .option('--no-open', 'do not open the browser')
    .action(async (opts: { docker?: boolean; open?: boolean }) => {
      const { up } = await import('./commands/up.js');
      await up(opts);
    });

  program.command('down').description('Stop launched processes')
    .action(async () => {
      const { down } = await import('./commands/down.js');
      await down();
    });

  program.command('uninstall').description('Remove MCP config (reversible)')
    .action(async () => {
      const { uninstall } = await import('./commands/uninstall.js');
      await uninstall();
    });

  await program.parseAsync(argv);
}

runCli(process.argv).catch((err: unknown) => {
  if (err instanceof CliError) {
    console.error(`✖ ${err.message}`);
    process.exit(err.exitCode);
  }
  console.error('✖ Unexpected error:', err);
  process.exit(1);
});
```

> Command modules are created in later tasks; the dynamic `import()` calls only resolve when that command runs, so the skeleton builds and runs (e.g. `archi-os --help`) before they exist.

- [ ] **Step 6: Add `"cli"` to root `package.json` workspaces**

Modify `package.json` (root): `"workspaces": ["core", "web"]` → `"workspaces": ["core", "web", "cli"]`.

- [ ] **Step 7: Add state files to `.gitignore`**

Append to `.gitignore`:
```
.archi/cli/
.archi/cli.json
```

- [ ] **Step 8: Install deps and verify build + help**

Run: `cd cli && npm install && npm run build && node dist/index.js --help`
Expected: help text listing `init`, `doctor`, `up`, `down`, `uninstall`; exit 0.

- [ ] **Step 9: Commit**

```bash
git add cli/package.json cli/tsconfig.json cli/tsup.config.ts cli/src/index.ts cli/src/errors.ts package.json .gitignore
git commit -m "feat(cli): scaffold @archi-os/cli package with commander skeleton"
```

---

## Task 2: Config schema (`config.ts`)

**Files:**
- Create: `cli/src/config.ts`, `cli/tests/unit/config.test.ts`

**Interfaces:**
- Produces: `CliConfigSchema` (zod), `type CliConfig = z.infer<typeof CliConfigSchema>` with shape `{ ports: { core: number; web: number }; clients: Array<'cursor'|'claude'|'vscode'> }`. `parseCliConfig(raw: unknown): CliConfig` (throws `McpConfigError` on invalid). `DEFAULT_CONFIG: CliConfig`.

- [ ] **Step 1: Write failing test `cli/tests/unit/config.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseCliConfig, DEFAULT_CONFIG } from '../../src/config.js';
import { McpConfigError } from '../../src/errors.js';

describe('parseCliConfig', () => {
  it('accepts a valid config', () => {
    const cfg = parseCliConfig({ ports: { core: 3000, web: 4173 }, clients: ['cursor'] });
    expect(cfg.ports.core).toBe(3000);
    expect(cfg.clients).toEqual(['cursor']);
  });

  it('rejects an unknown client', () => {
    expect(() => parseCliConfig({ ports: { core: 3000, web: 4173 }, clients: ['emacs'] }))
      .toThrow(McpConfigError);
  });

  it('rejects a non-integer port', () => {
    expect(() => parseCliConfig({ ports: { core: 3000.5, web: 4173 }, clients: [] }))
      .toThrow(McpConfigError);
  });

  it('exposes sane defaults', () => {
    expect(DEFAULT_CONFIG.ports.core).toBe(3000);
    expect(DEFAULT_CONFIG.ports.web).toBe(4173);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run tests/unit/config.test.ts`
Expected: FAIL (cannot import `../../src/config.js`).

- [ ] **Step 3: Implement `cli/src/config.ts`**

```ts
import { z } from 'zod';
import { McpConfigError } from './errors.js';

export const ClientIdSchema = z.enum(['cursor', 'claude', 'vscode']);
export type ClientId = z.infer<typeof ClientIdSchema>;

export const CliConfigSchema = z.object({
  ports: z.object({
    core: z.number().int().min(1).max(65535),
    web: z.number().int().min(1).max(65535),
  }),
  clients: z.array(ClientIdSchema),
});

export type CliConfig = z.infer<typeof CliConfigSchema>;

export const DEFAULT_CONFIG: CliConfig = {
  ports: { core: 3000, web: 4173 },
  clients: [],
};

export function parseCliConfig(raw: unknown): CliConfig {
  const result = CliConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new McpConfigError(`Invalid .archi/cli.json: ${result.error.issues[0]?.message ?? 'unknown'}`);
  }
  return result.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && npx vitest run tests/unit/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add cli/src/config.ts cli/tests/unit/config.test.ts
git commit -m "feat(cli): add Zod config schema for .archi/cli.json"
```

---

## Task 3: Client paths + detection (`paths.ts`)

**Files:**
- Create: `cli/src/lib/paths.ts`, `cli/tests/unit/paths.test.ts`

**Interfaces:**
- Consumes: `ClientId` from `config.ts`.
- Produces:
  - `type ClientDescriptor = { id: ClientId; file: string; key: 'mcpServers' | 'servers'; entry: 'plain' | 'stdio' }`.
  - `resolveClient(id: ClientId, ctx: { home: string; platform: NodeJS.Platform; workspaceRoot: string; appData?: string }): ClientDescriptor`.
  - `detectInstalledClients(ctx, existsSync?): ClientId[]` — returns clients whose config file or parent dir exists.
  - `clientContext(): { home; platform; workspaceRoot; appData }` — real environment (thin wrapper for injection in tests).

- [ ] **Step 1: Write failing test `cli/tests/unit/paths.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { resolveClient, detectInstalledClients } from '../../src/lib/paths.js';

const base = { home: '/home/u', workspaceRoot: '/ws', appData: 'C:\\Users\\u\\AppData\\Roaming' };

describe('resolveClient', () => {
  it('cursor → global mcp.json under home, mcpServers/plain', () => {
    const d = resolveClient('cursor', { ...base, platform: 'linux' });
    expect(d.file).toBe('/home/u/.cursor/mcp.json');
    expect(d.key).toBe('mcpServers');
    expect(d.entry).toBe('plain');
  });

  it('vscode → workspace .vscode/mcp.json, servers/stdio', () => {
    const d = resolveClient('vscode', { ...base, platform: 'linux' });
    expect(d.file).toBe('/ws/.vscode/mcp.json');
    expect(d.key).toBe('servers');
    expect(d.entry).toBe('stdio');
  });

  it('claude on linux → ~/.config/Claude', () => {
    const d = resolveClient('claude', { ...base, platform: 'linux' });
    expect(d.file).toBe('/home/u/.config/Claude/claude_desktop_config.json');
  });

  it('claude on darwin → Library/Application Support', () => {
    const d = resolveClient('claude', { ...base, platform: 'darwin' });
    expect(d.file).toBe('/home/u/Library/Application Support/Claude/claude_desktop_config.json');
  });

  it('claude on win32 → APPDATA', () => {
    const d = resolveClient('claude', { ...base, platform: 'win32' });
    expect(d.file).toBe('C:\\Users\\u\\AppData\\Roaming\\Claude\\claude_desktop_config.json');
  });
});

describe('detectInstalledClients', () => {
  it('returns only clients whose file/dir exists', () => {
    const exists = (p: string) => p.includes('.cursor');
    const found = detectInstalledClients({ ...base, platform: 'linux' }, exists);
    expect(found).toContain('cursor');
    expect(found).not.toContain('vscode');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run tests/unit/paths.test.ts`
Expected: FAIL (cannot import `paths.js`).

- [ ] **Step 3: Implement `cli/src/lib/paths.ts`**

```ts
import { existsSync as realExistsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ClientId } from '../config.js';

export type ClientDescriptor = {
  id: ClientId;
  file: string;
  key: 'mcpServers' | 'servers';
  entry: 'plain' | 'stdio';
};

export type ClientContext = {
  home: string;
  platform: NodeJS.Platform;
  workspaceRoot: string;
  appData?: string;
};

export function clientContext(): ClientContext {
  return {
    home: homedir(),
    platform: process.platform,
    workspaceRoot: process.env.WORKSPACE_ROOT ?? process.cwd(),
    appData: process.env.APPDATA,
  };
}

function claudeFile(ctx: ClientContext): string {
  const name = 'claude_desktop_config.json';
  if (ctx.platform === 'win32') {
    const appData = ctx.appData ?? join(ctx.home, 'AppData', 'Roaming');
    return join(appData, 'Claude', name);
  }
  if (ctx.platform === 'darwin') {
    return join(ctx.home, 'Library', 'Application Support', 'Claude', name);
  }
  return join(ctx.home, '.config', 'Claude', name);
}

export function resolveClient(id: ClientId, ctx: ClientContext): ClientDescriptor {
  switch (id) {
    case 'cursor':
      return { id, file: join(ctx.home, '.cursor', 'mcp.json'), key: 'mcpServers', entry: 'plain' };
    case 'vscode':
      return { id, file: join(ctx.workspaceRoot, '.vscode', 'mcp.json'), key: 'servers', entry: 'stdio' };
    case 'claude':
      return { id, file: claudeFile(ctx), key: 'mcpServers', entry: 'plain' };
  }
}

const ALL: ClientId[] = ['cursor', 'claude', 'vscode'];

export function detectInstalledClients(
  ctx: ClientContext,
  exists: (p: string) => boolean = realExistsSync,
): ClientId[] {
  return ALL.filter((id) => {
    const d = resolveClient(id, ctx);
    return exists(d.file) || exists(dirname(d.file));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && npx vitest run tests/unit/paths.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add cli/src/lib/paths.ts cli/tests/unit/paths.test.ts
git commit -m "feat(cli): OS-aware client descriptors and detection"
```

---

## Task 4: MCP config surgical merge/unmerge (`mcp-config.ts`)

**Files:**
- Create: `cli/src/lib/mcp-config.ts`, `cli/tests/unit/mcp-config.test.ts`

**Interfaces:**
- Consumes: `ClientDescriptor` (uses `.key`, `.entry`).
- Produces:
  - `type McpEntry = { command: string; args: string[]; env: Record<string, string>; type?: 'stdio' }`.
  - `buildEntry(coreDistPath: string, workspaceRoot: string, entryShape: 'plain' | 'stdio'): McpEntry`.
  - `mergeServer(text: string, entry: McpEntry, key: 'mcpServers' | 'servers'): string` — surgical edit of the `archi-os` key. Empty/whitespace `text` → starts from `{}`. Idempotent (identical → returns input unchanged). Throws `McpConfigError` on unparseable JSONC.
  - `unmergeServer(text: string, key: 'mcpServers' | 'servers'): string` — removes only `archi-os`. Throws `McpConfigError` on unparseable.
  - `SERVER_KEY = 'archi-os'`.

- [ ] **Step 1: Write failing test `cli/tests/unit/mcp-config.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parse } from 'jsonc-parser';
import { buildEntry, mergeServer, unmergeServer } from '../../src/lib/mcp-config.js';
import { McpConfigError } from '../../src/errors.js';

const entry = buildEntry('/abs/core/dist/index.js', '/abs', 'plain');
const vscodeEntry = buildEntry('/abs/core/dist/index.js', '/abs', 'stdio');

describe('buildEntry', () => {
  it('plain entry has no type', () => {
    expect(entry.type).toBeUndefined();
    expect(entry.command).toBe('node');
    expect(entry.args).toEqual(['/abs/core/dist/index.js']);
    expect(entry.env.WORKSPACE_ROOT).toBe('/abs');
  });
  it('stdio entry adds type', () => {
    expect(vscodeEntry.type).toBe('stdio');
  });
});

describe('mergeServer', () => {
  it('adds archi-os under mcpServers to empty text', () => {
    const out = mergeServer('', entry, 'mcpServers');
    expect(parse(out).mcpServers['archi-os'].command).toBe('node');
  });

  it('preserves sibling servers', () => {
    const input = '{ "mcpServers": { "other": { "command": "x" } } }';
    const out = mergeServer(input, entry, 'mcpServers');
    const j = parse(out);
    expect(j.mcpServers.other.command).toBe('x');
    expect(j.mcpServers['archi-os'].command).toBe('node');
  });

  it('preserves user comments (surgical edit)', () => {
    const input = '{\n  // keep me\n  "mcpServers": {}\n}';
    const out = mergeServer(input, entry, 'mcpServers');
    expect(out).toContain('// keep me');
  });

  it('is idempotent', () => {
    const once = mergeServer('', entry, 'mcpServers');
    const twice = mergeServer(once, entry, 'mcpServers');
    expect(twice).toBe(once);
  });

  it('uses the servers key for vscode', () => {
    const out = mergeServer('', vscodeEntry, 'servers');
    const j = parse(out);
    expect(j.servers['archi-os'].type).toBe('stdio');
    expect(j.mcpServers).toBeUndefined();
  });

  it('throws on unparseable input', () => {
    expect(() => mergeServer('{ not json', entry, 'mcpServers')).toThrow(McpConfigError);
  });
});

describe('unmergeServer', () => {
  it('removes only archi-os', () => {
    const input = mergeServer('{ "mcpServers": { "other": { "command": "x" } } }', entry, 'mcpServers');
    const out = unmergeServer(input, 'mcpServers');
    const j = parse(out);
    expect(j.mcpServers['archi-os']).toBeUndefined();
    expect(j.mcpServers.other.command).toBe('x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run tests/unit/mcp-config.test.ts`
Expected: FAIL (cannot import `mcp-config.js`).

- [ ] **Step 3: Implement `cli/src/lib/mcp-config.ts`**

```ts
import { applyEdits, modify, parse, type ParseError } from 'jsonc-parser';
import { McpConfigError } from '../errors.js';

export const SERVER_KEY = 'archi-os';

export type McpEntry = {
  command: string;
  args: string[];
  env: Record<string, string>;
  type?: 'stdio';
};

export function buildEntry(
  coreDistPath: string,
  workspaceRoot: string,
  entryShape: 'plain' | 'stdio',
): McpEntry {
  const entry: McpEntry = {
    command: 'node',
    args: [coreDistPath],
    env: { WORKSPACE_ROOT: workspaceRoot },
  };
  if (entryShape === 'stdio') entry.type = 'stdio';
  return entry;
}

const FORMAT = { insertSpaces: true, tabSize: 2 } as const;

function parseOrThrow(text: string): unknown {
  const errors: ParseError[] = [];
  const src = text.trim() === '' ? '{}' : text;
  const value = parse(src, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new McpConfigError('MCP config file is unreadable — edit it by hand or remove it, then retry.');
  }
  return value;
}

export function mergeServer(text: string, entry: McpEntry, key: 'mcpServers' | 'servers'): string {
  const src = text.trim() === '' ? '{}' : text;
  const current = parseOrThrow(src) as Record<string, unknown>;
  const existing = (current[key] as Record<string, unknown> | undefined)?.[SERVER_KEY];
  if (existing && JSON.stringify(existing) === JSON.stringify(entry)) {
    return text; // idempotent: no change
  }
  const edits = modify(src, [key, SERVER_KEY], entry, { formattingOptions: FORMAT });
  return applyEdits(src, edits);
}

export function unmergeServer(text: string, key: 'mcpServers' | 'servers'): string {
  const src = text.trim() === '' ? '{}' : text;
  parseOrThrow(src); // validate parseability
  const edits = modify(src, [key, SERVER_KEY], undefined, { formattingOptions: FORMAT });
  return applyEdits(src, edits);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && npx vitest run tests/unit/mcp-config.test.ts`
Expected: PASS (all cases, incl. comment preservation + idempotence).

- [ ] **Step 5: Commit**

```bash
git add cli/src/lib/mcp-config.ts cli/tests/unit/mcp-config.test.ts
git commit -m "feat(cli): surgical JSONC merge/unmerge for MCP config"
```

---

## Task 5: `init` command

**Files:**
- Create: `cli/src/commands/init.ts`
- (Manual verification; IO glue over tested pure libs.)

**Interfaces:**
- Consumes: `resolveClient`, `detectInstalledClients`, `clientContext` (paths); `buildEntry`, `mergeServer` (mcp-config); `CliConfig`, `DEFAULT_CONFIG`, `parseCliConfig`, `ClientId`, `ClientIdSchema` (config).
- Produces: `init(opts: { client?: string }): Promise<void>`.
- Uses helpers (create in this task, in `init.ts`): `readTextIfExists(file): string | null`, `atomicWrite(file, text): void` (temp+rename, mkdir -p), `backupIfAbsent(file): void` (copy to `file.bak` only if `.bak` missing), `writeCliConfig(workspaceRoot, cfg)`, `readCliConfig(workspaceRoot): CliConfig`.

- [ ] **Step 1: Implement `cli/src/commands/init.ts`**

```ts
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { multiselect, isCancel, cancel, intro, outro, log } from '@clack/prompts';
import { CliConfigSchema, ClientIdSchema, DEFAULT_CONFIG, parseCliConfig, type ClientId, type CliConfig } from '../config.js';
import { McpConfigError } from '../errors.js';
import { buildEntry, mergeServer } from '../lib/mcp-config.js';
import { clientContext, detectInstalledClients, resolveClient } from '../lib/paths.js';

function readTextIfExists(file: string): string | null {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

function atomicWrite(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text, 'utf8');
  renameSync(tmp, file);
}

function backupIfAbsent(file: string): void {
  const bak = `${file}.bak`;
  if (existsSync(file) && !existsSync(bak)) copyFileSync(file, bak);
}

function configPath(workspaceRoot: string): string {
  return join(workspaceRoot, '.archi', 'cli.json');
}

export function readCliConfig(workspaceRoot: string): CliConfig {
  const text = readTextIfExists(configPath(workspaceRoot));
  if (!text) return { ...DEFAULT_CONFIG };
  return parseCliConfig(JSON.parse(text));
}

function writeCliConfig(workspaceRoot: string, cfg: CliConfig): void {
  atomicWrite(configPath(workspaceRoot), JSON.stringify(CliConfigSchema.parse(cfg), null, 2) + '\n');
}

async function chooseClients(opts: { client?: string }, detected: ClientId[]): Promise<ClientId[]> {
  if (opts.client === 'all') return ['cursor', 'claude', 'vscode'];
  if (opts.client) {
    const parsed = ClientIdSchema.safeParse(opts.client);
    if (!parsed.success) throw new McpConfigError(`Unknown --client "${opts.client}" (cursor|claude|vscode|all)`);
    return [parsed.data];
  }
  if (detected.length === 0) throw new McpConfigError('No MCP client detected. Pass --client cursor|claude|vscode|all.');
  const picked = await multiselect({
    message: 'Configure MCP for which client(s)?',
    options: detected.map((id) => ({ value: id, label: id })),
    required: true,
  });
  if (isCancel(picked)) { cancel('Aborted.'); process.exit(0); }
  return picked as ClientId[];
}

export async function init(opts: { client?: string }): Promise<void> {
  intro('archi-os init');
  const ctx = clientContext();
  const workspaceRoot = ctx.workspaceRoot;
  const coreDist = resolve(workspaceRoot, 'core', 'dist', 'index.js');
  if (!existsSync(coreDist)) {
    log.warn(`core not built at ${coreDist} — run "npm run build:core" before starting the MCP client.`);
  }

  const detected = detectInstalledClients(ctx);
  const chosen = await chooseClients(opts, detected);

  for (const id of chosen) {
    const d = resolveClient(id, ctx);
    const before = readTextIfExists(d.file) ?? '';
    const entry = buildEntry(coreDist, workspaceRoot, d.entry);
    const after = mergeServer(before, entry, d.key);
    if (after === before && before !== '') { log.info(`${id}: already configured (no change).`); continue; }
    backupIfAbsent(d.file);
    atomicWrite(d.file, after.endsWith('\n') ? after : after + '\n');
    log.success(`${id}: wrote ${d.file}`);
  }

  const cfg = readCliConfig(workspaceRoot);
  const clients = Array.from(new Set([...cfg.clients, ...chosen]));
  writeCliConfig(workspaceRoot, { ...cfg, clients });
  outro('MCP configured. Restart your MCP client to load archi-os.');
}
```

- [ ] **Step 2: Manual verification (idempotence + preservation)**

Run:
```bash
cd cli && npm run build
cd .. && node cli/dist/index.js init --client vscode
```
Expected: creates `.vscode/mcp.json` with a `servers["archi-os"]` entry (`"type": "stdio"`), `.bak` created only if a prior file existed, `.archi/cli.json` lists `vscode`. Run again → "already configured (no change)"; the file's comments/siblings intact.

- [ ] **Step 3: Commit**

```bash
git add cli/src/commands/init.ts
git commit -m "feat(cli): init command — idempotent, atomic, backup-if-absent MCP config"
```

---

## Task 6: `doctor` command

**Files:**
- Create: `cli/src/commands/doctor.ts`

**Interfaces:**
- Consumes: `readCliConfig` (init.ts), `resolveClient`, `clientContext` (paths), `isPortFree` (ports.ts — created in Task 7; **doctor depends on Task 7**, sequence after it), `readRunRegistry`, `isEntryAlive` (process.ts — Task 8). To keep Task 6 independent, implement only the checks whose deps exist now (Node version, core build path, MCP config presence, cli.json validity) and add port/run checks in Task 11.
- Produces: `doctor(): Promise<void>`.

- [ ] **Step 1: Implement `cli/src/commands/doctor.ts` (deps-available checks only)**

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { clientContext, resolveClient } from '../lib/paths.js';
import { readCliConfig } from './init.js';

type Check = { label: string; ok: boolean; detail?: string };

export async function doctor(): Promise<void> {
  const ctx = clientContext();
  const checks: Check[] = [];

  const major = Number(process.versions.node.split('.')[0]);
  checks.push({ label: `Node >= 20 (${process.versions.node})`, ok: major >= 20 });

  const coreDist = resolve(ctx.workspaceRoot, 'core', 'dist', 'index.js');
  checks.push({ label: 'core built (core/dist/index.js)', ok: existsSync(coreDist), detail: existsSync(coreDist) ? undefined : 'run: npm run build:core' });

  const cfg = readCliConfig(ctx.workspaceRoot);
  for (const id of cfg.clients) {
    const d = resolveClient(id, ctx);
    checks.push({ label: `MCP config present: ${id}`, ok: existsSync(d.file), detail: d.file });
  }

  let failures = 0;
  for (const c of checks) {
    console.log(`${c.ok ? '✓' : '✖'} ${c.label}${c.detail ? `  → ${c.detail}` : ''}`);
    if (!c.ok) failures++;
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
}
```

- [ ] **Step 2: Manual verification**

Run: `cd cli && npm run build && cd .. && node cli/dist/index.js doctor`
Expected: prints Node/core-build/MCP-config lines; exit 0.

- [ ] **Step 3: Commit**

```bash
git add cli/src/commands/doctor.ts
git commit -m "feat(cli): doctor command — Node, core build, MCP config checks"
```

---

## Task 7: Ports (`ports.ts`)

**Files:**
- Create: `cli/src/lib/ports.ts`, `cli/tests/unit/ports.test.ts`

**Interfaces:**
- Produces:
  - `isPortFree(port: number, host?: string): Promise<boolean>`.
  - `findFreePort(preferred: number, host?: string): Promise<number>` — tries `preferred`, `preferred+1`, … up to +50; throws `PortError` if none.
  - `waitForHealth(url: string, opts?: { timeoutMs?: number; intervalMs?: number; signal?: () => boolean }): Promise<void>` — polls `GET url`, resolves on 2xx; rejects `PortError` on timeout or when `signal()` returns true (child died).

- [ ] **Step 1: Write failing test `cli/tests/unit/ports.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import { isPortFree, findFreePort, waitForHealth } from '../../src/lib/ports.js';
import { PortError } from '../../src/errors.js';

function listen(port: number): Promise<() => void> {
  return new Promise((res) => {
    const s = createServer((_q, r) => r.end('ok'));
    s.listen(port, '127.0.0.1', () => res(() => s.close()));
  });
}

describe('ports', () => {
  it('isPortFree true for an unused high port', async () => {
    expect(await isPortFree(52999)).toBe(true);
  });

  it('findFreePort skips a busy preferred port', async () => {
    const close = await listen(52990);
    const p = await findFreePort(52990);
    expect(p).toBeGreaterThan(52990);
    close();
  });

  it('waitForHealth resolves against a live server', async () => {
    const close = await listen(52991);
    await expect(waitForHealth('http://127.0.0.1:52991/', { timeoutMs: 2000 })).resolves.toBeUndefined();
    close();
  });

  it('waitForHealth rejects when signal() reports child death', async () => {
    await expect(
      waitForHealth('http://127.0.0.1:52992/', { timeoutMs: 3000, intervalMs: 50, signal: () => true }),
    ).rejects.toBeInstanceOf(PortError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run tests/unit/ports.test.ts`
Expected: FAIL (cannot import `ports.js`).

- [ ] **Step 3: Implement `cli/src/lib/ports.ts`**

```ts
import { createServer } from 'node:http';
import { PortError } from '../errors.js';

export function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((res) => {
    const srv = createServer();
    srv.once('error', () => res(false));
    srv.once('listening', () => srv.close(() => res(true)));
    srv.listen(port, host);
  });
}

export async function findFreePort(preferred: number, host = '127.0.0.1'): Promise<number> {
  for (let p = preferred; p <= preferred + 50 && p <= 65535; p++) {
    if (await isPortFree(p, host)) return p;
  }
  throw new PortError(`No free port near ${preferred}.`);
}

export async function waitForHealth(
  url: string,
  opts: { timeoutMs?: number; intervalMs?: number; signal?: () => boolean } = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const intervalMs = opts.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (opts.signal?.()) throw new PortError('Process exited before becoming healthy.');
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new PortError(`Timed out waiting for ${url}.`);
    await new Promise((res) => setTimeout(res, intervalMs));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd cli && npx vitest run tests/unit/ports.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add cli/src/lib/ports.ts cli/tests/unit/ports.test.ts
git commit -m "feat(cli): port discovery and health-check with child-death race"
```

---

## Task 8: Process registry + bimodal spawn + signed kill (`process.ts`)

**Files:**
- Create: `cli/src/lib/process.ts`

**Interfaces:**
- Consumes: nothing from prior tasks (uses node builtins + `ProcessError`).
- Produces:
  - `type ProcEntry = { pid: number; port: number; startedAt: number; cmd: string }`.
  - `type RunRegistry = { mode: 'native' | 'docker'; startedAt: number; core?: ProcEntry; web?: ProcEntry }`.
  - `runPath(workspaceRoot): string` (`.archi/cli/run.json`), `logPath(workspaceRoot, name): string`.
  - `readRunRegistry(workspaceRoot): RunRegistry | null`, `writeRunRegistry(workspaceRoot, reg): void` (atomic), `clearRunRegistry(workspaceRoot): void`.
  - `spawnManaged(args: { workspaceRoot; name: 'core'|'web'; command: string; commandArgs: string[]; env?: Record<string,string>; mode: 'detached'|'attached'; port: number }): ProcEntry` — spawns `shell:false`, stdout/stderr → log file, detached→`unref()`, returns entry with signature.
  - `isEntryAlive(entry: ProcEntry): boolean` — `process.kill(pid, 0)` guarded.
  - `stopEntry(entry: ProcEntry): void` — verifies alive+signature then portable kill (`taskkill /T /F` on win32, else SIGTERM→SIGKILL).
  - `tailLog(workspaceRoot, name, lines?): string`.

- [ ] **Step 1: Implement `cli/src/lib/process.ts`**

```ts
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ProcessError } from '../errors.js';

export type ProcEntry = { pid: number; port: number; startedAt: number; cmd: string };
export type RunRegistry = { mode: 'native' | 'docker'; startedAt: number; core?: ProcEntry; web?: ProcEntry };

const runDir = (ws: string) => join(ws, '.archi', 'cli');
export const runPath = (ws: string) => join(runDir(ws), 'run.json');
export const logPath = (ws: string, name: string) => join(runDir(ws), 'logs', `${name}.log`);

export function readRunRegistry(ws: string): RunRegistry | null {
  const p = runPath(ws);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')) as RunRegistry; } catch { return null; }
}

export function writeRunRegistry(ws: string, reg: RunRegistry): void {
  const p = runPath(ws);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(reg, null, 2), 'utf8');
  renameSync(tmp, p);
}

export function clearRunRegistry(ws: string): void {
  const p = runPath(ws);
  if (existsSync(p)) rmSync(p);
}

export function spawnManaged(args: {
  workspaceRoot: string; name: 'core' | 'web'; command: string; commandArgs: string[];
  env?: Record<string, string>; mode: 'detached' | 'attached'; port: number;
}): ProcEntry {
  const lp = logPath(args.workspaceRoot, args.name);
  mkdirSync(dirname(lp), { recursive: true });
  const out = openSync(lp, 'a');
  const child = spawn(args.command, args.commandArgs, {
    cwd: args.workspaceRoot,
    env: { ...process.env, ...args.env },
    detached: args.mode === 'detached',
    stdio: ['ignore', out, out],
    shell: false,
  });
  if (!child.pid) throw new ProcessError(`Failed to spawn ${args.name}.`);
  if (args.mode === 'detached') child.unref();
  return {
    pid: child.pid,
    port: args.port,
    startedAt: Date.now(),
    cmd: `${args.command} ${args.commandArgs.join(' ')}`,
  };
}

export function isEntryAlive(entry: ProcEntry): boolean {
  try { process.kill(entry.pid, 0); return true; } catch { return false; }
}

export function stopEntry(entry: ProcEntry): void {
  if (!isEntryAlive(entry)) return; // signature dead → already stopped, do not kill a reused PID
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(entry.pid), '/T', '/F']);
    return;
  }
  try { process.kill(entry.pid, 'SIGTERM'); } catch { return; }
  setTimeout(() => { try { process.kill(entry.pid, 'SIGKILL'); } catch { /* gone */ } }, 3000).unref();
}

export function tailLog(ws: string, name: string, lines = 20): string {
  const lp = logPath(ws, name);
  if (!existsSync(lp)) return '';
  return readFileSync(lp, 'utf8').split('\n').slice(-lines).join('\n');
}
```

> Signature note: `isEntryAlive` uses `kill(pid,0)`; combined with `up` writing a fresh `run.json` each launch (Task 10) and clearing it on `down` (Task 11), a recycled PID from a *previous* run cannot be targeted because the stale registry is cleared. The liveness guard is the safety net against acting on a registry that outlived its process.

- [ ] **Step 2: Type-check**

Run: `cd cli && npm run type-check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add cli/src/lib/process.ts
git commit -m "feat(cli): bimodal spawn, run.json registry, signed portable kill"
```

---

## Task 9: Static server (`static-server.ts`)

**Files:**
- Create: `cli/src/lib/static-server.ts`, `cli/tests/unit/static-server.test.ts`

**Interfaces:**
- Produces:
  - `injectRuntimeConfig(html: string, apiBaseUrl: string): string` — inserts `<script>window.__ARCHI_OS__={apiBaseUrl:"…"}</script>` before `</head>` (or prepends if none).
  - `resolveSafePath(distRoot: string, urlPath: string): string | null` — returns absolute path confined to `distRoot`, or `null` if traversal escapes.
  - `startStaticServer(args: { distRoot: string; apiBaseUrl: string; port: number; host?: string }): Promise<{ port: number; close(): void }>` — binds 127.0.0.1, SPA fallback, retries next port on `EADDRINUSE`.

- [ ] **Step 1: Write failing test `cli/tests/unit/static-server.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { injectRuntimeConfig, resolveSafePath } from '../../src/lib/static-server.js';

describe('injectRuntimeConfig', () => {
  it('injects before </head>', () => {
    const out = injectRuntimeConfig('<html><head><title>x</title></head><body></body></html>', 'http://localhost:3000');
    expect(out).toContain('window.__ARCHI_OS__');
    expect(out.indexOf('__ARCHI_OS__')).toBeLessThan(out.indexOf('</head>'));
  });
  it('escapes the url safely into JSON', () => {
    const out = injectRuntimeConfig('<head></head>', 'http://localhost:3000');
    expect(out).toContain('"apiBaseUrl":"http://localhost:3000"');
  });
});

describe('resolveSafePath', () => {
  it('confines to distRoot', () => {
    expect(resolveSafePath('/app/dist', '/index.html')).toBe('/app/dist/index.html');
  });
  it('rejects traversal', () => {
    expect(resolveSafePath('/app/dist', '/../../etc/passwd')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd cli && npx vitest run tests/unit/static-server.test.ts`
Expected: FAIL (cannot import `static-server.js`).

- [ ] **Step 3: Implement `cli/src/lib/static-server.ts`**

```ts
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { join, normalize, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

export function injectRuntimeConfig(html: string, apiBaseUrl: string): string {
  const script = `<script>window.__ARCHI_OS__=${JSON.stringify({ apiBaseUrl })};</script>`;
  return html.includes('</head>') ? html.replace('</head>', `${script}</head>`) : script + html;
}

export function resolveSafePath(distRoot: string, urlPath: string): string | null {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  const abs = resolve(distRoot, '.' + (clean.startsWith('/') ? clean : `/${clean}`));
  const rootWithSep = distRoot.endsWith(sep) ? distRoot : distRoot + sep;
  if (abs !== distRoot && !abs.startsWith(rootWithSep)) return null;
  return abs;
}

function ext(p: string): string { const i = p.lastIndexOf('.'); return i < 0 ? '' : p.slice(i); }

export function startStaticServer(args: {
  distRoot: string; apiBaseUrl: string; port: number; host?: string;
}): Promise<{ port: number; close(): void }> {
  const host = args.host ?? '127.0.0.1';
  const indexHtml = join(args.distRoot, 'index.html');

  const send = (res: ServerResponse, file: string): void => {
    if (ext(file) === '.html') {
      const { readFileSync } = require('node:fs') as typeof import('node:fs');
      const html = injectRuntimeConfig(readFileSync(file, 'utf8'), args.apiBaseUrl);
      res.writeHead(200, { 'content-type': 'text/html' }).end(html);
      return;
    }
    res.writeHead(200, { 'content-type': MIME[ext(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  };

  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const safe = resolveSafePath(args.distRoot, url === '/' ? '/index.html' : url);
    if (!safe) { res.writeHead(403).end('Forbidden'); return; }
    if (existsSync(safe) && statSync(safe).isFile()) { send(res, safe); return; }
    send(res, indexHtml); // SPA fallback
  });

  return new Promise((res, rej) => {
    let attempt = args.port;
    const tryListen = () => {
      server.once('error', (e: NodeJS.ErrnoException) => {
        if (e.code === 'EADDRINUSE' && attempt < args.port + 50) { attempt++; server.listen(attempt, host); }
        else rej(e);
      });
      server.listen(attempt, host, () => res({ port: attempt, close: () => server.close() }));
    };
    tryListen();
  });
}
```

> Note: replace the inline `require('node:fs')` with a top-level `import { readFileSync }` — shown inline only to keep the send helper self-contained; add `readFileSync` to the existing `node:fs` import at implementation time (ESM has no `require`).

- [ ] **Step 4: Correct the import (ESM)**

Change the `node:fs` import line to `import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';` and delete the inline `require` line, using `readFileSync(file, 'utf8')` directly.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd cli && npx vitest run tests/unit/static-server.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add cli/src/lib/static-server.ts cli/tests/unit/static-server.test.ts
git commit -m "feat(cli): traversal-safe static server with runtime config injection"
```

---

## Task 10: `up` command

**Files:**
- Create: `cli/src/commands/up.ts`

**Interfaces:**
- Consumes: `readCliConfig` (init.ts); `findFreePort`, `waitForHealth` (ports.ts); `spawnManaged`, `readRunRegistry`, `writeRunRegistry`, `isEntryAlive`, `tailLog`, `logPath`, type `RunRegistry` (process.ts); `startStaticServer` (static-server.ts).
- Produces: `up(opts: { docker?: boolean; open?: boolean }): Promise<void>`.

- [ ] **Step 1: Implement `cli/src/commands/up.ts`**

```ts
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { CliError, ProcessError } from '../errors.js';
import { clientContext } from '../lib/paths.js';
import { findFreePort, waitForHealth } from '../lib/ports.js';
import {
  isEntryAlive, readRunRegistry, spawnManaged, tailLog, writeRunRegistry, type RunRegistry,
} from '../lib/process.js';
import { startStaticServer } from '../lib/static-server.js';
import { readCliConfig } from './init.js';

export async function up(opts: { docker?: boolean; open?: boolean }): Promise<void> {
  const ctx = clientContext();
  const ws = ctx.workspaceRoot;

  const existing = readRunRegistry(ws);
  if (existing?.core && isEntryAlive(existing.core)) {
    console.log(`Already up — core on :${existing.core.port}${existing.web ? `, web on :${existing.web.port}` : ''}.`);
    return;
  }

  if (opts.docker) {
    const r = spawnSync('docker', ['compose', 'up', '-d'], { cwd: ws, stdio: 'inherit', shell: false });
    if (r.status !== 0) throw new ProcessError('docker compose up failed.');
    writeRunRegistry(ws, { mode: 'docker', startedAt: Date.now() });
    console.log('Started via docker compose.');
    return;
  }

  const cfg = readCliConfig(ws);
  const coreDist = resolve(ws, 'core', 'dist', 'index.js');
  if (!existsSync(coreDist)) throw new CliError('core not built. Run: npm run build:core');

  const corePort = await findFreePort(cfg.ports.core);
  const coreEntry = spawnManaged({
    workspaceRoot: ws, name: 'core', command: process.execPath, commandArgs: [coreDist],
    env: { RUN_HTTP_SERVER: 'true', PORT: String(corePort), WORKSPACE_ROOT: ws },
    mode: 'detached', port: corePort,
  });

  // Write core entry IMMEDIATELY so a later failure still leaves a killable process.
  const reg: RunRegistry = { mode: 'native', startedAt: Date.now(), core: coreEntry };
  writeRunRegistry(ws, reg);

  try {
    await waitForHealth(`http://127.0.0.1:${corePort}/health`, {
      timeoutMs: 20000, signal: () => !isEntryAlive(coreEntry),
    });
  } catch (err) {
    console.error(`✖ core failed to start.\n--- core.log (tail) ---\n${tailLog(ws, 'core')}`);
    throw err instanceof CliError ? err : new ProcessError('core did not become healthy.');
  }

  const distRoot = resolve(ws, 'web', 'dist');
  if (!existsSync(distRoot)) throw new CliError('web not built. Run: npm run build:web');

  const web = await startStaticServer({ distRoot, apiBaseUrl: `http://localhost:${corePort}`, port: cfg.ports.web });
  const webEntry = { pid: process.pid, port: web.port, startedAt: Date.now(), cmd: 'archi-os static-server' };
  writeRunRegistry(ws, { ...reg, web: webEntry });

  const webUrl = `http://localhost:${web.port}`;
  console.log(`\n✓ ARCHI-OS ready\n  core: http://localhost:${corePort}\n  web:  ${webUrl}`);

  if (opts.open !== false) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    spawnSync(opener, [webUrl], { stdio: 'ignore', shell: process.platform === 'win32' });
  }

  // Static server runs in THIS process; keep it alive until interrupted.
  await new Promise<void>((res) => {
    const shutdown = () => { web.close(); res(); };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
```

> The static server lives in the `up` process, so `up` blocks (foreground) after printing URLs; the detached **core** survives independently and is what `down` stops. `up`'s `web` PID equals the `up` process — acceptable because `down` stops `web` before `core`, and a dead `up` process means the static server is already gone (its port freed).

- [ ] **Step 2: Manual smoke (requires core+web built)**

Run:
```bash
npm run build:core && npm run build:web && cd cli && npm run build
cd .. && node cli/dist/index.js up --no-open
```
Expected: `.archi/cli/run.json` gets a `core` entry immediately, `/health` passes, prints core+web URLs, `web/dist` served with injected `window.__ARCHI_OS__`. Ctrl-C stops the foreground static server (core stays until `down`).

- [ ] **Step 3: Commit**

```bash
git add cli/src/commands/up.ts
git commit -m "feat(cli): up command — detached core, health race, static web, incremental registry"
```

---

## Task 11: `down` command + doctor runtime checks

**Files:**
- Create: `cli/src/commands/down.ts`
- Modify: `cli/src/commands/doctor.ts` (add run/port checks now that deps exist)

**Interfaces:**
- Consumes: `readRunRegistry`, `clearRunRegistry`, `stopEntry`, `isEntryAlive`, `tailLog` (process.ts); `clientContext` (paths); for doctor: `isPortFree` (ports.ts).
- Produces: `down(): Promise<void>`.

- [ ] **Step 1: Implement `cli/src/commands/down.ts`**

```ts
import { spawnSync } from 'node:child_process';
import { clientContext } from '../lib/paths.js';
import { clearRunRegistry, readRunRegistry, stopEntry } from '../lib/process.js';

export async function down(): Promise<void> {
  const ws = clientContext().workspaceRoot;
  const reg = readRunRegistry(ws);
  if (!reg) { console.log('Nothing to stop (no run.json).'); return; }

  if (reg.mode === 'docker') {
    spawnSync('docker', ['compose', 'down'], { cwd: ws, stdio: 'inherit', shell: false });
    clearRunRegistry(ws);
    console.log('Stopped docker compose.');
    return;
  }

  if (reg.web) stopEntry(reg.web);
  if (reg.core) stopEntry(reg.core);
  clearRunRegistry(ws);
  console.log('Stopped ARCHI-OS.');
}
```

- [ ] **Step 2: Add runtime checks to `doctor.ts`**

Add to `doctor()` after the MCP-config checks, before the summary loop:

```ts
import { isPortFree } from '../lib/ports.js';
import { isEntryAlive, readRunRegistry } from '../lib/process.js';
// ...
const coreFree = await isPortFree(cfg.ports.core);
checks.push({ label: `preferred core port ${cfg.ports.core} free`, ok: coreFree, detail: coreFree ? undefined : 'in use (fallback will apply)' });

const reg = readRunRegistry(ctx.workspaceRoot);
if (reg?.core) {
  checks.push({ label: `core process alive (pid ${reg.core.pid})`, ok: isEntryAlive(reg.core) });
}
```

- [ ] **Step 3: Manual verification (up then down)**

Run:
```bash
cd cli && npm run build && cd ..
node cli/dist/index.js up --no-open &   # background the foreground server
sleep 3
node cli/dist/index.js doctor           # shows core alive
node cli/dist/index.js down             # stops core; run.json removed
```
Expected: doctor reports core alive; `down` stops it; `run.json` gone.

- [ ] **Step 4: Commit**

```bash
git add cli/src/commands/down.ts cli/src/commands/doctor.ts
git commit -m "feat(cli): down command (native/docker routing) + doctor runtime checks"
```

---

## Task 12: `uninstall` command

**Files:**
- Create: `cli/src/commands/uninstall.ts`

**Interfaces:**
- Consumes: `down` (down.ts); `readCliConfig` (init.ts); `resolveClient`, `clientContext` (paths); `unmergeServer` (mcp-config); `clearRunRegistry` (process.ts).
- Produces: `uninstall(): Promise<void>`.
- Local helper (copy the small IO helpers from init or export them): reuse `readTextIfExists` + `atomicWrite` — **export these two from `init.ts`** so uninstall imports them (avoids duplication; update Task 5 file to add `export` on both).

- [ ] **Step 1: Export IO helpers from `init.ts`**

In `cli/src/commands/init.ts`, add `export` to `readTextIfExists` and `atomicWrite`.

- [ ] **Step 2: Implement `cli/src/commands/uninstall.ts`**

```ts
import { existsSync } from 'node:fs';
import { clientContext, resolveClient } from '../lib/paths.js';
import { unmergeServer } from '../lib/mcp-config.js';
import { clearRunRegistry } from '../lib/process.js';
import { atomicWrite, readCliConfig, readTextIfExists } from './init.js';
import { down } from './down.js';

export async function uninstall(): Promise<void> {
  const ctx = clientContext();
  const ws = ctx.workspaceRoot;

  await down(); // stop first

  const cfg = readCliConfig(ws);
  for (const id of cfg.clients) {
    const d = resolveClient(id, ctx);
    if (!existsSync(d.file)) continue;
    const before = readTextIfExists(d.file) ?? '';
    const after = unmergeServer(before, d.key);
    if (after !== before) {
      atomicWrite(d.file, after.endsWith('\n') ? after : after + '\n');
      console.log(`${id}: removed archi-os from ${d.file}`);
    }
  }

  clearRunRegistry(ws);
  console.log('Uninstalled. archi-os MCP entry removed (siblings and comments preserved).');
}
```

- [ ] **Step 3: Manual verification (init → uninstall round-trip)**

Run:
```bash
cd cli && npm run build && cd ..
node cli/dist/index.js init --client vscode
node cli/dist/index.js uninstall
```
Expected: `.vscode/mcp.json` no longer contains `archi-os` under `servers`, but any sibling servers/comments remain; `run.json` gone.

- [ ] **Step 4: Commit**

```bash
git add cli/src/commands/uninstall.ts cli/src/commands/init.ts
git commit -m "feat(cli): uninstall — down + surgical unmerge, reversible"
```

---

## Task 13: Web runtime config fallback

**Files:**
- Modify: `web/src/config.ts`

**Interfaces:**
- Produces: `API_BASE_URL` now reads `window.__ARCHI_OS__?.apiBaseUrl` first.

- [ ] **Step 1: Read current `web/src/config.ts`**

Run: `cd .. && node cli/dist/index.js --help >/dev/null; sed -n '1,20p' web/src/config.ts` (or open the file). Confirm the current `API_BASE_URL` line and `POLL_INTERVAL_MS` export.

- [ ] **Step 2: Modify `web/src/config.ts`**

Add the typed global and update `API_BASE_URL`, preserving all other exports (e.g. `POLL_INTERVAL_MS`):

```ts
declare global {
  interface Window { __ARCHI_OS__?: { apiBaseUrl?: string } }
}

export const API_BASE_URL =
  (typeof window !== 'undefined' ? window.__ARCHI_OS__?.apiBaseUrl : undefined)
  ?? import.meta.env.VITE_API_BASE_URL
  ?? 'http://localhost:3000';
```

- [ ] **Step 3: Type-check web**

Run: `cd web && npm run type-check`
Expected: no errors.

- [ ] **Step 4: Build web to confirm dist emits**

Run: `cd web && npm run build`
Expected: `web/dist/index.html` present.

- [ ] **Step 5: Commit**

```bash
git add web/src/config.ts
git commit -m "feat(web): runtime API base via window.__ARCHI_OS__ fallback"
```

---

## Task 14: Full-flow verification + ARCHITECTURE.md

**Files:**
- Modify: `ARCHITECTURE.md`

**Interfaces:** none.

- [ ] **Step 1: Run the whole test suite**

Run: `cd cli && npm run test && npm run type-check`
Expected: all unit tests pass; no type errors.

- [ ] **Step 2: End-to-end manual DoD check**

Run:
```bash
npm run build:core && npm run build:web && cd cli && npm run build && cd ..
node cli/dist/index.js init --client vscode
node cli/dist/index.js doctor          # all green (core built, MCP present)
node cli/dist/index.js up --no-open &
sleep 3
curl -s http://localhost:$(node -e "console.log(require('./.archi/cli/run.json').core.port)")/health
node cli/dist/index.js down
node cli/dist/index.js uninstall
```
Expected: health returns 2xx JSON; down stops core; uninstall removes the MCP entry. Zero manual file editing.

- [ ] **Step 3: Update `ARCHITECTURE.md`**

Add a section documenting the new `cli/` package: purpose (single home for install/launch/MCP-config), the `lib/` pure modules, the two state files (`.archi/cli.json`, `.archi/cli/run.json`), and the bimodal spawn note (detached for CLI, attached reserved for the future extension). Keep it consistent with existing doc style.

- [ ] **Step 4: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: document cli/ package in ARCHITECTURE.md"
```

---

## Self-Review

**Spec coverage:**
- §2 scaffold/stack → Task 1. §3 state files → Tasks 1 (gitignore), 5 (cli.json), 8 (run.json). §4 MCP config (descriptors, key-per-client, JSONC surgical, robustness, detection) → Tasks 3, 4, 5. §5 runtime (bimodal, signed kill, portable kill, health race, incremental registry, docker) → Tasks 8, 10, 11. §6 static server (traversal, 127.0.0.1, SPA, EADDRINUSE, injection, dist decision) → Tasks 9, 10. §7 web fallback → Task 13. §8 doctor → Tasks 6, 11. §9 uninstall → Task 12. §10 errors/tests → Task 1 + per-task tests. §11 security → covered by 4/5/8/9. §12 DoD / §13 milestones → Task 14 + task ordering.
- No spec section left without a task.

**Placeholder scan:** No TBD/TODO; every code step shows full code. The static-server `require` shortcut is explicitly corrected in Task 9 Step 4.

**Type consistency:** `ClientDescriptor.key`/`.entry` consistent across paths (Task 3), mcp-config (Task 4), init/uninstall (5/12). `ProcEntry`/`RunRegistry` consistent across process (8), up (10), down (11). `buildEntry(coreDistPath, workspaceRoot, entryShape)` signature identical in Tasks 4 and 5. `waitForHealth(url, opts)` identical in Tasks 7 and 10.

---

## Milestone mapping

- **M1** (init + doctor): Tasks 1–6.
- **M2a** (up/down): Tasks 7–11.
- **M2b** (uninstall, docker in-line, web modif) + packaging: Tasks 12–14.
