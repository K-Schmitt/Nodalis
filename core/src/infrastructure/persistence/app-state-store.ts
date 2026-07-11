import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** A workspace the user has opened before (for quick re-opening). */
export interface RecentWorkspace {
  path: string;
  name: string;
  presetId: string;
  lastOpenedAt: string;
}

/** One level of the drill-down path into a node's sub-graph. */
export interface GraphStackEntry {
  /** The owning node's id (its sub-graph file is `subgraphs/<id>.graph.json`). */
  id: string;
  /** Display label for the breadcrumb. */
  label: string;
}

/** Global, cross-process application state — lives OUTSIDE any workspace. */
export interface AppState {
  activeWorkspacePath: string | null;
  recentWorkspaces: RecentWorkspace[];
  /**
   * Drill-down path within the active workspace. Empty = viewing the root graph;
   * each entry pushes into the sub-graph owned by that node. Reset on workspace
   * switch. Shared cross-process so MCP and HTTP agree on "which graph is active".
   */
  activeGraphStack: GraphStackEntry[];
}

const MAX_RECENTS = 20;
const EMPTY_STATE: AppState = { activeWorkspacePath: null, recentWorkspaces: [], activeGraphStack: [] };

/**
 * Persists which workspace is active and the list of recently-opened workspaces
 * at the user level (`$XDG_CONFIG_HOME/archi-os/state.json`, or `~/.archi-os/`).
 *
 * Shared by the MCP and HTTP processes: switching workspace in the frontend is
 * visible to the agent on its next tool call. This is what lets Nodalis "remember
 * where we work" and never re-ask on restart.
 */
export class AppStateStore {
  private readonly statePath: string;

  constructor(stateDir?: string) {
    const dir = stateDir
      ?? process.env.ARCHI_OS_STATE_DIR
      ?? (process.env.XDG_CONFIG_HOME
        ? path.join(process.env.XDG_CONFIG_HOME, 'archi-os')
        : path.join(os.homedir(), '.archi-os'));

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.statePath = path.join(dir, 'state.json');
  }

  getState(): AppState {
    try {
      if (!fs.existsSync(this.statePath)) return { ...EMPTY_STATE };
      const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<AppState>;
      return {
        activeWorkspacePath: parsed.activeWorkspacePath ?? null,
        recentWorkspaces: parsed.recentWorkspaces ?? [],
        activeGraphStack: parsed.activeGraphStack ?? [],
      };
    } catch {
      return { ...EMPTY_STATE };
    }
  }

  getActivePath(): string | null {
    return this.getState().activeWorkspacePath;
  }

  getRecents(): RecentWorkspace[] {
    return this.getState().recentWorkspaces;
  }

  setActivePath(workspacePath: string | null): void {
    const state = this.getState();
    state.activeWorkspacePath = workspacePath;
    state.activeGraphStack = []; // changing workspace resets the drill-down path
    this.write(state);
  }

  getGraphStack(): GraphStackEntry[] {
    return this.getState().activeGraphStack;
  }

  setGraphStack(stack: GraphStackEntry[]): void {
    const state = this.getState();
    state.activeGraphStack = stack;
    this.write(state);
  }

  /** Record (or refresh) a workspace in the recents list and mark it active. */
  recordOpened(ws: RecentWorkspace): void {
    const state = this.getState();
    const recents = state.recentWorkspaces.filter((r) => r.path !== ws.path);
    recents.unshift(ws);
    state.recentWorkspaces = recents.slice(0, MAX_RECENTS);
    state.activeWorkspacePath = ws.path;
    state.activeGraphStack = []; // opening a workspace starts at its root graph
    this.write(state);
  }

  removeRecent(workspacePath: string): void {
    const state = this.getState();
    state.recentWorkspaces = state.recentWorkspaces.filter((r) => r.path !== workspacePath);
    if (state.activeWorkspacePath === workspacePath) state.activeWorkspacePath = null;
    this.write(state);
  }

  private write(state: AppState): void {
    const tmp = `${this.statePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tmp, this.statePath);
  }
}
