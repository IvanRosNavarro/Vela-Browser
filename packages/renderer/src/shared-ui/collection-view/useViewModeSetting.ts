import { useCallback, useEffect, useState } from 'react';
import type { CollectionViewMode } from './types';

/**
 * Modo lista/cuadrícula persistido en los ajustes del perfil (nunca en
 * localStorage: el estado persistente vive en SQLite).
 */
export function useViewModeSetting(
  key: 'favorites:view-mode' | 'folder-view:view-mode',
  fallback: CollectionViewMode = 'grid',
): [CollectionViewMode, (mode: CollectionViewMode) => void] {
  const [mode, setMode] = useState<CollectionViewMode>(fallback);

  useEffect(() => {
    let cancelled = false;
    void window.api.settings.get({ key }).then((res) => {
      if (cancelled || !res.ok) return;
      const v = res.data?.value;
      if (v === 'grid' || v === 'list') setMode(v);
    });
    return () => { cancelled = true; };
  }, [key]);

  const update = useCallback((next: CollectionViewMode) => {
    setMode(next);
    void window.api.settings.set({ key, value: next });
  }, [key]);

  return [mode, update];
}
