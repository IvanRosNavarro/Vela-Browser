import { useEffect, useState, useCallback } from 'react';
import type { InstalledExtension } from '@vela/shared';
import { Puzzle, ExternalLink } from 'lucide-react';

export function Extensions() {
  const [extensions, setExtensions] = useState<InstalledExtension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await window.api.extensions.listInstalled();
      if (res.ok) setExtensions(res.data);
      setLoading(false);
    })();
  }, []);

  const openManager = useCallback(async () => {
    await window.api.commands.execute('internal.openExtensions');
  }, []);

  const handleToggle = useCallback(async (ext: InstalledExtension) => {
    const res = ext.enabled
      ? await window.api.extensions.disable({ extensionId: ext.id })
      : await window.api.extensions.enable({ extensionId: ext.id });
    if (res.ok) {
      setExtensions((prev) =>
        prev.map((e) => (e.id === ext.id ? { ...e, enabled: !e.enabled } : e)),
      );
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-[var(--vela-fg)]">Extensiones</h2>
        <p className="text-sm text-[var(--vela-fg-muted)]">
          Gestiona tus extensiones instaladas en este perfil.
        </p>
      </div>

      {/* Open manager button */}
      <button
        onClick={() => void openManager()}
        className="flex items-center gap-2 self-start rounded-md bg-[var(--vela-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 active:opacity-80 transition-opacity"
      >
        <ExternalLink className="h-4 w-4" />
        Abrir gestor de extensiones
      </button>

      {/* Preview list */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--vela-fg-muted)]">
          Instaladas
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--vela-accent)] border-t-transparent" />
          </div>
        ) : extensions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Puzzle className="h-8 w-8 text-[var(--vela-fg-muted)]" strokeWidth={1.5} />
            <p className="text-sm text-[var(--vela-fg-muted)]">
              No hay extensiones instaladas
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1 rounded-lg border border-[var(--vela-border)] overflow-hidden">
            {extensions.map((ext) => (
              <ExtensionPreviewRow
                key={ext.id}
                extension={ext}
                onToggle={() => void handleToggle(ext)}
                onOpen={() => void openManager()}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExtensionPreviewRow({
  extension,
  onToggle,
  onOpen,
}: {
  extension: InstalledExtension;
  onToggle(): void;
  onOpen(): void;
}) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors bg-[var(--vela-surface-1)] hover:bg-[var(--vela-surface-2)]"
      style={{ opacity: extension.enabled ? 1 : 0.6 }}
      onClick={onOpen}
    >
      {/* Icon */}
      {extension.iconUrl ? (
        <img
          src={extension.iconUrl}
          alt=""
          width={28}
          height={28}
          className="rounded shrink-0"
          style={{
            imageRendering: 'pixelated',
            filter: extension.enabled ? 'none' : 'grayscale(1)',
          }}
          draggable={false}
        />
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[var(--vela-surface-2)]">
          <Puzzle className="h-4 w-4 text-[var(--vela-fg-muted)]" />
        </div>
      )}

      <span className="min-w-0 flex-1 truncate text-sm text-[var(--vela-fg)]">
        {extension.name}
      </span>

      {/* Toggle — stopPropagation so row click goes to onOpen */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        title={extension.enabled ? 'Desactivar' : 'Activar'}
        className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
        style={{
          background: extension.enabled
            ? 'var(--vela-accent, #3b82f6)'
            : 'var(--vela-surface-3, rgba(128,128,128,0.3))',
        }}
      >
        <span
          className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
          style={{
            transform: extension.enabled ? 'translateX(18px)' : 'translateX(3px)',
          }}
        />
      </button>
    </div>
  );
}
