import { Registry } from './registry.js';
import { Graph } from './graph.js';
import { Edge, Node, ValidationResult, ValidationError, type PresetRules, type EdgeType } from './types.js';
import { buildZodSchemaFromDataSchema } from './data-schema-validator.js';
import { DefinitionNotFoundError } from '../errors/definition-not-found-error.js';

export class RuleEngine {
  private presetRules?: PresetRules;
  private edgeTypes?: EdgeType[];

  constructor(
    private registry: Registry,
    private graph: Graph
  ) {}

  setPresetRules(rules?: PresetRules): void {
    this.presetRules = rules;
  }

  /** Set the relation types the active preset allows on edges. */
  setEdgeTypes(edgeTypes?: EdgeType[]): void {
    this.edgeTypes = edgeTypes;
  }

  /**
   * Validate an edge's semantic relation against the active preset's edgeTypes.
   * No-op when the preset declares no edgeTypes (plain edges) or no type is set.
   */
  validateEdgeRelation(type?: string): ValidationResult {
    if (!type || !this.edgeTypes || this.edgeTypes.length === 0) return { valid: true };
    if (this.edgeTypes.some((t) => t.id === type)) return { valid: true };
    return {
      valid: false,
      errors: [{
        code: 'ERR_EDGE_TYPE_UNKNOWN',
        message: `Edge relation "${type}" is not defined in the active preset. Allowed: ${this.edgeTypes.map((t) => t.id).join(', ')}`,
        context: { type, allowed: this.edgeTypes.map((t) => t.id) },
      }],
    };
  }

  /** Whether cycles are blocked in the active preset (default: true). */
  shouldBlockCycles(): boolean {
    return this.presetRules?.noCycles !== false;
  }

