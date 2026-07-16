# Nodalis Architecture

> 🇫🇷 [Read in French](ARCHITECTURE.md).

## Overview

Nodalis is a software architecture management and visualization system that lets you manipulate architecture graphs via AIs and view them in a web interface.

### General architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   AI Assistant  │────────▶│  MCP Server      │────────▶│  graph.json     │
│   (via MCP)     │         │  (stdio)         │         │  (persistence)  │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                                                   │
                                                                   │ watch
                                                                   ▼
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Web Frontend  │────────▶│  HTTP Server     │────────▶│  Graph (memory) │
│   (React)       │  poll   │  (port 3000)     │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

## Project structure

```
nodalis/
├── core/                    # Backend (TypeScript/Node.js)
│   ├── src/
│   │   ├── application/     # Use cases (business logic)
│   │   ├── domain/          # Domain model
│   │   ├── errors/          # Custom errors
│   │   └── infrastructure/  # Technical layers
│   ├── definitions/         # Node type definitions
│   ├── tests/              # Unit and integration tests
│   └── dist/               # Compiled code (generated)
│
├── web/                    # Frontend (React/Vite)
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom React hooks
│   │   └── stores/         # State management (Zustand)
│   └── public/            # Static assets
│
├── cli/                    # @nodalis/cli CLI (install/launch/MCP)
│   ├── src/
│   │   ├── commands/      # init, doctor, up, down, uninstall
│   │   ├── lib/           # pure modules (mcp-config, paths, ports, process, static-server)
│   │   ├── config.ts      # Zod schema for .nodalis/cli.json
│   │   └── errors.ts      # CliError & subclasses
│   └── tests/unit/        # vitest tests for pure modules
│
├── extension/              # "nodalis" VSCode extension (esbuild → .vsix)
│   ├── src/
│   │   ├── engine.ts      # spawns attached core + static web (via cli/lib)
│   │   ├── mcp.ts         # MCP config (composes cli/lib/mcp-config)
│   │   ├── webview/       # panel (CSP+nonce) + typed bridge
│   │   ├── diagnostics*.ts# onDidSave *.def.json → Problems (Zod)
│   │   └── versioning/    # TreeView + versioning route client
│   └── tests/             # bridge + diagnostics-core (vitest)
│
└── .nodalis/                # Persisted data
    ├── graph.json         # Graph state
    ├── cli.json           # CLI config: preferred ports + configured clients
    └── cli/               # CLI runtime (gitignored)
        ├── run.json       # PID/port/signature registry of launched processes
        └── logs/          # core.log, web.log (detached processes)
```

---

## Core Backend (`/core`)

### Entry points

#### `src/index.ts`
**Role**: Main backend entry point. Initializes every component and starts either the MCP server or the HTTP server depending on the environment variable.

**Behavior**:
- Creates the domain instances (`Registry`, `Graph`)
- Initializes `GraphStorage` for persistence
- Loads the graph from `.nodalis/graph.json`
- Loads type definitions from `/definitions`
- Starts either:
  - **MCP Server** (default): for communication with AIs
  - **HTTP Server** (if `RUN_HTTP_SERVER=true`): for the web frontend

**Environment variables**:
- `WORKSPACE_ROOT`: Workspace root
- `DEFINITIONS_PATH`: Path to the definitions
- `RUN_HTTP_SERVER`: If `true`, starts the HTTP server instead of MCP

---

### Domain Layer (`src/domain/`)

#### `graph.ts`
**Role**: Central model representing the architecture graph.

**Responsibilities**:
- Node management (add, remove, retrieve)
- Edge management (add, remove, retrieve)
- Keeping the in-memory graph consistent
- `clear()` method to fully wipe the graph

**Data structure**:
```typescript
class Graph {
  private nodes: Map<string, Node>
  private edges: Map<string, Edge>
}
```

#### `registry.ts`
**Role**: Registry of the available node types (definitions).

