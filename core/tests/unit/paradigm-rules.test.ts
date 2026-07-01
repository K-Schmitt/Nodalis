import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from '../../src/domain/registry.js';
import { Graph } from '../../src/domain/graph.js';
import { RuleEngine } from '../../src/domain/rule-engine.js';
import type { Definition, Node, Edge } from '../../src/domain/types.js';

const tableDef: Definition = {
  typeId: 'erd:entity:table', label: 'Table', category: 'entity',
  style: { shape: 'cylinder', color: '#4F46E5' },
};
const enumDef: Definition = {
  typeId: 'erd:type:enum', label: 'Enum', category: 'type',
  style: { shape: 'hexagon', color: '#0D9488' },
};

const node = (id: string, typeId: string): Node => ({ id, typeId, label: id });
const edge = (id: string, sourceId: string, targetId: string, type?: string): Edge => ({ id, sourceId, targetId, type });

describe('Paradigm rules (new)', () => {
  let registry: Registry;
  let graph: Graph;
  let engine: RuleEngine;

  beforeEach(() => {
    registry = new Registry();
    graph = new Graph();
    engine = new RuleEngine(registry, graph);
    registry.register(tableDef);
    registry.register(enumDef);
  });

  describe('edge relation types', () => {
    it('accepts a declared relation type', () => {
      engine.setEdgeTypes([{ id: 'one-to-many', label: '1:N', style: {} }]);
      expect(engine.validateEdgeRelation('one-to-many').valid).toBe(true);
    });

    it('rejects an unknown relation type', () => {
      engine.setEdgeTypes([{ id: 'one-to-many', label: '1:N', style: {} }]);
      const r = engine.validateEdgeRelation('bogus');
      expect(r.valid).toBe(false);
      expect(r.errors?.[0].code).toBe('ERR_EDGE_TYPE_UNKNOWN');
    });

    it('is a no-op when the preset declares no edge types', () => {
      expect(engine.validateEdgeRelation('anything').valid).toBe(true);
    });

    it('validates relation through validateConnection when an edge type is set', () => {
      graph.addNode(node('a', 'erd:entity:table'));
      graph.addNode(node('b', 'erd:entity:table'));
      engine.setEdgeTypes([{ id: 'one-to-many', label: '1:N', style: {} }]);
      const ok = engine.validateConnection('a', 'b', undefined, edge('e', 'a', 'b', 'one-to-many'));
      expect(ok.valid).toBe(true);
      const bad = engine.validateConnection('a', 'b', undefined, edge('e', 'a', 'b', 'nope'));
      expect(bad.valid).toBe(false);
    });
  });

  describe('forbiddenTypes', () => {
    it('blocks a node whose typeId is forbidden', () => {
      engine.setPresetRules({ forbiddenTypes: ['erd:type:enum'] });
      const r = engine.validateNode(node('n', 'erd:type:enum'));
      expect(r.valid).toBe(false);
      expect(r.errors?.some((e) => e.code === 'ERR_TYPE_FORBIDDEN')).toBe(true);
    });

    it('blocks a node whose category is forbidden', () => {
      engine.setPresetRules({ forbiddenTypes: ['type'] });
      expect(engine.validateNode(node('n', 'erd:type:enum')).valid).toBe(false);
    });
  });

  describe('maxNodesPerType', () => {
    it('blocks creating more than the allowed count', () => {
      engine.setPresetRules({ maxNodesPerType: { 'erd:entity:table': 1 } });
      graph.addNode(node('t1', 'erd:entity:table'));
      const r = engine.validateNode(node('t2', 'erd:entity:table'));
      expect(r.valid).toBe(false);
      expect(r.errors?.[0].code).toBe('ERR_MAX_NODES_PER_TYPE');
    });

    it('counts nodes pending earlier in the same proposal', () => {
      engine.setPresetRules({ maxNodesPerType: { 'erd:entity:table': 1 } });
      const pending = new Map<string, number>([['erd:entity:table', 1]]);
      const r = engine.validateNode(node('t1', 'erd:entity:table'), { pendingNodesByTypeId: pending });
      expect(r.valid).toBe(false);
    });
  });

  describe('noCycles flag', () => {
    it('blocks cycles by default', () => {
      expect(engine.shouldBlockCycles()).toBe(true);
    });

    it('allows cycles when the preset opts out', () => {
      engine.setPresetRules({ noCycles: false });
      expect(engine.shouldBlockCycles()).toBe(false);
    });
  });

  describe('validateGraphIntegrity (advisory)', () => {
    it('reports a missing required type', () => {
      engine.setPresetRules({ requiredTypes: ['erd:entity:table'] });
      const r = engine.validateGraphIntegrity();
      expect(r.valid).toBe(false);
      expect(r.errors?.[0].code).toBe('ERR_REQUIRED_TYPE_MISSING');
    });

    it('passes once a required type is present', () => {
      engine.setPresetRules({ requiredTypes: ['erd:entity:table'] });
      graph.addNode(node('t', 'erd:entity:table'));
      expect(engine.validateGraphIntegrity().valid).toBe(true);
    });

    it('reports a required connection that is missing', () => {
      engine.setPresetRules({ requiredConnections: [{ from: 'erd:entity:table', to: 'erd:type:enum' }] });
      graph.addNode(node('t', 'erd:entity:table'));
      graph.addNode(node('e', 'erd:type:enum'));
      const r = engine.validateGraphIntegrity();
      expect(r.valid).toBe(false);
      expect(r.errors?.[0].code).toBe('ERR_REQUIRED_CONNECTION_MISSING');
    });

    it('passes the required connection once the edge exists', () => {
      engine.setPresetRules({ requiredConnections: [{ from: 'erd:entity:table', to: 'erd:type:enum' }] });
      graph.addNode(node('t', 'erd:entity:table'));
      graph.addNode(node('e', 'erd:type:enum'));
      graph.addEdge(edge('x', 't', 'e'));
      expect(engine.validateGraphIntegrity().valid).toBe(true);
    });

    it('reports graphs exceeding maxDepth', () => {
      engine.setPresetRules({ maxDepth: 1 });
      graph.addNode(node('a', 'erd:entity:table'));
      graph.addNode(node('b', 'erd:entity:table'));
      graph.addNode(node('c', 'erd:entity:table'));
      graph.addEdge(edge('e1', 'a', 'b'));
      graph.addEdge(edge('e2', 'b', 'c')); // depth 2 > 1
      const r = engine.validateGraphIntegrity();
      expect(r.valid).toBe(false);
      expect(r.errors?.[0].code).toBe('ERR_MAX_DEPTH_EXCEEDED');
    });
  });
});
