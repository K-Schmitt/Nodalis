import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AppStateStore } from '../../src/infrastructure/persistence/app-state-store.js';
import { WorkspaceManager } from '../../src/infrastructure/workspace/workspace-manager.js';
import { WorkspacePathError } from '../../src/errors/workspace-path-error.js';
import { WorkspaceNotFoundError } from '../../src/errors/workspace-not-found-error.js';
import { NoActiveWorkspaceError } from '../../src/errors/no-active-workspace-error.js';

describe('WorkspaceManager', () => {
  let root: string;
  let workspaces: WorkspaceManager;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'archi-ws-'));
    const appState = new AppStateStore(path.join(root, '.state'));
    workspaces = new WorkspaceManager(appState, root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('has no active workspace initially', () => {
    expect(workspaces.getActive()).toBeNull();
    expect(() => workspaces.requireActive()).toThrow(NoActiveWorkspaceError);
  });

  it('creates a workspace, makes it active and writes the .nodalis memory folder', () => {
    const wsPath = path.join(root, 'proj1');
    const info = workspaces.create(wsPath, { name: 'Proj 1', presetId: 'web' });

    expect(info.name).toBe('Proj 1');
    expect(info.presetId).toBe('web');
    expect(workspaces.isInitialized(wsPath)).toBe(true);
    expect(fs.existsSync(path.join(wsPath, '.nodalis', 'workspace.json'))).toBe(true);
    expect(fs.existsSync(path.join(wsPath, '.nodalis', 'notes.md'))).toBe(true);
    expect(workspaces.getActive()?.path).toBe(path.resolve(wsPath));
  });

  it('refuses to create a workspace twice at the same path', () => {
    const wsPath = path.join(root, 'proj1');
    workspaces.create(wsPath, { name: 'Proj 1', presetId: 'web' });
    expect(() => workspaces.create(wsPath, { name: 'again', presetId: 'web' })).toThrow(WorkspacePathError);
  });

  it('does not clobber an existing graph.json on create (migration safety)', () => {
    const wsPath = path.join(root, 'legacy');
    fs.mkdirSync(path.join(wsPath, '.nodalis'), { recursive: true });
    fs.writeFileSync(
      path.join(wsPath, '.nodalis', 'graph.json'),
      JSON.stringify({ nodes: [{ id: 'keep' }], edges: [], savedAt: 'x' })
    );

    workspaces.create(wsPath, { name: 'Legacy', presetId: 'full' });
    const graph = JSON.parse(fs.readFileSync(path.join(wsPath, '.nodalis', 'graph.json'), 'utf-8'));
    expect(graph.nodes).toHaveLength(1);
  });

  it('open() fails on a folder that is not a workspace', () => {
    const wsPath = path.join(root, 'not-a-ws');
    fs.mkdirSync(wsPath);
    expect(() => workspaces.open(wsPath)).toThrow(WorkspaceNotFoundError);
  });

  it('rejects paths outside the allowed browse root', () => {
    const outside = path.resolve(root, '..', 'archi-evil-target');
    expect(() => workspaces.create(outside, { name: 'evil', presetId: 'web' })).toThrow(WorkspacePathError);
  });

  it('persists workspace notes (agent memory)', () => {
    workspaces.create(path.join(root, 'proj1'), { name: 'Proj 1', presetId: 'web' });
    workspaces.appendNote('Decision: use REST');
    expect(workspaces.readNotes()).toContain('Decision: use REST');
  });

  it('lists only recents that still exist on disk', () => {
    const wsPath = path.join(root, 'proj1');
    workspaces.create(wsPath, { name: 'Proj 1', presetId: 'web' });
    expect(workspaces.list().recent.map((r) => r.path)).toContain(path.resolve(wsPath));

    fs.rmSync(wsPath, { recursive: true, force: true });
    expect(workspaces.list().recent).toHaveLength(0);
  });

  describe('sub-graphs (drill-down)', () => {
    const NODE = '11111111-1111-4111-8111-111111111111';

    beforeEach(() => {
      workspaces.create(path.join(root, 'proj'), { name: 'Proj', presetId: 'web' });
    });

    it('starts at the root graph with the workspace preset', () => {
      const ctx = workspaces.getActiveGraphContext()!;
      expect(ctx.subgraphId).toBeNull();
      expect(ctx.presetId).toBe('web');
      expect(ctx.breadcrumb).toHaveLength(0);
    });

    it('creates a sub-graph file with its own preset', () => {
      const preset = workspaces.createSubgraph(NODE, 'erd');
      expect(preset).toBe('erd');
      expect(workspaces.hasSubgraph(NODE)).toBe(true);
    });

    it('drills into a sub-graph, switching the effective preset', () => {
      workspaces.createSubgraph(NODE, 'erd');
      const ctx = workspaces.enterSubgraph(NODE, 'Main DB');
      expect(ctx.subgraphId).toBe(NODE);
      expect(ctx.presetId).toBe('erd');
      expect(workspaces.getEffectivePresetId()).toBe('erd');
      expect(ctx.breadcrumb).toEqual([{ id: NODE, label: 'Main DB' }]);
    });

    it('refuses to enter a node without a sub-graph', () => {
      expect(() => workspaces.enterSubgraph(NODE, 'x')).toThrow(WorkspacePathError);
    });

    it('returns to the root graph by emptying the stack', () => {
      workspaces.createSubgraph(NODE, 'erd');
      workspaces.enterSubgraph(NODE, 'Main DB');
      const ctx = workspaces.setGraphStack([]);
      expect(ctx.subgraphId).toBeNull();
      expect(ctx.presetId).toBe('web');
    });

    it('self-heals to root when the active sub-graph file is gone', () => {
      workspaces.createSubgraph(NODE, 'erd');
      workspaces.enterSubgraph(NODE, 'Main DB');
      fs.rmSync(workspaces.resolveSubgraphPath(path.join(root, 'proj'), NODE), { force: true });
      const ctx = workspaces.getActiveGraphContext()!;
      expect(ctx.subgraphId).toBeNull();
      expect(ctx.presetId).toBe('web');
    });
  });
});