**Responsibilities**:
- Stores type definitions (tech:frontend:react, tech:database:postgres, etc.)
- Provides access to definitions for validation and display
- Handles hot-reload of definitions in development

**Example definition**:
```json
{
  "id": "tech:frontend:react",
  "name": "React Frontend",
  "style": { "shape": "rectangle", "color": "#61dafb" }
}
```

#### `types.ts`
**Role**: TypeScript definitions for the domain types.

**Main types**:
- `Node`: Represents an architecture component
- `Edge`: Represents a connection between nodes
- `Definition`: Definition of a node type
- `Proposal`: Proposed changes to the graph

#### `rule-engine.ts`
**Role**: Rule engine that validates graph operations — forbidden connections, cycle detection, `dataSchema`, and preset-level rules (`maxNodesPerType`, `maxDepth`, `requiredTypes`, `requiredConnections`, …).

---

### Application Layer (`src/application/`)

#### `load-definitions.use-case.ts`
**Role**: Use case that loads type definitions from the filesystem.

**Features**:
- Loads all `.def.json` files from `/definitions`
- Registers the definitions in the `Registry`
- Enables hot-reload in development mode

#### `validate-proposal.use-case.ts`
**Role**: Use case that validates a proposed batch of changes.

**Validations**:
- Checks that the node types exist
- Checks that IDs are valid UUID v4
- Checks that nodes referenced in edges exist

#### `apply-proposal.use-case.ts`
**Role**: Use case that applies a validated proposal to the graph.

**Supported operations**:
- `add_node`: Add a node
- `add_edge`: Add an edge
- `delete_node`: Delete a node
- `delete_edge`: Delete an edge
- `update_node`: Update a node

---

### Infrastructure Layer (`src/infrastructure/`)

#### `mcp/mcp-server.ts`
**Role**: MCP (Model Context Protocol) server for AI communication.

**Communication**: Via stdio (stdin/stdout)

**Exposed tools**: `get_active_workspace`, `list_workspaces`, `create_workspace`, `open_workspace`, `get_workspace_notes`, `append_workspace_note`, `list_presets`, `create_subgraph`, `open_graph`, `list_types`, `get_graph`, `validate_graph`, `propose_changes`, `clear_graph`, `check_proposal_status`, `list_versions`, `create_snapshot`, `restore_version`.

**Proposal format**:
```typescript
{
  author: "AI Assistant",
  operations: [
    {
      op: "add_node",
      payload: {
        id: "uuid-v4",
        typeId: "tech:frontend:react",
        label: "My App"
      }
    }
  ]
}
```

**Features**:
- Automatic proposal validation via `ValidateProposalUseCase`
- Automatic application via `ApplyProposalUseCase`
- Automatic save after every change via `GraphStorage`
- Errors are self-correcting: rejections embed the valid values (e.g. the full list of `typeId`s for the active preset, or the existing node/edge ids) so an agent can retry with a correct call instead of guessing.

#### `api/http-server.ts`
**Role**: HTTP REST server for the web frontend.

**Port**: 3000 (configurable)

**Endpoints**:
- `GET /api/graph`: Returns the graph in React Flow format
- `GET /api/definitions`: Lists the available types
- `GET /health`: Server health check

**Key features**:
- **Auto-reload**: Watches the `graph.json` file via `fs.watch()`
- When the file changes, automatically reloads the graph
- Transforms the data for React Flow (compatible format)

**CORS**: Configured to accept `http://localhost:5173`

#### `persistence/graph-storage.ts`
**Role**: Manages graph persistence to disk.

**File**: `.nodalis/graph.json`

**Methods**:
- `load(graph)`: Loads the graph from the file
  - **IMPORTANT**: Clears the graph before loading (avoids duplicates)
- `save(graph)`: Saves the graph to the file
- `clear()`: Deletes the persistence file

**File format**:
```json
{
  "nodes": [...],
  "edges": [...],
  "savedAt": "2026-02-05T18:00:00.000Z"
}
```

