import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { WorkspaceMetaSchema, type WorkspaceMeta } from '../../domain/types.js';
import { AppStateStore, type GraphStackEntry } from '../persistence/app-state-store.js';
import { NoActiveWorkspaceError } from '../../errors/no-active-workspace-error.js';
import { WorkspaceNotFoundError } from '../../errors/workspace-not-found-error.js';
import { WorkspacePathError } from '../../errors/workspace-path-error.js';

/** Absolute paths to every artifact inside a workspace's `.nodalis/` folder. */
export interface WorkspacePaths {
  root: string;
  archiDir: string;
  workspaceJsonPath: string;
  graphPath: string;
  proposalsPath: string;
  versionsDir: string;
  subgraphsDir: string;
  notesPath: string;
}

/** A workspace's metadata plus its on-disk location. */
export type WorkspaceInfo = WorkspaceMeta & { path: string };

/**
 * The graph currently in focus within the active workspace — either the root
 * graph or a node's sub-graph (drill-down). Resolves the file to read/write and
 * the *effective* preset (a sub-graph carries its own architecture type).
 */
export interface GraphContext {
  workspacePath: string;
  /** null = root graph; otherwise the owning node's id. */
  subgraphId: string | null;
  /** File holding the active graph's nodes/edges. */
  graphPath: string;
  /** Effective preset id for the active graph (sub-graph preset when drilled in). */
  presetId: string;
  /** Drill-down trail (excludes the root); drives the frontend breadcrumb. */
  breadcrumb: GraphStackEntry[];
}

/** One entry returned by the folder browser. */
export interface DirEntry {
  name: string;
  path: string;
  isWorkspace: boolean;
}

const NOTES_TEMPLATE = (name: string) =>
  `# ${name} — Notes\n\n` +
  `Mémoire de l'agent pour ce workspace. Note ici les décisions d'architecture,\n` +
  `le contexte, et tout ce qui doit survivre entre les sessions.\n`;

/**
 * Owns the "open folder" workspace model (VSCode-style). A workspace is any OS
 * folder; Nodalis stores its data in `<folder>/.nodalis/`. The active workspace
 * is persisted globally (see {@link AppStateStore}) so it is remembered across
 * restarts and shared between the MCP and HTTP processes.
 *
 * All path inputs are validated against a configurable browse root
 * (`WORKSPACE_BROWSE_ROOT`, default: the user's home directory) to prevent
 * traversal into sensitive locations.
 */
export class WorkspaceManager {
  readonly browseRoot: string;

  constructor(
    private readonly appState: AppStateStore,
    browseRoot?: string
  ) {
    this.browseRoot = path.resolve(browseRoot ?? process.env.WORKSPACE_BROWSE_ROOT ?? os.homedir());
  }

  // ─── Path resolution ────────────────────────────────────────────────────

  resolvePaths(workspacePath: string): WorkspacePaths {
    const root = path.resolve(workspacePath);
    const archiDir = path.join(root, '.nodalis');
    return {
      root,
      archiDir,
      workspaceJsonPath: path.join(archiDir, 'workspace.json'),
      graphPath: path.join(archiDir, 'graph.json'),
      proposalsPath: path.join(archiDir, 'proposals.json'),
      versionsDir: path.join(archiDir, 'versions'),
      subgraphsDir: path.join(archiDir, 'subgraphs'),
      notesPath: path.join(archiDir, 'notes.md'),
    };
  }

  /** Absolute path of a node's sub-graph file within a workspace. */
  resolveSubgraphPath(workspacePath: string, nodeId: string): string {
    // nodeId becomes a filename — reject anything that isn't a UUID so it can
    // never contain path separators / `..` and escape the sub-graphs folder.
    WorkspaceManager.assertValidNodeId(nodeId);
    return path.join(this.resolvePaths(workspacePath).subgraphsDir, `${nodeId}.graph.json`);
  }

  private static readonly NODE_ID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  private static assertValidNodeId(nodeId: string): void {
    if (!WorkspaceManager.NODE_ID_RE.test(nodeId)) {
      throw new WorkspacePathError(`Invalid node id "${nodeId}" (expected a UUID).`, { nodeId });
    }
  }

  isInitialized(workspacePath: string): boolean {
    return fs.existsSync(this.resolvePaths(workspacePath).workspaceJsonPath);
  }

  // ─── Active workspace ───────────────────────────────────────────────────

  getActive(): WorkspaceInfo | null {
    const activePath = this.appState.getActivePath();
    if (!activePath || !this.isInitialized(activePath)) return null;
    const meta = this.readMeta(activePath);
    return meta ? { ...meta, path: path.resolve(activePath) } : null;
  }

  requireActive(): WorkspaceInfo {
    const active = this.getActive();
    if (!active) throw new NoActiveWorkspaceError();
    return active;
  }

