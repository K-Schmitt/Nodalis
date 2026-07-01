import { ArchiOSError } from './base-error.js';

/**
 * Thrown when a requested workspace path is invalid or outside the allowed
 * browse root (guards against path traversal / access to sensitive folders).
 */
export class WorkspacePathError extends ArchiOSError {
  readonly code = 'ERR_WORKSPACE_PATH';

  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
  }
}