#### `file-system/definition-loader.ts`
**Role**: Loads type definitions from the filesystem.

**Features**:
- Reads all `.def.json` files from a directory
- Parses and validates the JSON
- Supports hot-reload via `fs.watch()`

---

### Errors (`src/errors/`)

#### `base-error.ts`
Base class for all custom errors.

#### `definition-not-found-error.ts`
Thrown when a node type does not exist.

#### `rule-violation-error.ts`
Thrown when a validation rule is violated.

#### `schema-validation-error.ts`
Thrown when data does not match the expected schema.

---

## Definitions (`/definitions`)

`*.def.json` files defining node types, **organized by category**:
`ai/`, `auth/`, `backend/`, `bpmn/`, `cloud/`, `cloudflare/`, `database/`, `ddd/`,
`devops/`, `erd/`, `game/`, `general/`, `messaging/`, `monitoring/`, `network/`,
`storage/`, `uml/`, `web/`. The Core stays agnostic: it loads whatever the
active **preset** designates.

### Presets (`/definitions/presets/*.preset.json`)

A preset decides *which* folders to load + the active **rules** + **`edgeTypes`**.
Shipped presets:
- **Technical**: `web`, `mobile`, `cloud-native`, `microservices`, `ai-ml`, `game`, `full`.
- **Modeling**: `erd`, `ddd`, `bpmn`, `uml`, `network`.

**Definition structure**:
```json
{
  "typeId": "tech:database:postgres",
  "version": "1.0.0",
  "metadata": { "label": "PostgreSQL", "category": "Storage" },
  "behavior": {
    "maxIncomingEdges": null,
    "maxOutgoingEdges": 0,
    "allowConnectionFrom": ["tech:service:*"]
  },
  "style": { "shape": "cylinder", "backgroundColor": "#336791", "icon": "database" },
  "dataSchema": { "type": "object", "required": ["port"], "properties": { "port": { "type": "number", "default": 5432 } } },
  "render": { "archetype": "record" }
}
```

---

## Web Frontend (`/web`)

### `src/main.tsx`
React entry point. Mounts the application on the DOM.

### `src/App.tsx`
Root component of the application. Contains the `GraphCanvas`.

### `src/components/GraphCanvas.tsx`
**Role**: Main graph visualization component.

**Features**:
- Uses **React Flow** to render the graph
- Polls the HTTP server every 2 seconds
- **Paradigm-aware auto-layout** with **ELK.js** — the algorithm, flow direction and edge routing are chosen based on the active preset (see `src/lib/layout.ts`)
- Real node sizes (`estimateNodeSize`) passed to ELK ⇒ variable-height records never overlap
- Handles follow the flow axis (left→right for BPMN/ERD/DDD, top→down for UML)

**Layout profiles** (`src/lib/layout.ts`):
| Preset | Algorithm | Direction | Routing |
|--------|-----------|-----------|---------|
| `erd` | layered (network-simplex) | RIGHT | orthogonal, wide spacing |
| `uml` | layered | DOWN (legacy) | orthogonal |
| `bpmn` | layered | RIGHT (sequence flow) | orthogonal, compact |
| `ddd` | layered | RIGHT (EventStorming timeline) | orthogonal |
| `network` | **stress** (organic) | — | polyline |
| default | layered | DOWN | orthogonal |

### `src/components/UniversalNode.tsx` + `src/components/nodes/`
**Role**: Paradigm-aware rendering dispatcher. `UniversalNode` remains the only `nodeType` registered with React Flow, but it no longer draws anything itself: it reads `data.render.archetype` (forwarded as-is by the Core) and delegates to the matching generic renderer. No paradigm logic is wired here — the archetype is **data**, so an ERD table, a UML class and a BPMN gateway all flow through this one component while still rendering authentically.

