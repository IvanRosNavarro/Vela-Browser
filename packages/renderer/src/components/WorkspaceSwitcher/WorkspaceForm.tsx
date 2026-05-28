import { useEffect, useState } from 'react';
import type { Workspace } from '@vela/shared';
import { ColorPicker } from './ColorPicker';
import { IconPicker } from './IconPicker';
import { WorkspaceIcon } from './WorkspaceIcon';

export interface WorkspaceFormValue {
  name: string;
  icon: string | null;
  color: string | null;
}

export interface WorkspaceFormProps {
  initial?: Pick<Workspace, 'name' | 'icon' | 'color'> | null;
  onSubmit: (value: WorkspaceFormValue) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
}

export function WorkspaceForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel = 'Guardar',
}: WorkspaceFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? null);
  const [color, setColor] = useState<string | null>(initial?.color ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(initial?.name ?? '');
    setIcon(initial?.icon ?? null);
    setColor(initial?.color ?? null);
    setError(null);
  }, [initial]);

  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= 120;

  const handleSubmit = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: trimmed, icon, color });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <WorkspaceIcon
          icon={icon}
          fallbackName={trimmed || 'W'}
          size={36}
          background={color}
        />
        <div className="flex-1">
          <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
            Nombre
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            maxLength={120}
            className="w-full rounded border bg-[var(--vela-bg-app)] px-2 py-1.5 text-[13px] text-[var(--vela-fg)] outline-none"
            style={{ borderColor: 'var(--vela-border)' }}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
          Color
        </label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--vela-fg-muted)]">
          Icono
        </label>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      {error && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[12px] text-red-400">
          {error}
        </div>
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-[12px] text-[var(--vela-fg-muted)] hover:bg-[var(--vela-bg-row-hover)] hover:text-[var(--vela-fg)]"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!valid || submitting}
          className="rounded px-3 py-1.5 text-[12px] font-medium text-[var(--vela-fg)] disabled:opacity-50"
          style={{ background: 'var(--vela-accent)' }}
        >
          {submitting ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
