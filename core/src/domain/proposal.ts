import { Proposal } from './types.js';

/**
 * Proposal - Represents a set of operations to be applied to the graph
 * Immutable, validated before application
 */
export class ProposalManager {
  /**
   * Create a new proposal
   */
  static create(proposal: Omit<Proposal, 'id' | 'timestamp'>): Proposal {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...proposal,
    };
  }

  /**
   * Save a proposal to the pending directory
   * (Implementation in infrastructure layer)
   */
  static serialize(proposal: Proposal): string {
    return JSON.stringify(proposal, null, 2);
  }

  /**
   * Parse a proposal from JSON
   */
  static deserialize(json: string): Proposal {
    return JSON.parse(json);
  }
}
