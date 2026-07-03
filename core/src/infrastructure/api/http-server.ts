import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Graph } from '../../domain/graph.js';
import { Registry } from '../../domain/registry.js';
import { ProposalStore } from '../../domain/proposal-store.js';
import { GraphStorage } from '../persistence/graph-storage.js';
import { WorkspaceManager } from '../workspace/workspace-manager.js';
import { PresetRegistry } from '../registry/preset-registry.js';
import { ApplyProposalUseCase } from '../../application/apply-proposal.use-case.js';
import { ValidateProposalUseCase } from '../../application/validate-proposal.use-case.js';
import { RuleEngine } from '../../domain/rule-engine.js';
import { ProposalSchema } from '../../domain/types.js';
import { ArchiOSError } from '../../errors/base-error.js';
import { PresetNotFoundError } from '../../errors/preset-not-found-error.js';

/** Map domain error codes to HTTP statuses. */
const ERROR_STATUS: Record<string, number> = {
  ERR_NO_ACTIVE_WORKSPACE: 409,
  ERR_WORKSPACE_NOT_FOUND: 404,
  ERR_WORKSPACE_PATH: 400,
  ERR_PRESET_NOT_FOUND: 400,
  ERR_GRAPH_PERSISTENCE: 500,
};

export class HTTPServer {
  private app = Fastify({ logger: true });
  private readonly applyUseCase: ApplyProposalUseCase;
  private readonly validateUseCase: ValidateProposalUseCase;

  constructor(
    private graph: Graph,
    private registry: Registry,
    private graphStorage: GraphStorage,
    private proposalStore: ProposalStore,
    private workspaces: WorkspaceManager,
    private presetRegistry: PresetRegistry,
    private ruleEngine: RuleEngine
  ) {
    this.applyUseCase = new ApplyProposalUseCase(this.graph);
    this.validateUseCase = new ValidateProposalUseCase(ruleEngine, this.graph);
    this.setupMiddleware();
    this.setupErrorHandler();
    this.setupRoutes();
  }

  /** Sync in-memory state to the active workspace: preset-scoped registry + graph. */
  private syncContext(): void {
    this.presetRegistry.ensureForActiveWorkspace(this.workspaces);
    this.graphStorage.loadIfChanged(this.graph);
  }

  private async setupMiddleware() {
    await this.app.register(cors, {
      origin: (origin, cb) => {
        // Allow localhost (any port) in dev, and the VSCode webview origin.
        if (
          !origin ||
          /^http:\/\/localhost(:\d+)?$/.test(origin) ||
          /^vscode-webview:\/\//.test(origin)
        ) {
          cb(null, true);
        } else {
          cb(new Error('Not allowed by CORS'), false);
        }
      },
      credentials: true,
    });
  }

  private setupErrorHandler() {
    this.app.setErrorHandler((error, _request, reply) => {
      if (error instanceof ArchiOSError) {
        const status = ERROR_STATUS[error.code] ?? 400;
        return reply.code(status).send({ success: false, code: error.code, message: error.message, context: error.context });
      }
      this.app.log.error(error);
      return reply.code(500).send({ success: false, code: 'ERR_INTERNAL', message: error.message });
    });
  }

