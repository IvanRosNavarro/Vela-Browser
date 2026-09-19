import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, FocusEvent } from 'react';
import { IcoCheck, IcoX } from './icons';
import type { CollectionEditResult, CollectionItem } from './types';

export const miniBtn = (primary?: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 3, borderRadius: 5, cursor: 'default', flexShrink: 0,
  border: `1px solid ${primary ? 'var(--vela-accent)' : 'var(--vela-border)'}`,
  background: primary ? 'var(--vela-accent)' : 'var(--vela-bg-row-hover)',
  color: primary ? '#fff' : 'var(--vela-fg)',
});

interface ItemEditorProps {
  item: CollectionItem;
  /** Muestra también el campo de dirección (solo enlaces). */
  editUrl: boolean;
  /** Un nombre vacío se guarda como `null` en vez de cancelar. */
  allowEmptyName: boolean;
  layout: 'row' | 'stack';
  fontSize: number;
  /** Devuelve un mensaje de error para seguir editando, o null si guardó. */
  onSave: (result: CollectionEditResult) => Promise<string | null>;
  onCancel: () => void;
}

/**
 * Editor in situ de un elemento. Guarda con Enter, con ✓ o al sacar el foco
 * del editor; cancela con Escape o ✕. Los botones usan
 * `onMouseDown={preventDefault}` para que el blur no se adelante al clic.
 */
export function ItemEditor({ item, editUrl, allowEmptyName, layout, fontSize, onSave, onCancel }: ItemEditorProps) {
  const showUrl = editUrl && item.kind === 'link';
  const [name, setName] = useState(item.editableTitle);
  const [url, setUrl] = useState(item.url ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const doneRef = useRef(false);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { nameRef.current?.select(); }, []);

  const commit = useCallback(async () => {
    if (doneRef.current || saving) return;
    const nextName = name.trim();
    const nextUrl = url.trim();
    const nameChanged = nextName !== item.editableTitle.trim();
    const urlChanged = showUrl && nextUrl !== (item.url ?? '');
    if (!nameChanged && !urlChanged) {
      doneRef.current = true;
      onCancel();
      return;
    }
    if (!nextName && !allowEmptyName) {
      setError('El nombre no puede quedar vacío');
      return;
    }
    setSaving(true);
    const result: CollectionEditResult = { title: nextName === '' ? null : nextName };
    if (showUrl) result.url = nextUrl;
    const err = await onSave(result);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    doneRef.current = true;
  }, [name, url, item, showUrl, allowEmptyName, onSave, onCancel, saving]);

  const cancel = useCallback(() => {
    doneRef.current = true;
    onCancel();
  }, [onCancel]);

  // Guardar al perder el foco, salvo que pase de un campo a otro del editor.
  const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    void commit();
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    minWidth: 0, boxSizing: 'border-box',
    background: 'var(--vela-suggestion-bg)',
    border: `1px solid ${error ? 'var(--vela-insecure, #e05c5c)' : 'var(--vela-accent)'}`,
    borderRadius: 5, padding: '2px 6px',
    fontSize, color: 'var(--vela-fg)', outline: 'none',
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); void commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };

  const nameInput = (
    <input
      ref={nameRef}
      type="text"
      value={name}
      autoFocus
      placeholder="Nombre"
      aria-label="Nombre"
      onChange={(e) => { setName(e.target.value); setError(null); }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      style={{ ...inputStyle, fontWeight: 500 }}
    />
  );

  const urlInput = showUrl ? (
    <input
      type="text"
      value={url}
      placeholder="https://…"
      aria-label="Dirección"
      spellCheck={false}
      onChange={(e) => { setUrl(e.target.value); setError(null); }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onKeyDown}
      style={{ ...inputStyle, fontSize: fontSize - 1, color: 'var(--vela-fg-muted)' }}
    />
  ) : null;

  const buttons = (
    <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', flexShrink: 0 }}>
      <button
        type="button" title="Guardar" disabled={saving}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); void commit(); }}
        style={miniBtn(true)}
      >
        <IcoCheck />
      </button>
      <button
        type="button" title="Cancelar"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); cancel(); }}
        style={miniBtn(false)}
      >
        <IcoX />
      </button>
    </div>
  );

  const errorLine = error ? (
    <div style={{ fontSize: 11, color: 'var(--vela-insecure, #e05c5c)' }}>{error}</div>
  ) : null;

  if (layout === 'stack') {
    return (
      <div onBlur={handleBlur} onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        {nameInput}
        {urlInput}
        {errorLine}
        {buttons}
      </div>
    );
  }

  return (
    <div onBlur={handleBlur} onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
          {nameInput}
          {urlInput}
        </div>
        {buttons}
      </div>
      {errorLine}
    </div>
  );
}
