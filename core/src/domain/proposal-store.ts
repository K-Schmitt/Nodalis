import * as fs from 'fs';
import * as path from 'path';
import type { Proposal } from './types.js';
import type { Definition } from './types.js';
import { ProposalTimeoutError } from '../errors/proposal-timeout-error.js';
import { NoActiveWorkspaceError } from '../errors/no-active-workspace-error.js';

export interface ProposalPreview {
  nodesToAdd:    Array<{ id: string; typeId: string; label: string; style: Definition['style']; render?: Definition['render'] }>;
  edgesToAdd:    Array<{ id: string; sourceId: string; targetId: string; label?: string }>;
  nodesToDelete: Array<{ id: string; label: string; typeId: string }>;
  edgesToDelete: Array<{ id: string }>;
  nodesToUpdate: Array<{ id: string; changes: Record<string, unknown> }>;
}

/**
 * Serializable summary of what an accepted proposal actually changed on disk.
 * Persisted on the proposal so the (separate) MCP process can report the real
 * outcome instead of assuming success.
 */
export interface ProposalApplySummary {
  applied: number;
  failed: Array<{ reason: string }>;
  finalCounts: { nodes: number; edges: number };
}

export interface PendingProposal {
  id: string;
  author: string;
  operations: Proposal['operations'];
  preview: ProposalPreview;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  resolvedAt?: string;
  rejectionReason?: string;
  applySummary?: ProposalApplySummary;
}

const MAX_STORED      = 100;
const POLL_INTERVAL   = 1_000;
const DEFAULT_TIMEOUT = 10 * 60 * 1_000;

/**
 * File-backed proposal store shared between the MCP process and the HTTP process.
 * Both read/write the active workspace's `.archi/proposals.json`. The store path
 * is resolved on every access via the injected provider, so it always targets
 * the currently-active workspace (the provider returns null when none is open).
 */
export class ProposalStore {
  constructor(private readonly resolveStorePath: () => string | null) {}

  add(proposal: PendingProposal): void {
    const all = this.readAll();
    all.push(proposal);
    this.writeAll(all);
  }

  get(id: string): PendingProposal | undefined {
    return this.readAll().find((p) => p.id === id);
  }

  getPending(): PendingProposal[] {
    return this.readAll().filter((p) => p.status === 'pending');
  }

  getAll(): PendingProposal[] {
    return this.readAll();
  }

  resolve(
    id: string,
    status: 'accepted' | 'rejected',
    rejectionReason?: string,
    applySummary?: ProposalApplySummary
  ): boolean {
    const all = this.readAll();
    const proposal = all.find((p) => p.id === id);
    if (!proposal || proposal.status !== 'pending') return false;

    proposal.status     = status;
    proposal.resolvedAt = new Date().toISOString();
    if (rejectionReason) proposal.rejectionReason = rejectionReason;
    if (applySummary) proposal.applySummary = applySummary;

    this.writeAll(all);
    return true;
  }

  /**
   * Blocks (async) until the proposal is resolved or the timeout fires.
   * Polls the shared file every second — zero extra tokens, zero extra tool calls.
   */
  async waitForResolution(
    proposalId: string,
    timeoutMs = DEFAULT_TIMEOUT
  ): Promise<PendingProposal> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const proposal = this.get(proposalId);
      if (proposal && proposal.status !== 'pending') return proposal;
      await sleep(POLL_INTERVAL);
    }

    this.resolve(proposalId, 'rejected');
    throw new ProposalTimeoutError(proposalId, timeoutMs / 60_000);
  }

  // ─── I/O ──────────────────────────────────────────────────────────────────

  private readAll(): PendingProposal[] {
    const storePath = this.resolveStorePath();
    if (!storePath) return [];
    try {
      if (!fs.existsSync(storePath)) return [];
      return JSON.parse(fs.readFileSync(storePath, 'utf-8')) as PendingProposal[];
    } catch {
      return [];
    }
  }

  private writeAll(proposals: PendingProposal[]): void {
    const storePath = this.resolveStorePath();
    if (!storePath) throw new NoActiveWorkspaceError();

    const dir = path.dirname(storePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const trimmed = proposals.slice(-MAX_STORED);
    const tmp = `${storePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2), 'utf-8');
    fs.renameSync(tmp, storePath);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