  getActivePaths(): WorkspacePaths | null {
    const active = this.getActive();
    return active ? this.resolvePaths(active.path) : null;
  }

  // ─── Active graph context (root vs sub-graph drill-down) ──────────────────

  /**
   * Resolve the graph currently in focus. Self-heals: if the drill-down points at
   * a sub-graph file that no longer exists, it resets to the root graph rather
   * than leaving the user stuck on a missing graph.
   */
  getActiveGraphContext(): GraphContext | null {
    const active = this.getActive();
    if (!active) return null;

    const paths = this.resolvePaths(active.path);
    const stack = this.appState.getGraphStack();

    if (stack.length === 0) {
      return { workspacePath: active.path, subgraphId: null, graphPath: paths.graphPath, presetId: active.presetId, breadcrumb: [] };
    }

    const leaf = stack[stack.length - 1];
    // A malformed (non-UUID) or vanished sub-graph id must never wedge reads or
    // reach a file path — fall back to the root graph and clear the broken trail.
    let subPath: string | null = null;
    let subPreset: string | null = null;
    try {
      subPath = this.resolveSubgraphPath(active.path, leaf.id);
      subPreset = this.readSubgraphPreset(subPath);
    } catch {
      subPath = null;
      subPreset = null;
    }

    if (!subPath || !subPreset) {
      this.appState.setGraphStack([]);
      return { workspacePath: active.path, subgraphId: null, graphPath: paths.graphPath, presetId: active.presetId, breadcrumb: [] };
    }

    return { workspacePath: active.path, subgraphId: leaf.id, graphPath: subPath, presetId: subPreset, breadcrumb: stack };
  }

  requireActiveGraphContext(): GraphContext {
    const ctx = this.getActiveGraphContext();
    if (!ctx) throw new NoActiveWorkspaceError();
    return ctx;
  }

  /** Effective preset id for the active graph (used to scope the registry/rules). */
  getEffectivePresetId(): string | null {
    return this.getActiveGraphContext()?.presetId ?? null;
  }

