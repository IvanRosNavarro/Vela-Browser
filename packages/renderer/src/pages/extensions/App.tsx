import { useEffect, useState, useCallback } from 'react';
import type { InstalledExtension } from '@vela/shared';
import { IPC_EVENTS } from '@vela/shared';
import { themeManager } from '../../shared-ui/theme';
import { useUiStore } from '../../stores/uiStore';
import { ExtensionsLayout } from './components/ExtensionsLayout';

export function App() {
  const hydrate = useUiStore((s) => s.hydrate);
  const [extensions, setExtensions] = useState<InstalledExtension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    themeManager.initialize();
    void hydrate();
    return () => themeManager.destroy();
  }, [hydrate]);

  const loadExtensions = useCallback(async () => {
    setLoading(true);
    const res = await window.api.extensions.listInstalled();
    if (res.ok) setExtensions(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadExtensions();
  }, [loadExtensions]);

  // Refrescar lista cuando cambia el estado de extensiones desde fuera
  useEffect(() => {
    return window.api.on(IPC_EVENTS.EXTENSION_ACTIONS_CHANGED, () => {
      void loadExtensions();
    });
  }, [loadExtensions]);

  return (
    <ExtensionsLayout
      extensions={extensions}
      loading={loading}
      onRefresh={loadExtensions}
      onExtensionsChange={setExtensions}
    />
  );
}
