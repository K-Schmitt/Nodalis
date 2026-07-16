import { useToastStore, type ToastKind } from '../stores/useToastStore';
import { T } from '../lib/theme';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const STYLE: Record<ToastKind, { bg: string; border: string; fg: string; icon: typeof AlertTriangle }> = {
  error:   { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c', icon: AlertTriangle },
  success: { bg: '#f0fdf4', border: '#bbf7d0', fg: '#15803d', icon: CheckCircle2 },
  info:    { bg: '#eff6ff', border: '#bfdbfe', fg: '#1d4ed8', icon: Info },
};

/** Stacked, auto-dismissing toasts (wired to Core ApiError codes). */
export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  if (toasts.length === 0) return null;
  return (
    <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      {toasts.map((t) => {
        const s = STYLE[t.kind];
        const Icon = s.icon;
        return (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            role="status"
            style={{
              background: s.bg, border: `1px solid ${s.border}`, color: s.fg,
              padding: '10px 16px', borderRadius: 8, boxShadow: T.shadowLg, maxWidth: '80vw',
              cursor: 'pointer', fontSize: 13, display: 'flex', gap: 8, alignItems: 'center',
            }}
            title="Click to dismiss"
          >
            <Icon size={16} />
            <span>{t.message}</span>
            {t.code && <code style={{ fontSize: 11, opacity: 0.7 }}>{t.code}</code>}
          </div>
        );
      })}
    </div>
  );
}
