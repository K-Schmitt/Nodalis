import { Node, Edge } from './types.js';

/**
 * Graph - Manages nodes and edges
 * Immutable structure, modifications via operations
 */
export class Graph {
  private nodes: Map<string, Node> = new Map();
  private edges: Map<string, Edge> = new Map();

  /**
   * Add a node to the graph
   */
  addNode(node: Node): void {
    this.nodes.set(node.id, node);
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get all nodes
   */
  getAllNodes(): Node[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Add an edge to the graph
   */
  addEdge(edge: Edge): void {
    this.edges.set(edge.id, edge);
  }

  /**
   * Get an edge by ID
   */
  getEdge(id: string): Edge | undefined {
    return this.edges.get(id);
  }

  /**
   * Get all edges
   */
  getAllEdges(): Edge[] {
    return Array.from(this.edges.values());
  }

  /**
   * Get edges connected to a node
   */
  getNodeEdges(nodeId: string): Edge[] {
    return Array.from(this.edges.values()).filter(
      (edge) => edge.sourceId === nodeId || edge.targetId === nodeId
    );
  }

  /**
   * Remove a node from the graph.
   * @returns true if the node existed and was removed, false otherwise.
   */
  removeNode(id: string): boolean {
    return this.nodes.delete(id);
  }

  /**
   * Remove an edge from the graph.
   * @returns true if the edge existed and was removed, false otherwise.
   */
  removeEdge(id: string): boolean {
    return this.edges.delete(id);
  }

  /**
   * Check if a node exists
   */
  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /**
   * Check if an edge exists
   */
  hasEdge(id: string): boolean {
    return this.edges.has(id);
  }

  /**
   * Clear the entire graph
   */
  clear(): void {
    this.nodes.clear();
    this.edges.clear();
  }
}
