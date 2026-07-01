import { ArchiOSError } from './base-error.js';

/**
 * Thrown when a definition is not found in the Registry
 */
export class DefinitionNotFoundError extends ArchiOSError {
  readonly code = 'ERR_DEFINITION_NOT_FOUND';

  constructor(
    public typeId: string,
    context?: Record<string, unknown>
  ) {
    super(`Definition not found: ${typeId}`, { ...context, typeId });
  }
}
