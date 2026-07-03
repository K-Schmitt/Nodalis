# VSCode Extension (archi-os-vscode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `archi-os-vscode` extension (`.vsix`) that installs/launches ARCHI-OS, hosts the `web/` frontend in a webview, and delivers livrable #1 (versioning TreeView + `onDidSave` def.json diagnostics) — reusing `cli/lib` and `@archi-os/core/schema` with zero duplicated logic.

**Architecture:** New `extension/` package (esbuild → CommonJS `.vsix`) wraps the existing, complete CLI: it imports `spawnManaged` (mode `attached`), `startStaticServer`, ports helpers, and MCP-config primitives from `@archi-os/cli/lib/*`, and imports `DefinitionSchema` from a new `@archi-os/core/schema` subpath (zod-only, no Fastify/MCP pulled in). Core gains 3 thin versioning HTTP routes (wrapping existing storage) and a CORS allowance for the `vscode-webview://` origin. The webview loads `web/dist` under a strict CSP+nonce; all fs/git/process work stays in the extension host and reaches the webview via typed `postMessage`.

**Tech Stack:** TypeScript (strict), esbuild, `@vscode/vsce`, Fastify (core), Zod, Vite (web), vitest, jsonc-parser.

## Global Constraints

- Node `>=20` (matches `cli`/`core` `engines`).
- Zero implicit `any`; TS strict mode everywhere.
- Single source of truth: derive TS types from Zod via `z.infer`; never re-declare schema shapes.
- **No duplicated install/launch/MCP logic** — the extension imports from `@archi-os/cli/lib/*`; it never reimplements spawn/port/merge algorithms.
- The extension imports the core schema **only** via `@archi-os/core/schema` (never `@archi-os/core` root — that bundles Fastify+MCP).
- Webview: strict CSP, every `<script>` carries the request-scoped `nonce`; `connect-src` is built with the real core port at panel-creation time.
- Every `git commit` in this plan ends its message with the trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Custom errors, not generic throws, where the codebase already defines them.
- Reference spec: `docs/superpowers/specs/2026-07-03-vscode-extension-design.md`.

---

## File Structure

**Web (glue):**
- Modify `web/vite.config.ts` — `base: './'`.
- Create `web/src/lib/vscode.ts` — `acquireVsCodeApi()` adapter (no-op in a browser).
- Modify `web/src/main.tsx` (or the store bootstrap) — wire `getVsCodeApi()` refresh listener.

**CLI (expose lib):**
- Modify `cli/tsup.config.ts` — split into two builds so lib files carry **no** shebang.
- Modify `cli/package.json` — add `exports` map exposing `./lib/*`.

**Core (schema export + routes + CORS):**
- Modify `core/package.json` — add `exports` with `./schema` subpath.
- Modify `core/src/infrastructure/api/http-server.ts` — CORS webview origin; 3 versioning routes; public `inject` test helper.
- Create `core/tests/integration/versioning-routes.test.ts`.

