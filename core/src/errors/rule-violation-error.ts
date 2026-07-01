import { ArchiOSError } from './base-error.js';

/**
 * Thrown when a rule constraint is violated
 */
export class RuleViolationError extends ArchiOSError {
  readonly code = 'ERR_RULE_VIOLATION';

  constructor(
    message: string,
    public ruleId: string,
    context?: Record<string, unknown>
  ) {
    super(message, { ...context, ruleId });
  }
}
