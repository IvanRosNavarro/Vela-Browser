import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { generateKeyBetween } from 'fractional-indexing';
import type { SidebarMode, TabNode } from '@vela/shared';
import { useNodeDrag } from './useNodeDrag';
import { useNodeDrop } from './useNodeDrop';
import { DropIndicator } from './DropIndicator';
import { Favicon } from './Favicon';
import velaIcon from '../../assets/vela-icon.png';
import { InlineRename } from './InlineRename';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useTreeStore } from '../../stores/treeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';
import { useMediaStore } from '../../stores/mediaStore';
import { toast } from '../../stores/toastStore';
import { call, IpcError } from '../../lib/ipc';
import { showContextMenu } from '../../lib/contextMenu';
import { useSidebarStore } from '../../stores/sidebarStore';
import type { MenuItemSpec } from '@vela/shared';
import type { ActiveDrop } from './types';
import type { DropZone } from './dropValidation';
import { useSettings } from '../../pages/settings/lib/useSettings';

async function pinWithToast(id: string): Promise<void> {
  try {
    await call(() => window.api.tab.pin({ id }));
  } catch (err) {
    if (err instanceof IpcError && err.details === 'CANNOT_PIN_NESTED_TAB') {
      toast(
        'No se puede fijar una pestaña dentro de una carpeta',
        'warning',
      );
      return;
    }
    throw err;
  }
}

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
  const [isPermanentlyWhitelisted, setIsPermanentlyWhitelisted] = useState(false);
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
  const closeTab = useRuntimeStore((s) => s.closeTab);
  const renameNode = useTreeStore((s) => s.renameNode);
  const deleteNode = useTreeStore((s) => s.deleteNode);
  const createFolder = useTreeStore((s) => s.createFolder);
  const moveNode = useTreeStore((s) => s.moveNode);
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const treeNodes = useTreeStore(
    (s) => s.nodesByWorkspace[node.workspaceId] ?? [],
  );

  const isAnchor = useTreeStore((s) => s.anchoredTabs.some((t) => t.id === node.id));

  const compact = mode === 'compact';
  const title = useMemo(() => deriveTitle(node), [node]);
  const fallbackChar = title.charAt(0) || '·';

  const dropZone = activeDrop?.targetId === node.id ? activeDrop.zone : null;
  const isInvalidTarget =
    activeDrop?.targetId === node.id && activeDrop.invalid;

  const opacity = drag.isDragging ? 0.4 : 1;

  // Carga el estado de whitelist permanente al montar y cuando cambia el id
  useEffect(() => {
    void window.api.discard.getWhitelistStatus({ tabId: node.id }).then((res) => {
      if (res.ok) setIsPermanentlyWhitelisted(res.data.permanent);
    }).catch(() => {});
  }, [node.id]);

  const rowStyle: CSSProperties = {
    height: rowHeight,
    paddingLeft: compact
      ? Math.min(depth * indent, 16)
      : depth * indent + 6,
    paddingRight: compact ? 0 : 6,
    opacity,
    background: isActive
      ? 'var(--vela-tab-active-bg)'
      : node.isSecure
        ? 'color-mix(in srgb, var(--vela-accent) 8%, transparent)'
        : undefined,
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

  function handleAuxClick(e: React.MouseEvent) {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    void closeTab(node.id);
  }

  async function addToNewFolder() {
    const allNodes = useTreeStore.getState().nodesByWorkspace[node.workspaceId] ?? [];
    const siblings = allNodes
      .filter((n) => n.parentId === node.parentId)
      .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
    const nodeIdx = siblings.findIndex((n) => n.id === node.id);
    const nextSibling = siblings[nodeIdx + 1];
    const folderPosition = generateKeyBetween(node.position, nextSibling?.position ?? null);

    const newFolder = await createFolder({
      workspaceId: node.workspaceId,
      parentId: node.parentId,
      name: 'Nueva carpeta',
      position: folderPosition,
    });

    await moveNode({
      id: node.id,
      newParentId: newFolder.id,
      newPosition: generateKeyBetween(null, null),
    });

    void activateTab(newFolder.id);
    useSidebarStore.getState().setPendingRenameId(newFolder.id);
  }

  function siblingsOf(parentId: string | null) {
    return treeNodes
      .filter((n) => n.parentId === parentId && n.id !== node.id)
      .sort((a, b) =>
        a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
      );
  }

  function siblingTabsOf(parentId: string | null) {
    return treeNodes.filter((n) => n.parentId === parentId && n.kind === 'tab' && n.id !== node.id);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (_showTimer) { clearTimeout(_showTimer); _showTimer = null; }
    if (currentWindowId && _previewWindowId === currentWindowId) {
      _previewWindowId = null;
      void window.api.tabPreview.hide({ windowId: currentWindowId });
    }

    async function moveToWorkspaceRoot() {
      const allNodes = useTreeStore.getState().nodesByWorkspace[node.workspaceId] ?? [];
      const rootNodes = allNodes.filter((n) => n.parentId === null);
      const lastPos = rootNodes.length > 0
        ? rootNodes.reduce((max, n) => (n.position > max ? n.position : max), rootNodes[0]!.position)
        : null;
      await call(() => window.api.node.move({ id: node.id, newParentId: null, newPosition: generateKeyBetween(lastPos, null), newWorkspaceId: node.workspaceId }));
    }

    const otherWorkspaces = workspaces.filter((w) => w.id !== node.workspaceId);
    const moveSubmenu: MenuItemSpec[] =
      otherWorkspaces.length === 0
        ? [{ type: 'normal', id: 'noop:no-other-workspaces', label: '(solo hay un workspace)', enabled: false }]
        : otherWorkspaces.map((w) => ({
            type: 'normal' as const,
            id: `move-to-workspace:${w.id}`,
            label: w.name,
            enabled: true,
          }));

    const discardSection: MenuItemSpec[] = node.discarded
      ? [
          { type: 'separator' },
          { type: 'normal', id: 'restore-tab', label: 'Reactivar esta pestaña' },
          { type: 'normal', id: 'restore-workspace', label: 'Reactivar todas las pestañas del workspace' },
        ]
      : [
          { type: 'separator' },
          { type: 'normal', id: 'discard-tab', label: 'Suspender esta pestaña' },
          ...(node.parentId
            ? [{ type: 'normal' as const, id: 'discard-folder', label: 'Suspender todas las pestañas de esta carpeta' }]
            : []),
          { type: 'normal', id: 'discard-workspace', label: 'Suspender todas las pestañas del workspace' },
          {
            type: 'normal',
            id: 'toggle-permanent-whitelist',
            label: isPermanentlyWhitelisted
              ? '✓ Mantener siempre activa'
              : 'Mantener siempre activa',
          },
        ];

    const items: MenuItemSpec[] = [
      { type: 'normal', id: 'rename', label: 'Renombrar' },
      { type: 'normal', id: 'close', label: 'Cerrar' },
      { type: 'normal', id: 'close-others', label: 'Cerrar otras (este nivel)' },
      { type: 'normal', id: 'close-all', label: 'Cerrar todas' },
      { type: 'separator' },
      ...(!node.pinned
        ? [{ type: 'normal' as const, id: 'pin', label: 'Estibar Carga' }]
        : []),
      ...(node.pinned
        ? [{ type: 'normal' as const, id: 'unpin', label: 'Desestibar Carga' }]
        : []),
      ...(node.pinned && node.pinnedUrl ? [
        { type: 'normal' as const, id: 'restore-pinned', label: 'Restaurar Carga' },
        { type: 'normal' as const, id: 'replace-pinned', label: 'Reemplazar Carga' },
      ] : []),
      {
        type: 'normal',
        id: isAnchor ? 'remove-anchor' : 'add-anchor',
        label: isAnchor ? 'Levar Ancla' : 'Anclar Ancla',
        enabled: node.url.startsWith('http://') || node.url.startsWith('https://'),
      },
      ...(isAnchor && node.anchoredUrl ? [
        { type: 'normal' as const, id: 'restore-anchor', label: 'Restaurar Ancla' },
        { type: 'normal' as const, id: 'replace-anchor', label: 'Reemplazar Ancla' },
      ] : []),
      { type: 'normal', id: 'add-to-folder', label: 'Añadir a carpeta' },
      { type: 'submenu', label: 'Mover a workspace', submenu: moveSubmenu },
      { type: 'separator' },
      { type: 'normal', id: 'duplicate', label: 'Duplicar' },
      {
        type: 'normal',
        id: 'open-secure',
        label: 'Abrir en pestaña fantasma',
        enabled: node.url.startsWith('http://') || node.url.startsWith('https://'),
      },
      { type: 'normal', id: 'open-blinded-window', label: 'Nueva ventana fantasma' },
      { type: 'normal', id: 'delete', label: 'Eliminar' },
      ...discardSection,
    ];

    const moveHandlers: Record<string, () => void> = {};
    for (const w of otherWorkspaces) {
      moveHandlers[`move-to-workspace:${w.id}`] = () => {
        const targetNodes = useTreeStore
          .getState()
          .nodesByWorkspace[w.id] ?? [];
        const rootNodes = targetNodes.filter((n) => n.parentId === null);
        const lastPos = rootNodes.length > 0
          ? rootNodes.reduce((max, n) => (n.position > max ? n.position : max), rootNodes[0]!.position)
          : null;
        const newPosition = generateKeyBetween(lastPos, null);
        void call(() =>
          window.api.node.move({
            id: node.id,
            newParentId: null,
            newPosition,
            newWorkspaceId: w.id,
          }),
        );
      };
    }

    void showContextMenu(items, {
      rename: () => setRenaming(true),
      'add-to-folder': () => void addToNewFolder(),
      close: () => closeTab(node.id),
      'close-others': () => {
        for (const s of siblingsOf(node.parentId)) {
          if (s.kind === 'tab') void closeTab(s.id);
        }
      },
      'close-all': () => {
        for (const t of treeNodes) {
          if (t.kind === 'tab') void closeTab(t.id);
        }
      },
      pin: () => void (async () => {
        if (node.parentId !== null) await moveToWorkspaceRoot();
        await pinWithToast(node.id);
      })(),
      unpin: () => void window.api.tab.unpin({ id: node.id }),
      'restore-pinned': () => void window.api.tab.restorePinnedUrl({ id: node.id }),
      'replace-pinned': () => void window.api.tab.replacePinnedUrl({ id: node.id }),
      'add-anchor': () => void (async () => {
        if (node.parentId !== null) await moveToWorkspaceRoot();
        await call(() => window.api.tab.anchor({ id: node.id }));
      })(),
      'remove-anchor': () => void window.api.tab.unanchor({ id: node.id }),
      'restore-anchor': () => void window.api.tab.restoreAnchoredUrl({ id: node.id }),
      'replace-anchor': () => void window.api.tab.replaceAnchoredUrl({ id: node.id }),
      duplicate: () =>
        void window.api.window.openUrlInNewTab({
          url: node.url,
          parentId: node.parentId,
        }),
      'open-secure': () => void window.api.tab.createSecure({ url: node.url }),
      'open-blinded-window': () => void window.api.window.openBlindedWindow(),
      delete: () => void deleteNode({ id: node.id }),
      // Discard actions
      'discard-tab': () => void call(() => window.api.discard.discardTab({ tabId: node.id })),
      'discard-folder': () => {
        if (node.parentId) {
          void call(() => window.api.discard.discardFolder({ folderId: node.parentId! }));
        }
      },
      'discard-workspace': () =>
        void call(() => window.api.discard.discardWorkspace({ workspaceId: node.workspaceId })),
      'restore-tab': () => void call(() => window.api.discard.restoreTab({ tabId: node.id })),
      'restore-workspace': () =>
        void call(() => window.api.discard.restoreWorkspace({ workspaceId: node.workspaceId })),
      'toggle-permanent-whitelist': () => {
        void call(() => window.api.discard.togglePermanentWhitelist({ tabId: node.id })).then((res) => {
          setIsPermanentlyWhitelisted(res.whitelisted);
        });
      },
      ...moveHandlers,
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
      onClick={() => {
        if (!renaming) void activateTab(node.id);
      }}
      onAuxClick={handleAuxClick}
      onDoubleClick={(e) => {
        e.preventDefault();
        setRenaming(true);
      }}
      onContextMenu={handleContextMenu}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title={node.discarded ? 'Pestaña suspendida · Click para recargar' : undefined}
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
        <div className="mx-auto flex items-center justify-center" style={faviconStyle}>
          <Favicon
            src={faviconSrc}
            alt={title}
            size={20}
            fallbackChar={fallbackChar}
          />
        </div>
      ) : (
        <>
          {node.isSecure && (
            <span
              aria-label="Pestaña blindada"
              title="Pestaña blindada"
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
          {mediaSource && !renaming && (
            <span
              title={mediaSource.isPlaying ? 'Reproduciendo audio' : 'Audio pausado'}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 group-hover:hidden"
              style={{
                fontSize: 13,
                color: mediaSource.isPlaying
                  ? 'var(--vela-accent, #4f8ef7)'
                  : 'var(--vela-fg-muted)',
                animation: mediaSource.isPlaying
                  ? 'media-pulse 1.8s ease-in-out infinite'
                  : 'none',
                pointerEvents: 'none',
                userSelect: 'none',
              } as CSSProperties}
            >
              {mediaSource.isPlaying ? '♪' : '♩'}
            </span>
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