**Extension (new package `extension/`):**
- `extension/package.json` — VSCode manifest (main, engines, activationEvents, contributes, scripts, deps).
- `extension/tsconfig.json`, `extension/esbuild.mjs`, `extension/vitest.config.ts`, `extension/.vscodeignore`.
- `extension/src/extension.ts` — activate/deactivate, wiring.
- `extension/src/config.ts` — resolve workspace root, cli config, core port; `archiOs.autostart` setting read.
- `extension/src/engine.ts` — spawn core (attached) + static web via cli lib; health-check; teardown.
- `extension/src/mcp.ts` — configure MCP via cli primitives (compose, don't duplicate).
- `extension/src/statusbar.ts` — Live/Disconnected indicator + reload flash + theme.
- `extension/src/webview/panel.ts` — panel, CSP+nonce, `asWebviewUri` rewrite, nonced `__ARCHI_OS__` injection.
- `extension/src/webview/bridge.ts` — typed message protocol + guards (vscode-free, unit-tested).
- `extension/src/diagnostics.ts` — `onDidSave` wiring (vscode-facing thin shell).
- `extension/src/diagnostics-core.ts` — pure Zod-issue → position mapping (vscode-free, unit-tested).
- `extension/src/versioning/tree.ts` — `TreeDataProvider` + snapshot/restore commands.
- `extension/src/versioning/api.ts` — typed `fetch` client for the 3 core routes (vscode-free, unit-tested for URL/shape).
- `extension/tests/bridge.test.ts`, `extension/tests/diagnostics-core.test.ts`.

**Docs:**
- Modify `ARCHITECTURE.md` — new `extension/` package, cli/core exports, versioning routes.

---

## Task 1: Web M0 — relative base + webview bridge adapter

**Files:**
- Modify: `web/vite.config.ts`
- Create: `web/src/lib/vscode.ts`
- Modify: `web/src/main.tsx`

**Interfaces:**
- Produces: `getVsCodeApi(): VsCodeApi | null`, `isWebview(): boolean`, `onExtensionMessage(cb: (msg: { type: string; payload?: unknown }) => void): () => void` in `web/src/lib/vscode.ts`.
- Consumes: nothing.

- [ ] **Step 1: Set Vite base to relative**

In `web/vite.config.ts`, add `base: './'` to the exported config object (top-level, alongside `plugins`):

```ts
export default defineConfig({
  base: './',
  // ...existing config unchanged
});
```

- [ ] **Step 2: Create the webview adapter**

Create `web/src/lib/vscode.ts`:

```ts
export type VsCodeApi = {
  postMessage(msg: unknown): void;
  getState<T = unknown>(): T | undefined;
  setState<T = unknown>(state: T): void;
};

declare function acquireVsCodeApi(): VsCodeApi;

let cached: VsCodeApi | null | undefined;

/** Returns the VSCode webview API when running inside the extension, else null. */
export function getVsCodeApi(): VsCodeApi | null {
  if (cached !== undefined) return cached;
  cached = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  return cached;
}

export const isWebview = (): boolean => getVsCodeApi() !== null;

/** Subscribe to messages pushed by the extension host. Returns an unsubscribe fn. */
export function onExtensionMessage(
  cb: (msg: { type: string; payload?: unknown }) => void,
): () => void {
  const handler = (e: MessageEvent): void => {
    const data = e.data as { type?: unknown };
    if (data && typeof data.type === 'string') cb(data as { type: string; payload?: unknown });
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}
```

- [ ] **Step 3: Wire the refresh listener in the app bootstrap**

In `web/src/main.tsx`, after the app mounts, add a listener that re-fetches the graph on an extension `refresh` push (uses the existing graph store's fetch). Import the store and the adapter, then:

```ts
import { onExtensionMessage } from './lib/vscode';
import { useGraphStore } from './stores/useGraphStore';

onExtensionMessage((msg) => {
  if (msg.type === 'refresh') void useGraphStore.getState().fetchGraph();
});
```

> If the store's fetch method has a different name, use the existing public fetch action on `useGraphStore` (the one its polling `setInterval` calls). Do not invent a new one.

- [ ] **Step 4: Build web and verify relative asset paths**

Run: `npm run build -w web`
Expected: build succeeds; then inspect output:

Run: `grep -o 'src="[^"]*"' web/dist/index.html`
Expected: asset path is relative, e.g. `src="./assets/index-XXXX.js"` (starts with `./`, not `/`).

- [ ] **Step 5: Type-check web**

Run: `npm run type-check -w web`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/vite.config.ts web/src/lib/vscode.ts web/src/main.tsx
git commit -m "feat(web): relative base + webview bridge adapter (EXT Web M0)"
```

---

## Task 2: CLI — expose `lib/*` without shebang

**Files:**
- Modify: `cli/tsup.config.ts`
- Modify: `cli/package.json`

**Interfaces:**
- Produces: importable `@archi-os/cli/lib/process`, `@archi-os/cli/lib/ports`, `@archi-os/cli/lib/static-server`, `@archi-os/cli/lib/mcp-config`, `@archi-os/cli/lib/paths` (JS + `.d.ts`), none carrying a `#!` shebang.
- Consumes: nothing.

- [ ] **Step 1: Split the tsup build (bin keeps shebang, lib does not)**

Replace `cli/tsup.config.ts` with two builds — the bin entry gets the shebang banner, everything else does not:

```ts
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
```

- [ ] **Step 2: Add the exports map to the CLI package**

In `cli/package.json`, add an `exports` field (keep the existing `bin`/`main`):

```json
  "exports": {
    ".": "./dist/index.js",
    "./lib/*": {
      "types": "./dist/lib/*.d.ts",
      "default": "./dist/lib/*.js"
    }
  },
```

- [ ] **Step 3: Rebuild the CLI**

Run: `npm run build -w cli`
Expected: build succeeds; `cli/dist/lib/process.js`, `cli/dist/lib/process.d.ts` exist.

- [ ] **Step 4: Verify lib files have NO shebang (bin still does)**

Run: `head -1 cli/dist/index.js cli/dist/lib/process.js`
Expected: `cli/dist/index.js` first line is `#!/usr/bin/env node`; `cli/dist/lib/process.js` first line is **not** a shebang (regular `import`/code).

- [ ] **Step 5: Verify existing CLI tests still pass**

Run: `npm test -w cli`
Expected: PASS (the split build must not regress existing behavior).

- [ ] **Step 6: Commit**

```bash
git add cli/tsup.config.ts cli/package.json
git commit -m "feat(cli): export lib/* subpath (shebang only on bin) for extension reuse"
```

---

## Task 3: Core — `@archi-os/core/schema` subpath export

**Files:**
- Modify: `core/package.json`

**Interfaces:**
- Produces: `import { DefinitionSchema } from '@archi-os/core/schema'` resolving to `core/dist/domain/types.js` (+ `.d.ts`), pulling only `zod`.
- Consumes: nothing.

- [ ] **Step 1: Add the schema subpath export**

In `core/package.json`, add an `exports` field (keep existing `main`):

```json
  "exports": {
    ".": "./dist/index.js",
    "./schema": {
      "types": "./dist/domain/types.d.ts",
      "default": "./dist/domain/types.js"
    }
  },
```

- [ ] **Step 2: Ensure core is built**

Run: `npm run build -w core`
Expected: `core/dist/domain/types.js` and `core/dist/domain/types.d.ts` exist.

- [ ] **Step 3: Verify the subpath resolves to zod-only (no Fastify)**

Run: `node --input-type=module -e "import('@archi-os/core/schema').then(m => console.log(typeof m.DefinitionSchema.parse))"`
Expected: prints `function` (schema loads without starting/importing the server).

- [ ] **Step 4: Commit**

```bash
git add core/package.json
git commit -m "feat(core): expose zod schema via @archi-os/core/schema subpath"
```

---

## Task 4: Core — allow the `vscode-webview://` origin in CORS

**Files:**
- Modify: `core/src/infrastructure/api/http-server.ts:52-64` (the `setupMiddleware` CORS block)

**Interfaces:**
- Produces: CORS accepts origins matching `^vscode-webview://` in addition to localhost.
- Consumes: nothing.

- [ ] **Step 1: Extend the CORS origin predicate**

In `setupMiddleware`, replace the origin check so webview origins are allowed:

```ts
  private async setupMiddleware() {
    await this.app.register(cors, {
      origin: (origin, cb) => {
        // Allow localhost (any port) in dev, and the VSCode webview origin.
        if (
          !origin ||
          /^http:\/\/localhost(:\d+)?$/.test(origin) ||
          /^vscode-webview:\/\//.test(origin)
        ) {
          cb(null, true);
        } else {
          cb(new Error('Not allowed by CORS'), false);
        }
      },
      credentials: true,
    });
  }
```

- [ ] **Step 2: Type-check core**

Run: `npm run type-check -w core`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add core/src/infrastructure/api/http-server.ts
git commit -m "fix(core): allow vscode-webview:// origin in CORS (fold #5)"
```

---

## Task 5: Core — versioning HTTP routes (list/snapshot/restore)

**Files:**
- Modify: `core/src/infrastructure/api/http-server.ts` (add routes inside `setupRoutes`, before its closing `}` at line ~371; add public `inject` helper on the class)
- Create: `core/tests/integration/versioning-routes.test.ts`

**Interfaces:**
- Consumes: `this.graphStorage.listVersions(): GraphVersion[]`, `.createSnapshot(graph, label): GraphVersion`, `.restoreVersion(id, graph): boolean`, `.save(graph): void`, `this.syncContext()`.
- Produces:
  - `GET /api/versions` → `{ versions: GraphVersion[] }`
  - `POST /api/snapshot` body `{ label: string }` → `201 { version: GraphVersion }` (400 if label missing/empty)
  - `POST /api/versions/:id/restore` → `{ success: true, nodeCount, edgeCount }` (404 if id unknown)
  - `HTTPServer.inject(opts)` test helper.

- [ ] **Step 1: Write the failing integration test**

Create `core/tests/integration/versioning-routes.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppStateStore } from '../../src/infrastructure/persistence/app-state-store.js';
import { WorkspaceManager } from '../../src/infrastructure/workspace/workspace-manager.js';
import { GraphStorage } from '../../src/infrastructure/persistence/graph-storage.js';
import { Graph } from '../../src/domain/graph.js';
import { Registry } from '../../src/domain/registry.js';
import { ProposalStore } from '../../src/domain/proposal-store.js';
import { RuleEngine } from '../../src/domain/rule-engine.js';
import { PresetRegistry } from '../../src/infrastructure/registry/preset-registry.js';
import { DefinitionLoader } from '../../src/infrastructure/file-system/definition-loader.js';
import { PresetLoader } from '../../src/infrastructure/file-system/preset-loader.js';
import { HTTPServer } from '../../src/infrastructure/api/http-server.js';

const DEFS = join(__dirname, '../../../definitions');

function build(stateDir: string, wsDir: string): HTTPServer {
  const appState = new AppStateStore(stateDir);
  const workspaces = new WorkspaceManager(appState);
  const registry = new Registry();
  const graph = new Graph();
  const proposalStore = new ProposalStore(() => workspaces.getActivePaths()?.proposalsPath ?? null);
  const graphStorage = new GraphStorage(workspaces);
  const definitionLoader = new DefinitionLoader(DEFS);
  const presetLoader = new PresetLoader(DEFS);
  const ruleEngine = new RuleEngine(registry, graph);
  const presetRegistry = new PresetRegistry(registry, ruleEngine, definitionLoader, presetLoader);
  return new HTTPServer(graph, registry, graphStorage, proposalStore, workspaces, presetRegistry, ruleEngine);
}

describe('versioning HTTP routes', () => {
  let stateDir: string;
  let wsDir: string;
  let server: HTTPServer;

  beforeEach(async () => {
    stateDir = mkdtempSync(join(tmpdir(), 'archi-state-'));
    wsDir = mkdtempSync(join(tmpdir(), 'archi-ws-'));
    mkdirSync(join(wsDir, 'project'), { recursive: true });
    server = build(stateDir, wsDir);
    // Create + activate a workspace via the existing HTTP surface.
    const created = await server.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { path: join(wsDir, 'project'), name: 'test', presetId: 'full' },
    });
    expect(created.statusCode).toBeLessThan(300);
  });

  afterEach(async () => {
    await server.stop();
    rmSync(stateDir, { recursive: true, force: true });
    rmSync(wsDir, { recursive: true, force: true });
  });

  it('snapshot → list → restore round-trips and persists', async () => {
    const snap = await server.inject({ method: 'POST', url: '/api/snapshot', payload: { label: 'v1' } });
    expect(snap.statusCode).toBe(201);
    const version = snap.json().version as { id: string; label: string };
    expect(version.label).toBe('v1');

    const list = await server.inject({ method: 'GET', url: '/api/versions' });
    expect(list.statusCode).toBe(200);
    expect(list.json().versions.map((v: { id: string }) => v.id)).toContain(version.id);

    const restore = await server.inject({ method: 'POST', url: `/api/versions/${version.id}/restore` });
    expect(restore.statusCode).toBe(200);
    expect(restore.json().success).toBe(true);
  });

  it('snapshot rejects empty label', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/snapshot', payload: { label: '' } });
    expect(res.statusCode).toBe(400);
  });

  it('restore of unknown id returns 404', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/versions/nope/restore' });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm test -w core -- versioning-routes`
Expected: FAIL — `server.inject` is not a function / routes 404.

- [ ] **Step 3: Add the public `inject` test helper**

In `http-server.ts`, add a method on the `HTTPServer` class (near `start`/`stop`), and add the import for its option type at the top:

```ts
import type { InjectOptions } from 'fastify';
```

```ts
  /** Test helper: wait for routes to register, then forward to Fastify inject. */
  async inject(opts: InjectOptions) {
    await this.app.ready();
    return this.app.inject(opts);
  }
```

- [ ] **Step 4: Add the three versioning routes**

Inside `setupRoutes()`, before its closing brace (after the proposals routes, ~line 371), add:

```ts
    // ─── Versioning ─────────────────────────────────────────────────────────
    this.app.get('/api/versions', async () => {
      this.syncContext();
      return { versions: this.graphStorage.listVersions() };
    });

    this.app.post<{ Body: { label?: string } }>('/api/snapshot', async (request, reply) => {
      this.syncContext();
      const label = request.body?.label?.trim();
      if (!label) return reply.code(400).send({ error: 'label is required' });
      const version = this.graphStorage.createSnapshot(this.graph, label);
      return reply.code(201).send({ version });
    });

    this.app.post<{ Params: { id: string } }>('/api/versions/:id/restore', async (request, reply) => {
      this.syncContext();
      const restored = this.graphStorage.restoreVersion(request.params.id, this.graph);
      if (!restored) return reply.code(404).send({ error: 'version not found' });
      // Meta-op (git-checkout-like): persist the restored graph to the on-disk SSOT
      // so the webview poll AND the MCP process (reload-before-read) both see it.
      this.graphStorage.save(this.graph);
      return {
        success: true,
        nodeCount: this.graph.getAllNodes().length,
        edgeCount: this.graph.getAllEdges().length,
      };
    });
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npm test -w core -- versioning-routes`
Expected: PASS (all three cases).

- [ ] **Step 6: Full core test + type-check**

Run: `npm test -w core && npm run type-check -w core`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add core/src/infrastructure/api/http-server.ts core/tests/integration/versioning-routes.test.ts
git commit -m "feat(core): versioning HTTP routes (list/snapshot/restore) with disk-persist restore"
```

---

## Task 6: Extension scaffold + lifecycle (EXT-M0)

**Files:**
- Create: `extension/package.json`, `extension/tsconfig.json`, `extension/esbuild.mjs`, `extension/vitest.config.ts`, `extension/.vscodeignore`
- Create: `extension/src/extension.ts`, `extension/src/config.ts`
- Modify: root `package.json` (`workspaces` array — add `extension`)

**Interfaces:**
- Produces: `activate(ctx)`, `deactivate()`; `resolveContext(): { workspaceRoot: string; corePort: number; webPort: number; autostart: boolean }` in `config.ts`.
- Consumes: `@archi-os/cli/lib/*` (later tasks), VSCode API.

- [ ] **Step 1: Add extension to workspaces**

In root `package.json`, add `"extension"` to the `workspaces` array (after `"cli"`).

- [ ] **Step 2: Create the VSCode manifest**

Create `extension/package.json`:

```json
{
  "name": "archi-os-vscode",
  "displayName": "ARCHI-OS",
  "description": "ARCHI-OS meta-modeler: graph, versioning, MCP.",
  "version": "0.1.0",
  "publisher": "archi-os",
  "engines": { "vscode": "^1.85.0", "node": ">=20.0.0" },
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "categories": ["Other"],
  "contributes": {
    "commands": [
      { "command": "archi-os.open", "title": "ARCHI-OS: Open" },
      { "command": "archi-os.start", "title": "ARCHI-OS: Start Runtime" },
      { "command": "archi-os.stop", "title": "ARCHI-OS: Stop Runtime" },
      { "command": "archi-os.configureMcp", "title": "ARCHI-OS: Configure MCP" },
      { "command": "archi-os.createSnapshot", "title": "ARCHI-OS: Create Snapshot" },
      { "command": "archi-os.refreshVersions", "title": "ARCHI-OS: Refresh Versions", "icon": "$(refresh)" }
    ],
    "viewsContainers": {
      "activitybar": [
        { "id": "archi-os", "title": "ARCHI-OS", "icon": "media/icon.svg" }
      ]
    },
    "views": {
      "archi-os": [
        { "id": "archi-os.versions", "name": "Versions" }
      ]
    },
    "menus": {
      "view/title": [
        { "command": "archi-os.createSnapshot", "when": "view == archi-os.versions", "group": "navigation" },
        { "command": "archi-os.refreshVersions", "when": "view == archi-os.versions", "group": "navigation" }
      ]
    },
    "configuration": {
      "title": "ARCHI-OS",
      "properties": {
        "archiOs.autostart": {
          "type": "boolean",
          "default": false,
          "description": "Automatically start the ARCHI-OS runtime when a workspace with .archi/ is opened."
        }
      }
    }
  },
  "scripts": {
    "build": "node esbuild.mjs",
    "watch": "node esbuild.mjs --watch",
    "package": "vsce package --no-dependencies",
    "test": "vitest run",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@archi-os/cli": "*",
    "@archi-os/core": "*",
    "jsonc-parser": "^3.2.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/node": "^20.11.5",
    "@types/vscode": "^1.85.0",
    "@vscode/vsce": "^2.24.0",
    "esbuild": "^0.20.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.2"
  }
}
```

- [ ] **Step 3: Create tsconfig, esbuild, vitest, ignore files**

Create `extension/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

Create `extension/esbuild.mjs`:

```js
import esbuild from 'esbuild';

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
```

Create `extension/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
```

Create `extension/.vscodeignore`:

```
src/**
tests/**
tsconfig.json
esbuild.mjs
vitest.config.ts
**/*.map
```

- [ ] **Step 4: Add an activity-bar icon placeholder**

Create `extension/media/icon.svg` (simple monochrome mark):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3L18.5 8 12 11.7 5.5 8 12 4.3ZM5 9.7l6 3.4v6.6l-6-3.3V9.7Zm14 0v6.7l-6 3.3v-6.6l6-3.4Z"/></svg>
```

- [ ] **Step 5: Create `config.ts`**

Create `extension/src/config.ts`:

```ts
import * as vscode from 'vscode';

export type ExtContext = {
  workspaceRoot: string;
  corePort: number;
  webPort: number;
  autostart: boolean;
};

/** Resolve the active workspace root and configured ports. */
export function resolveContext(): ExtContext | null {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return null;
  const cfg = vscode.workspace.getConfiguration('archiOs');
  return {
    workspaceRoot: folder.uri.fsPath,
    corePort: 3000,
    webPort: 5173,
    autostart: cfg.get<boolean>('autostart', false),
  };
}
```

- [ ] **Step 6: Create `extension.ts` with empty command handlers**

Create `extension/src/extension.ts`:

```ts
import * as vscode from 'vscode';
import { resolveContext } from './config';

export function activate(context: vscode.ExtensionContext): void {
  const register = (id: string, fn: (...a: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  };

  register('archi-os.open', () => vscode.window.showInformationMessage('ARCHI-OS: open (M1).'));
  register('archi-os.start', () => vscode.window.showInformationMessage('ARCHI-OS: start (M2).'));
  register('archi-os.stop', () => vscode.window.showInformationMessage('ARCHI-OS: stop (M2).'));
  register('archi-os.configureMcp', () => vscode.window.showInformationMessage('ARCHI-OS: MCP (M2).'));
  register('archi-os.createSnapshot', () => vscode.window.showInformationMessage('ARCHI-OS: snapshot (M4).'));
  register('archi-os.refreshVersions', () => vscode.window.showInformationMessage('ARCHI-OS: versions (M4).'));

  const ctx = resolveContext();
  console.log('[archi-os] activated', ctx ? `ws=${ctx.workspaceRoot}` : 'no workspace');
}

export function deactivate(): void {
  // Runtime teardown wired in Task 8.
}
```

- [ ] **Step 7: Install deps and build**

Run: `npm install && npm run build -w extension`
Expected: `extension/dist/extension.js` produced; esbuild bundles `@archi-os/cli` (already built in Task 2) without shebang errors.

- [ ] **Step 8: Type-check**

Run: `npm run type-check -w extension`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add extension package.json
git commit -m "feat(extension): scaffold archi-os-vscode + activate/deactivate lifecycle (EXT-M0)"
```

---

## Task 7: Webview panel + typed bridge (EXT-M1)

**Files:**
- Create: `extension/src/webview/bridge.ts`, `extension/src/webview/panel.ts`
- Create: `extension/tests/bridge.test.ts`
- Modify: `extension/src/extension.ts` (`archi-os.open` → open the panel)

**Interfaces:**
- Consumes: `resolveContext()` from Task 6; `web/dist` assets.
- Produces:
  - `bridge.ts`: `type ExtToWeb`, `type WebToExt`, `isWebToExt(msg): msg is WebToExt`.
  - `panel.ts`: `openPanel(ctx: ExtContext, extensionUri: vscode.Uri): vscode.WebviewPanel`, `postToWebview(panel, msg: ExtToWeb): void`.

- [ ] **Step 1: Write the failing bridge test**

Create `extension/tests/bridge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isWebToExt } from '../src/webview/bridge';

describe('bridge message guards', () => {
  it('accepts a valid ready message', () => {
    expect(isWebToExt({ type: 'ready' })).toBe(true);
  });

  it('accepts open-external with url', () => {
    expect(isWebToExt({ type: 'open-external', payload: { url: 'https://x' } })).toBe(true);
  });

  it('rejects unknown type', () => {
    expect(isWebToExt({ type: 'nope' })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isWebToExt(null)).toBe(false);
    expect(isWebToExt('ready')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -w extension -- bridge`
Expected: FAIL — `bridge` module not found.

- [ ] **Step 3: Implement the bridge protocol**

Create `extension/src/webview/bridge.ts`:

```ts
export type Theme = 'dark' | 'light';

export type ExtToWeb =
  | { type: 'init'; payload: { apiBaseUrl: string; theme: Theme; workspacePath: string } }
  | { type: 'theme'; payload: { theme: Theme } }
  | { type: 'refresh' };

export type WebToExt =
  | { type: 'ready' }
  | { type: 'open-external'; payload: { url: string } };

const WEB_TO_EXT = new Set(['ready', 'open-external']);

export function isWebToExt(msg: unknown): msg is WebToExt {
  if (typeof msg !== 'object' || msg === null) return false;
  const t = (msg as { type?: unknown }).type;
  return typeof t === 'string' && WEB_TO_EXT.has(t);
}
```

- [ ] **Step 4: Run to confirm the test passes**

Run: `npm test -w extension -- bridge`
Expected: PASS.

- [ ] **Step 5: Implement the panel (CSP + nonce + asWebviewUri + nonced injection)**

Create `extension/src/webview/panel.ts`:

```ts
import * as vscode from 'vscode';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtContext } from '../config';
import type { ExtToWeb, Theme } from './bridge';

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function currentTheme(): Theme {
  return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? 'light' : 'dark';
}

export function postToWebview(panel: vscode.WebviewPanel, msg: ExtToWeb): void {
  void panel.webview.postMessage(msg);
}

/** Rewrite web/dist/index.html for the webview: asWebviewUri assets, CSP, nonce, runtime injection. */
function buildHtml(webview: vscode.Webview, distRoot: vscode.Uri, ctx: ExtContext): string {
  const n = nonce();
  const raw = readFileSync(join(distRoot.fsPath, 'index.html'), 'utf8');

  // Rewrite relative asset refs (./assets/...) to webview URIs.
  const html = raw.replace(/(src|href)="(\.\/[^"]+)"/g, (_m, attr: string, rel: string) => {
    const abs = vscode.Uri.joinPath(distRoot, rel.replace(/^\.\//, ''));
    return `${attr}="${webview.asWebviewUri(abs)}"`;
  });

  const apiBaseUrl = `http://localhost:${ctx.corePort}`;
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${n}'`,
    `connect-src ${apiBaseUrl} ws://localhost:${ctx.corePort}`,
    `font-src ${webview.cspSource}`,
  ].join('; ');

  const injection = `<script nonce="${n}">window.__ARCHI_OS__=${JSON.stringify({ apiBaseUrl })};</script>`;
  const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

  // Add nonce to every bundle <script>; inject CSP + runtime config into <head>.
  return html
    .replace(/<script /g, `<script nonce="${n}" `)
    .replace('</head>', `${cspMeta}${injection}</head>`);
}

export function openPanel(ctx: ExtContext, extensionUri: vscode.Uri): vscode.WebviewPanel {
  const distRoot = vscode.Uri.joinPath(extensionUri, 'web-dist');
  const panel = vscode.window.createWebviewPanel(
    'archiOs',
    'ARCHI-OS',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [distRoot],
    },
  );

  panel.webview.html = buildHtml(panel.webview, distRoot, ctx);

  // Push theme changes to the webview.
  const themeSub = vscode.window.onDidChangeActiveColorTheme(() => {
    postToWebview(panel, { type: 'theme', payload: { theme: currentTheme() } });
  });
  panel.onDidDispose(() => themeSub.dispose());

  return panel;
}
```

> **Bundling note:** `web/dist` is copied into the extension as `web-dist/` at package time (Task 11 wires the copy into `build`/`package`). For local dev before packaging, create the copy manually: `cp -r web/dist extension/web-dist`.

- [ ] **Step 6: Wire `archi-os.open` to open the panel**

In `extension/src/extension.ts`, replace the `archi-os.open` handler:

```ts
  register('archi-os.open', () => {
    const ctx = resolveContext();
    if (!ctx) { void vscode.window.showErrorMessage('ARCHI-OS: open a workspace folder first.'); return; }
    openPanel(ctx, context.extensionUri);
  });
```

Add the import at the top: `import { openPanel } from './webview/panel';`

- [ ] **Step 7: Prepare web-dist and build**

Run: `cp -r web/dist extension/web-dist && npm run build -w extension`
Expected: build succeeds.

- [ ] **Step 8: Type-check + unit tests**

Run: `npm run type-check -w extension && npm test -w extension`
Expected: no type errors; bridge tests PASS.

- [ ] **Step 9: Commit**

```bash
echo "web-dist/" >> extension/.gitignore
git add extension/src/webview extension/tests/bridge.test.ts extension/src/extension.ts extension/.gitignore
git commit -m "feat(extension): webview panel with CSP/nonce + typed bridge (EXT-M1)"
```

---

## Task 8: Engine (attached spawn) + MCP config + status bar (EXT-M2)

**Files:**
- Create: `extension/src/engine.ts`, `extension/src/mcp.ts`, `extension/src/statusbar.ts`
- Modify: `extension/src/extension.ts` (wire start/stop/configureMcp, status bar, gated autostart, deactivate)

**Interfaces:**
- Consumes: `@archi-os/cli/lib/process` (`spawnManaged`, `stopEntry`, `type ProcEntry`), `@archi-os/cli/lib/ports` (`findFreePort`, `waitForHealth`), `@archi-os/cli/lib/static-server` (`startStaticServer`), `@archi-os/cli/lib/mcp-config` (`buildEntry`, `mergeServer`, `SERVER_KEY`), `@archi-os/cli/lib/paths` (`clientContext`, `resolveClient`).
- Produces:
  - `engine.ts`: `class Engine { start(ctx): Promise<{corePort:number; webUrl:string}>; stop(): Promise<void>; isRunning(): boolean }`.
  - `mcp.ts`: `configureMcp(ctx): Promise<string>` (returns the config file path written).
  - `statusbar.ts`: `class StatusBar { setLive(url:string):void; setStopped():void; flashReload():void; dispose():void }`.

- [ ] **Step 1: Implement the engine (core attached + in-process static web)**

Create `extension/src/engine.ts`:

```ts
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnManaged, stopEntry, type ProcEntry } from '@archi-os/cli/lib/process';
import { findFreePort, waitForHealth } from '@archi-os/cli/lib/ports';
import { startStaticServer } from '@archi-os/cli/lib/static-server';
import type { ExtContext } from './config';

export class Engine {
  private core: ProcEntry | null = null;
  private web: { port: number; close(): void } | null = null;

  isRunning(): boolean {
    return this.core !== null;
  }

  /** Spawn core (attached → dies on deactivate) + serve web/dist in-process. */
  async start(ctx: ExtContext): Promise<{ corePort: number; webUrl: string }> {
    if (this.core) return { corePort: this.core.port, webUrl: `http://localhost:${this.web?.port}` };

    const coreDist = resolve(ctx.workspaceRoot, 'core', 'dist', 'index.js');
    if (!existsSync(coreDist)) throw new Error('core not built. Run: npm run build -w core');

    const corePort = await findFreePort(ctx.corePort);
    const core = spawnManaged({
      workspaceRoot: ctx.workspaceRoot,
      name: 'core',
      command: process.execPath,
      commandArgs: [coreDist],
      env: { RUN_HTTP_SERVER: 'true', PORT: String(corePort), WORKSPACE_ROOT: ctx.workspaceRoot },
      mode: 'attached',
      port: corePort,
    });
    this.core = core;

    await waitForHealth(`http://127.0.0.1:${corePort}/health`, {
      timeoutMs: 20000,
      signal: () => { try { process.kill(core.pid, 0); return false; } catch { return true; } },
    });

    const distRoot = resolve(ctx.workspaceRoot, 'web', 'dist');
    if (!existsSync(distRoot)) throw new Error('web not built. Run: npm run build -w web');
    this.web = await startStaticServer({
      distRoot,
      apiBaseUrl: `http://localhost:${corePort}`,
      port: ctx.webPort,
    });

    return { corePort, webUrl: `http://localhost:${this.web.port}` };
  }

  async stop(): Promise<void> {
    this.web?.close();
    this.web = null;
    if (this.core) { await stopEntry(this.core); this.core = null; }
  }
}
```

- [ ] **Step 2: Implement MCP configuration (compose cli primitives)**

Create `extension/src/mcp.ts`:

```ts
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildEntry, mergeServer } from '@archi-os/cli/lib/mcp-config';
import { clientContext, resolveClient } from '@archi-os/cli/lib/paths';
import type { ExtContext } from './config';

