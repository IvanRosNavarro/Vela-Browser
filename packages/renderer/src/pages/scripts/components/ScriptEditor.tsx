import { useEffect, useRef, useState } from 'react';
import type { UserScript } from '@vela/shared';

type RunAt = 'document-start' | 'document-end' | 'document-idle';
type ScriptType = 'js' | 'css';

interface ScriptFormData {
  name: string;
  description: string;
  type: ScriptType;
  code: string;
  matchPatterns: string[];
  enabled: boolean;
  runAt: RunAt;
}

interface Props {
  initial: (Partial<ScriptFormData> & { id?: string }) | null;
  onSave: (data: ScriptFormData) => void;
  onCancel: () => void;
}

function patternsToText(patterns: string[]): string {
  return patterns.join('\n');
}

function textToPatterns(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function ScriptEditor({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [type, setType] = useState<ScriptType>(initial?.type ?? 'js');
  const [code, setCode] = useState(initial?.code ?? '');
  const [patternsText, setPatternsText] = useState(patternsToText(initial?.matchPatterns ?? ['*://*/*']));
  const [runAt, setRunAt] = useState<RunAt>(initial?.runAt ?? 'document-idle');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function handleTest() {
    setTestStatus('Ejecutando…');
    const res = await window.api.scripts.test({ code, type });
    if (res.ok) {
      setTestStatus('✓ Ejecutado correctamente.');
    } else {
      setTestStatus(`✗ ${res.error ?? 'Error desconocido'}`);
    }
    setTimeout(() => setTestStatus(null), 4000);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const patterns = textToPatterns(patternsText);
    if (!name.trim()) return;
    if (patterns.length === 0) return;
    setSaving(true);
    onSave({ name: name.trim(), description: description.trim(), type, code, matchPatterns: patterns, enabled, runAt });
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--vela-bg-input)',
    border: '1px solid var(--vela-border)',
    borderRadius: 6,
    padding: '6px 10px',
    fontSize: 13,
    color: 'var(--vela-fg)',
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '16px 20px', gap: 14, overflow: 'auto' }}
    >
      {/* Nombre */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>Nombre *</span>
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mi script"
          required
          style={inputStyle}
        />
      </label>

      {/* Descripción */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>Descripción</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Qué hace este script"
          style={inputStyle}
        />
      </label>

      {/* Tipo + RunAt + Enabled en fila */}
      <div style={{ display: 'flex', gap: 12 }}>
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Tipo</span>
          <select value={type} onChange={(e) => setType(e.target.value as ScriptType)} style={selectStyle}>
            <option value="js">JavaScript</option>
            <option value="css">CSS</option>
          </select>
        </label>
        <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Ejecutar en</span>
          <select value={runAt} onChange={(e) => setRunAt(e.target.value as RunAt)} style={selectStyle}>
            <option value="document-start">Inicio del documento</option>
            <option value="document-end">DOM listo</option>
            <option value="document-idle">Página cargada</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--vela-accent)' }}
          />
          <span style={{ fontSize: 12, fontWeight: 500 }}>Activo</span>
        </label>
      </div>

      {/* Patrones URL */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>Patrones de URL *</span>
        <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)' }}>Un patrón por línea. Ej: *://*.github.com/*  •  &lt;all_urls&gt;</span>
        <textarea
          value={patternsText}
          onChange={(e) => setPatternsText(e.target.value)}
          rows={3}
          placeholder="*://*.example.com/*"
          required
          style={{ ...inputStyle, fontFamily: 'monospace', resize: 'vertical' }}
        />
      </label>

      {/* Código */}
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        <span style={{ fontSize: 12, fontWeight: 500 }}>Código</span>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={type === 'js' ? '// Tu código JavaScript aquí\ndocument.title = "Hola";' : '/* Tu CSS aquí */\nbody { background: #1a1a2e; }'}
          style={{
            ...inputStyle,
            fontFamily: 'monospace',
            fontSize: 12,
            resize: 'vertical',
            flex: 1,
            minHeight: 160,
          }}
        />
      </label>

      {testStatus && (
        <div style={{ fontSize: 12, color: testStatus.startsWith('✓') ? '#22c55e' : '#f87171', padding: '4px 8px', background: 'var(--vela-bg-input)', borderRadius: 6 }}>
          {testStatus}
        </div>
      )}

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0, paddingBottom: 8 }}>
        <button
          type="button"
          onClick={() => void handleTest()}
          style={{
            background: 'var(--vela-bg-input)',
            border: '1px solid var(--vela-border)',
            color: 'var(--vela-fg)',
            borderRadius: 6,
            padding: '7px 14px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          ▶ Probar en la tab activa
        </button>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'none',
            border: '1px solid var(--vela-border)',
            color: 'var(--vela-fg)',
            borderRadius: 6,
            padding: '7px 14px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{
            background: 'var(--vela-accent)',
            border: 'none',
            color: '#fff',
            borderRadius: 6,
            padding: '7px 16px',
            fontSize: 13,
            cursor: saving ? 'wait' : 'pointer',
            fontWeight: 500,
          }}
        >
          Guardar
        </button>
      </div>
    </form>
  );
}