  /**
   * Validate a node against its definition and active preset rules.
   * `ctx.pendingNodesByTypeId` tracks typeIds already queued earlier in the
   * same proposal so that `maxNodesPerType` accounts for the full proposal.
   */
  validateNode(
    node: Node,
    ctx?: { pendingNodesByTypeId?: Map<string, number> }
  ): ValidationResult {
    const errors: ValidationError[] = [];

    let definition;
    try {
      definition = this.registry.get(node.typeId);
    } catch (e) {
      if (e instanceof DefinitionNotFoundError) {
        errors.push({
          code: 'ERR_TYPE_NOT_FOUND',
          message: `Unknown node type: "${node.typeId}" — is the correct preset loaded?`,
          context: { typeId: node.typeId },
        });
        return { valid: false, errors };
      }
      throw e;
    }

    // Preset: forbiddenTypes — block the whole type/category
    for (const forbidden of this.presetRules?.forbiddenTypes ?? []) {
      if (node.typeId === forbidden || definition.category === forbidden) {
        errors.push({
          code: 'ERR_TYPE_FORBIDDEN',
          message: `Node type "${node.typeId}" (category: "${definition.category}") is forbidden in the active preset`,
          context: { typeId: node.typeId, category: definition.category, forbidden },
        });
      }
    }

    // Preset: maxNodesPerType — count existing + already-pending in this proposal
    const typeLimit = this.presetRules?.maxNodesPerType?.[node.typeId];
    if (typeLimit !== undefined) {
      const existingCount = this.graph.getAllNodes().filter(n => n.typeId === node.typeId).length;
      const pendingCount = ctx?.pendingNodesByTypeId?.get(node.typeId) ?? 0;
      if (existingCount + pendingCount >= typeLimit) {
        errors.push({
          code: 'ERR_MAX_NODES_PER_TYPE',
          message: `Cannot add node: maximum ${typeLimit} node(s) of type "${node.typeId}" already reached (${existingCount} existing + ${pendingCount} pending in this proposal)`,
          context: { typeId: node.typeId, limit: typeLimit, existing: existingCount, pending: pendingCount },
        });
      }
    }

    // Required fields
    if (definition.constraints?.requiredFields) {
      const missingFields = definition.constraints.requiredFields.filter(
        field => !node.data || !(field in node.data)
      );
      if (missingFields.length > 0) {
        errors.push({
          code: 'ERR_MISSING_REQUIRED_FIELDS',
          message: `Node is missing required fields: ${missingFields.join(', ')}`,
          context: { nodeId: node.id, missingFields, requiredFields: definition.constraints.requiredFields },
        });
      }
    }

    // dataSchema validation
    if (definition.dataSchema && node.data) {
      const zodSchema = buildZodSchemaFromDataSchema(
        definition.dataSchema as Record<string, unknown>,
        definition.constraints?.requiredFields ?? []
      );
      const result = zodSchema.safeParse(node.data);
      if (!result.success) {
        errors.push({
          code: 'ERR_DATA_SCHEMA_INVALID',
          message: `Node data does not match definition schema for ${node.typeId}`,
          context: {
            nodeId: node.id,
            typeId: node.typeId,
            validationErrors: result.error.issues.map(i => ({
              field: i.path.join('.'),
              message: i.message,
            })),
          },
        });
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  /**
   * Validate a connection between two nodes.
   * Pass `proposedEdge` so that `maxDepth` can be checked prospectively.
   * Pass `overrideNodes` for within-proposal prospective node lookup.
   */
  validateConnection(
    sourceId: string,
    targetId: string,
    overrideNodes?: Map<string, Node>,
    proposedEdge?: Edge
  ): ValidationResult {
    const errors: ValidationError[] = [];

    const sourceNode = overrideNodes?.get(sourceId) ?? this.graph.getNode(sourceId);
    const targetNode = overrideNodes?.get(targetId) ?? this.graph.getNode(targetId);

    if (!sourceNode) {
      errors.push({ code: 'ERR_NODE_NOT_FOUND', message: `Source node not found: ${sourceId}`, context: { sourceId } });
    }
    if (!targetNode) {
      errors.push({ code: 'ERR_NODE_NOT_FOUND', message: `Target node not found: ${targetId}`, context: { targetId } });
    }
    if (errors.length > 0) return { valid: false, errors };

    const sourceDefinition = this.registry.tryGet(sourceNode!.typeId);
    const targetDefinition = this.registry.tryGet(targetNode!.typeId);

    if (!sourceDefinition) {
      errors.push({ code: 'ERR_TYPE_NOT_FOUND', message: `Unknown source type: "${sourceNode!.typeId}"`, context: { typeId: sourceNode!.typeId } });
    }
    if (!targetDefinition) {
      errors.push({ code: 'ERR_TYPE_NOT_FOUND', message: `Unknown target type: "${targetNode!.typeId}"`, context: { typeId: targetNode!.typeId } });
    }
    if (errors.length > 0) return { valid: false, errors };

    // Preset: forbiddenConnections
    for (const rule of this.presetRules?.forbiddenConnections ?? []) {
      const fromMatch = sourceNode!.typeId === rule.from || sourceDefinition!.category === rule.from;
      const toMatch = targetNode!.typeId === rule.to || targetDefinition!.category === rule.to;
      if (fromMatch && toMatch) {
        errors.push({
          code: 'ERR_CONNECTION_FORBIDDEN',
          message: `Connection from "${rule.from}" to "${rule.to}" is forbidden by the active preset${rule.reason ? ` — ${rule.reason}` : ''}`,
          context: { from: rule.from, to: rule.to, sourceTypeId: sourceNode!.typeId, targetTypeId: targetNode!.typeId, reason: rule.reason },
        });
      }
    }

    // Preset: allowedConnectionsOnly whitelist
    const whitelist = this.presetRules?.allowedConnectionsOnly;
    if (whitelist && whitelist.length > 0) {
      const allowed = whitelist.some(rule => {
        const fromMatch = sourceNode!.typeId === rule.from || sourceDefinition!.category === rule.from;
        const toMatch = targetNode!.typeId === rule.to || targetDefinition!.category === rule.to;
        return fromMatch && toMatch;
      });
      if (!allowed) {
        errors.push({
          code: 'ERR_CONNECTION_NOT_WHITELISTED',
          message: `Connection from category "${sourceDefinition!.category}" to "${targetDefinition!.category}" is not permitted in this preset (whitelist mode active)`,
          context: {
            sourceTypeId: sourceNode!.typeId,
            targetTypeId: targetNode!.typeId,
            sourceCategory: sourceDefinition!.category,
            targetCategory: targetDefinition!.category,
          },
        });
      }
    }

    // Per-node: allowedTargets
    if (sourceDefinition!.constraints?.allowedTargets) {
      if (!sourceDefinition!.constraints.allowedTargets.includes(targetNode!.typeId)) {
        errors.push({
          code: 'ERR_TARGET_NOT_ALLOWED',
          message: `Node type "${sourceNode!.typeId}" cannot connect to "${targetNode!.typeId}"`,
          context: {
            sourceTypeId: sourceNode!.typeId,
            targetTypeId: targetNode!.typeId,
            allowedTargets: sourceDefinition!.constraints.allowedTargets,
          },
        });
      }
    }

    // Per-node: allowedSources
    if (targetDefinition!.constraints?.allowedSources) {
      if (!targetDefinition!.constraints.allowedSources.includes(sourceNode!.typeId)) {
        errors.push({
          code: 'ERR_SOURCE_NOT_ALLOWED',
          message: `Node type "${targetNode!.typeId}" cannot accept connections from "${sourceNode!.typeId}"`,
          context: {
            sourceTypeId: sourceNode!.typeId,
            targetTypeId: targetNode!.typeId,
            allowedSources: targetDefinition!.constraints.allowedSources,
          },
        });
      }
    }

    // Per-node: maxOutputs (node constraint > preset default)
    const maxOutputs = sourceDefinition!.constraints?.maxOutputs ?? this.presetRules?.defaultMaxOutputs;
    if (maxOutputs !== undefined) {
      const currentOutputs = this.graph.getAllEdges().filter(e => e.sourceId === sourceId).length;
      if (currentOutputs >= maxOutputs) {
        errors.push({
          code: 'ERR_MAX_OUTPUTS_EXCEEDED',
          message: `Node ${sourceId} has reached its maximum outputs (${maxOutputs})`,
          context: { nodeId: sourceId, maxOutputs, currentOutputs },
        });
      }
    }

    // Per-node: maxInputs
    const maxInputs = targetDefinition!.constraints?.maxInputs ?? this.presetRules?.defaultMaxInputs;
    if (maxInputs !== undefined) {
      const currentInputs = this.graph.getAllEdges().filter(e => e.targetId === targetId).length;
      if (currentInputs >= maxInputs) {
        errors.push({
          code: 'ERR_MAX_INPUTS_EXCEEDED',
          message: `Node ${targetId} has reached its maximum inputs (${maxInputs})`,
          context: { nodeId: targetId, maxInputs, currentInputs },
        });
      }
    }

    // Preset: edge relation must be a declared edgeType (when the paradigm uses them)
    if (proposedEdge?.type) {
      const rel = this.validateEdgeRelation(proposedEdge.type);
      if (!rel.valid) errors.push(...(rel.errors ?? []));
    }

    // Preset: maxDepth — computed prospectively with the proposed edge included
    if (this.presetRules?.maxDepth !== undefined && proposedEdge) {
      const depth = this.computeMaxDepthWithEdge(proposedEdge);
      if (depth > this.presetRules.maxDepth) {
        errors.push({
          code: 'ERR_MAX_DEPTH_EXCEEDED',
          message: `This connection would push the graph depth to ${depth}, exceeding the preset limit of ${this.presetRules.maxDepth}`,
          context: { maxDepth: this.presetRules.maxDepth, projectedDepth: depth },
        });
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  /**
   * Detect if adding `newEdge` would create a cycle.
   * Accepts optional extra edges for prospective validation within a proposal.
   */
  detectCycle(newEdge: Edge, extraEdges: Edge[] = []): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const allEdges = [...this.graph.getAllEdges(), ...extraEdges, newEdge];

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);
      for (const edge of allEdges.filter(e => e.sourceId === nodeId)) {
        if (!visited.has(edge.targetId)) {
          if (dfs(edge.targetId)) return true;
        } else if (recStack.has(edge.targetId)) {
          return true;
        }
      }
      recStack.delete(nodeId);
      return false;
    };

    return dfs(newEdge.sourceId);
  }

  /**
   * Advisory graph integrity check — not called automatically during proposal
   * validation (which would block incremental builds). Call it explicitly via
   * `GET /api/graph/validate` or the `validate_graph` MCP tool.
   *
   * Checks: requiredTypes, requiredConnections, maxDepth (on the full graph).
   */
  validateGraphIntegrity(nodes?: Node[], edges?: Edge[]): ValidationResult {
    const allNodes = nodes ?? this.graph.getAllNodes();
    const allEdges = edges ?? this.graph.getAllEdges();
    const errors: ValidationError[] = [];

    // requiredTypes: at least one node of this typeId or category must exist
    for (const required of this.presetRules?.requiredTypes ?? []) {
      const found = allNodes.some(n => {
        if (n.typeId === required) return true;
        const def = this.registry.tryGet(n.typeId);
        return def?.category === required;
      });
      if (!found) {
        errors.push({
          code: 'ERR_REQUIRED_TYPE_MISSING',
          message: `This preset requires at least one node of type or category "${required}"`,
          context: { required },
        });
      }
    }

    // requiredConnections: every `from` node must have at least one edge to a `to` node
    for (const rule of this.presetRules?.requiredConnections ?? []) {
      const fromNodes = allNodes.filter(n => {
        if (n.typeId === rule.from) return true;
        const def = this.registry.tryGet(n.typeId);
        return def?.category === rule.from;
      });

      for (const fromNode of fromNodes) {
        const hasConnection = allEdges.some(e => {
          if (e.sourceId !== fromNode.id) return false;
          const targetNode = allNodes.find(n => n.id === e.targetId);
          if (!targetNode) return false;
          if (targetNode.typeId === rule.to) return true;
          const def = this.registry.tryGet(targetNode.typeId);
          return def?.category === rule.to;
        });

        if (!hasConnection) {
          const fromLabel = this.registry.tryGet(fromNode.typeId)?.label ?? fromNode.typeId;
          errors.push({
            code: 'ERR_REQUIRED_CONNECTION_MISSING',
            message: `Node "${fromLabel}" (${fromNode.id.slice(0, 8)}…) must connect to "${rule.to}"${rule.reason ? ` — ${rule.reason}` : ''}`,
            context: { nodeId: fromNode.id, typeId: fromNode.typeId, requiredTarget: rule.to, reason: rule.reason },
          });
        }
      }
    }

    // maxDepth advisory check on the full graph
    if (this.presetRules?.maxDepth !== undefined) {
      const depth = this.computeMaxDepth(allNodes, allEdges);
      if (depth > this.presetRules.maxDepth) {
        errors.push({
          code: 'ERR_MAX_DEPTH_EXCEEDED',
          message: `Graph depth (${depth}) exceeds the preset limit of ${this.presetRules.maxDepth}`,
          context: { maxDepth: this.presetRules.maxDepth, actualDepth: depth },
        });
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }

  // ---------- private helpers ----------

  private computeMaxDepthWithEdge(extraEdge: Edge): number {
    return this.computeMaxDepth(this.graph.getAllNodes(), [...this.graph.getAllEdges(), extraEdge]);
  }

  private computeMaxDepth(nodes: Node[], edges: Edge[]): number {
    if (nodes.length === 0) return 0;

    const adjacency = new Map<string, string[]>();
    for (const n of nodes) adjacency.set(n.id, []);
    for (const e of edges) {
      const targets = adjacency.get(e.sourceId);
      if (targets) targets.push(e.targetId);
    }

    const inDegree = new Map<string, number>();
    for (const n of nodes) inDegree.set(n.id, 0);
    for (const e of edges) {
      inDegree.set(e.targetId, (inDegree.get(e.targetId) ?? 0) + 1);
    }

    let maxDepth = 0;

    // DFS from each root (nodes with no incoming edge). Guard against cycles.
    const dfs = (nodeId: string, depth: number, onPath: Set<string>): void => {
      if (onPath.has(nodeId)) return;
      maxDepth = Math.max(maxDepth, depth);
      onPath.add(nodeId);
      for (const targetId of adjacency.get(nodeId) ?? []) {
        dfs(targetId, depth + 1, onPath);
      }
      onPath.delete(nodeId);
    };

    const roots = nodes.filter(n => (inDegree.get(n.id) ?? 0) === 0);
    for (const root of roots) {
      dfs(root.id, 0, new Set());
    }

    // Fallback: if the graph is entirely cyclic, start from any node
    if (roots.length === 0 && nodes.length > 0) {
      dfs(nodes[0].id, 0, new Set());
    }

    return maxDepth;
  }
}
