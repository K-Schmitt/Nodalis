import { ArchiOSError } from './base-error.js';

/**
 * Thrown when the graph cannot be persisted to disk.
 * Surfacing this (instead of swallowing it) prevents a proposal from being
 * marked "accepted" while the on-disk graph never actually changed.
 */
export class GraphPersistenceError extends ArchiOSError {
  readonly code = 'ERR_GRAPH_PERSISTENCE';

  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}