**Rendering archetypes** (`src/components/nodes/`):
- **`RecordNode`** — titled box with row compartments: ERD table (columns + PK 🔑 / FK 🔗 badges), UML class (Attributes / Methods compartments, `+/-/#` visibility carried by the row text), DDD entity/aggregate.
- **`ShapeNode`** — pure BPMN/flowchart geometry: event (thin circle=start / thick=end / double ring=intermediate), task (rounded rect + type icon in the corner), gateway (diamond + `× / + / ○` glyph), data-object.
- **`DeviceNode`** — large centered icon + label below: network equipment (router / switch / firewall / server / cloud), infra.
- **`BoxNode`** — legacy rendering (colored shape + icon + label), fallback when a definition declares no `render` (backward-compatible; also fits DDD EventStorming sticky notes: event/command/saga).
- **`shared.tsx`** — shared helpers: `NodeFrame` (handles + sub-graph badge), row/badge parsing (`toRows`), and `estimateNodeSize()` — deterministic size per archetype, **reused by ELK** in `GraphCanvas` so variable-height nodes (records) never overlap.

The `render` descriptor is optional, defined in each `*.def.json`, validated by Zod in the Core (`RenderSpecSchema`) and then forwarded as opaque data: **the Core never branches on `archetype`** (full agnosticism). ERD edges use **crow's-foot** notation (`cf-one`, `cf-many`, `cf-one-mandatory`, …) declared in `MarkerDefs` (`RelationEdge.tsx`) and picked via the preset's `edgeTypes`.

**`container` archetype + nesting**: nodes can carry a `parentId` (`NodeSchema`, Core) and are then rendered *inside* a `container` node (BPMN pool, DDD bounded-context, UML package) via React Flow's `parentId`/`extent:'parent'`. Nested layout is handled by `layoutNested` (`src/lib/elk.ts`), which builds an ELK tree — ELK returns child coordinates relative to the parent, exactly what React Flow expects.

**Per-node interactions**:
- `RecordNode`: inline editing (double-click title/row), ＋ add row, collapsible compartments, color-coded type pills (`typeColor`), PK/FK/unique/index badges, italics + "stereotype" for UML abstract, hovering an FK → highlights incident edges.
- `ShapeNode`: task-type icon (user/service/script/manual), typed events (message/timer/error), `[+]` sub-process marker.
- `DeviceNode`: up/down status dot, IP/CIDR subtitle.
- `BoxNode`: DDD EventStorming palette + auto-contrasted text color (`readableText`).

**Edge editing**: cardinality label rendered via `EdgeLabelRenderer`; right-click on an edge → relation-change menu (`onEdgeContextMenu`).