/** Merge the archi-os MCP entry into the VSCode client config (idempotent, backed up). */
export function configureMcp(ctx: ExtContext): string {
  const clientCtx = { ...clientContext(), workspaceRoot: ctx.workspaceRoot };
  const client = resolveClient('vscode', clientCtx);

  const distPath = `${ctx.workspaceRoot}/core/dist/index.js`;
  const entry = buildEntry({
    distPath,
    workspaceRoot: ctx.workspaceRoot,
    browseRoot: ctx.workspaceRoot,
    entryShape: client.entry,
  });

  const existing = existsSync(client.file) ? readFileSync(client.file, 'utf8') : '{}';
  if (existsSync(client.file)) copyFileSync(client.file, `${client.file}.bak`);
  const merged = mergeServer(existing, entry, client.key);

  mkdirSync(dirname(client.file), { recursive: true });
  writeFileSync(client.file, merged, 'utf8');
  return client.file;
}
```

> `resolveClient('vscode', …)` returns `{ file: <ws>/.vscode/mcp.json, key: 'servers', entry: 'stdio' }` (from `cli/lib/paths`). Do not hardcode these — read them from the descriptor.

- [ ] **Step 3: Implement the status bar**

Create `extension/src/statusbar.ts`:

```ts
import * as vscode from 'vscode';

