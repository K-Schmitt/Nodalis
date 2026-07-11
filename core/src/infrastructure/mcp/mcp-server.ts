import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Registry } from '../../domain/registry.js';
import { Graph } from '../../domain/graph.js';
import { RuleEngine } from '../../domain/rule-engine.js';
import { ProposalStore, type ProposalPreview } from '../../domain/proposal-store.js';
import { Node, Edge, ProposalSchema } from '../../domain/types.js';
import { GraphStorage } from '../persistence/graph-storage.js';
import { WorkspaceManager } from '../workspace/workspace-manager.js';
import { PresetRegistry } from '../registry/preset-registry.js';
import { ArchiOSError } from '../../errors/base-error.js';
import { PresetNotFoundError } from '../../errors/preset-not-found-error.js';

// ─── Args schemas (Zod) ───────────────────────────────────────────────────────

const CheckProposalStatusArgsSchema = z.object({
  proposalId: z.string().uuid(),
});

const CreateSnapshotArgsSchema = z.object({
  label: z.string().min(1),
});

const RestoreVersionArgsSchema = z.object({
  versionId: z.string().uuid(),
});

const CreateWorkspaceArgsSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  presetId: z.string().min(1),
  description: z.string().optional(),
});

const OpenWorkspaceArgsSchema = z.object({
  path: z.string().min(1),
});

const AppendNoteArgsSchema = z.object({
  note: z.string().min(1),
});

const CreateSubgraphArgsSchema = z.object({
  nodeId: z.string().uuid(),
  presetId: z.string().min(1),
});

const OpenGraphArgsSchema = z.object({
  // 'root' returns to the workspace's top-level graph; a UUID drills into that node's sub-graph.
  target: z.string().min(1),
});

// ─── MCPServer ────────────────────────────────────────────────────────────────

export class MCPServer {
  private server: Server;

