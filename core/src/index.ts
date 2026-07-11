import { Registry } from './domain/registry.js';
import { PidManager } from './infrastructure/pid-manager.js';
import { Graph } from './domain/graph.js';
import { RuleEngine } from './domain/rule-engine.js';
import { ProposalStore } from './domain/proposal-store.js';
import { DefinitionLoader } from './infrastructure/file-system/definition-loader.js';
import { PresetLoader } from './infrastructure/file-system/preset-loader.js';
import { PresetRegistry } from './infrastructure/registry/preset-registry.js';
import { MCPServer } from './infrastructure/mcp/mcp-server.js';
import { HTTPServer } from './infrastructure/api/http-server.js';
import { GraphStorage } from './infrastructure/persistence/graph-storage.js';
import { AppStateStore } from './infrastructure/persistence/app-state-store.js';
import { WorkspaceManager } from './infrastructure/workspace/workspace-manager.js';
import { existsSync } from 'fs';
import { basename, resolve } from 'path';

const runHttpServer = process.env.RUN_HTTP_SERVER === 'true';
// In MCP mode stdout is the JSON-RPC channel — all logging MUST go to stderr.
const log = runHttpServer
  ? (...args: unknown[]) => console.log(...args)
  : (...args: unknown[]) => console.error(...args);

/**
 * One-time migration: if a legacy repo-level `.archi/graph.json` exists and no
 * workspace is active, adopt that folder as a workspace so existing graphs keep
 * working under the new "open folder" model (without re-asking the user).
 */
function migrateLegacyWorkspace(workspaces: WorkspaceManager, workspaceRoot: string): void {
  if (workspaces.getActive() || workspaces.isInitialized(workspaceRoot)) return;
  if (!existsSync(resolve(workspaceRoot, '.archi/graph.json'))) return;
  try {
    workspaces.create(workspaceRoot, {
      name: basename(workspaceRoot) || 'Default',
      presetId: 'full',
      description: 'Migrated from legacy .archi/graph.json',
    });
    log(`🧭 Adopted existing graph as a workspace at ${workspaceRoot}`);
  } catch (err) {
    log(`⚠️  Legacy migration skipped: ${(err as Error).message}`);
  }
}

async function main() {
  log('🚀 Starting Nodalis Core...');

  const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();

  const appState   = new AppStateStore();
  const workspaces = new WorkspaceManager(appState);
  migrateLegacyWorkspace(workspaces, workspaceRoot);

  const registry      = new Registry();
  const graph         = new Graph();
  const proposalStore = new ProposalStore(() => workspaces.getActivePaths()?.proposalsPath ?? null);

  const graphStorage = new GraphStorage(workspaces);
  graphStorage.loadIfChanged(graph);

  const definitionsPath  = process.env.DEFINITIONS_PATH || './definitions';
  const definitionLoader = new DefinitionLoader(definitionsPath);
  const presetLoader     = new PresetLoader(definitionsPath);
  const ruleEngine       = new RuleEngine(registry, graph);

  // The registry is scoped to the active workspace's preset (subsets).
  const presetRegistry = new PresetRegistry(registry, ruleEngine, definitionLoader, presetLoader);
  presetRegistry.ensureForActiveWorkspace(workspaces);

  const active = workspaces.getActive();
  log(`✅ Nodalis ready — ${presetLoader.list().length} preset(s), ${registry.size()} types in scope`);
  log(active ? `📁 Active workspace: ${active.name} [${active.presetId}] (${active.path})` : '📁 No active workspace');

  if (runHttpServer) {
    const port = parseInt(process.env.PORT ?? '3000', 10);

    const pidManager = new PidManager(port, workspaceRoot);
    await pidManager.acquirePort();

    if (process.env.NODE_ENV !== 'production') {
      definitionLoader.watchChanges(() => {
        presetRegistry.reloadActive(workspaces);
        log('🔄 Definitions reloaded');
      });
    }

    const httpServer = new HTTPServer(graph, registry, graphStorage, proposalStore, workspaces, presetRegistry, ruleEngine);
    await httpServer.start(port);

    process.on('SIGINT', async () => {
      await httpServer.stop();
      process.exit(0);
    });
  } else {
    const mcpServer = new MCPServer(registry, graph, graphStorage, ruleEngine, proposalStore, workspaces, presetRegistry);

    if (process.env.NODE_ENV !== 'production') {
      definitionLoader.watchChanges(async () => {
        presetRegistry.reloadActive(workspaces);
        log('🔄 Definitions reloaded — notifying MCP clients');
        await mcpServer.notifyToolsChanged();
      });
    }

    await mcpServer.start();

    process.on('SIGINT', async () => {
      await mcpServer.stop();
      process.exit(0);
    });
  }
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
