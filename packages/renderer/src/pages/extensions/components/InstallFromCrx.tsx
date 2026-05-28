import { useState, useCallback } from 'react';
import type { InstalledExtension } from '@vela/shared';

type InstallState =
  | { kind: 'idle' }
  | { kind: 'installing' }
  | { kind: 'success'; ext: InstalledExtension }
  | { kind: 'error'; message: string };

interface UseInstallFromCrxResult {
  state: InstallState;
  install(): Promise<void>;
}

export function useInstallFromCrx(
  onSuccess: (ext: InstalledExtension) => void,
): UseInstallFromCrxResult {
  const [state, setState] = useState<InstallState>({ kind: 'idle' });

  const install = useCallback(async () => {
    setState({ kind: 'installing' });
    const res = await window.api.extensions.installFromCrx();
    if (!res.ok) {
      if (res.error === 'CANCELLED') {
        setState({ kind: 'idle' });
        return;
      }
      setState({ kind: 'error', message: String(res.details ?? res.error ?? 'Error desconocido') });
      setTimeout(() => setState({ kind: 'idle' }), 5000);
      return;
    }
    setState({ kind: 'success', ext: res.data });
    onSuccess(res.data);
    setTimeout(() => setState({ kind: 'idle' }), 3000);
  }, [onSuccess]);

  return { state, install };
}

interface InstallFeedbackProps {
  state: InstallState;
}

export function InstallFeedback({ state }: InstallFeedbackProps) {
  if (state.kind === 'idle') return null;

  if (state.kind === 'installing') {
    return (
      <div className="flex items-center gap-2 rounded-md bg-[var(--vela-surface-2)] px-3 py-2 text-sm text-[var(--vela-fg-muted)]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--vela-accent)] border-t-transparent" />
        Instalando extensión…
      </div>
    );
  }

  if (state.kind === 'success') {
    return (
      <div className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600 dark:text-green-400">
        ✓ {state.ext.name} instalada correctamente
      </div>
    );
  }

  return (
    <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
      Error: {state.message}
    </div>
  );
}
