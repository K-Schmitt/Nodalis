import { Operation } from '../domain/types.js';
import { Graph } from '../domain/graph.js';

/** Outcome of applying a batch of operations to the graph. */
export interface ApplyResult {
  /** Operations that mutated the graph successfully. */
  applied: Operation[];
  /** Operations that could not be applied, with the reason why. */
  failed: Array<{ op: Operation; reason: string }>;
  /** Node/edge counts AFTER the batch was applied. */
  finalCounts: { nodes: number; edges: number };
}

/**
 * Use Case: Apply a validated batch of operations to the graph.
 *
 * This is the single, authoritative place that mutates the graph. It tracks the
 * outcome of every operation so callers can report the *real* result instead of
 * blindly assuming success — this is what prevents the "I deleted everything but
 * nothing was deleted, yet the agent thinks it worked" class of bugs.
 *
 * Validation (rule engine, schema) happens upstream (ValidateProposalUseCase);
 * this use case only checks for the existence of targets so that a delete of a
 * missing entity is reported as `failed` rather than silently swallowed.
 */
export class ApplyProposalUseCase {
  constructor(private graph: Graph) {}

  execute(operations: Operation[]): ApplyResult {
    const applied: Operation[] = [];
    const failed: Array<{ op: Operation; reason: string }> = [];

    for (const op of operations) {
      switch (op.op) {
        case 'add_node':
          this.graph.addNode(op.payload);
          applied.push(op);
          break;

        case 'add_edge':
          this.graph.addEdge(op.payload);
          applied.push(op);
          break;

        case 'update_node': {
          const existing = this.graph.getNode(op.payload.id);
          if (!existing) {
            failed.push({ op, reason: `Node not found: ${op.payload.id}` });
            break;
          }
          this.graph.addNode({ ...existing, ...op.payload.changes });
          applied.push(op);
          break;
        }

        case 'delete_node': {
          if (!this.graph.hasNode(op.payload.id)) {
            failed.push({ op, reason: `Node not found: ${op.payload.id}` });
            break;
          }
          // Remove connected edges first to avoid orphans, then the node itself.
          this.graph.getNodeEdges(op.payload.id).forEach((e) => this.graph.removeEdge(e.id));
          this.graph.removeNode(op.payload.id);
          applied.push(op);
          break;
        }

        case 'delete_edge': {
          const removed = this.graph.removeEdge(op.payload.id);
          if (!removed) {
            failed.push({ op, reason: `Edge not found: ${op.payload.id}` });
            break;
          }
          applied.push(op);
          break;
        }

        case 'clear_all':
          this.graph.clear();
          applied.push(op);
          break;
      }
    }

    return {
      applied,
      failed,
      finalCounts: {
        nodes: this.graph.getAllNodes().length,
        edges: this.graph.getAllEdges().length,
      },
    };
  }
}