export class StatusBar {
  private item: vscode.StatusBarItem;
  private steady = '$(circle-slash) ARCHI-OS';

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'archi-os.open';
    this.setStopped();
    this.item.show();
  }

  setLive(url: string): void {
    this.steady = '$(broadcast) ARCHI-OS Live';
    this.item.text = this.steady;
    this.item.tooltip = `Runtime live — ${url}`;
  }

  setStopped(): void {
    this.steady = '$(circle-slash) ARCHI-OS';
    this.item.text = this.steady;
    this.item.tooltip = 'Runtime stopped — click to open';
  }

  flashReload(): void {
    this.item.text = '$(sync~spin) rules reloaded';
    setTimeout(() => { this.item.text = this.steady; }, 1500);
  }

  dispose(): void { this.item.dispose(); }
}
```

- [ ] **Step 4: Wire everything in `extension.ts` (start/stop/mcp, status bar, gated autostart, deactivate)**

Replace `extension/src/extension.ts` with the integrated version:

```ts
import * as vscode from 'vscode';
import { resolveContext } from './config';
import { Engine } from './engine';
import { configureMcp } from './mcp';
import { StatusBar } from './statusbar';
import { openPanel } from './webview/panel';

let engine: Engine | null = null;
let statusBar: StatusBar | null = null;

