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
  // Sandbox the browse root to the temp dir so the temp workspace path is allowed.
  const workspaces = new WorkspaceManager(appState, wsDir);
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
