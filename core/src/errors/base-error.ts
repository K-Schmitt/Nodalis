/**
 * Base class for all Nodalis errors
 * Provides structured error handling with codes and context
 */
export abstract class ArchiOSError extends Error {
  abstract readonly code: string;
  
  constructor(
    message: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
    };
  }
}