export function activate(context: vscode.ExtensionContext): void {
  engine = new Engine();
  statusBar = new StatusBar();
  context.subscriptions.push({ dispose: () => statusBar?.dispose() });

  const register = (id: string, fn: (...a: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  };

  register('archi-os.open', () => {
    const ctx = resolveContext();
    if (!ctx) { void vscode.window.showErrorMessage('ARCHI-OS: open a workspace folder first.'); return; }
    openPanel(ctx, context.extensionUri);
  });

  register('archi-os.start', async () => {
    const ctx = resolveContext();
    if (!ctx) { void vscode.window.showErrorMessage('ARCHI-OS: open a workspace folder first.'); return; }
    try {
      const { webUrl } = await engine!.start(ctx);
      statusBar!.setLive(webUrl);
      void vscode.window.showInformationMessage(`ARCHI-OS runtime live — ${webUrl}`);
    } catch (err) {
      void vscode.window.showErrorMessage(`ARCHI-OS start failed: ${(err as Error).message}`);
    }
  });

  register('archi-os.stop', async () => {
    await engine?.stop();
    statusBar?.setStopped();
  });

  register('archi-os.configureMcp', () => {
    const ctx = resolveContext();
    if (!ctx) { void vscode.window.showErrorMessage('ARCHI-OS: open a workspace folder first.'); return; }
    try {
      const file = configureMcp(ctx);
      void vscode.window.showInformationMessage(`ARCHI-OS MCP configured: ${file}`);
    } catch (err) {
      void vscode.window.showErrorMessage(`ARCHI-OS MCP config failed: ${(err as Error).message}`);
    }
  });

  register('archi-os.createSnapshot', () => vscode.window.showInformationMessage('ARCHI-OS: snapshot (M4).'));
  register('archi-os.refreshVersions', () => vscode.window.showInformationMessage('ARCHI-OS: versions (M4).'));

  // Gated autostart: never spawn silently on mere .archi/ presence.
  const ctx = resolveContext();
  if (ctx?.autostart) {
    void vscode.commands.executeCommand('archi-os.start');
  }
}

export function deactivate(): Thenable<void> | void {
  return engine?.stop();
}
```

- [ ] **Step 5: Build + type-check**

Run: `npm run build -w extension && npm run type-check -w extension`
Expected: no errors; esbuild bundles the cli lib imports.

- [ ] **Step 6: Unit tests still green**

Run: `npm test -w extension`
Expected: PASS (bridge).

- [ ] **Step 7: Commit**

```bash
git commit -am "feat(extension): engine (attached spawn) + MCP config + status bar (EXT-M2)"
```

---

## Task 9: onDidSave diagnostics (EXT-M4, part 1)

**Files:**
- Create: `extension/src/diagnostics-core.ts`, `extension/src/diagnostics.ts`
- Create: `extension/tests/diagnostics-core.test.ts`
- Modify: `extension/src/extension.ts` (register the save hook; flash status bar; push refresh)

**Interfaces:**
- Consumes: `DefinitionSchema` from `@archi-os/core/schema`; `jsonc-parser`.
- Produces:
  - `diagnostics-core.ts`: `type PlainDiagnostic = { line:number; character:number; endLine:number; endCharacter:number; message:string }`; `validateDefinitionText(text: string): PlainDiagnostic[]`.
  - `diagnostics.ts`: `registerDiagnostics(context, onValidSave: (uri: vscode.Uri) => void): vscode.Disposable`.

- [ ] **Step 1: Write the failing pure-mapping test**

Create `extension/tests/diagnostics-core.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateDefinitionText } from '../src/diagnostics-core';

