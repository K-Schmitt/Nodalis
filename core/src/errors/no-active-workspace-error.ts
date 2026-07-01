import { ArchiOSError } from './base-error.js';

/**
 * Thrown when a graph operation is attempted but no workspace is currently open.
 * Signals the agent/UI to ask the user which folder to work in, then call
 * open_workspace or create_workspace.
 */
export class NoActiveWorkspaceError extends ArchiOSError {
  readonly code = 'ERR_NO_ACTIVE_WORKSPACE';

  constructor(
    message = 'No active workspace. Open or create a workspace folder first.',
    context?: Record<string, unknown>
  ) {
    super(message, context);
  }
}
