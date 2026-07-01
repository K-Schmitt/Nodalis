import { ArchiOSError } from './base-error.js';
import { ZodError } from 'zod';

/**
 * Thrown when Zod schema validation fails
 */
export class SchemaValidationError extends ArchiOSError {
  readonly code = 'ERR_SCHEMA_VALIDATION';

  constructor(
    message: string,
    public zodError?: ZodError,
    context?: Record<string, unknown>
  ) {
    super(message, { 
      ...context, 
      validationErrors: zodError?.errors 
    });
  }
}
