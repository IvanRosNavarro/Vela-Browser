import { useEffect, useMemo } from 'react';
import { FilePickerPanel } from './components/FilePickerPanel';

function parseParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    accept: p.get('accept') ?? '',
    multiple: p.get('multiple') === 'true',
    profileId: p.get('profileId') ?? '',
    windowId: parseInt(p.get('windowId') ?? '0', 10),
    pickerId: p.get('pickerId') ?? '',
  };
}

export function App() {
  const params = useMemo(() => parseParams(), []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void window.api.filepicker.cancel({ windowId: params.windowId });
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [params.windowId]);

  return (
    <FilePickerPanel
      accept={params.accept}
      multiple={params.multiple}
      profileId={params.profileId}
      windowId={params.windowId}
      pickerId={params.pickerId}
    />
  );
}
