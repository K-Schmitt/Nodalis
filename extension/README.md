# ARCHI-OS for VSCode

Model, version, and validate semantic architecture graphs — right inside VSCode or Cursor.

ARCHI-OS is an agnostic "meta-modeler": the rules live in `.def.json` definition files, the graph is rendered with React Flow, and an MCP server lets AI assistants propose changes transactionally. This extension bundles the whole runtime — **install it and go, no repo clone, no build, no Node install**.

## Features

- **Graph in a webview** — `ARCHI-OS: Open` renders your architecture graph (React Flow) with a strict CSP.
- **One-click runtime** — `ARCHI-OS: Start Runtime` boots the bundled core (Fastify HTTP API) under the editor's own Node; a status-bar item shows **Live**.
- **Versioning** — a **Versions** view in the activity bar: snapshot the current graph, browse versions, and restore any of them (restore is persisted to disk).
- **Live definition diagnostics** — save a `definitions/**/*.def.json` and rule errors show up in the **Problems** panel, mapped to the exact line, validated against the Zod schema. A clean save refreshes the open graph instantly.
- **MCP wiring** — `ARCHI-OS: Configure MCP` writes `.vscode/mcp.json` so AI tools can drive the graph.

## Getting started

1. Install the extension (Marketplace, Open VSX, or a `.vsix` from the [releases](https://github.com/K-Schmitt/Archi-Os/releases)).
2. Reload the window if prompted.
3. Open any folder as a workspace.
4. Command Palette (`Ctrl/Cmd+Shift+P`):
   - **ARCHI-OS: Start Runtime** — status bar goes **Live**.
   - **ARCHI-OS: Open** — the graph renders.

Definitions come from a `definitions/` folder in your workspace when present; otherwise the extension's bundled default rule set is used.

## Commands

| Command | Description |
|---------|-------------|
| `ARCHI-OS: Open` | Open the graph webview |
| `ARCHI-OS: Start Runtime` / `Stop Runtime` | Boot / stop the bundled core |
| `ARCHI-OS: Configure MCP` | Write `.vscode/mcp.json` |
| `ARCHI-OS: Create Snapshot` | Snapshot the current graph |
| `ARCHI-OS: Refresh Versions` / `Restore Version` | Manage versions |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `archiOs.autostart` | `false` | Start the runtime automatically when a workspace opens |

## Requirements

- VSCode ≥ 1.80 or a recent Cursor. No separate Node.js install needed.

## Links

- Repository & docs: https://github.com/K-Schmitt/Archi-Os
- Issues: https://github.com/K-Schmitt/Archi-Os/issues

Licensed under MIT.
