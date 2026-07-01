import { ArchiOSError } from './base-error.js';

/**
 * Thrown when a path is expected to be an initialized workspace (it has a
 * `.archi/workspace.json`) but is not.
 */
export class WorkspaceNotFoundError extends ArchiOSError {
  readonly code = 'ERR_WORKSPACE_NOT_FOUND';

  constructor(workspacePath: string, context?: Record<string, unknown>) {
    super(`No workspace found at "${workspacePath}". Create one first.`, { ...context, workspacePath });
  }
}
