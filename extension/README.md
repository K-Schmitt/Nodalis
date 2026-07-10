# Nodalis for VSCode

Model, version, and validate semantic architecture graphs — right inside VSCode or Cursor.

Nodalis is an agnostic "meta-modeler": the rules live in `.def.json` definition files, the graph is rendered with React Flow, and an MCP server lets AI assistants propose changes transactionally. This extension bundles the whole runtime — **install it and go, no repo clone, no build, no Node install**.

## Features

- **Graph in a webview** — `Nodalis: Open` renders your architecture graph (React Flow) with a strict CSP.
- **One-click runtime** — `Nodalis: Start Runtime` boots the bundled core (Fastify HTTP API) under the editor's own Node; a status-bar item shows **Live**.
- **Versioning** — a **Versions** view in the activity bar: snapshot the current graph, browse versions, and restore any of them (restore is persisted to disk).
- **Live definition diagnostics** — save a `definitions/**/*.def.json` and rule errors show up in the **Problems** panel, mapped to the exact line, validated against the Zod schema. A clean save refreshes the open graph instantly.
- **MCP wiring** — `Nodalis: Configure MCP` registers the bundled MCP server for **VSCode** (`.vscode/mcp.json`), **Cursor** (`.cursor/mcp.json`) and **Claude Code** (`.mcp.json`) so AI tools can drive the graph.

## Getting started

1. Install the extension (Marketplace, Open VSX, or a `.vsix` from the [releases](https://github.com/K-Schmitt/Nodalis/releases)).
2. Reload the window if prompted.
3. Open any folder as a workspace.
4. Command Palette (`Ctrl/Cmd+Shift+P`):
   - **Nodalis: Start Runtime** — status bar goes **Live**.
   - **Nodalis: Open** — the graph renders.

Definitions come from a `definitions/` folder in your workspace when present; otherwise the extension's bundled default rule set is used.

## Commands

| Command | Description |
|---------|-------------|
| `Nodalis: Open` | Open the graph webview |
| `Nodalis: Start Runtime` / `Stop Runtime` | Boot / stop the bundled core |
| `Nodalis: Configure MCP` | Register the MCP server for VSCode, Cursor & Claude Code |
| `Nodalis: Create Snapshot` | Snapshot the current graph |
| `Nodalis: Refresh Versions` / `Restore Version` | Manage versions |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `archiOs.autostart` | `false` | Start the runtime automatically when a workspace opens |

## Requirements

- VSCode ≥ 1.80 or a recent Cursor. No separate Node.js install needed.

## Links

- Repository & docs: https://github.com/K-Schmitt/Nodalis
- Issues: https://github.com/K-Schmitt/Nodalis/issues

Licensed under MIT.
