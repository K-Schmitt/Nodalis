import { describe, it, expect, beforeEach } from 'vitest';
import { Graph } from '../../src/domain/graph.js';
import { ApplyProposalUseCase } from '../../src/application/apply-proposal.use-case.js';
import type { Node, Edge, Operation } from '../../src/domain/types.js';

const makeNode = (id: string): Node => ({ id, typeId: 'tech:frontend:react', label: id });
const makeEdge = (id: string, sourceId: string, targetId: string): Edge => ({ id, sourceId, targetId });

describe('ApplyProposalUseCase', () => {
  let graph: Graph;
  let useCase: ApplyProposalUseCase;

  beforeEach(() => {
    graph = new Graph();
    useCase = new ApplyProposalUseCase(graph);
  });

  it('applies add_node / add_edge and reports final counts', () => {
    const ops: Operation[] = [
      { op: 'add_node', payload: makeNode('a') },
      { op: 'add_node', payload: makeNode('b') },
      { op: 'add_edge', payload: makeEdge('e1', 'a', 'b') },
    ];
    const result = useCase.execute(ops);
    expect(result.applied).toHaveLength(3);
    expect(result.failed).toHaveLength(0);
    expect(result.finalCounts).toEqual({ nodes: 2, edges: 1 });
  });

  it('delete_node also removes the connected edges', () => {
    useCase.execute([
      { op: 'add_node', payload: makeNode('a') },
      { op: 'add_node', payload: makeNode('b') },
      { op: 'add_edge', payload: makeEdge('e1', 'a', 'b') },
    ]);

    const result = useCase.execute([{ op: 'delete_node', payload: { id: 'a' } }]);
    expect(result.applied).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(graph.hasNode('a')).toBe(false);
    expect(graph.hasEdge('e1')).toBe(false);
    expect(result.finalCounts).toEqual({ nodes: 1, edges: 0 });
  });

  it('reports a delete of a missing node as failed (no silent no-op)', () => {
    const result = useCase.execute([{ op: 'delete_node', payload: { id: 'ghost' } }]);
    expect(result.applied).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toContain('ghost');
  });

  it('reports a delete of a missing edge as failed', () => {
    const result = useCase.execute([{ op: 'delete_edge', payload: { id: 'ghost-edge' } }]);
    expect(result.failed).toHaveLength(1);
    expect(result.applied).toHaveLength(0);
  });

  it('clear_all wipes the entire graph atomically', () => {
    useCase.execute([
      { op: 'add_node', payload: makeNode('a') },
      { op: 'add_node', payload: makeNode('b') },
      { op: 'add_edge', payload: makeEdge('e1', 'a', 'b') },
    ]);

    const result = useCase.execute([{ op: 'clear_all', payload: {} }]);
    expect(result.applied).toHaveLength(1);
    expect(result.finalCounts).toEqual({ nodes: 0, edges: 0 });
    expect(graph.getAllNodes()).toHaveLength(0);
  });

  it('deletes a large batch (> 50 nodes) fully — the old proposal cap no longer truncates', () => {
    const addOps: Operation[] = Array.from({ length: 60 }, (_, i) => ({
      op: 'add_node',
      payload: makeNode(`n${i}`),
    }));
    useCase.execute(addOps);
    expect(graph.getAllNodes()).toHaveLength(60);

    const deleteOps: Operation[] = Array.from({ length: 60 }, (_, i) => ({
      op: 'delete_node',
      payload: { id: `n${i}` },
    }));
    const result = useCase.execute(deleteOps);
    expect(result.applied).toHaveLength(60);
    expect(result.failed).toHaveLength(0);
    expect(graph.getAllNodes()).toHaveLength(0);
  });

  it('tracks per-operation success/failure in a mixed batch', () => {
    useCase.execute([{ op: 'add_node', payload: makeNode('a') }]);

    const result = useCase.execute([
      { op: 'delete_node', payload: { id: 'a' } },      // ok
      { op: 'delete_node', payload: { id: 'missing' } }, // fails
      { op: 'update_node', payload: { id: 'gone', changes: { label: 'x' } } }, // fails
    ]);

    expect(result.applied).toHaveLength(1);
    expect(result.failed).toHaveLength(2);
    expect(result.finalCounts).toEqual({ nodes: 0, edges: 0 });
  });
});