const VALID = JSON.stringify(
  { typeId: 'tech:frontend:react', label: 'React', category: 'frontend', style: { shape: 'rectangle', color: '#61DAFB' } },
  null, 2,
);

const INVALID = JSON.stringify(
  { typeId: 'tech:frontend:react', label: 'React', category: 'frontend', style: { shape: 'rectangle', color: 'blue' } },
  null, 2,
);

describe('validateDefinitionText', () => {
  it('returns no diagnostics for a valid definition', () => {
    expect(validateDefinitionText(VALID)).toEqual([]);
  });

  it('flags the bad color and points at its line', () => {
    const diags = validateDefinitionText(INVALID);
    expect(diags.length).toBeGreaterThan(0);
    const colorLine = INVALID.split('\n').findIndex((l) => l.includes('"color"'));
    expect(diags.some((d) => d.line === colorLine)).toBe(true);
    expect(diags[0].message.toLowerCase()).toContain('color');
  });

  it('returns a diagnostic (not throw) on invalid JSON', () => {
    const diags = validateDefinitionText('{ not json');
    expect(diags.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npm test -w extension -- diagnostics-core`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pure mapping**

Create `extension/src/diagnostics-core.ts`:

```ts
import { DefinitionSchema } from '@archi-os/core/schema';
import { parseTree, findNodeAtLocation, type Node, type Segment } from 'jsonc-parser';

export type PlainDiagnostic = {
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  message: string;
};

function offsetToPos(text: string, offset: number): { line: number; character: number } {
  let line = 0;
  let last = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') { line++; last = i; }
  }
  return { line, character: offset - last - 1 };
}

function nodeRange(text: string, root: Node | undefined, path: Segment[]): { s: number; e: number } {
  const node = root ? findNodeAtLocation(root, path) : undefined;
  if (node) return { s: node.offset, e: node.offset + node.length };
  return { s: 0, e: Math.min(1, text.length) };
}

/** Validate def.json text against DefinitionSchema; return plain, position-mapped diagnostics. */
export function validateDefinitionText(text: string): PlainDiagnostic[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return [{ line: 0, character: 0, endLine: 0, endCharacter: 1, message: `Invalid JSON: ${(err as Error).message}` }];
  }

  const result = DefinitionSchema.safeParse(json);
  if (result.success) return [];

  const root = parseTree(text);
  return result.error.issues.map((issue) => {
    const { s, e } = nodeRange(text, root, issue.path as Segment[]);
    const start = offsetToPos(text, s);
    const end = offsetToPos(text, e);
    const where = issue.path.length ? issue.path.join('.') : '(root)';
    return {
      line: start.line,
      character: start.character,
      endLine: end.line,
      endCharacter: end.character,
      message: `${where}: ${issue.message}`,
    };
  });
}
```

- [ ] **Step 4: Run to confirm passing**

Run: `npm test -w extension -- diagnostics-core`
Expected: PASS.

- [ ] **Step 5: Implement the vscode-facing hook**

Create `extension/src/diagnostics.ts`:

```ts
import * as vscode from 'vscode';
import { validateDefinitionText } from './diagnostics-core';

const DEF_GLOB = /[/\\]definitions[/\\].*\.def\.json$/;

/** Wire onDidSave for definitions/**/*.def.json: publish diagnostics, invoke onValidSave when clean. */
export function registerDiagnostics(
  context: vscode.ExtensionContext,
  onValidSave: (uri: vscode.Uri) => void,
): vscode.Disposable {
  const collection = vscode.languages.createDiagnosticCollection('archi-os');
  context.subscriptions.push(collection);

  let timer: ReturnType<typeof setTimeout> | undefined;

  const sub = vscode.workspace.onDidSaveTextDocument((doc) => {
    if (!DEF_GLOB.test(doc.uri.fsPath)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const diags = validateDefinitionText(doc.getText()).map((d) => new vscode.Diagnostic(
        new vscode.Range(d.line, d.character, d.endLine, d.endCharacter),
        d.message,
        vscode.DiagnosticSeverity.Error,
      ));
      collection.set(doc.uri, diags);
      if (diags.length === 0) onValidSave(doc.uri);
      else void vscode.window.showWarningMessage(`ARCHI-OS: ${doc.uri.path.split('/').pop()} has ${diags.length} rule error(s).`);
    }, 300);
  });

  context.subscriptions.push(sub);
  return sub;
}
```

- [ ] **Step 6: Register the hook in `extension.ts` (flash + push refresh)**

In `activate()`, after the status bar is created, add:

```ts
  registerDiagnostics(context, () => {
    statusBar?.flashReload();
    for (const p of activePanels) p.webview.postMessage({ type: 'refresh' });
  });
```

Add near the top of the module (module scope): `const activePanels = new Set<vscode.WebviewPanel>();`
In the `archi-os.open` handler, track the panel:

```ts
  register('archi-os.open', () => {
    const ctx = resolveContext();
    if (!ctx) { void vscode.window.showErrorMessage('ARCHI-OS: open a workspace folder first.'); return; }
    const panel = openPanel(ctx, context.extensionUri);
    activePanels.add(panel);
    panel.onDidDispose(() => activePanels.delete(panel));
  });
```

Add the import: `import { registerDiagnostics } from './diagnostics';`

- [ ] **Step 7: Build + type-check + all unit tests**

Run: `npm run build -w extension && npm run type-check -w extension && npm test -w extension`
Expected: no errors; bridge + diagnostics-core tests PASS.

- [ ] **Step 8: Commit**

```bash
git commit -am "feat(extension): onDidSave def.json diagnostics → Problems + push refresh (EXT-M4)"
```

---

## Task 10: Versioning TreeView + snapshot/restore commands (EXT-M4, part 2)

**Files:**
- Create: `extension/src/versioning/api.ts`, `extension/src/versioning/tree.ts`
- Modify: `extension/src/extension.ts` (register the tree + real snapshot/restore commands)

**Interfaces:**
- Consumes: core routes from Task 5 (`/api/versions`, `/api/snapshot`, `/api/versions/:id/restore`); the running `corePort` (via a getter added to `Engine`).
- Produces:
  - `api.ts`: `type Version = { id:string; label:string; createdAt:string; nodeCount:number; edgeCount:number; kind:'auto'|'manual' }`; `listVersions(base:string): Promise<Version[]>`; `createSnapshot(base:string, label:string): Promise<Version>`; `restoreVersion(base:string, id:string): Promise<void>`.
  - `tree.ts`: `class VersionsProvider implements vscode.TreeDataProvider<Version> { refresh():void }`.

- [ ] **Step 1: Add a port getter to the Engine**

In `extension/src/engine.ts`, add a method to `Engine`:

```ts
  /** core base URL when running, else null. */
  coreBaseUrl(): string | null {
    return this.core ? `http://localhost:${this.core.port}` : null;
  }
```

- [ ] **Step 2: Implement the typed API client**

Create `extension/src/versioning/api.ts`:

```ts
export type Version = {
  id: string;
  label: string;
  createdAt: string;
  nodeCount: number;
  edgeCount: number;
  kind: 'auto' | 'manual';
};

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function listVersions(base: string): Promise<Version[]> {
  const data = await json<{ versions: Version[] }>(await fetch(`${base}/api/versions`));
  return data.versions;
}

export async function createSnapshot(base: string, label: string): Promise<Version> {
  const data = await json<{ version: Version }>(
    await fetch(`${base}/api/snapshot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label }),
    }),
  );
  return data.version;
}

export async function restoreVersion(base: string, id: string): Promise<void> {
  await json<{ success: boolean }>(
    await fetch(`${base}/api/versions/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
  );
}
```

- [ ] **Step 3: Implement the TreeDataProvider**

Create `extension/src/versioning/tree.ts`:

```ts
import * as vscode from 'vscode';
import { listVersions, type Version } from './api';

export class VersionsProvider implements vscode.TreeDataProvider<Version> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private baseUrl: () => string | null) {}

  refresh(): void { this.emitter.fire(); }

  getTreeItem(v: Version): vscode.TreeItem {
    const item = new vscode.TreeItem(v.label, vscode.TreeItemCollapsibleState.None);
    item.description = `${new Date(v.createdAt).toLocaleString()} · ${v.nodeCount}n/${v.edgeCount}e`;
    item.tooltip = `${v.kind} · ${v.id}`;
    item.iconPath = new vscode.ThemeIcon(v.kind === 'manual' ? 'bookmark' : 'history');
    item.contextValue = 'archi-os.version';
    item.command = { command: 'archi-os.restoreVersion', title: 'Restore', arguments: [v] };
    return item;
  }

  async getChildren(): Promise<Version[]> {
    const base = this.baseUrl();
    if (!base) return [];
    try { return await listVersions(base); } catch { return []; }
  }
}
```

- [ ] **Step 4: Register tree + real commands in `extension.ts`**

Add imports:

```ts
import { VersionsProvider } from './versioning/tree';
import { createSnapshot, restoreVersion, type Version } from './versioning/api';
```

In `activate()`, after `engine`/`statusBar` are created:

```ts
  const versions = new VersionsProvider(() => engine!.coreBaseUrl());
  context.subscriptions.push(vscode.window.registerTreeDataProvider('archi-os.versions', versions));
```

Replace the placeholder `createSnapshot`/`refreshVersions` registrations and add `restoreVersion`:

```ts
  register('archi-os.refreshVersions', () => versions.refresh());

  register('archi-os.createSnapshot', async () => {
    const base = engine!.coreBaseUrl();
    if (!base) { void vscode.window.showErrorMessage('ARCHI-OS: start the runtime first.'); return; }
    const label = await vscode.window.showInputBox({ prompt: 'Snapshot label', placeHolder: 'e.g. before-refactor' });
    if (!label) return;
    try { await createSnapshot(base, label); versions.refresh(); void vscode.window.showInformationMessage(`Snapshot "${label}" created.`); }
    catch (err) { void vscode.window.showErrorMessage(`Snapshot failed: ${(err as Error).message}`); }
  });

  register('archi-os.restoreVersion', async (arg: unknown) => {
    const base = engine!.coreBaseUrl();
    if (!base) { void vscode.window.showErrorMessage('ARCHI-OS: start the runtime first.'); return; }
    const v = arg as Version;
    const ok = await vscode.window.showWarningMessage(`Restore graph to "${v.label}"? This replaces the current graph.`, { modal: true }, 'Restore');
    if (ok !== 'Restore') return;
    try {
      await restoreVersion(base, v.id);
      for (const p of activePanels) p.webview.postMessage({ type: 'refresh' });
      void vscode.window.showInformationMessage(`Restored to "${v.label}".`);
    } catch (err) { void vscode.window.showErrorMessage(`Restore failed: ${(err as Error).message}`); }
  });
```

Add `"archi-os.restoreVersion"` to `contributes.commands` in `extension/package.json`:

```json
      { "command": "archi-os.restoreVersion", "title": "ARCHI-OS: Restore Version" },
```

- [ ] **Step 5: Build + type-check + tests**

Run: `npm run build -w extension && npm run type-check -w extension && npm test -w extension`
Expected: no errors; unit tests PASS.

- [ ] **Step 6: Commit**

```bash
git commit -am "feat(extension): versioning TreeView + snapshot/restore commands (EXT-M4)"
```

---

## Task 11: Packaging (.vsix) + web-dist bundling + docs

**Files:**
- Modify: `extension/esbuild.mjs` (copy `web/dist` → `extension/web-dist` during build)
- Modify: `extension/.vscodeignore` (keep `web-dist/`, `media/`)
- Modify: `ARCHITECTURE.md`

**Interfaces:**
- Produces: installable `archi-os-vscode-0.1.0.vsix`.

- [ ] **Step 1: Copy web/dist into the extension at build time**

In `extension/esbuild.mjs`, before creating the esbuild context, copy the built web assets:

```js
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const webDist = resolve('..', 'web', 'dist');
if (!existsSync(webDist)) throw new Error('web/dist missing — run: npm run build -w web');
cpSync(webDist, resolve('web-dist'), { recursive: true });
```

- [ ] **Step 2: Ensure `.vscodeignore` keeps runtime assets**

Confirm `extension/.vscodeignore` does NOT exclude `web-dist/` or `media/` (it currently excludes only `src/**`, tests, config, maps). Leave as-is.

- [ ] **Step 3: Build web + extension, then package**

Run: `npm run build -w web && npm run build -w extension && npm run package -w extension`
Expected: `extension/archi-os-vscode-0.1.0.vsix` produced; vsce reports the included files (must list `dist/extension.js`, `web-dist/`, `media/icon.svg`).

- [ ] **Step 4: Update ARCHITECTURE.md**

Add a section documenting: the new `extension/` package (esbuild → `.vsix`, wraps cli), the `@archi-os/cli` `./lib/*` export and `@archi-os/core/schema` export, and the 3 versioning HTTP routes. Place it near the existing `cli/` package documentation. Example paragraph to insert:

```markdown
### `extension/` — archi-os-vscode

VSCode/Cursor extension (esbuild bundle → `.vsix`). Thin wrapper over `@archi-os/cli`:
imports `lib/process` (attached spawn — children die on `deactivate`), `lib/static-server`,
`lib/ports`, and `lib/mcp-config`. Hosts `web/dist` in a webview under a strict CSP+nonce.
Livrable #1: versioning TreeView (core routes `GET /api/versions`, `POST /api/snapshot`,
`POST /api/versions/:id/restore`) and `onDidSave` def.json diagnostics validated via
`@archi-os/core/schema` (`DefinitionSchema`).
```

- [ ] **Step 5: Commit**

```bash
git add extension/esbuild.mjs ARCHITECTURE.md
git commit -m "chore(extension): bundle web/dist into .vsix + document in ARCHITECTURE.md"
```

- [ ] **Step 6: Manual acceptance (DoD)**

Install the `.vsix` in VSCode/Cursor (`code --install-extension extension/archi-os-vscode-0.1.0.vsix`) and verify:
- `ARCHI-OS: Start Runtime` → status bar goes **Live**, no terminal used.
- `ARCHI-OS: Open` → graph renders, assets load, **no CSP error** in the webview console, `fetch` to core succeeds (CORS ok).
- Save a `definitions/**/*.def.json` with a bad `color` → red squiggle + Problems entry; fix it → diagnostics clear + webview refreshes instantly.
- Versions view: create a snapshot, then restore it → confirmation modal, webview reflects the restored graph.
- Toggle `archiOs.autostart` off → reload window → runtime does **not** auto-spawn.

---

## Self-Review

**1. Spec coverage:**
- §2 architecture (3 packages + new) → Tasks 1–11. ✓
- §2 cli exports map → Task 2. ✓
- §2 core `/schema` subpath (fold #2) → Task 3. ✓
- §2 CORS webview origin (fold #5) → Task 4. ✓
- §4 injection nonced + CSP (fold #1) → Task 7 (`buildHtml` nonced injection + per-script nonce). ✓
- §5 versioning routes + restore disk-persist (fold #3) → Task 5 (`save` after restore + test). ✓
- §6 autostart gated (fold #4) → Task 6 setting + Task 8 gated `executeCommand`. ✓
- §3 components table → Tasks 6–10 (panel, bridge, engine, mcp, statusbar, diagnostics, tree). ✓
- §8 theme sync → Task 7 (`onDidChangeActiveColorTheme` → `theme` message). ✓
- §9 tests (core inject, bridge, diagnostics mapping) → Tasks 5, 7, 9. ✓
- §11 DoD + §2 Web M0 → Task 1 + Task 11 manual acceptance. ✓
- ARCHITECTURE.md update → Task 11. ✓

**2. Placeholder scan:** No TBD/TODO. The one interpretive note (web store fetch method name, Task 1 Step 3) is bounded — it names the existing polling action rather than inventing one. Manual acceptance (Task 11 Step 6) is intentional (VSCode UI can't be unit-tested here); unit/integration coverage lives in Tasks 5/7/9.

**3. Type consistency:** `ExtContext`, `ExtToWeb`/`WebToExt`, `ProcEntry` (from cli), `Version`, `PlainDiagnostic` used consistently across tasks. `engine.coreBaseUrl()` defined in Task 10 Step 1 before use. `activePanels` introduced in Task 9 and reused in Task 10. Route response shapes (`{versions}`, `{version}`, `{success,...}`) match between Task 5 (producer) and Task 10 `api.ts` (consumer).
