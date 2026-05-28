import type { UserScript } from '@vela/shared';
import type { ScriptError } from '@vela/shared';

interface Props {
  errors: ScriptError[];
  scripts: UserScript[];
  onClear: () => void;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'hace un momento';
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)} h`;
  return new Date(ts).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ScriptErrors({ errors, scripts, onClear }: Props) {
  if (errors.length === 0) return null;

  function getScriptName(scriptId: string): string {
    return scripts.find((s) => s.id === scriptId)?.name ?? scriptId;
  }

  return (
    <div
      style={{
        background: '#7f1d1d22',
        border: '1px solid #ef444444',
        borderRadius: 8,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fca5a5' }}>
          Errores de ejecución ({errors.length})
        </span>
        <button
          onClick={onClear}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            color: 'var(--vela-fg-muted)',
            padding: '2px 6px',
          }}
        >
          Limpiar errores
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
        {errors.map((err, i) => (
          <div
            key={i}
            style={{
              fontSize: 12,
              padding: '6px 10px',
              background: 'var(--vela-bg-surface)',
              borderRadius: 6,
              border: '1px solid var(--vela-border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontWeight: 500 }}>{getScriptName(err.scriptId)}</span>
              <span style={{ color: 'var(--vela-fg-muted)' }}>{relativeTime(err.timestamp)}</span>
            </div>
            <div style={{ color: 'var(--vela-fg-muted)', marginTop: 2, fontSize: 11, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {err.url && <span style={{ marginRight: 6 }}>{err.url}</span>}
            </div>
            <div style={{ color: '#fca5a5', fontSize: 11, fontFamily: 'monospace', marginTop: 2, wordBreak: 'break-all' }}>
              {err.error}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
