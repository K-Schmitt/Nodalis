import { ProposalSchema, ValidationResult, type Node, type Edge } from '../domain/types.js';
import { RuleEngine } from '../domain/rule-engine.js';
import { Graph } from '../domain/graph.js';

export class ValidateProposalUseCase {
  constructor(
    private ruleEngine: RuleEngine,
    private graph: Graph
  ) {}

  execute(proposalData: unknown): ValidationResult {
    const parseResult = ProposalSchema.safeParse(proposalData);
    if (!parseResult.success) {
      return {
        valid: false,
        errors: [{
          code: 'ERR_SCHEMA_VALIDATION',
          message: 'Proposal schema validation failed',
          context: { validationErrors: parseResult.error.errors },
        }],
      };
    }

    const proposal = parseResult.data;
    const errors: Array<{ code: string; message: string; context?: Record<string, unknown> }> = [];

    // Nodes added earlier in this same batch must be visible to later edge
    // validations (you can define nodes then connect them in one proposal).
    const prospectiveNodes = new Map<string, Node>();
    const prospectiveEdges: Edge[] = [];

    // Track how many nodes of each typeId are added earlier in this proposal
    // so that maxNodesPerType accounts for the full batch, not just the graph state.
    const pendingNodesByTypeId = new Map<string, number>();

    for (const operation of proposal.operations) {
      switch (operation.op) {
        case 'add_node': {
          const nodeValidation = this.ruleEngine.validateNode(operation.payload, { pendingNodesByTypeId });
          if (!nodeValidation.valid) errors.push(...(nodeValidation.errors ?? []));
          // Register this node as pending so subsequent ops in the same proposal see it
          prospectiveNodes.set(operation.payload.id, operation.payload);
          const prev = pendingNodesByTypeId.get(operation.payload.typeId) ?? 0;
          pendingNodesByTypeId.set(operation.payload.typeId, prev + 1);
          break;
        }

        case 'add_edge': {
          const edge = operation.payload;
          const connectionValidation = this.ruleEngine.validateConnection(
            edge.sourceId,
            edge.targetId,
            prospectiveNodes,
            edge
          );
          if (!connectionValidation.valid) errors.push(...(connectionValidation.errors ?? []));

          // Cycle check is guarded by the preset's noCycles flag (default: true)
          if (this.ruleEngine.shouldBlockCycles() && this.ruleEngine.detectCycle(edge, prospectiveEdges)) {
            errors.push({
              code: 'ERR_CYCLE_DETECTED',
              message: 'Adding this edge would create a cycle',
              context: { edgeId: edge.id, sourceId: edge.sourceId, targetId: edge.targetId },
            });
          }
          prospectiveEdges.push(edge);
          break;
        }

        case 'delete_node': {
          if (!this.graph.hasNode(operation.payload.id)) {
            errors.push({
              code: 'ERR_NODE_NOT_FOUND',
              message: `Cannot delete non-existent node: ${operation.payload.id}`,
              context: { nodeId: operation.payload.id },
            });
          }
          break;
        }

        case 'delete_edge': {
          if (!this.graph.hasEdge(operation.payload.id)) {
            errors.push({
              code: 'ERR_EDGE_NOT_FOUND',
              message: `Cannot delete non-existent edge: ${operation.payload.id}`,
              context: { edgeId: operation.payload.id },
            });
          }
          break;
        }
      }
    }

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }
}
