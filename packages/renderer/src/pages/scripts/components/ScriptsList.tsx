import type { UserScript } from '@vela/shared';
import type { ScriptError } from '@vela/shared';
import { ScriptRow } from './ScriptRow';
import { ScriptErrors } from './ScriptErrors';

interface Props {
  scripts: UserScript[];
  errors: ScriptError[];
  onNew: () => void;
  onEdit: (script: UserScript) => void;
  onDelete: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onImport: () => void;
  onClearErrors: () => void;
}

export function ScriptsList({ scripts, errors, onNew, onEdit, onDelete, onToggle, onImport, onClearErrors }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Barra de acciones */}
      <div
        style={{
          padding: '10px 20px',
          display: 'flex',
          gap: 8,
          borderBottom: '1px solid var(--vela-border)',
          flexShrink: 0,
        }}
      >
        <button
          onClick={onNew}
          style={{
            background: 'var(--vela-accent)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'pointer',
            fontWeight: 500,
          }}
        >
          + Nuevo script
        </button>
        <button
          onClick={onImport}
          style={{
            background: 'var(--vela-bg-input)',
            color: 'var(--vela-fg)',
            border: '1px solid var(--vela-border)',
            borderRadius: 6,
            padding: '6px 14px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Importar desde URL
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {errors.length > 0 && (
          <ScriptErrors errors={errors} scripts={scripts} onClear={onClearErrors} />
        )}

        {scripts.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--vela-fg-muted)',
              marginTop: 48,
              fontSize: 14,
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>📜</div>
            <div>No hay scripts instalados.</div>
            <div style={{ marginTop: 4 }}>Crea uno nuevo o importa desde una URL.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {scripts.map((script) => (
              <ScriptRow
                key={script.id}
                script={script}
                onEdit={() => onEdit(script)}
                onDelete={() => onDelete(script.id)}
                onToggle={(enabled) => onToggle(script.id, enabled)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
