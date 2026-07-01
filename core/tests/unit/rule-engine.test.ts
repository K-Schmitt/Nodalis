import { describe, it, expect, beforeEach } from 'vitest';
import { Registry } from '../../src/domain/registry.js';
import { Graph } from '../../src/domain/graph.js';
import { RuleEngine } from '../../src/domain/rule-engine.js';
import type { Definition, Node, Edge } from '../../src/domain/types.js';

const reactDef: Definition = {
  typeId: 'tech:frontend:react',
  label: 'React',
  category: 'frontend',
  style: { shape: 'rectangle', color: '#61DAFB' },
  constraints: {
    maxOutputs: 2,
    allowedTargets: ['tech:api:rest'],
  },
};

const apiDef: Definition = {
  typeId: 'tech:api:rest',
  label: 'REST API',
  category: 'api',
  style: { shape: 'hexagon', color: '#FF6B6B' },
  constraints: {
    maxInputs: 1,
    allowedSources: ['tech:frontend:react'],
    requiredFields: ['basePath'],
  },
  dataSchema: {
    basePath: { type: 'string' },
    port: { type: 'number' },
  },
};

const makeNode = (id: string, typeId: string, data?: Record<string, unknown>): Node => ({
  id,
  typeId,
  label: id,
  data,
});

const makeEdge = (id: string, sourceId: string, targetId: string): Edge => ({
  id,
  sourceId,
  targetId,
});

describe('RuleEngine', () => {
  let registry: Registry;
  let graph: Graph;
  let engine: RuleEngine;

  beforeEach(() => {
    registry = new Registry();
    graph = new Graph();
    engine = new RuleEngine(registry, graph);
    registry.register(reactDef);
    registry.register(apiDef);
  });

  describe('validateConnection', () => {
    it('passes for allowed connection', () => {
      const src = makeNode('src', 'tech:frontend:react');
      const tgt = makeNode('tgt', 'tech:api:rest');
      graph.addNode(src);
      graph.addNode(tgt);
      expect(engine.validateConnection('src', 'tgt').valid).toBe(true);
    });

    it('fails when target not in allowedTargets', () => {
      const api1 = makeNode('a', 'tech:api:rest');
      const api2 = makeNode('b', 'tech:api:rest');
      graph.addNode(api1);
      graph.addNode(api2);
      const result = engine.validateConnection('a', 'b');
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.code === 'ERR_SOURCE_NOT_ALLOWED' || e.code === 'ERR_TARGET_NOT_ALLOWED')).toBe(true);
    });

    it('fails when maxOutputs is exceeded', () => {
      const src = makeNode('src', 'tech:frontend:react');
      const tgt1 = makeNode('t1', 'tech:api:rest');
      const tgt2 = makeNode('t2', 'tech:api:rest');
      const tgt3 = makeNode('t3', 'tech:api:rest');
      graph.addNode(src); graph.addNode(tgt1); graph.addNode(tgt2); graph.addNode(tgt3);
      graph.addEdge(makeEdge('e1', 'src', 't1'));
      graph.addEdge(makeEdge('e2', 'src', 't2'));
      const result = engine.validateConnection('src', 't3');
      expect(result.valid).toBe(false);
      expect(result.errors?.[0].code).toBe('ERR_MAX_OUTPUTS_EXCEEDED');
    });

    it('validates prospective (in-proposal) nodes via overrideNodes', () => {
      const src = makeNode('src', 'tech:frontend:react');
      const tgt = makeNode('tgt', 'tech:api:rest');
      // Neither node is in the graph yet — passed as prospective
      const overrides = new Map([['src', src], ['tgt', tgt]]);
      expect(engine.validateConnection('src', 'tgt', overrides).valid).toBe(true);
    });
  });

  describe('validateNode', () => {
    it('fails when required fields are missing', () => {
      const node = makeNode('n1', 'tech:api:rest'); // missing basePath
      const result = engine.validateNode(node);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0].code).toBe('ERR_MISSING_REQUIRED_FIELDS');
    });

    it('passes when required fields are present', () => {
      const node = makeNode('n1', 'tech:api:rest', { basePath: '/api' });
      expect(engine.validateNode(node).valid).toBe(true);
    });

    it('fails when data violates dataSchema type', () => {
      const node = makeNode('n1', 'tech:api:rest', { basePath: 42 as unknown as string }); // wrong type
      const result = engine.validateNode(node);
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.code === 'ERR_DATA_SCHEMA_INVALID')).toBe(true);
    });
  });

  describe('detectCycle', () => {
    it('detects a simple A→B→A cycle', () => {
      const a = makeNode('A', 'tech:frontend:react');
      const b = makeNode('B', 'tech:api:rest');
      graph.addNode(a); graph.addNode(b);
      graph.addEdge(makeEdge('e1', 'A', 'B'));
      const newEdge = makeEdge('e2', 'B', 'A');
      expect(engine.detectCycle(newEdge)).toBe(true);
    });

    it('allows a valid DAG edge', () => {
      const a = makeNode('A', 'tech:frontend:react');
      const b = makeNode('B', 'tech:api:rest');
      graph.addNode(a); graph.addNode(b);
      const edge = makeEdge('e1', 'A', 'B');
      expect(engine.detectCycle(edge)).toBe(false);
    });
  });

  describe('preset rules', () => {
    it('forbids a connection matched by the preset (by typeId)', () => {
      const src = makeNode('src', 'tech:frontend:react');
      const tgt = makeNode('tgt', 'tech:api:rest');
      graph.addNode(src); graph.addNode(tgt);
      // react→rest is normally allowed; the preset forbids it globally.
      engine.setPresetRules({ forbiddenConnections: [{ from: 'tech:frontend:react', to: 'tech:api:rest' }] });
      const result = engine.validateConnection('src', 'tgt');
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.code === 'ERR_CONNECTION_FORBIDDEN')).toBe(true);
    });

    it('forbids a connection matched by category', () => {
      const src = makeNode('src', 'tech:frontend:react');
      const tgt = makeNode('tgt', 'tech:api:rest');
      graph.addNode(src); graph.addNode(tgt);
      engine.setPresetRules({ forbiddenConnections: [{ from: 'frontend', to: 'api' }] });
      expect(engine.validateConnection('src', 'tgt').valid).toBe(false);
    });

    it('applies defaultMaxOutputs when the node defines none', () => {
      // apiDef has no maxOutputs of its own.
      const a = makeNode('a', 'tech:api:rest', { basePath: '/a' });
      const r1 = makeNode('r1', 'tech:frontend:react');
      const r2 = makeNode('r2', 'tech:frontend:react');
      graph.addNode(a); graph.addNode(r1); graph.addNode(r2);
      graph.addEdge(makeEdge('e1', 'a', 'r1'));
      engine.setPresetRules({ defaultMaxOutputs: 1 });
      const result = engine.validateConnection('a', 'r2');
      expect(result.valid).toBe(false);
      expect(result.errors?.some((e) => e.code === 'ERR_MAX_OUTPUTS_EXCEEDED')).toBe(true);
    });
  });
});