  constructor(
    private registry: Registry,
    private graph: Graph,
    private graphStorage: GraphStorage,
    private ruleEngine: RuleEngine,
    private proposalStore: ProposalStore,
    private workspaces: WorkspaceManager,
    private presetRegistry: PresetRegistry
  ) {
    this.server = new Server(
      { name: 'nodalis-mcp', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    this.setupHandlers();
  }

  async notifyToolsChanged(): Promise<void> {
    try {
      await this.server.notification({ method: 'notifications/tools/list_changed', params: {} });
    } catch {
      // client may not be connected yet — safe to ignore
    }
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {

      const tools: Tool[] = [
        {
          name: 'get_active_workspace',
          description: 'Get the workspace (project folder) currently being worked on, including its name and architecture type (presetId). ALWAYS call this FIRST. If it returns active=null, you MUST ask the user which folder to work in, then call open_workspace (existing) or create_workspace (new) before any graph operation.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'list_workspaces',
          description: 'List the active workspace and recently opened workspaces (with their folder paths and architecture types). Use this to let the user pick where to work.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'create_workspace',
          description: 'Create a NEW workspace at an absolute folder path and make it active. Use when the user wants to start a new architecture in a new folder. Pick presetId by the architecture type (e.g. "web", "game", "full") — call list_presets to see options. Initializes a .nodalis/ memory folder so the work persists across sessions.',
          inputSchema: {
            type: 'object',
            required: ['path', 'name', 'presetId'],
            properties: {
              path: { type: 'string', description: 'Absolute path of the folder to use as the workspace.' },
              name: { type: 'string', description: 'Human-readable workspace name.' },
              presetId: { type: 'string', description: 'Architecture type / preset id (e.g. "web", "game", "full").' },
              description: { type: 'string', description: 'Optional description.' },
            },
          },
        },
        {
          name: 'open_workspace',
          description: 'Open / switch to an EXISTING workspace folder (one that already has a .nodalis/ folder) and make it active.',
          inputSchema: {
            type: 'object',
            required: ['path'],
            properties: { path: { type: 'string', description: 'Absolute path of the existing workspace folder.' } },
          },
        },
        {
          name: 'get_workspace_notes',
          description: 'Read the persistent notes (memory) for the active workspace. Read this when resuming work to recover context from previous sessions.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'append_workspace_note',
          description: 'Append a timestamped note to the active workspace memory (.nodalis/notes.md). Record architecture decisions and context so future sessions do not start from zero.',
          inputSchema: {
            type: 'object',
            required: ['note'],
            properties: { note: { type: 'string', description: 'The note to persist.' } },
          },
        },
        {
          name: 'list_presets',
          description: 'List the available architecture presets (types) — e.g. "web", "game", "full". Each preset determines which node types and rules a workspace uses. Use this to choose a presetId when creating a workspace.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'create_subgraph',
          description: 'Give a node its own nested sub-graph with a DIFFERENT architecture preset, then you can drill into it. Example: a "Database" node in a web graph gets an "erd" sub-graph to model its tables. Pass the node id (must exist in the CURRENT graph) and the sub-graph presetId (call list_presets for options). After creating, call open_graph to enter it.',
          inputSchema: {
            type: 'object',
            required: ['nodeId', 'presetId'],
            properties: {
              nodeId: { type: 'string', description: 'UUID of an existing node in the current graph that should own the sub-graph.' },
              presetId: { type: 'string', description: 'Architecture preset for the sub-graph (e.g. "erd", "uml", "bpmn").' },
            },
          },
        },
        {
          name: 'open_graph',
          description: 'Switch which graph you are working on (drill-down navigation). Pass target="root" to return to the workspace top-level graph, or target=<nodeId> to enter that node\'s sub-graph. After switching, get_graph / list_types / propose_changes all operate on that graph and its preset. The frontend follows the same active graph.',
          inputSchema: {
            type: 'object',
            required: ['target'],
            properties: { target: { type: 'string', description: '"root" or the UUID of a node that owns a sub-graph.' } },
          },
        },
        {
          name: 'list_types',
          description: 'List the node types available in the active graph (scoped to its architecture preset), with their constraints and required data fields.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'get_graph',
          description: 'Get the current architecture graph (nodes and edges). If pendingApproval is present in the response, a proposal awaits user review — do not call propose_changes again, use check_proposal_status instead.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'validate_graph',
          description: "Check the current graph against the active preset's advisory rules (required node types, required connections, max depth). Returns any violations as warnings. Use this after building an architecture to confirm it is complete and well-formed.",
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'propose_changes',
          description: `Submit a batch of graph changes for user review and approval.

BEFORE CALLING: call list_types to know which typeIds exist in the active preset.

CRITICAL — ID FORMAT: Every "id", "sourceId", "targetId" MUST be a valid UUID v4.
Generate them with crypto.randomUUID() or use the format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx.
NEVER use strings like "node-1", "user", "frontend" — those will be rejected immediately.

OPERATIONS (operations_json = JSON array):

  Add node (data fields are ALL OPTIONAL — omit any you don't know yet):
  {"op":"add_node","payload":{"id":"<uuid>","typeId":"<typeId>","label":"<display name>","data":{}}}

  Add edge (connection between two nodes):
  {"op":"add_edge","payload":{"id":"<uuid>","sourceId":"<uuid>","targetId":"<uuid>"}}

  Update node data:
  {"op":"update_node","payload":{"id":"<uuid>","changes":{"key":"value"}}}

  Delete node:
  {"op":"delete_node","payload":{"id":"<uuid>"}}

  Delete edge:
  {"op":"delete_edge","payload":{"id":"<uuid>"}}

The call BLOCKS until the user accepts or rejects in the UI. Do NOT call again before the response.`,
          inputSchema: {
            type: 'object',
            properties: {
              author: {
                type: 'string',
                description: 'Name of the agent authoring this proposal.',
              },
              operations_json: {
                type: 'string',
                description: 'JSON array of operations. All ids MUST be valid UUID v4 strings.',
              },
            },
            required: ['author', 'operations_json'],
          },
        },
        {
          name: 'clear_graph',
          description: 'Delete EVERYTHING from the graph in one atomic operation. Use this when the user asks to "delete everything", "clear the graph", "start over", or "reset". Submits a single clear-all proposal for user approval and blocks until accepted or rejected — works regardless of how many nodes exist (no per-proposal operation limit). Prefer this over enumerating many delete_node operations.',
          inputSchema: {
            type: 'object',
            properties: {
              author: { type: 'string', description: 'Name of the agent authoring this proposal.' },
            },
          },
        },
        {
          name: 'check_proposal_status',
          description: 'Check the status of a proposal by its ID (pending, accepted, or rejected). Returns rejectionReason if rejected.',
          inputSchema: {
            type: 'object',
            required: ['proposalId'],
            properties: { proposalId: { type: 'string', description: 'The proposal UUID returned by propose_changes.' } },
          },
        },
        {
          name: 'list_versions',
          description: 'List all saved graph snapshots.',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          name: 'create_snapshot',
          description: 'Manually snapshot the current graph.',
          inputSchema: {
            type: 'object',
            required: ['label'],
            properties: { label: { type: 'string' } },
          },
        },
        {
          name: 'restore_version',
          description: 'Restore the graph to a previous snapshot.',
          inputSchema: {
            type: 'object',
            required: ['versionId'],
            properties: { versionId: { type: 'string' } },
          },
        },
      ];

      return { tools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          case 'get_active_workspace':  return this.handleGetActiveWorkspace();
          case 'list_workspaces':       return this.handleListWorkspaces();
          case 'create_workspace':      return this.handleCreateWorkspace(args);
          case 'open_workspace':        return this.handleOpenWorkspace(args);
          case 'get_workspace_notes':   return this.handleGetWorkspaceNotes();
          case 'append_workspace_note': return this.handleAppendWorkspaceNote(args);
          case 'list_presets':          return this.handleListPresets();
          case 'create_subgraph':       return this.handleCreateSubgraph(args);
          case 'open_graph':            return this.handleOpenGraph(args);
          case 'list_types':            return this.handleListTypes();
          case 'get_graph':             return this.handleGetGraph();
          case 'validate_graph':        return this.handleValidateGraph();
          case 'propose_changes':       return await this.handleProposeChanges(args);
          case 'clear_graph':           return await this.handleClearGraph(args);
          case 'check_proposal_status': return this.handleCheckProposalStatus(args);
          case 'list_versions':         return this.handleListVersions();
          case 'create_snapshot':       return this.handleCreateSnapshot(args);
          case 'restore_version':       return this.handleRestoreVersion(args);
          default:
            return this.errorResponse('ERR_UNKNOWN_TOOL', `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          return this.errorResponse('ERR_SCHEMA_VALIDATION', 'Invalid input', error.issues);
        }
        if (error instanceof ArchiOSError) {
          return this.errorResponse(error.code, error.message, error.context);
        }
        return this.errorResponse('ERR_INTERNAL', (error as Error).message);
      }
    });
  }

  // ─── Workspace handlers ─────────────────────────────────────────────────

  private handleGetActiveWorkspace() {
    const active = this.workspaces.getActive();
    if (!active) {
      return this.okResponse({
        active: null,
        message:
          'No active workspace. Ask the user which folder to work in, then call ' +
          'open_workspace (existing) or create_workspace (new). Use list_workspaces to show recent ones.',
      });
    }
    return this.okResponse({ active });
  }

  private handleListWorkspaces() {
    return this.okResponse(this.workspaces.list());
  }

  private handleCreateWorkspace(args: unknown) {
    const { path, name, presetId, description } = CreateWorkspaceArgsSchema.parse(args);
    if (!this.presetRegistry.hasPreset(presetId)) {
      throw new PresetNotFoundError(presetId, this.presetRegistry.listPresets().map((p) => p.id));
    }
    const workspace = this.workspaces.create(path, { name, presetId, description });
    this.syncWorkspaceContext();
    return this.okResponse({ workspace, message: `✅ Workspace "${workspace.name}" created and active at ${workspace.path}` });
  }

  private handleOpenWorkspace(args: unknown) {
    const { path } = OpenWorkspaceArgsSchema.parse(args);
    const workspace = this.workspaces.open(path);
    this.syncWorkspaceContext();
    return this.okResponse({ workspace, message: `✅ Workspace "${workspace.name}" is now active.` });
  }

  private handleListPresets() {
    return this.okResponse({ presets: this.presetRegistry.listPresets() });
  }

  private handleCreateSubgraph(args: unknown) {
    const { nodeId, presetId } = CreateSubgraphArgsSchema.parse(args);
    this.workspaces.requireActive();
    if (!this.presetRegistry.hasPreset(presetId)) {
      throw new PresetNotFoundError(presetId, this.presetRegistry.listPresets().map((p) => p.id));
    }

    // Operate on the current graph (root or a parent sub-graph).
    this.syncWorkspaceContext();
    const node = this.graph.getNode(nodeId);
    if (!node) {
      return this.errorResponse('ERR_NODE_NOT_FOUND', `Node "${nodeId}" not found in the current graph.`);
    }

    const effectivePreset = this.workspaces.createSubgraph(nodeId, presetId);
    this.graph.addNode({ ...node, subgraph: { presetId: effectivePreset } });
    this.graphStorage.save(this.graph);

    return this.okResponse({
      nodeId,
      presetId: effectivePreset,
      message: `✅ Sub-graph (preset "${effectivePreset}") created for "${node.label}". Call open_graph with target="${nodeId}" to enter it.`,
    });
  }

  private handleOpenGraph(args: unknown) {
    const { target } = OpenGraphArgsSchema.parse(args);
    this.workspaces.requireActive();

    if (target === 'root') {
      this.workspaces.setGraphStack([]);
    } else {
      // Resolve a label for the breadcrumb from the current graph before switching.
      this.syncWorkspaceContext();
      const node = this.graph.getNode(target);
      this.workspaces.enterSubgraph(target, node?.label ?? target);
    }

    // Reload graph + preset for the newly active graph.
    this.syncWorkspaceContext();
    const ctx = this.workspaces.getActiveGraphContext();
    return this.okResponse({
      activeGraph: target === 'root' ? 'root' : target,
      preset: this.presetRegistry.getActivePreset()?.id ?? null,
      breadcrumb: ctx?.breadcrumb ?? [],
      nodeCount: this.graph.getAllNodes().length,
      edgeCount: this.graph.getAllEdges().length,
      message: `✅ Now working on ${target === 'root' ? 'the root graph' : `the sub-graph of "${ctx?.breadcrumb.at(-1)?.label ?? target}"`} (preset "${this.presetRegistry.getActivePreset()?.id ?? '?'}").`,
    });
  }

  private handleGetWorkspaceNotes() {
    this.workspaces.requireActive();
    return this.okResponse({ notes: this.workspaces.readNotes() });
  }

  private handleAppendWorkspaceNote(args: unknown) {
    const { note } = AppendNoteArgsSchema.parse(args);
    this.workspaces.appendNote(note);
    return this.okResponse({ message: 'Note saved to workspace memory.' });
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  /** Sync in-memory state to the active workspace: preset-scoped registry + graph. */
  private syncWorkspaceContext(): void {
    this.presetRegistry.ensureForActiveWorkspace(this.workspaces);
    this.graphStorage.loadIfChanged(this.graph);
  }

  private handleListTypes() {
    this.workspaces.requireActive();
    this.presetRegistry.ensureForActiveWorkspace(this.workspaces);
    const types = this.registry.getAll();
    return this.okResponse({ count: types.length, types });
  }

  private handleGetGraph() {
    this.workspaces.requireActive();

    // Reload-before-read: the graph may have been mutated by the HTTP process
    // (proposal accepted in the UI). Without this the agent reads a stale copy
    // and wrongly believes deletions/changes did or did not happen.
    this.syncWorkspaceContext();

    const nodes = this.graph.getAllNodes();
    const edges = this.graph.getAllEdges();

    const statsByType: Record<string, number> = {};
    for (const n of nodes) statsByType[n.typeId] = (statsByType[n.typeId] ?? 0) + 1;

    const pendingProposals = this.proposalStore.getPending();
    const pendingApproval = pendingProposals.length > 0
      ? {
          IMPORTANT: `There are ${pendingProposals.length} proposal(s) awaiting user approval. ` +
            'Do NOT call propose_changes again. Call check_proposal_status with the proposalId.',
          pendingProposals: pendingProposals.map((p) => ({
            proposalId: p.id,
            author: p.author,
            createdAt: p.createdAt,
            operationCount: p.operations.length,
          })),
        }
      : undefined;

    const ctx = this.workspaces.getActiveGraphContext();
    const subgraphNodes = nodes.filter((n) => n.subgraph).map((n) => ({ id: n.id, label: n.label, presetId: n.subgraph!.presetId }));

    return this.okResponse({
      ...(pendingApproval ? { pendingApproval } : {}),
      activeGraph: {
        scope: ctx?.subgraphId ? 'subgraph' : 'root',
        preset: this.presetRegistry.getActivePreset()?.id ?? null,
        breadcrumb: ctx?.breadcrumb ?? [],
      },
      meta: { nodeCount: nodes.length, edgeCount: edges.length, statsByType },
      ...(subgraphNodes.length > 0 ? { nodesWithSubgraphs: subgraphNodes } : {}),
      nodes,
      edges,
    });
  }

  private handleValidateGraph() {
    this.workspaces.requireActive();
    this.syncWorkspaceContext();
    const result = this.ruleEngine.validateGraphIntegrity();
    if (result.valid) {
      return this.okResponse({ valid: true, message: '✅ The graph satisfies all advisory rules of the active preset.' });
    }
    return this.okResponse({
      valid: false,
      warnings: result.errors,
      message: `⚠️ ${result.errors?.length ?? 0} advisory rule(s) not satisfied: ${result.errors?.map((e) => e.message).join('; ')}`,
    });
  }

  private async handleProposeChanges(args: unknown) {
    const raw = args as { author?: string; operations?: unknown[]; operations_json?: string };

    // Support both flat string (operations_json) and legacy array (operations)
    let operations: unknown[];
    if (raw.operations_json) {
      try {
        operations = JSON.parse(raw.operations_json);
        if (!Array.isArray(operations)) {
          return this.errorResponse('ERR_INVALID_JSON', 'operations_json must be a JSON array');
        }
      } catch {
        return this.errorResponse('ERR_INVALID_JSON', 'operations_json is not valid JSON');
      }
    } else if (raw.operations) {
      operations = raw.operations;
    } else {
      return this.errorResponse('ERR_MISSING_OPERATIONS', 'Either operations_json or operations must be provided');
    }

    return this.submitAndAwait(raw.author, operations);
  }

  private async handleClearGraph(args: unknown) {
    const raw = args as { author?: string };
    // A single atomic clear_all op — wipes the whole graph regardless of size,
    // sidestepping the per-proposal operation cap that broke "delete everything".
    return this.submitAndAwait(raw.author ?? 'agent', [{ op: 'clear_all', payload: {} }]);
  }

  /**
   * Validate a batch of operations, register the proposal for user review, block
   * until it is resolved, then report the REAL outcome — node/edge counts and any
   * per-operation failures read back from what was actually applied — instead of a
   * hardcoded "changes applied" message. Shared by propose_changes and clear_graph.
   */
  private async submitAndAwait(author: string | undefined, operations: unknown[]) {
    this.workspaces.requireActive();

    const proposal = ProposalSchema.parse({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      author,
      operations,
    });

    // Reload-before-validate: validate against the active workspace's current
    // graph AND preset-scoped registry/rules.
    this.syncWorkspaceContext();

    const errors: Array<{ code: string; message: string; context?: Record<string, unknown> }> = [];
    const prospectiveNodes = new Map<string, Node>();
    const prospectiveEdges: Edge[] = [];

    // Node validation pass
    for (const op of proposal.operations) {
      if (op.op !== 'add_node') continue;

      if (!this.registry.has(op.payload.typeId)) {
        errors.push({
          code: 'ERR_TYPE_NOT_FOUND',
          message: `Type "${op.payload.typeId}" not in registry`,
          context: { typeId: op.payload.typeId },
        });
        continue;
      }

      const nv = this.ruleEngine.validateNode(op.payload);
      if (!nv.valid) errors.push(...(nv.errors ?? []));
      prospectiveNodes.set(op.payload.id, op.payload);
    }

    // Edge + delete validation pass
    for (const op of proposal.operations) {
      if (op.op === 'add_edge') {
        const cv = this.ruleEngine.validateConnection(op.payload.sourceId, op.payload.targetId, prospectiveNodes);
        if (!cv.valid) {
          errors.push(...(cv.errors ?? []));
        } else if (this.ruleEngine.detectCycle(op.payload, prospectiveEdges)) {
          errors.push({
            code: 'ERR_CYCLE_DETECTED',
            message: 'This edge would create a cycle',
            context: { edgeId: op.payload.id },
          });
        } else {
          prospectiveEdges.push(op.payload);
        }
      }
      if (op.op === 'delete_node' && !this.graph.hasNode(op.payload.id)) {
        errors.push({
          code: 'ERR_NODE_NOT_FOUND',
          message: `Node not found: ${op.payload.id}`,
          context: { nodeId: op.payload.id },
        });
      }
      if (op.op === 'delete_edge' && !this.graph.hasEdge(op.payload.id)) {
        errors.push({
          code: 'ERR_EDGE_NOT_FOUND',
          message: `Edge not found: ${op.payload.id}`,
          context: { edgeId: op.payload.id },
        });
      }
    }

    if (errors.length > 0) {
      return this.errorResponse('ERR_VALIDATION_FAILED', 'Proposal validation failed', { errors });
    }

    const preview = this.buildPreview(proposal.operations);

    this.proposalStore.add({
      id: proposal.id,
      author: proposal.author,
      operations: proposal.operations,
      preview,
      status: 'pending',
      createdAt: proposal.timestamp,
    });

    // Block until the user accepts or rejects in the frontend UI
    const resolved = await this.proposalStore.waitForResolution(proposal.id);

    if (resolved.status !== 'accepted') {
      return this.okResponse({
        proposalId: proposal.id,
        status: resolved.status,
        resolvedAt: resolved.resolvedAt,
        ...(resolved.rejectionReason ? { rejectionReason: resolved.rejectionReason } : {}),
        message: `❌ Proposal rejected by the user.${resolved.rejectionReason ? ` Reason: "${resolved.rejectionReason}"` : ''} You may propose an alternative if needed.`,
      });
    }

    // Accepted: report the REAL post-apply state (the HTTP process applied + saved).
    this.graphStorage.loadIfChanged(this.graph);
    const summary = resolved.applySummary;
    const counts = summary?.finalCounts ?? {
      nodes: this.graph.getAllNodes().length,
      edges: this.graph.getAllEdges().length,
    };
    const failedNote = summary && summary.failed.length > 0
      ? ` ⚠️ ${summary.failed.length} operation(s) could NOT be applied: ${summary.failed.map((f) => f.reason).join('; ')}.`
      : '';

    return this.okResponse({
      proposalId: proposal.id,
      status: resolved.status,
      resolvedAt: resolved.resolvedAt,
      ...(summary ? { applied: summary.applied, failed: summary.failed } : {}),
      graph: { nodeCount: counts.nodes, edgeCount: counts.edges },
      message: `✅ Proposal accepted. The graph now has ${counts.nodes} node(s) and ${counts.edges} edge(s).${failedNote}`,
    });
  }

  private handleCheckProposalStatus(args: unknown) {
    const { proposalId } = CheckProposalStatusArgsSchema.parse(args);
    const proposal = this.proposalStore.get(proposalId);

    if (!proposal) {
      return this.errorResponse('ERR_PROPOSAL_NOT_FOUND', `Proposal "${proposalId}" not found`);
    }

    const elapsedSeconds = Math.round(
      (Date.now() - new Date(proposal.createdAt).getTime()) / 1_000
    );

    if (proposal.status === 'pending') {
      return this.okResponse({ proposalId, status: 'pending', elapsedSeconds });
    }

    return this.okResponse({
      proposalId,
      status: proposal.status,
      resolvedAt: proposal.resolvedAt,
      elapsedSeconds,
      ...(proposal.rejectionReason ? { rejectionReason: proposal.rejectionReason } : {}),
    });
  }

  private handleListVersions() {
    const versions = this.graphStorage.listVersions();
    return this.okResponse({ count: versions.length, versions });
  }

  private handleCreateSnapshot(args: unknown) {
    const { label } = CreateSnapshotArgsSchema.parse(args);
    const version = this.graphStorage.createSnapshot(this.graph, label);
    return this.okResponse({ version });
  }

  private handleRestoreVersion(args: unknown) {
    const { versionId } = RestoreVersionArgsSchema.parse(args);

    if (!this.graphStorage.restoreVersion(versionId, this.graph)) {
      return this.errorResponse('ERR_VERSION_NOT_FOUND', `Version "${versionId}" not found`);
    }

    this.graphStorage.save(this.graph);

    return this.okResponse({
      message: `Graph restored to version ${versionId}`,
      nodes: this.graph.getAllNodes().length,
      edges: this.graph.getAllEdges().length,
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildPreview(operations: ReturnType<typeof ProposalSchema.parse>['operations']): ProposalPreview {
    const preview: ProposalPreview = {
      nodesToAdd:    [],
      edgesToAdd:    [],
      nodesToDelete: [],
      edgesToDelete: [],
      nodesToUpdate: [],
    };

    for (const op of operations) {
      switch (op.op) {
        case 'add_node': {
          const def = this.registry.has(op.payload.typeId) ? this.registry.get(op.payload.typeId) : null;
          preview.nodesToAdd.push({
            id: op.payload.id,
            typeId: op.payload.typeId,
            label: op.payload.label,
            style: def?.style ?? { shape: 'rectangle', color: '#888888' },
            render: def?.render,
          });
          break;
        }
        case 'add_edge':
          preview.edgesToAdd.push({
            id: op.payload.id,
            sourceId: op.payload.sourceId,
            targetId: op.payload.targetId,
            label: op.payload.label,
          });
          break;
        case 'delete_node': {
          const node = this.graph.getNode(op.payload.id);
          preview.nodesToDelete.push({
            id: op.payload.id,
            label: node?.label ?? '?',
            typeId: node?.typeId ?? '?',
          });
          break;
        }
        case 'delete_edge':
          preview.edgesToDelete.push({ id: op.payload.id });
          break;
        case 'update_node':
          preview.nodesToUpdate.push({ id: op.payload.id, changes: op.payload.changes });
          break;
        case 'clear_all':
          // Show the whole current graph as pending deletion.
          for (const node of this.graph.getAllNodes()) {
            preview.nodesToDelete.push({ id: node.id, label: node.label, typeId: node.typeId });
          }
          for (const edge of this.graph.getAllEdges()) {
            preview.edgesToDelete.push({ id: edge.id });
          }
          break;
      }
    }

    return preview;
  }

  private okResponse(data: Record<string, unknown>) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }

  private errorResponse(code: string, message: string, details?: unknown) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, code, message, ...(details ? { details } : {}) }, null, 2) }],
      isError: true,
    };
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Server started');
  }

  async stop(): Promise<void> {
    await this.server.close();
    console.error('MCP Server stopped');
  }
}
