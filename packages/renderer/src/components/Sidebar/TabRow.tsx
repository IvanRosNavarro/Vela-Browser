import { useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Volume2, VolumeOff } from 'lucide-react';
import type { SidebarMode, TabNode } from '@vela/shared';
import { useNodeDrag } from './useNodeDrag';
import { useNodeDrop } from './useNodeDrop';
import { DropIndicator } from './DropIndicator';
import { Favicon } from './Favicon';
import velaIcon from '../../assets/vela-icon.png';
import { InlineRename } from './InlineRename';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useTreeStore } from '../../stores/treeStore';
import { useMediaStore } from '../../stores/mediaStore';
import { useTabSelectionStore } from '../../stores/tabSelectionStore';
import { selectVisibleFlatListWithDepth } from './flatList';
import { isFolderLike } from '@vela/shared';
import { toast } from '../../stores/toastStore';
import { showTabContextMenu } from './tabContextMenu';
import type { ActiveDrop } from './types';
import type { DropZone } from './dropValidation';
import { useSettings } from '../../pages/settings/lib/useSettings';

interface TabRowProps {
  node: TabNode;
  depth: number;
  mode: SidebarMode;
  rowHeight: number;
  indent: number;
  inheritedColor: string | null;
  inheritedColorEnabled: boolean;
  isActive: boolean;
  activeDrop: ActiveDrop | null;
}

function deriveTitle(node: TabNode): string {
  if (node.name && node.name.trim().length > 0) return node.name;
  if (node.originalTitle && node.originalTitle.trim().length > 0) {
    return node.originalTitle;
  }
  try {
    return new URL(node.url).hostname;
  } catch {
    return node.url;
  }
}

// Module-level state: exactly one preview per window at a time
let _showTimer: ReturnType<typeof setTimeout> | null = null;
let _hideTimer: ReturnType<typeof setTimeout> | null = null;
let _previewWindowId: number | null = null;

const MEDIA_PULSE_STYLE = `
@keyframes media-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.85); }
}
`;

