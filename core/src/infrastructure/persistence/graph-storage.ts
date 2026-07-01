import * as fs from 'fs';
import * as path from 'path';
import { Graph } from '../../domain/graph.js';
import { GraphPersistenceError } from '../../errors/graph-persistence-error.js';
import { NoActiveWorkspaceError } from '../../errors/no-active-workspace-error.js';
import { WorkspaceManager } from '../workspace/workspace-manager.js';

const MAX_AUTO_SNAPSHOTS = 50;

export interface GraphVersion {
  id: string;
  label: string;
  createdAt: string;
  nodeCount: number;
  edgeCount: number;
  /** 'auto' = created on save, 'manual' = created by user/MCP */
  kind: 'auto' | 'manual';
}

interface StoredVersion extends GraphVersion {
  nodes: ReturnType<Graph['getAllNodes']>;
  edges: ReturnType<Graph['getAllEdges']>;
}

interface GraphFile {
  nodes: ReturnType<Graph['getAllNodes']>;
  edges: ReturnType<Graph['getAllEdges']>;
  savedAt: string;
  /** Present only for sub-graph files — preserves their own architecture preset. */
  presetId?: string;
}

/** Paths derived from the currently active graph context (root or sub-graph). */
interface ResolvedPaths {
  graphPath: string;
  versionsDir: string;
  indexPath: string;
  /** null = root graph; otherwise the owning node's id. */
  subgraphId: string | null;
  /** Effective preset id of the active graph (persisted for sub-graphs). */
  presetId: string;
}

/**
 * Persists the graph for the *currently active workspace*. Paths are resolved on
 * every call from the {@link WorkspaceManager}, so switching workspace (which
 * changes the active path) is picked up automatically by {@link loadIfChanged}.
 */
export class GraphStorage {
  /** Path + mtime this instance last synced with — drives reload-before-read. */
  private lastSyncedPath: string | null = null;
  private lastSyncedMtimeMs = 0;

  constructor(private readonly workspaces: WorkspaceManager) {}

  /** Active workspace's graph.json path, or '' when no workspace is open. */
  get storagePath(): string {
    return this.activePaths()?.graphPath ?? '';
  }

  // ─── Core Load / Save ─────────────────────────────────────────────────────