  private setupRoutes() {
    // ── Graph ──────────────────────────────────────────────────────────────
    this.app.get('/api/graph', async () => {
      // Reload-before-read: stay consistent with the on-disk SSOT (e.g. after
      // the MCP process or another request mutated the graph, or a workspace switch).
      this.syncContext();

      const nodes = this.graph.getAllNodes().map((node) => {
        const definition = this.registry.has(node.typeId) ? this.registry.get(node.typeId) : null;
        return {
          id: node.id,
          type: 'universal',
          position: node.position ?? { x: 0, y: 0 },
          data: { ...node, style: definition?.style ?? { shape: 'rectangle', color: '#666666' }, render: definition?.render },
        };
      });

      const edgeTypes = this.presetRegistry.getActivePreset()?.edgeTypes ?? [];
      const edges = this.graph.getAllEdges().map((edge) => {
        const relation = edge.type ? edgeTypes.find((t) => t.id === edge.type) : undefined;
        return {
          id: edge.id,
          source: edge.sourceId,
          target: edge.targetId,
          label: edge.label ?? relation?.label,
          // 'relation' selects the custom edge renderer; undefined uses the default edge.
          type: edge.type ? 'relation' : undefined,
          data: { relation: edge.type, style: relation?.style },
        };
      });

      return { nodes, edges };
    });

    this.app.get('/api/definitions', async () => {
      this.presetRegistry.ensureForActiveWorkspace(this.workspaces);
      return this.registry.getAll();
    });

    /** Edge relation types of the active graph's preset (UML extends, ERD 1:N, …). */
    this.app.get('/api/edge-types', async () => {
      this.presetRegistry.ensureForActiveWorkspace(this.workspaces);
      return { edgeTypes: this.presetRegistry.getActivePreset()?.edgeTypes ?? [] };
    });

    /** Active graph context: breadcrumb trail, current preset, edge relation palette. */
    this.app.get('/api/graph/context', async () => {
      this.syncContext();
      const ctx = this.workspaces.getActiveGraphContext();
      const preset = this.presetRegistry.getActivePreset();
      return {
        subgraphId: ctx?.subgraphId ?? null,
        breadcrumb: ctx?.breadcrumb ?? [],
        preset: preset ? { id: preset.id, label: preset.label } : null,
        edgeTypes: preset?.edgeTypes ?? [],
      };
    });

    /** Available architecture presets (for the "create workspace" / sub-graph picker). */
    this.app.get('/api/presets', async () => ({ presets: this.presetRegistry.listPresets() }));

    // ── Direct graph editing (the user is the authority — no approval loop) ──

    /**
     * Apply a batch of operations directly (user-initiated edits from the UI).
     * Validated against the active preset's rules; rejected edits return 422
     * with structured errors instead of silently corrupting the graph.
     */
    this.app.post<{ Body: { operations?: unknown[] } }>('/api/graph/operations', async (request, reply) => {
      this.syncContext();
      const operations = request.body?.operations;
      if (!Array.isArray(operations)) {
        return reply.code(400).send({ error: 'operations must be an array' });
      }

      const proposalData = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        author: 'frontend',
        operations,
      };

      const validation = this.validateUseCase.execute(proposalData);
      if (!validation.valid) {
        return reply.code(422).send({ success: false, errors: validation.errors });
      }

      const { operations: typedOps } = ProposalSchema.parse(proposalData);
      const result = this.applyUseCase.execute(typedOps);

      try {
        this.graphStorage.save(this.graph);
      } catch (err) {
        request.log.error(err, 'Failed to persist graph after direct edit');
        return reply.code(500).send({ success: false, error: 'Failed to persist graph' });
      }

      return {
        success: true,
        applied: result.applied.length,
        failed: result.failed.map((f) => ({ reason: f.reason })),
        graph: { nodeCount: result.finalCounts.nodes, edgeCount: result.finalCounts.edges },
      };
    });

    /** Lightweight node-position update for drag (skips rule validation — geometry only). */
    this.app.patch<{ Params: { id: string }; Body: { x?: number; y?: number } }>(
      '/api/graph/nodes/:id/position',
      async (request, reply) => {
        this.syncContext();
        const node = this.graph.getNode(request.params.id);
        if (!node) return reply.code(404).send({ error: 'Node not found' });

        const { x, y } = request.body ?? {};
        if (typeof x !== 'number' || typeof y !== 'number') {
          return reply.code(400).send({ error: 'x and y must be numbers' });
        }

        this.graph.addNode({ ...node, position: { x, y } });
        try {
          this.graphStorage.save(this.graph);
        } catch (err) {
          request.log.error(err, 'Failed to persist node position');
          return reply.code(500).send({ success: false, error: 'Failed to persist position' });
        }
        return { success: true };
      }
    );

    // ── Sub-graphs (drill-down) ──────────────────────────────────────────────

    /**
     * Create a sub-graph for a node (with its own architecture preset) and mark
     * the node as owning it. E.g. give a "Database" node an ERD sub-graph.
     */
    this.app.post<{ Params: { id: string }; Body: { presetId?: string } }>(
      '/api/graph/nodes/:id/subgraph',
      async (request, reply) => {
        this.syncContext();
        const node = this.graph.getNode(request.params.id);
        if (!node) return reply.code(404).send({ error: 'Node not found' });

        const presetId = request.body?.presetId;
        if (!presetId) return reply.code(400).send({ error: 'presetId is required' });
        if (!this.presetRegistry.hasPreset(presetId)) {
          throw new PresetNotFoundError(presetId, this.presetRegistry.listPresets().map((p) => p.id));
        }

        const effectivePreset = this.workspaces.createSubgraph(node.id, presetId);
        // Mark the node so the frontend shows a drill-down affordance.
        this.graph.addNode({ ...node, subgraph: { presetId: effectivePreset } });
        try {
          this.graphStorage.save(this.graph);
        } catch (err) {
          request.log.error(err, 'Failed to persist sub-graph marker');
          return reply.code(500).send({ success: false, error: 'Failed to persist sub-graph' });
        }
        return { success: true, nodeId: node.id, presetId: effectivePreset };
      }
    );

    /**
     * Set the active drill-down trail (breadcrumb). Empty stack = root graph.
     * The frontend sends the full desired trail (enter pushes, exit/jump truncates).
     */
    this.app.put<{ Body: { stack?: Array<{ id: string; label: string }> } }>(
      '/api/graph/active',
      async (request, reply) => {
        const stack = request.body?.stack ?? [];
        if (!Array.isArray(stack)) return reply.code(400).send({ error: 'stack must be an array' });
        const ctx = this.workspaces.setGraphStack(stack);
        this.syncContext();
        return { success: true, subgraphId: ctx.subgraphId, breadcrumb: ctx.breadcrumb };
      }
    );