export function TabRow({
  node,
  depth,
  mode,
  rowHeight,
  indent,
  inheritedColor,
  inheritedColorEnabled,
  isActive,
  activeDrop,
}: TabRowProps) {
  const drag = useNodeDrag(node);
  const drop = useNodeDrop(node);
  const [renaming, setRenaming] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);

  const activateTab = useRuntimeStore((s) => s.activateTab);
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const currentProfileId = useRuntimeStore((s) => s.currentProfileId);

  const mediaSources = useMediaStore((s) => s.sources);
  const { get: getSetting } = useSettings();
  const tabIndicatorEnabled = getSetting('media:tab-indicator', true);
  const mediaSource = tabIndicatorEnabled
    ? mediaSources.find((s) => s.tabId === node.id)
    : undefined;
  const isMuted = useMediaStore((s) => s.mutedTabIds.has(node.id));
  const toggleMuted = useMediaStore((s) => s.toggleMuted);
  const isSelected = useTabSelectionStore((s) => s.ids.includes(node.id));
  // El altavoz aparece si la pestaña suena (con el indicador activado) o si
  // está silenciada: el silencio lo decidió el usuario y debe verse siempre.
  const showSpeaker = !renaming && (isMuted || mediaSource !== undefined);
  const speakerLabel = isMuted ? 'Activar sonido' : 'Silenciar pestaña';
  const closeTab = useRuntimeStore((s) => s.closeTab);
  const renameNode = useTreeStore((s) => s.renameNode);
  const compact = mode === 'compact';
  const title = useMemo(() => deriveTitle(node), [node]);
  const fallbackChar = title.charAt(0) || '·';

  const dropZone = activeDrop?.targetId === node.id ? activeDrop.zone : null;
  const isInvalidTarget =
    activeDrop?.targetId === node.id && activeDrop.invalid;

  const opacity = drag.isDragging ? 0.4 : 1;

  const rowStyle: CSSProperties = {
    height: rowHeight,
    paddingLeft: compact
      ? Math.min(depth * indent, 16)
      : depth * indent + 6,
    paddingRight: compact ? 0 : 6,
    opacity,
    background: isActive
      ? 'var(--vela-tab-active-bg)'
      : isSelected
        ? 'color-mix(in srgb, var(--vela-accent) 16%, transparent)'
        : node.isSecure
          ? 'color-mix(in srgb, var(--vela-accent) 8%, transparent)'
          : undefined,
    // Seleccionada: contorno de accent, distinto del fondo de la activa, para
    // que se vea también cuando la activa forma parte de la selección.
    boxShadow: isSelected
      ? 'inset 0 0 0 1px color-mix(in srgb, var(--vela-accent) 55%, transparent)'
      : undefined,
    borderRadius: isSelected ? 4 : undefined,
    color: isActive ? 'var(--vela-tab-active-fg)' : 'var(--vela-fg)',
  };

  const transformStyle: CSSProperties = drag.transform
    ? {
        transform: `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)`,
      }
    : {};

  function handleClose(e: React.MouseEvent) {
    e.stopPropagation();
    void closeTab(node.id);
  }

  function handleToggleMute(e: React.MouseEvent) {
    e.stopPropagation();
    void toggleMuted(node.id);
  }

  /**
   * Ctrl/Cmd+clic alterna la pestaña en la selección múltiple; Shift+clic
   * selecciona el rango desde la última pulsada (o desde la activa) en el
   * orden visible del árbol. Clic normal: limpia la selección y activa.
   */
  function handleClick(e: React.MouseEvent) {
    if (renaming) return;
    const selection = useTabSelectionStore.getState();
    if (e.ctrlKey || e.metaKey) {
      selection.toggle(node.workspaceId, node.id);
      return;
    }
    if (e.shiftKey) {
      const flat = selectVisibleFlatListWithDepth(
        useTreeStore.getState(),
        node.workspaceId,
      );
      const byId = new Map(flat.map((f) => [f.node.id, f.node] as const));
      const activeTabId =
        currentWindowId !== null
          ? (useRuntimeStore.getState().activeTabIdByWindow[currentWindowId] ?? null)
          : null;
      selection.selectRange(
        node.workspaceId,
        flat.map((f) => f.node.id),
        node.id,
        (id) => {
          const n = byId.get(id);
          return n !== undefined && !isFolderLike(n);
        },
        activeTabId,
      );
      return;
    }
    selection.clear();
    void activateTab(node.id);
  }

  function handleAuxClick(e: React.MouseEvent) {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    void closeTab(node.id);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Clic derecho fuera de la selección: se descarta, como en Chrome, y el
    // menú actúa solo sobre esta pestaña.
    if (!isSelected) useTabSelectionStore.getState().clear();

    if (_showTimer) { clearTimeout(_showTimer); _showTimer = null; }
    if (currentWindowId && _previewWindowId === currentWindowId) {
      _previewWindowId = null;
      void window.api.tabPreview.hide({ windowId: currentWindowId });
    }

    void showTabContextMenu({
      node,
      isActive,
      onRename: () => setRenaming(true),
    });
  }

  const handleMouseEnter = useCallback(() => {
    if (!currentWindowId || !currentProfileId || isActive) return;
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }

    const delay = (getSetting('sidebar:tab-preview-delay', 500) as number) ?? 500;

    if (_previewWindowId === currentWindowId) {
      // Preview already visible for this window: update immediately
      void window.api.tabPreview.update({ windowId: currentWindowId, tabId: node.id, profileId: currentProfileId, title, url: node.url });
    } else {
      if (_showTimer) { clearTimeout(_showTimer); _showTimer = null; }
      _showTimer = setTimeout(() => {
        _showTimer = null;
        const r = rowRef.current?.getBoundingClientRect();
        if (!r || !currentWindowId || !currentProfileId) return;
        _previewWindowId = currentWindowId;
        void window.api.tabPreview.show({
          windowId: currentWindowId,
          tabId: node.id,
          profileId: currentProfileId,
          title,
          url: node.url,
          anchorRect: { right: r.right, top: r.top, bottom: r.bottom },
        });
      }, delay);
    }
  }, [currentWindowId, currentProfileId, node.id, node.url, title, getSetting, isActive]);

  const handleMouseLeave = useCallback(() => {
    if (_showTimer) { clearTimeout(_showTimer); _showTimer = null; }
    if (!currentWindowId || _previewWindowId !== currentWindowId) return;
    _hideTimer = setTimeout(() => {
      _hideTimer = null;
      if (_previewWindowId === currentWindowId) {
        _previewWindowId = null;
        void window.api.tabPreview.hide({ windowId: currentWindowId });
      }
    }, 120);
  }, [currentWindowId]);

  const faviconSrc = node.url?.startsWith('vela://') ? velaIcon : (node.favicon ?? null);

  // Estilos especiales para tabs descartadas
  const faviconStyle: CSSProperties = node.discarded
    ? { filter: 'grayscale(100%) opacity(0.6)' }
    : {};
  const titleStyle: CSSProperties = node.discarded
    ? { opacity: 0.6 }
    : {};

  return (
    <div
      ref={(el) => { drag.setNodeRef(el); rowRef.current = el; }}
      {...drag.listeners}
      {...drag.attributes}
      onClick={handleClick}
      onAuxClick={handleAuxClick}
      onDoubleClick={(e) => {
        e.preventDefault();
        setRenaming(true);
      }}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={node.discarded ? 'Pestaña suspendida · Click para recargar' : undefined}
      aria-selected={isSelected || undefined}
      className="group relative flex cursor-default items-center select-none hover:bg-[var(--vela-bg-row-hover)]"
      style={{ ...rowStyle, ...transformStyle }}
      data-tab-id={node.id}
    >
      {inheritedColorEnabled && inheritedColor && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 1,
            background: inheritedColor,
            opacity: 'var(--vela-inherit-line-alpha)',
          }}
        />
      )}

      {/*
        Las drop zones son refs geométricas para dnd-kit (closestCenter usa
        getBoundingClientRect, no hit-testing por pointer events). Sin
        pointer-events: none capturarían los clicks porque, al estar
        position:absolute encima de hermanos estáticos, se pintan en una
        capa superior y los clicks no llegan al botón "×" de cerrar.
      */}
      <div
        ref={drop.before.setNodeRef}
        style={{
          position: 'absolute',
          inset: 0,
          height: '50%',
          pointerEvents: 'none',
        }}
        aria-hidden
      />
      <div
        ref={drop.after.setNodeRef}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '50%',
          bottom: 0,
          pointerEvents: 'none',
        }}
        aria-hidden
      />

      {compact ? (
        <div className="relative mx-auto flex items-center justify-center">
          <span style={faviconStyle}>
            <Favicon
              src={faviconSrc}
              alt={title}
              size={20}
              fallbackChar={fallbackChar}
            />
          </span>
          {showSpeaker && (
            <button
              type="button"
              aria-label={speakerLabel}
              title={speakerLabel}
              onClick={handleToggleMute}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute -bottom-1 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full"
              style={{
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                background: 'var(--vela-bg-sidebar)',
                color: isMuted ? 'var(--vela-fg-muted)' : 'var(--vela-accent)',
              }}
            >
              {isMuted ? <VolumeOff size={10} /> : <Volume2 size={10} />}
            </button>
          )}
        </div>
      ) : (
        <>
          {node.isSecure && (
            <span
              aria-label="Pestaña fantasma"
              title="Pestaña fantasma"
              style={{
                fontSize: 14,
                color: 'var(--vela-accent)',
                marginRight: 2,
                flexShrink: 0,
                lineHeight: 1,
              }}
              className="ti ti-shield-lock"
            />
          )}
          <span style={faviconStyle}>
            <Favicon
              src={faviconSrc}
              alt={title}
              size={16}
              fallbackChar={fallbackChar}
            />
          </span>
          <style>{MEDIA_PULSE_STYLE}</style>
          {renaming ? (
            <div className="ml-2 flex flex-1 items-center pr-7">
              <InlineRename
                initial={title}
                onCommit={(next) => {
                  setRenaming(false);
                  void renameNode({ id: node.id, name: next });
                }}
                onCancel={() => setRenaming(false)}
              />
            </div>
          ) : (
            <span
              className="ml-2 flex-1 overflow-hidden whitespace-nowrap text-[13px]"
              style={{
                ...titleStyle,
                maskImage: 'linear-gradient(to right, black calc(100% - 2rem), transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 2rem), transparent 100%)',
              }}
            >
              {node.isSecure ? `[Fantasma] ${title}` : title}
            </span>
          )}
          {showSpeaker && (
            <button
              type="button"
              aria-label={speakerLabel}
              title={speakerLabel}
              onClick={handleToggleMute}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded hover:bg-[var(--vela-border-strong)] group-hover:right-7"
              style={{
                border: 'none',
                padding: 0,
                background: 'transparent',
                cursor: 'pointer',
                color:
                  !isMuted && mediaSource?.isPlaying
                    ? 'var(--vela-accent, #4f8ef7)'
                    : 'var(--vela-fg-muted)',
                animation:
                  !isMuted && mediaSource?.isPlaying
                    ? 'media-pulse 1.8s ease-in-out infinite'
                    : 'none',
              }}
            >
              {isMuted ? <VolumeOff size={13} /> : <Volume2 size={13} />}
            </button>
          )}
          <button
            type="button"
            aria-label="Cerrar pestaña"
            title="Cerrar"
            onClick={handleClose}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 hidden h-5 w-5 items-center justify-center rounded text-base leading-none text-[var(--vela-fg-muted)] hover:bg-[var(--vela-border-strong)] hover:text-[var(--vela-fg)] group-hover:flex"
          >
            ×
          </button>
        </>
      )}

      {dropZone && !isInvalidTarget && (
        <DropIndicator
          zone={dropZone as DropZone}
          visible={dropZone === 'before' || dropZone === 'after'}
        />
      )}
    </div>
  );
}