  load(graph: Graph): void {
    graph.clear();

    const paths = this.activePaths();
    this.lastSyncedPath = paths?.graphPath ?? null;
    this.lastSyncedMtimeMs = paths ? this.currentMtimeMs(paths.graphPath) : 0;

    if (!paths) {
      console.error('📂 No active workspace — graph is empty');
      return;
    }
    if (!fs.existsSync(paths.graphPath)) {
      console.error('📂 No persisted graph found, starting fresh');
      return;
    }

    try {
      const raw = fs.readFileSync(paths.graphPath, 'utf-8');
      const data = JSON.parse(raw) as GraphFile;

      for (const node of data.nodes ?? []) graph.addNode(node);

      // Purge orphan edges — edges whose source or target no longer exists
      const nodeIds = new Set(graph.getAllNodes().map((n) => n.id));
      const validEdges = (data.edges ?? []).filter(
        (e) => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId)
      );
      const orphanCount = (data.edges?.length ?? 0) - validEdges.length;
      if (orphanCount > 0) {
        console.warn(`⚠️  Purged ${orphanCount} orphan edge(s) referencing missing nodes`);
      }
      for (const edge of validEdges) graph.addEdge(edge);

      console.error(`✅ Loaded graph: ${graph.getAllNodes().length} nodes, ${graph.getAllEdges().length} edges`);
    } catch (err) {
      console.error('❌ Failed to load graph:', err);
    }
  }

  /**
   * Reload the graph from disk only if the active workspace or the file changed
   * since this instance last synced. Implements "reload-before-read": keeps each
   * process consistent with the on-disk SSOT and makes workspace switches
   * transparent, without paying a full clear+reload on every call.
   *
   * @returns true if a reload happened, false if the in-memory graph was already current.
   */
  loadIfChanged(graph: Graph): boolean {
    const paths = this.activePaths();
    const currentPath = paths?.graphPath ?? null;
    const mtime = currentPath ? this.currentMtimeMs(currentPath) : 0;

    if (currentPath === this.lastSyncedPath && mtime === this.lastSyncedMtimeMs) return false;
    this.load(graph);
    return true;
  }

  /**
   * Persist the current graph and append an auto snapshot to version history.
   * Atomic write (temp file + rename) + throws {@link GraphPersistenceError} on
   * failure so callers never report success for an unsaved graph.
   */
  save(graph: Graph): void {
    const paths = this.requirePaths();
    const nodes = graph.getAllNodes();
    const edges = graph.getAllEdges();
    const savedAt = new Date().toISOString();
    const tmpPath = `${paths.graphPath}.${process.pid}.tmp`;

    try {
      this.ensureDir(path.dirname(paths.graphPath));
      // Sub-graph files carry their own preset; the root graph does not.
      const data: GraphFile = paths.subgraphId
        ? { presetId: paths.presetId, nodes, edges, savedAt }
        : { nodes, edges, savedAt };
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmpPath, paths.graphPath);
      this.lastSyncedPath = paths.graphPath;
      this.lastSyncedMtimeMs = this.currentMtimeMs(paths.graphPath);
      console.error(`💾 Graph saved: ${nodes.length} nodes, ${edges.length} edges`);
    } catch (err) {
      this.safeUnlink(tmpPath);
      console.error('❌ Failed to save graph:', err);
      throw new GraphPersistenceError(
        `Failed to persist graph to ${paths.graphPath}`,
        { cause: (err as Error).message }
      );
    }

    // Snapshots are best-effort: a snapshot failure must not fail the primary save.
    try {
      this.appendAutoSnapshot(paths, nodes, edges, savedAt);
    } catch (err) {
      console.error('⚠️  Failed to append auto snapshot:', err);
    }
  }

  // ─── Versioning ───────────────────────────────────────────────────────────

  /** Manually create a named snapshot of the current graph. */
  createSnapshot(graph: Graph, label: string): GraphVersion {
    const paths = this.requirePaths();
    const nodes = graph.getAllNodes();
    const edges = graph.getAllEdges();
    const version = this.writeVersion(paths, { nodes, edges, label, kind: 'manual' });
    console.error(`📸 Snapshot created: "${label}" (${version.id})`);
    return version;
  }

  /** List all versions from the index (metadata only, no payload). */
  listVersions(): GraphVersion[] {
    const paths = this.activePaths();
    if (!paths) return [];
    return this.readIndex(paths.indexPath).map(({ nodes: _n, edges: _e, ...meta }) => meta);
  }

  /**
   * Restore the graph to a saved version.
   * Returns false if the versionId is not found.
   */
  restoreVersion(versionId: string, graph: Graph): boolean {
    const paths = this.requirePaths();
    const index = this.readIndex(paths.indexPath);
    const version = index.find((v) => v.id === versionId);
    if (!version) return false;

    graph.clear();
    for (const node of version.nodes) graph.addNode(node);
    for (const edge of version.edges) graph.addEdge(edge);

    console.error(`⏪ Restored to version ${versionId} ("${version.label}")`);
    return true;
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private activePaths(): ResolvedPaths | null {
    const ctx = this.workspaces.getActiveGraphContext();
    const p = this.workspaces.getActivePaths();
    if (!ctx || !p) return null;
    // Each graph keeps its own version history (root vs each sub-graph).
    const indexName = ctx.subgraphId ? `sub-${ctx.subgraphId}.index.json` : 'index.json';
    return {
      graphPath: ctx.graphPath,
      versionsDir: p.versionsDir,
      indexPath: path.join(p.versionsDir, indexName),
      subgraphId: ctx.subgraphId,
      presetId: ctx.presetId,
    };
  }

  private requirePaths(): ResolvedPaths {
    const paths = this.activePaths();
    if (!paths) throw new NoActiveWorkspaceError();
    return paths;
  }

  private appendAutoSnapshot(
    paths: ResolvedPaths,
    nodes: ReturnType<Graph['getAllNodes']>,
    edges: ReturnType<Graph['getAllEdges']>,
    savedAt: string
  ): void {
    const index = this.readIndex(paths.indexPath);

    const version: StoredVersion = {
      id: this.generateId(),
      label: `auto-${savedAt}`,
      createdAt: savedAt,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      kind: 'auto',
      nodes,
      edges,
    };

    index.push(version);

    // Prune oldest auto snapshots, keep all manual ones
    const autoVersions = index.filter((v) => v.kind === 'auto');
    if (autoVersions.length > MAX_AUTO_SNAPSHOTS) {
      const toRemove = new Set(
        autoVersions.slice(0, autoVersions.length - MAX_AUTO_SNAPSHOTS).map((v) => v.id)
      );
      const pruned = index.filter((v) => !toRemove.has(v.id));
      this.writeIndex(paths, pruned);
    } else {
      this.writeIndex(paths, index);
    }
  }

  private writeVersion(paths: ResolvedPaths, opts: {
    nodes: ReturnType<Graph['getAllNodes']>;
    edges: ReturnType<Graph['getAllEdges']>;
    label: string;
    kind: 'auto' | 'manual';
  }): GraphVersion {
    const createdAt = new Date().toISOString();
    const version: StoredVersion = {
      id: this.generateId(),
      label: opts.label,
      createdAt,
      nodeCount: opts.nodes.length,
      edgeCount: opts.edges.length,
      kind: opts.kind,
      nodes: opts.nodes,
      edges: opts.edges,
    };

    const index = this.readIndex(paths.indexPath);
    index.push(version);
    this.writeIndex(paths, index);

    return { id: version.id, label: version.label, createdAt, nodeCount: version.nodeCount, edgeCount: version.edgeCount, kind: version.kind };
  }

  private readIndex(indexPath: string): StoredVersion[] {
    if (!fs.existsSync(indexPath)) return [];
    try {
      return JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as StoredVersion[];
    } catch {
      return [];
    }
  }

  private writeIndex(paths: ResolvedPaths, index: StoredVersion[]): void {
    this.ensureDir(paths.versionsDir);
    fs.writeFileSync(paths.indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  private generateId(): string {
    return crypto.randomUUID();
  }

  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }

  /** mtime of a file in ms, or 0 when it does not exist. */
  private currentMtimeMs(filePath: string): number {
    try {
      return fs.statSync(filePath).mtimeMs;
    } catch {
      return 0;
    }
  }

  private safeUnlink(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      /* ignore cleanup failures */
    }
  }
}