    /**
     * Advisory graph-integrity check against the active preset's "soft" rules
     * (requiredTypes, requiredConnections, maxDepth). Non-blocking — the frontend
     * surfaces these as warnings, unlike the per-operation rules enforced on edit.
     */
    this.app.get('/api/graph/validate', async () => {
      this.syncContext();
      const result = this.ruleEngine.validateGraphIntegrity();
      return { valid: result.valid, errors: result.errors ?? [] };
    });

    this.app.get('/health', async () => ({
      status: 'ok',
      nodes: this.graph.getAllNodes().length,
      edges: this.graph.getAllEdges().length,
      types: this.registry.getAll().length,
    }));

    // ── Workspaces ───────────────────────────────────────────────────────────

    /** Active workspace + recently opened workspaces. */
    this.app.get('/api/workspaces', async () => this.workspaces.list());

    /** Create a new workspace at a folder and make it active. */
    this.app.post<{ Body: { path?: string; name?: string; presetId?: string; description?: string } }>(
      '/api/workspaces',
      async (request, reply) => {
        const { path: wsPath, name, presetId, description } = request.body ?? {};
        if (!wsPath || !name || !presetId) {
          return reply.code(400).send({ error: 'path, name and presetId are required' });
        }
        if (!this.presetRegistry.hasPreset(presetId)) {
          throw new PresetNotFoundError(presetId, this.presetRegistry.listPresets().map((p) => p.id));
        }
        const workspace = this.workspaces.create(wsPath, { name, presetId, description });
        this.onWorkspaceChanged();
        return { workspace };
      }
    );

    /** Open / switch the active workspace to an already-initialized folder. */
    this.app.put<{ Body: { path?: string } }>('/api/workspaces/active', async (request, reply) => {
      const wsPath = request.body?.path;
      if (!wsPath) return reply.code(400).send({ error: 'path is required' });
      const workspace = this.workspaces.open(wsPath);
      this.onWorkspaceChanged();
      return { workspace };
    });

    /** Browse folders under the allowed root (for the "open folder" picker). */
    this.app.get<{ Querystring: { path?: string } }>('/api/fs/list', async (request) =>
      this.workspaces.listDirectories(request.query?.path)
    );

    // ── Proposals ──────────────────────────────────────────────────────────

    /** List all pending proposals (polled by the frontend every 2s) */
    this.app.get('/api/proposals/pending', async () => ({
      proposals: this.proposalStore.getPending(),
    }));

    /** Accept or reject a proposal */
    this.app.put<{
      Params: { id: string };
      Body: { action: 'accept' | 'reject'; reason?: string };
    }>('/api/proposals/:id', async (request, reply) => {
      const { id } = request.params;
      const { action, reason } = request.body;

      if (action !== 'accept' && action !== 'reject') {
        return reply.code(400).send({ error: 'action must be "accept" or "reject"' });
      }

      const proposal = this.proposalStore.get(id);
      if (!proposal) return reply.code(404).send({ error: 'Proposal not found' });
      if (proposal.status !== 'pending') {
        return reply.code(409).send({ error: `Proposal already ${proposal.status}` });
      }

      if (action === 'reject') {
        this.proposalStore.resolve(id, 'rejected', reason?.trim() || undefined);
        return { success: true, proposalId: id, status: 'rejected' };
      }

      // ── Apply accepted proposal ─────────────────────────────────────────
      // Reload from the SSOT first so we apply against the current graph, then
      // persist BEFORE resolving — a save failure must leave the proposal
      // pending instead of falsely reporting success.
      this.syncContext();
      const result = this.applyUseCase.execute(proposal.operations);

      try {
        this.graphStorage.save(this.graph);
      } catch (err) {
        request.log.error(err, 'Failed to persist graph after accepting proposal');
        return reply.code(500).send({
          success: false,
          proposalId: id,
          error: 'Failed to persist graph; proposal left pending',
        });
      }

      this.proposalStore.resolve(id, 'accepted', undefined, {
        applied: result.applied.length,
        failed: result.failed.map((f) => ({ reason: f.reason })),
        finalCounts: result.finalCounts,
      });

      return {
        success: true,
        proposalId: id,
        status: 'accepted',
        applied: result.applied.length,
        failed: result.failed.map((f) => ({ reason: f.reason })),
        graph: {
          nodeCount: result.finalCounts.nodes,
          edgeCount: result.finalCounts.edges,
        },
      };
    });
  }

  /** Called after the active workspace changes — refreshes preset + graph. */
  private onWorkspaceChanged(): void {
    this.syncContext();
  }

  async start(port = 3000) {
    try {
      await this.app.listen({ port, host: '0.0.0.0' });
      console.log(`\n🌐 HTTP API on http://localhost:${port}`);
      console.log('   GET  /api/graph · /api/definitions · /api/presets · /api/workspaces · /api/fs/list');
      console.log('   POST /api/workspaces   PUT /api/workspaces/active');
      console.log('   GET  /api/proposals/pending   PUT /api/proposals/:id\n');
    } catch (err) {
      this.app.log.error(err);
      process.exit(1);
    }
  }

  async stop() {
    await this.app.close();
  }
}
