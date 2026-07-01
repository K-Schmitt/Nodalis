import { ArchiOSError } from './base-error.js';

export class ProposalTimeoutError extends ArchiOSError {
  readonly code = 'ERR_PROPOSAL_TIMEOUT';

  constructor(proposalId: string, timeoutMinutes: number) {
    super(
      `Proposal "${proposalId}" timed out after ${timeoutMinutes} minutes with no user response.`,
      { proposalId, timeoutMinutes }
    );
  }
}
