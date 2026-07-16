# 📘 Nodalis

**Agnostic semantic-graph engine — a rule-sheet-driven "meta-modeler".**

Stack: Node.js + Fastify · React 19 + React Flow · MCP · Zod. Distributed as the
**Nodalis** VSCode extension, as the `@nodalis/cli` CLI, or run from source.

> Repo: [K-Schmitt/Nodalis](https://github.com/K-Schmitt/Nodalis). For the
> file-by-file technical reference, see [ARCHITECTURE.en.md](ARCHITECTURE.en.md).
> 🇫🇷 [Lire en français](README.md).

---

## 🎯 Concept

Nodalis is like a game engine, but for software architecture: **empty at the
start**, it learns to model any domain as soon as it's fed **definition
sheets** (`*.def.json`), and it stops the AI from making mistakes.

Unlike Draw.io (generic) or Structurizr (specialized), the **Core is
agnostic**:

- It has no native notion of "API" or "Database".
- It ingests JSON sheets describing object types and their constraints.
- Once loaded, it dynamically generates tools for the AI (via MCP), turning a
  general-purpose LLM into a domain expert.

A single Core covers several **paradigms** (presets): technical (`web`,
`mobile`, `cloud-native`, `microservices`, `ai-ml`, `game`, `full`) and
modeling (`erd`, `ddd`, `bpmn`, `uml`, `network`).

---

## ⚙️ How it works

```
Input (definitions) → AI context (MCP) → Proposal → Validation → UI approval → Graph
```

1. **Input** — the Core scans `/definitions`, loads the `*.def.json` sheets into its **Registry** (memory).
2. **AI context** — the MCP server dynamically exposes the loaded types + constraints.
3. **Proposal** — the AI never mutates the graph directly: it submits a transactional **proposal**.
4. **Validation** — Zod pipeline (syntax) → semantic (existing IDs) → **Rule Engine** (forbidden connections, cycles, `dataSchema`).
5. **Approval** — `propose_changes` **blocks** until accept/reject in the web UI.

---

## 🚀 Usage

Three ways, from simplest to most manual.

### 1. VSCode / Cursor extension — *Nodalis* (recommended)

Install the extension (Marketplace, Open VSX, or a `.vsix` from
[releases](https://github.com/K-Schmitt/Nodalis/releases)). **Everything is
bundled**: no clone, no build, no external Node required.

- Open a working folder. On a Nodalis workspace (presence of `.nodalis/` or
  `definitions/`), the **first launch** configures MCP, starts the runtime and
  opens the panel automatically (configurable via `nodalis.autoBootstrap`).
- The **Nodalis** view (activity bar) provides **Start** / **Open** buttons and
  **version** management (snapshot / restore).

### 2. CLI — `@nodalis/cli`

```bash
npx @nodalis/cli init      # configure the AI client(s) MCP (idempotent, reversible)
npx @nodalis/cli up        # start core (HTTP) + static web server
npx @nodalis/cli doctor    # diagnostics (Node, build, MCP config, ports, process)
npx @nodalis/cli down      # stop the launched processes
```

### 3. From source (development)

```bash
git clone https://github.com/K-Schmitt/Nodalis.git nodalis && cd nodalis
npm run install:all         # root + workspace dependencies
npm run build                # compile core/dist + web/dist
npm run dev                  # HTTP :3000 + Web :5173 (approval + editing UI)
```

Open `http://localhost:5173`. Use `npm run dev:full` to also run the MCP server locally.

**Requirements**: Node ≥ 18 (20+ recommended), npm ≥ 9.

### Adding your own definitions

An extension (or CLI) user extends the types by dropping `*.def.json` sheets
into a `definitions/` folder at the root of their workspace:

1. Create `definitions/<category>/my-type.def.json` (schema: see example below).
2. Put the sheet in a category that the **active preset loads** — the
   `include` field of the `*.preset.json` (e.g. the `web` preset loads
   `general, web, backend, database, auth, monitoring, storage`). Otherwise,
   add the category to `include` or create your own preset in
   `definitions/presets/`.
3. Save → the core **hot-reloads** the definitions; the extension validates
   the file (Zod) in the **Problems** panel, mapped to the exact line, and
   refreshes the graph.

> ℹ️ **Merging**: the workspace's `definitions/` is **overlaid** on top of the
> bundled default set — you only need to drop your additions, the base types
> stay available. On a matching `typeId` (or preset id), **your workspace
> version wins**. (Technically: `DEFINITIONS_PATH` accepts multiple roots; the
> extension passes `<bundled>` then `<workspace>`, the rightmost root wins.)

---

## 🔌 MCP & Workspace configuration

### Two complementary processes

| Process | Launched by | Role |
|---|---|---|
| **MCP server** (stdio) | The AI client (Cursor / VSCode / Claude Code) via its MCP config | Exposes tools to the agent (see below) |
| **HTTP + Web server** | You (`npm run dev`, CLI `up`, or the extension) → :5173 | View the graph, **approve proposals**, edit with the mouse |

> Both communicate through the workspace's `.nodalis/` files.

### Workspaces ("open folder" model)

A **workspace = any folder** opened from the frontend (📁 picker) or by the
agent. Nodalis creates a memory folder `.nodalis/` there (graph, preset,
snapshots, sub-graphs, `notes.md`). The active workspace is remembered
(`~/.nodalis/state.json`) and **shared between the agent and the UI**.

### Declaring the MCP server manually

`nodalis init` (CLI) or `Nodalis: Configure MCP` (extension) write the config
automatically. Manually, the compiled MCP server is `core/dist/index.js`
(**rebuild after any Core change**: `npm run build:core`).

**VSCode**: portable file provided → [.vscode/mcp.json](.vscode/mcp.json) (uses `${workspaceFolder}`).

**Cursor / Claude Code** (`~/.cursor/mcp.json`, absolute paths):
```json
{ "mcpServers": { "nodalis": {
  "command": "node",
  "args": ["/ABSOLUTE/PATH/nodalis/core/dist/index.js"],
  "env": {
    "DEFINITIONS_PATH": "/ABSOLUTE/PATH/nodalis/definitions",
    "WORKSPACE_BROWSE_ROOT": "/home/<user>"
  }
} } }
```

| Env variable | Role | Default |
|---|---|---|
| `DEFINITIONS_PATH` | Folder of `*.def.json` / presets | `./definitions` (required outside the repo) |
| `WORKSPACE_BROWSE_ROOT` | Allowed root for opening/creating workspaces | user home |
| `NODALIS_STATE_DIR` | Where the active workspace is remembered | `~/.nodalis` |
| `RUN_HTTP_SERVER` | Run the HTTP server instead of MCP | `false` |
| `HTTP_HOST` | Listen interface for the HTTP server | `127.0.0.1` (loopback) |

> **Security**: the HTTP API is unauthenticated and exposes the file browser +
> workspace creation. It listens on `127.0.0.1` by default — only expose it on
> the network (`HTTP_HOST=0.0.0.0`) behind a trust boundary.

### Exposed MCP tools

The server contains **no hardcoded tools** — they reflect the active registry
and preset:

| Domain | Tools |
|---|---|
| Graph | `get_graph`, `propose_changes`, `validate_graph`, `clear_graph`, `list_types` |
| Presets & relations | `list_presets` |
| Sub-graphs | `create_subgraph`, `open_graph` |
| Workspaces | `list_workspaces`, `create_workspace`, `open_workspace`, `get_active_workspace`, `get_workspace_notes`, `append_workspace_note` |
| Versioning | `create_snapshot`, `list_versions`, `restore_version` |
| Proposals | `check_proposal_status` |

---

## 🏗️ Technical architecture (overview)

Full detail in [ARCHITECTURE.en.md](ARCHITECTURE.en.md).

- **Core (`/core`)** — Fastify + MCP. In-memory Registry (single source of
  truth for types), 3-level validation pipeline (Zod → semantic → **Rule
  Engine**: forbidden connections, cycle detection, `dataSchema`, presets),
  transactional Proposal System, disk persistence `.nodalis/graph.json`.
- **Web (`/web`)** — React 19 + React Flow, paradigm-aware **ELK.js**
  auto-layout, archetype-based node rendering (record/shape/device/box),
  nested sub-graphs, Zustand, TailwindCSS.
- **CLI (`/cli`)** — `@nodalis/cli`: the single home for install / launch / MCP
  config logic (`init`, `up`, `down`, `doctor`, `uninstall`). Pure modules
  reusable via `@nodalis/cli/lib/*`.
- **Extension (`/extension`)** — *Nodalis*: thin wrapper around the CLI,
  bundled into a standalone `.vsix` (core + web + definitions embedded).
  Versioning, `*.def.json` diagnostics, first-run bootstrap.

### Example definition sheet

`definitions/database/postgres.def.json`:

```json
{
  "typeId": "tech:database:postgres",
  "version": "1.0.0",
  "metadata": { "label": "PostgreSQL", "category": "Storage" },
  "behavior": {
    "maxIncomingEdges": null,
    "maxOutgoingEdges": 0,
    "allowConnectionFrom": ["tech:service:*", "tech:function:lambda"]
  },
  "style": { "shape": "cylinder", "backgroundColor": "#336791", "icon": "database" },
  "dataSchema": {
    "type": "object",
    "required": ["port"],
    "properties": { "port": { "type": "number", "default": 5432 } }
  }
}
```

---

## 📦 Data model

No SQL: strict JSON structures (Zod-validated), persisted as files.

| Object | Storage | Key fields |
|---|---|---|
| **Definition** (the type) | `/definitions/**/*.def.json` | `typeId`, `version`, `metadata`, `behavior`, `style`, `dataSchema`, `render` |
| **Preset** (paradigm) | `/definitions/presets/*.preset.json` | loaded folders, rules, `edgeTypes` |
| **Node** (instance) | `.nodalis/graph.json` | `id` (UUID v4), `typeId`, `position`, `data`, `parentId?`, `subgraph?` |
| **Edge** (relation) | `.nodalis/graph.json` | `id`, `source`, `target`, `type` (⊂ preset `edgeTypes`), `metadata` |
| **Sub-graph** | `.nodalis/subgraphs/<nodeId>.graph.json` | `presetId`, `nodes`, `edges` |

---

## 🚨 Error handling

Every proposal rejection returns a structured object:

```json
{
  "code": "ERR_RULE_VIOLATION",
  "message": "Database cannot connect to API",
  "details": {
    "source": "node-123 (tech:database:postgres)",
    "target": "node-456 (tech:api:rest)",
    "rule": "postgres.def.json:behavior.maxOutgoingEdges",
    "suggestion": "Reverse connection direction"
  }
}
```

| Code | Meaning | Action |
|---|---|---|
| `ERR_SYNTAX` | Invalid JSON | Fix the syntax |
| `ERR_RULE_VIOLATION` | Business constraint violated | See `details.rule` |
| `ERR_CYCLE_DETECTED` | Cycle in the graph | Remove an edge |
| `ERR_TYPE_NOT_FOUND` | `typeId` does not exist | Load the missing definition |
| `ERR_EDGE_TYPE_UNKNOWN` | Relation outside the active preset | Use a declared `edgeType` |

Custom errors on the Core side: `DefinitionNotFoundError`, `RuleViolationError`,
`SchemaValidationError`.

---

## 📂 Project structure

```
nodalis/
├── core/              # Fastify + MCP backend (domain / application / infrastructure)
├── web/               # React 19 + React Flow + ELK frontend
├── cli/               # @nodalis/cli — install / launch / MCP config
├── extension/         # "Nodalis" VSCode extension (standalone .vsix bundle)
├── definitions/       # *.def.json sheets (by category) + presets/
├── .nodalis/            # Persisted workspace data (graph.json, snapshots, …)
├── docker-compose.yml # + Dockerfile.core / Dockerfile.web
├── ARCHITECTURE.en.md # Detailed technical reference (English)
├── ARCHITECTURE.md    # Detailed technical reference (French)
└── README.md          # This file, in French
```

---

## 📝 License

MIT