  /**
   * Create a sub-graph owned by `nodeId` with its own preset, if it does not
   * already exist. Returns the sub-graph's preset id (existing one if present).
   */
  createSubgraph(nodeId: string, presetId: string): string {
    const active = this.requireActive();
    const subPath = this.resolveSubgraphPath(active.path, nodeId);
    const existing = this.readSubgraphPreset(subPath);
    if (existing) return existing;

    const dir = path.dirname(subPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.writeJson(subPath, { presetId, nodes: [], edges: [], savedAt: new Date().toISOString() });
    return presetId;
  }

  /** True if a node already owns a sub-graph file. */
  hasSubgraph(nodeId: string): boolean {
    const active = this.getActive();
    if (!active) return false;
    return fs.existsSync(this.resolveSubgraphPath(active.path, nodeId));
  }

  /** Drill into a node's sub-graph (pushes onto the breadcrumb trail). */
  enterSubgraph(nodeId: string, label: string): GraphContext {
    const active = this.requireActive();
    const subPath = this.resolveSubgraphPath(active.path, nodeId);
    if (!this.readSubgraphPreset(subPath)) {
      throw new WorkspacePathError(`Node "${nodeId}" has no sub-graph. Create one first.`, { nodeId });
    }
    const stack = this.appState.getGraphStack().filter((e) => e.id !== nodeId);
    stack.push({ id: nodeId, label });
    this.appState.setGraphStack(stack);
    return this.requireActiveGraphContext();
  }

  /** Replace the drill-down trail wholesale (breadcrumb jump / exit to root with []). */
  setGraphStack(stack: GraphStackEntry[]): GraphContext {
    this.requireActive();
    // Validate every id BEFORE persisting so a malformed trail can never be
    // written (and later fed into a file path by getActiveGraphContext).
    for (const entry of stack) WorkspaceManager.assertValidNodeId(entry.id);
    this.appState.setGraphStack(stack);
    return this.requireActiveGraphContext();
  }

  private readSubgraphPreset(subPath: string): string | null {
    try {
      if (!fs.existsSync(subPath)) return null;
      const parsed = JSON.parse(fs.readFileSync(subPath, 'utf-8')) as { presetId?: string };
      return typeof parsed.presetId === 'string' ? parsed.presetId : null;
    } catch {
      return null;
    }
  }

  // ─── Create / open / list ───────────────────────────────────────────────

  create(
    workspacePath: string,
    opts: { name: string; presetId: string; description?: string }
  ): WorkspaceInfo {
    const root = this.assertWithinRoot(workspacePath);
    if (this.isInitialized(root)) {
      throw new WorkspacePathError(
        `"${root}" is already a workspace. Open it instead of creating it.`,
        { path: root }
      );
    }

    const paths = this.resolvePaths(root);
    fs.mkdirSync(paths.versionsDir, { recursive: true });

    const now = new Date().toISOString();
    const meta: WorkspaceMeta = {
      name: opts.name,
      presetId: opts.presetId,
      description: opts.description,
      createdAt: now,
      updatedAt: now,
    };
    this.writeMeta(paths, meta);
    // Never clobber an existing graph (e.g. when migrating a legacy `.nodalis/graph.json`).
    if (!fs.existsSync(paths.graphPath)) this.writeJson(paths.graphPath, { nodes: [], edges: [], savedAt: now });
    if (!fs.existsSync(paths.notesPath)) fs.writeFileSync(paths.notesPath, NOTES_TEMPLATE(opts.name), 'utf-8');

    this.appState.recordOpened({ path: root, name: meta.name, presetId: meta.presetId, lastOpenedAt: now });
    return { ...meta, path: root };
  }

  open(workspacePath: string): WorkspaceInfo {
    const root = this.assertWithinRoot(workspacePath);
    if (!this.isInitialized(root)) throw new WorkspaceNotFoundError(root);

    const meta = this.readMeta(root);
    if (!meta) throw new WorkspaceNotFoundError(root, { reason: 'invalid workspace.json' });

    this.appState.recordOpened({
      path: root,
      name: meta.name,
      presetId: meta.presetId,
      lastOpenedAt: new Date().toISOString(),
    });
    return { ...meta, path: root };
  }

  list(): { active: WorkspaceInfo | null; recent: ReturnType<AppStateStore['getRecents']> } {
    return {
      active: this.getActive(),
      // Only surface recents that still exist on disk.
      recent: this.appState.getRecents().filter((r) => this.isInitialized(r.path)),
    };
  }

  // ─── Notes (agent memory) ─────────────────────────────────────────────────

  readNotes(): string {
    const paths = this.requireActivePaths();
    return fs.existsSync(paths.notesPath) ? fs.readFileSync(paths.notesPath, 'utf-8') : '';
  }

  appendNote(note: string): void {
    const paths = this.requireActivePaths();
    const stamp = new Date().toISOString();
    const existing = fs.existsSync(paths.notesPath) ? fs.readFileSync(paths.notesPath, 'utf-8') : '';
    fs.writeFileSync(paths.notesPath, `${existing}\n## ${stamp}\n${note.trim()}\n`, 'utf-8');
    this.touch();
  }

  // ─── Folder browser (for the frontend "open folder" picker) ───────────────

  listDirectories(dirPath?: string): { path: string; parent: string | null; root: string; entries: DirEntry[] } {
    const target = dirPath ? this.assertWithinRoot(dirPath) : this.browseRoot;
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      throw new WorkspacePathError(`"${target}" is not a directory`, { path: target });
    }

    const entries: DirEntry[] = fs.readdirSync(target, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => {
        const p = path.join(target, e.name);
        return { name: e.name, path: p, isWorkspace: this.isInitialized(p) };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const parentCandidate = path.dirname(target);
    const parent = target !== this.browseRoot && this.isWithinRoot(parentCandidate) ? parentCandidate : null;

    return { path: target, parent, root: this.browseRoot, entries };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private requireActivePaths(): WorkspacePaths {
    const paths = this.getActivePaths();
    if (!paths) throw new NoActiveWorkspaceError();
    return paths;
  }

  private touch(): void {
    const active = this.getActive();
    if (!active) return;
    const paths = this.resolvePaths(active.path);
    this.writeMeta(paths, { ...active, updatedAt: new Date().toISOString() });
  }

  private readMeta(workspacePath: string): WorkspaceMeta | null {
    try {
      const raw = fs.readFileSync(this.resolvePaths(workspacePath).workspaceJsonPath, 'utf-8');
      const parsed = WorkspaceMetaSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private writeMeta(paths: WorkspacePaths, meta: WorkspaceMeta): void {
    if (!fs.existsSync(paths.archiDir)) fs.mkdirSync(paths.archiDir, { recursive: true });
    this.writeJson(paths.workspaceJsonPath, meta);
  }

  private writeJson(filePath: string, data: unknown): void {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private isWithinRoot(candidate: string): boolean {
    const resolved = path.resolve(candidate);
    return resolved === this.browseRoot || resolved.startsWith(this.browseRoot + path.sep);
  }

  private assertWithinRoot(workspacePath: string): string {
    const resolved = path.resolve(workspacePath);
    if (!this.isWithinRoot(resolved)) {
      throw new WorkspacePathError(
        `Path "${resolved}" is outside the allowed workspace root "${this.browseRoot}".`,
        { path: resolved, root: this.browseRoot }
      );
    }
    return resolved;
  }
}
