import { useState } from 'react';
import { useProposalStore, type PendingProposal } from '../stores/useProposalStore';
import { HEADER_HEIGHT_PX } from '../config';
import { User, Clock, Loader2, Check, X, ChevronUp, ChevronDown } from 'lucide-react';

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS = {
  add:    { bg: '#f0fdf4', border: '#86efac', text: '#15803d', dot: '#22c55e', label: '#16a34a' },
  delete: { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', dot: '#ef4444', label: '#dc2626' },
  update: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', dot: '#f59e0b', label: '#d97706' },
};

function opColor(op: string) {
  if (op.startsWith('add'))    return COLORS.add;
  if (op.startsWith('delete')) return COLORS.delete;
  return COLORS.update;
}

function opLabel(op: string, payload: Record<string, unknown>): string {
  switch (op) {
    case 'add_node':    return `+ Nœud  "${payload.label as string}"  (${payload.typeId as string})`;
    case 'add_edge':    return `+ Edge  ${(payload.sourceId as string).slice(0, 8)}… → ${(payload.targetId as string).slice(0, 8)}…`;
    case 'delete_node': return `− Nœud  ${(payload.id as string).slice(0, 8)}…`;
    case 'delete_edge': return `− Edge  ${(payload.id as string).slice(0, 8)}…`;
    case 'update_node': return `↺ Update  ${(payload.id as string).slice(0, 8)}…`;
    default:            return op;
  }
}

// ─── OpBadge ─────────────────────────────────────────────────────────────────

function OpBadge({ op, payload }: { op: string; payload: Record<string, unknown> }) {
  const c = opColor(op);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 10px', borderRadius: 6,
      backgroundColor: c.bg, border: `1px solid ${c.border}`,
      fontSize: 12, fontFamily: 'monospace', color: c.text,
      flexShrink: 0,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: c.dot, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {opLabel(op, payload)}
      </span>
    </div>
  );
}

// ─── ProposalCard ─────────────────────────────────────────────────────────────

