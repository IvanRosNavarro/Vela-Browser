import { useState } from 'react';
import type { UserScript } from '@vela/shared';

const TYPE_LABELS = { js: 'JS', css: 'CSS' };
const RUN_AT_LABELS = {
  'document-start': 'Al iniciar',
  'document-end': 'DOM listo',
  'document-idle': 'Página cargada',
};

interface Props {
  script: UserScript;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (enabled: boolean) => void;
}

export function ScriptRow({ script, onEdit, onDelete, onToggle }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const visiblePatterns = script.matchPatterns.slice(0, 3);
  const extraCount = script.matchPatterns.length - 3;

  function handleDelete() {
    if (confirmDelete) {
      onDelete();
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderRadius: 8,
        border: '1px solid var(--vela-border)',
        background: 'var(--vela-bg-surface)',
        opacity: script.enabled ? 1 : 0.6,
      }}
    >
      {/* Toggle */}
      <label
        style={{ cursor: 'pointer', flexShrink: 0 }}
        title={script.enabled ? 'Desactivar' : 'Activar'}
      >
        <input
          type="checkbox"
          checked={script.enabled}
          onChange={(e) => onToggle(e.target.checked)}
          style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--vela-accent)' }}
        />
      </label>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 500, fontSize: 14 }}>{script.name}</span>
          <span
            style={{
              background: script.type === 'js' ? '#d97706' : '#2563eb',
              color: '#fff',
              borderRadius: 4,
              padding: '1px 6px',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {TYPE_LABELS[script.type]}
          </span>
          <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)' }}>
            {RUN_AT_LABELS[script.runAt]}
          </span>
        </div>
        {script.description && (
          <div style={{ fontSize: 12, color: 'var(--vela-fg-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {script.description}
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {visiblePatterns.map((p) => (
            <span
              key={p}
              style={{
                background: 'var(--vela-bg-input)',
                border: '1px solid var(--vela-border)',
                borderRadius: 4,
                padding: '1px 6px',
                fontSize: 11,
                fontFamily: 'monospace',
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {p}
            </span>
          ))}
          {extraCount > 0 && (
            <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', padding: '1px 4px' }}>
              +{extraCount} más
            </span>
          )}
        </div>
      </div>

      {/* Updated at */}
      <div style={{ fontSize: 11, color: 'var(--vela-fg-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
        {new Date(script.updatedAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button
          onClick={onEdit}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--vela-fg-muted)', padding: '4px 6px', borderRadius: 4, fontSize: 13 }}
          title="Editar"
        >
          ✏
        </button>
        <button
          onClick={handleDelete}
          style={{
            background: confirmDelete ? '#dc2626' : 'none',
            border: 'none',
            cursor: 'pointer',
            color: confirmDelete ? '#fff' : 'var(--vela-fg-muted)',
            padding: '4px 6px',
            borderRadius: 4,
            fontSize: 13,
            transition: 'background 0.2s',
          }}
          title={confirmDelete ? 'Haz clic de nuevo para confirmar' : 'Eliminar'}
        >
          {confirmDelete ? '¿Eliminar?' : '🗑'}
        </button>
      </div>
    </div>
  );
}