**Design system & theme**: CSS tokens (`src/lib/theme.ts` + `index.css` variables), **dark mode** via `data-theme` driven by `useUiStore`. UI stores: `useUiStore` (theme, Cmd-K, hover), `useToastStore` (toasts tied to the Core's `ApiError`s).

**Advanced auto-layout** (`GraphCanvas`):
- **incremental** placement (only new nodes are placed, near a connected neighbor),
- toolbar: toggle direction ↓/→, choose ELK algorithm (`layered`/`stress`/`mrtree`/`radial`/`force`), Fit, Auto-layout,
- CSS position animation on re-layout (`.archi-animate` class), `fitView` + focus on the selected node,
- **actually measured** sizes (`node.measured`) passed to ELK for pixel-accurate layout.

**Overall UX**: palette with a **live preview** of the actual rendering + **drag-and-drop** on the canvas, `NodeInspector` with table editing (columns/attributes), **command palette** ⌘K (`CommandPalette`), toasts (`Toaster`), keyboard shortcuts (F=fit, Shift+L=layout, Esc, Delete), empty state, minimap colored by paradigm, highlighting of the path impacted by an AI proposal. `GraphCanvas` (React Flow + ELK) is **code-split** (`React.lazy`): the initial chunk drops from ~2.6 MB to ~234 KB.

### `src/stores/useGraphStore.ts`
**Role**: Zustand store managing graph state on the frontend.

**State**:
```typescript
{
  nodes: Node[]        // React Flow nodes
  edges: Edge[]        // React Flow edges
  fetchGraph: () => Promise<void>
}
```

**Features**:
- Fetches data from `http://localhost:3000/api/graph`
- Transforms the data for React Flow
- Handles fetch errors

---

## CLI (`/cli`)

Package `@nodalis/cli`: the **single home** for "install / launch / configure MCP" logic. The VSCode extension (`extension/`) wraps it without duplicating this layer; Docker is a runtime target (`--docker`), not a competing product.

To be reusable outside the bin, pure modules are exposed via the package's `exports` map: `@nodalis/cli/lib/*` (JS + `.d.ts`, **no** shebang — only `dist/index.js` carries the `#!/usr/bin/env node`). The `tsup` build is split in two (bin with shebang banner / lib without).

### Commands (`src/commands/`)
- `init`: writes/merges the MCP config for the client(s), idempotent + reversible + backup. Writes `.nodalis/cli.json`.
- `doctor`: diagnostics (Node ≥ 20, core built, MCP config present, preferred port free, live processes, log tail).
- `up`: launches core (HTTP) detached + a static server for `web/dist`. Health-check racing against the child dying, incremental registry. `--docker` delegates to `docker compose`.
- `down`: stops per `run.json` (`native` → signed kill; `docker` → `docker compose down`).
- `uninstall`: `down` then surgically removes the `nodalis` key from client configs (reversible).

### Pure modules (`src/lib/`)
- `mcp-config.ts`: **surgical** JSONC merge/unmerge (`jsonc-parser` `modify`/`applyEdits`) — preserves the user's comments and neighboring servers. Parameterized key (`mcpServers` for Cursor/Claude, `servers` + `type:stdio` for VSCode).
- `paths.ts`: OS-aware client descriptors (`process.platform`) + detection of installed clients.
- `ports.ts`: `findFreePort` (fallback), `waitForHealth` (poll `/health`, cancellable via `signal`).
- `process.ts`: **bimodal** spawn (`detached` for the CLI / `attached` reserved for the extension), `run.json` registry with an anti-PID-reuse **signature**, portable kill (`taskkill` on Windows / `SIGTERM→SIGKILL`).
- `static-server.ts`: zero-dependency SPA server, **confined** (anti path-traversal), bound to `127.0.0.1`, runtime injection of `window.__NODALIS__` (resolves the dynamic port on the web side without a rebuild).

### State files (under `.nodalis/`)
- `.nodalis/cli.json`: user config (**preferred** ports, configured clients). Zod-validated.
- `.nodalis/cli/run.json`: **actual** ports/PID after fallback; source of truth for `down`. The web injection reads this file.
- `.nodalis/cli/logs/{core,web}.log`: output of the detached processes.

---

## VSCode Extension (`/extension`)

Package `nodalis` (esbuild bundle → CommonJS → `.vsix`). **Thin wrapper** around `@nodalis/cli`: imports `lib/process` (spawns `attached` — children die on `deactivate`), `lib/static-server`, `lib/ports` and `lib/mcp-config`. No install/launch/MCP logic is duplicated. The Zod schema is only consumed via `@nodalis/core/schema` (`DefinitionSchema`) — never the `@nodalis/core` root (which bundles Fastify + MCP).

### Modules (`src/`)
- `extension.ts`: `activate()` registers **all** commands first (registration never depends on optional UI wiring), then wires up the statusbar/tree/diagnostics best-effort, then `bootstrapFirstRun()`.
- `config.ts`: resolves the active workspace root + ports + the `nodalis.autostart` and `nodalis.autoBootstrap` settings.
- `engine.ts`: `Engine.start()` collapses concurrent calls into a single `launch()` (memoized `startPromise`); `launch()` spawns core (`attached`) via `spawnManaged`, health-checks with `waitForHealth` (cancellable if the child dies), then serves `web/dist` in-process (`startStaticServer`). **Atomic start**: if the health-check or the web server fails, the core is rolled back (`stopEntry` + `this.core=null`) so `isLive()`/`coreBaseUrl()` stay honest. `stop()` tears everything down.
- `mcp.ts`: `configureMcp()` **composes** `buildEntry` + `mergeServer` and writes the **global** (user-level) config for **VSCode**, **Cursor** and **Claude Code** — idempotent merge + `.bak` backup.
- `statusbar.ts`: Live/Disconnected indicator + "rules reloaded" flash + theme.
- `webview/bridge.ts`: typed `postMessage` protocol (`ExtToWeb`/`WebToExt`) + guards (vscode-free, unit-tested).
- `webview/panel.ts`: webview panel, **strict CSP + nonce** (CSPRNG `randomBytes`), `asWebviewUri` asset rewriting, nonced injection of `window.__NODALIS__`; `connect-src` built with the real core port.
- `diagnostics-core.ts`: pure mapping from a Zod issue to a position (offset→line via `jsonc-parser`), vscode-free, tested. `diagnostics.ts`: `onDidSave` shell on `definitions/**/*.def.json` → Problems + callback if clean.
- `versioning/api.ts`: typed `fetch` client for the 3 core routes. `versioning/tree.ts`: `TreeDataProvider` for the Versions panel + snapshot/restore commands.

### Deliverable #1 — Versioning
TreeView wired to the core routes `GET /api/versions`, `POST /api/snapshot`, `POST /api/versions/:id/restore` (restore **persists** the graph to the on-disk SSOT so both the web poll AND the MCP process see it). `onDidSave` diagnostics for `*.def.json`, validated via `@nodalis/core/schema`.

### First-run bootstrap & UI (activity bar)
- **`nodalis.versions` view** ("Nodalis" activity bar): header **Start / Open / Stop** buttons (+ snapshot/refresh) via `menus.view/title`, and a `viewsWelcome` showing **Start Runtime** / **Open Panel** buttons when the runtime is stopped.
- **`bootstrapFirstRun()`**: on a Nodalis workspace (presence of `.nodalis/` **or** `definitions/`) and if `nodalis.autoBootstrap` (default `true`), chains `configureMcp` → `start` → `open`. Separate `globalState` flags: `mcpConfigured` (global, written once) and `bootstrapped:<workspaceRoot>` (per workspace, set **after** success so it retries on the next launch). Never acts on a non-Nodalis folder (side-effect free).

### Packaging (standalone)
`esbuild.mjs` produces a **standalone** `.vsix` — no clone/build of the repo needed on the user's side:
1. `web/dist` → `extension/web-dist` (cleaned before copy);
2. `core/dist/index.js` → `extension/core-bundle/index.cjs`: a **single-file** esbuild bundle (fastify/pino/chokidar/zod inlined, no `node_modules`) spawned by the `engine` as a child process;
3. `definitions/` → `extension/definitions`: default rules so an empty workspace has types;
4. bundle of `src/extension.ts` (`external: ['vscode']`).

`engine.start(ctx, extensionPath)` launches the bundled core (`core-bundle/index.cjs`, env `WORKSPACE_ROOT` = the opened folder, `DEFINITIONS_PATH` = `<bundled>` then, if present, `<workspace>/definitions` — a **multi-root list** separated by `path.delimiter`, the workspace root overlaying the bundled one — override by `typeId`/preset id) and serves `web-dist` in-process. `vsce package --no-dependencies` produces `nodalis-<version>.vsix` (`dist/extension.js`, `core-bundle/`, `web-dist/`, `definitions/`, `media/icon.svg`). Core CORS is widened to the `vscode-webview://` origin.

---

## Data flows

### Creating a node via AI

```
1. AI → propose_changes → MCP Server
2. MCP Server → ValidateProposalUseCase → checks the format
3. MCP Server → ApplyProposalUseCase → mutates the Graph
4. MCP Server → GraphStorage.save() → writes graph.json
5. HTTP Server (fs.watch) → detects the change → GraphStorage.load()
6. Frontend (polling) → GET /api/graph → receives the new nodes
7. Frontend → renders the updated graph
```

### Deleting a node via AI

```
1. AI → propose_changes (delete_node) → MCP Server
2. MCP Server → Graph.removeNode() + Graph.removeEdge() (associated edges)
3. MCP Server → GraphStorage.save()
4. HTTP Server → automatic reload
5. Frontend → renders the updated graph
```

---

## Configuration

### Environment variables

#### Core Backend
- `NODE_ENV`: Runtime mode (`development` | `production`)
- `WORKSPACE_ROOT`: Project root (required)
- `DEFINITIONS_PATH`: Path(s) to the definitions (default: `./definitions`). Accepts **multiple roots** separated by `path.delimiter` (`:`/`;`); later roots overlay earlier ones (override by `typeId`/preset id)
- `RUN_HTTP_SERVER`: Runs the HTTP server instead of MCP (`true` | `false`)
- `WORKSPACE_BROWSE_ROOT`: Allowed root for opening/creating workspaces (default: home) — bounds the file browser and workspace creation
- `HTTP_HOST`: Listen interface for the HTTP server (default: **`127.0.0.1`**)

> **Security — loopback bind.** The HTTP API is **unauthenticated** and exposes
> the file browser (`/api/fs/list`) and workspace creation. It therefore
> listens on `127.0.0.1` by default (never the LAN). Only the Docker
> container sets `HTTP_HOST=0.0.0.0` (the port is explicitly published).
> Sub-graph ids passed in paths are validated as UUIDs (anti-traversal).

#### MCP Configuration (`~/.config/Code/User/mcp.json`)
```json
{
  "mcpServers": {
    "nodalis": {
      "command": "node",
      "args": ["/path/to/core/dist/index.js"],
      "env": {
        "NODE_ENV": "development",
        "WORKSPACE_ROOT": "/path/to/nodalis",
        "DEFINITIONS_PATH": "/path/to/definitions"
      }
    }
  }
}
```

---

## Problems solved

### 1. MCP ↔ HTTP Server sync
**Problem**: The HTTP server didn't see changes made by the MCP server.

**Cause**: Two `Graph` instances in memory, no synchronization.

**Solution**: Added `fs.watch()` in the HTTP server to reload the graph when `graph.json` changes.

### 2. Node duplication on reload
**Problem**: After a reload, nodes were appended instead of replaced.

**Cause**: `GraphStorage.load()` added nodes without clearing the graph first.

**Solution**: Added `graph.clear()` at the start of `load()`.

### 3. Proposal format
**Problem**: AIs kept forgetting to set UUIDs.

**Solution**: Detailed documentation in the MCP tool description with concrete examples and critical rules.

---

## Development scripts

### Root (`/`)
```bash
npm run dev          # Runs MCP + HTTP + Frontend in parallel
npm run dev:http     # Runs only the HTTP server
npm run dev:web      # Runs only the frontend
```

### Core (`/core`)
```bash
npm run dev          # Runs the server in watch mode (tsx)
npm run build        # Compiles TypeScript → dist/
npm test             # Runs the tests
```

### Web (`/web`)
```bash
npm run dev          # Runs the Vite dev server (port 5173)
npm run build        # Production build
npm run preview      # Preview the build
```

---

## Technologies used

### Backend
- **TypeScript**: Main language
- **Node.js**: Runtime
- **@modelcontextprotocol/sdk**: MCP SDK
- **Fastify**: HTTP framework
- **tsx**: TypeScript execution in dev

### Frontend
- **React 19**: UI framework
- **Vite**: Build tool and dev server
- **@xyflow/react** (React Flow): Graph library
- **ELK.js**: Auto-layout algorithm
- **Zustand**: State management
- **TailwindCSS**: CSS framework

---

## Paradigms, Edge Types & Sub-graphs (drill-down)

> This section details the multi-paradigm / multi-graph model (presets,
> `edgeTypes`, sub-graphs) that extends the foundation described above.

### Paradigms = presets (an extended "subset" mechanism)
A workspace (or a sub-graph) carries a **preset** that decides *which*
definition folders to load AND the active **rules** + **relation types**.
The shipped presets cover two families:
- **Technical**: `web`, `mobile`, `cloud-native`, `microservices`, `ai-ml`, `game`, `full`.
- **Modeling** (structurally different paradigms): `erd` (entity-relationship),
  `ddd` (Domain-Driven Design), `bpmn` (business process), `uml` (class diagram),
  `network` (network topology).

Each paradigm has its own definitions folder (`definitions/erd/`, `ddd/`, …) and
its own `*.preset.json`. The Core stays **agnostic**: no hardcoded domain logic.

### Preset rules (`PresetRulesSchema` in `domain/types.ts`)
Enforced by `RuleEngine`. Blocking (checked on every operation):
`forbiddenConnections`, `allowedConnectionsOnly`, `forbiddenTypes`, `maxNodesPerType`,
`maxDepth`, `noCycles`, `defaultMaxInputs/Outputs`. Advisory (via
`validateGraphIntegrity`, exposed by `GET /api/graph/validate` and the MCP tool
`validate_graph`): `requiredTypes`, `requiredConnections`.

### Edge Types (semantic relations)
A preset can declare `edgeTypes`: the list of possible relations on edges
(e.g. UML `extends`/`composes`, ERD `1:N`). Each relation carries a `style`
(stroke, dashes, animation, **markers** `markerStart`/`markerEnd`). An edge
(`Edge.type`) must match an `edgeType` of the active preset (otherwise
`ERR_EDGE_TYPE_UNKNOWN`). The frontend (`RelationEdge.tsx` + `MarkerDefs`)
renders these relations with SVG markers (hollow UML triangle, composition
diamond, etc.) that inherit color via `context-stroke`.

### Sub-graphs (drill-down)
A node can own a **nested sub-graph** with its **own preset** (e.g. a
"Database" node in a `web` graph opens an `erd` sub-graph).
- **Storage**: `<workspace>/.nodalis/subgraphs/<nodeId>.graph.json` (contains
  `presetId`, `nodes`, `edges`). The parent node carries `subgraph: { presetId }`.
  Separate version history per graph (`versions/sub-<nodeId>.index.json`).
- **Active graph pointer**: `AppStateStore.activeGraphStack` (a stack shared
  cross-process MCP↔HTTP, reset on workspace change). Empty = root graph;
  each entry = one drill-down level (breadcrumb).
- **`WorkspaceManager.getActiveGraphContext()`** resolves the file to
  read/write and the **effective preset** (auto-heals back to root if the
  sub-graph file has disappeared). `GraphStorage` and `PresetRegistry` key off
  this context → the whole anti-split-brain "reload-before-read" mechanism
  works as-is for sub-graphs too.

### HTTP routes added
`GET /api/edge-types`, `GET /api/graph/context`, `GET /api/graph/validate`,
`PUT /api/graph/active` (navigation stack), `POST /api/graph/nodes/:id/subgraph`.

### MCP tools added
`create_subgraph`, `open_graph` (root/<nodeId>), `validate_graph`. `get_graph`
now returns `activeGraph` (scope, preset, breadcrumb) and `nodesWithSubgraphs`.

---

## Next steps

1. **Authentication**: Secure the APIs
2. **WebSocket**: Replace polling with real-time updates
3. **Undo/Redo**: Change history (build on the existing snapshots)
4. **Exports**: Export the graph to various formats (PNG, SVG, JSON)
5. **Inter-graph links**: reference a node from another sub-graph