function ProposalCard({ proposal }: { proposal: PendingProposal }) {
  const { accept, reject } = useProposalStore();
  const [loading, setLoading]         = useState<'accept' | 'reject' | null>(null);
  const [opsExpanded, setOpsExpanded] = useState(true);
  const [rejectOpen, setRejectOpen]   = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handle = async (action: 'accept' | 'reject') => {
    if (action === 'reject' && !rejectOpen) {
      setRejectOpen(true);
      return;
    }
    setLoading(action);
    try {
      if (action === 'accept') await accept(proposal.id);
      else await reject(proposal.id, rejectReason);
    } finally {
      setLoading(null);
      setRejectOpen(false);
      setRejectReason('');
    }
  };

  const addCount    = proposal.operations.filter((o) => o.op.startsWith('add')).length;
  const deleteCount = proposal.operations.filter((o) => o.op.startsWith('delete')).length;
  const updateCount = proposal.operations.filter((o) => o.op.startsWith('update')).length;

  return (
    <div style={{
      borderRadius: 10,
      border: '1px solid #e2e8f0',
      backgroundColor: '#fff',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
      flexShrink: 0,
    }}>
      {/* ── Card header ──────────────────────────────────────────────────── */}
      <div style={{
        padding: '11px 14px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: '10px 10px 0 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            <User size={13} /> {proposal.author}
          </div>
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
            {new Date(proposal.createdAt).toLocaleTimeString()} · {proposal.operations.length} op.
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {addCount > 0 && (
            <span style={{ background: '#22c55e', color: '#fff', borderRadius: 99, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>
              +{addCount}
            </span>
          )}
          {deleteCount > 0 && (
            <span style={{ background: '#ef4444', color: '#fff', borderRadius: 99, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>
              −{deleteCount}
            </span>
          )}
          {updateCount > 0 && (
            <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 99, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>
              ↺{updateCount}
            </span>
          )}
        </div>
      </div>

      {/* ── Operations — collapsible, scrollable ─────────────────────────── */}
      <div style={{ borderBottom: '1px solid #f1f5f9' }}>
        {/* Toggle row */}
        <button
          onClick={() => setOpsExpanded((v) => !v)}
          style={{
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 11, color: '#64748b', fontWeight: 600,
          }}
        >
          <span>OPÉRATIONS</span>
          <span style={{ display: 'flex' }}>{opsExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
        </button>

        {opsExpanded && (
          <div style={{
            maxHeight: 200,
            overflowY: 'auto',
            padding: '0 10px 10px',
            display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {proposal.operations.map((op, i) => (
              <OpBadge key={i} op={op.op} payload={op.payload} />
            ))}
          </div>
        )}
      </div>

      {/* ── Rejection reason (shown after first click on Rejeter) ──────── */}
      {rejectOpen && (
        <div style={{ padding: '0 12px 10px' }}>
          <textarea
            autoFocus
            placeholder="Raison du refus (optionnel)…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '8px 10px', borderRadius: 6,
              border: '1px solid #fca5a5', outline: 'none',
              fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
              background: '#fff5f5', color: '#1e293b',
            }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button
              disabled={loading !== null}
              onClick={() => handle('reject')}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                background: loading === 'reject' ? '#fca5a5' : '#ef4444',
                color: '#fff', fontWeight: 700, fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {loading === 'reject' ? <><Loader2 size={13} className="archi-spin" /> En cours…</> : <><X size={13} /> Confirmer le refus</>}
            </button>
            <button
              disabled={loading !== null}
              onClick={() => { setRejectOpen(false); setRejectReason(''); }}
              style={{
                padding: '8px 12px', borderRadius: 6,
                border: '1px solid #e2e8f0', background: '#f8fafc',
                cursor: 'pointer', fontSize: 12, color: '#64748b',
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── Accept / Reject — always visible ────────────────────────────── */}
      <div style={{ padding: '10px 12px', display: 'flex', gap: 8 }}>
        <button
          disabled={loading !== null}
          onClick={() => handle('accept')}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 7, border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            background: loading === 'accept' ? '#86efac' : '#22c55e',
            color: '#fff', fontWeight: 700, fontSize: 13,
            transition: 'background 0.15s, opacity 0.15s',
            opacity: loading === 'reject' ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {loading === 'accept' ? <><Loader2 size={13} className="archi-spin" /> En cours…</> : <><Check size={13} /> Accepter</>}
        </button>
        <button
          disabled={loading !== null}
          onClick={() => handle('reject')}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 7, border: 'none',
            cursor: loading ? 'not-allowed' : 'pointer',
            background: rejectOpen ? '#dc2626' : loading === 'reject' ? '#fca5a5' : '#ef4444',
            color: '#fff', fontWeight: 700, fontSize: 13,
            transition: 'background 0.15s, opacity 0.15s',
            opacity: loading === 'accept' ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <X size={13} /> {rejectOpen ? 'Rejeter ↑' : 'Rejeter'}
        </button>
      </div>
    </div>
  );
}

// ─── ProposalPanel ────────────────────────────────────────────────────────────

export function ProposalPanel() {
  const { pending } = useProposalStore();
  const [open, setOpen] = useState(true);

  if (pending.length === 0) return null;

  const HEADER_HEIGHT = HEADER_HEIGHT_PX;

  return (
    <>
      {/* ── Collapsed tab (always visible on right edge) ────────────────── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            top: HEADER_HEIGHT + 24,
            right: 0,
            zIndex: 200,
            background: '#1e293b',
            color: '#fff',
            border: 'none',
            borderRadius: '8px 0 0 8px',
            padding: '10px 8px',
            cursor: 'pointer',
            writingMode: 'vertical-rl',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '-2px 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          <Clock size={13} /> {pending.length}
        </button>
      )}

      {/* ── Drawer ─────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: 'fixed',
          top: HEADER_HEIGHT,
          right: 0,
          bottom: 0,
          zIndex: 200,
          width: 'min(380px, 100vw)',
          display: 'flex',
          flexDirection: 'column',
          background: '#f8fafc',
          borderLeft: '1px solid #e2e8f0',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
        }}>
          {/* Drawer header — sticky */}
          <div style={{
            padding: '12px 16px',
            background: '#0f172a',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} />
              <div>
                <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14 }}>
                  {pending.length} proposition{pending.length > 1 ? 's' : ''} en attente
                </div>
                <div style={{ color: '#64748b', fontSize: 11 }}>
                  En attente de validation
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close proposals drawer"
              style={{
                background: 'rgba(255,255,255,0.1)', border: 'none', color: '#94a3b8',
                borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 14,
                fontWeight: 700, display: 'flex',
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Scrollable proposals list */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            {pending.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
