import { useState, useCallback } from 'react';
import { RecentSection } from './RecentSection';
import { DownloadsSection } from './DownloadsSection';
import { ClipboardSection } from './ClipboardSection';
import { ExploreButton } from './ExploreButton';

interface Props {
  accept: string;
  multiple: boolean;
  profileId: string;
  windowId: number;
  pickerId: string;
}

export function FilePickerPanel({ accept, multiple, profileId, windowId, pickerId }: Props) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  const togglePath = useCallback((p: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(multiple ? prev : []);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }, [multiple]);

  async function confirmSelection(paths: string[]) {
    if (paths.length === 0) return;
    await window.api.filepicker.select({ windowId, profileId, paths, pickerId });
  }

  async function handleClipboardSelect(dataUrl: string) {
    await window.api.filepicker.select({
      windowId,
      profileId,
      paths: [`__clipboard__:${dataUrl}`],
      pickerId,
    });
  }

  const hasSelection = selectedPaths.size > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: 'var(--vela-bg-sidebar-elev)',
        border: '1px solid var(--vela-border)',
        borderRadius: '10px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.25)',
        overflow: 'hidden',
      }}
    >
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
        <ClipboardSection accept={accept} onSelect={(d) => void handleClipboardSelect(d)} />
        <RecentSection
          profileId={profileId}
          accept={accept}
          multiple={multiple}
          selected={selectedPaths}
          onToggle={togglePath}
        />
        <DownloadsSection
          accept={accept}
          multiple={multiple}
          selected={selectedPaths}
          onToggle={togglePath}
        />
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: '1px solid var(--vela-border)',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <ExploreButton
          windowId={windowId}
          profileId={profileId}
          accept={accept}
          multiple={multiple}
          pickerId={pickerId}
        />
        {hasSelection && (
          <button
            onClick={() => void confirmSelection(Array.from(selectedPaths))}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '7px',
              background: 'var(--vela-accent)',
              color: 'var(--vela-accent-fg)',
              fontWeight: 600,
              fontSize: '13px',
              width: '100%',
              transition: 'opacity 80ms',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            {selectedPaths.size === 1
              ? 'Seleccionar archivo'
              : `Seleccionar ${selectedPaths.size} archivos`}
          </button>
        )}
      </div>
    </div>
  );
}
