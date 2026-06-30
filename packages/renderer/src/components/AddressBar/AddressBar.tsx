import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
} from 'react';
import { useUiStore } from '../../stores/uiStore';
import { useAddressBar } from './useAddressBar';
import { selectNodeById, useTreeStore } from '../../stores/treeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';
import { useRuntimeStore } from '../../stores/runtimeStore';

import { NavButtons } from './NavButtons';
import { SecurityIndicator } from './SecurityIndicator';
import { SuggestionsList } from './SuggestionsList';
import { UrlInput } from './UrlInput';
import { CopyUrlButton } from './CopyUrlButton';
import { TranslateButton } from './TranslateButton';
import { ModeChip } from './ModeChip';
import { UrlBreadcrumb } from './UrlBreadcrumb';
import { HoverUrlDisplay } from './HoverUrlDisplay';
import { ToolsClusterButton } from './ToolsClusterButton';
import { StatusClusterButton } from './StatusClusterButton';
import { VaultButton } from './VaultButton';
import { NotificationBell } from './NotificationBell';
import { CameraPermissionButton } from './CameraPermissionButton';
import type { AddressBarMode } from './useAddressBar';

function canShowBreadcrumb(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return u.pathname.split('/').filter((s) => s.length > 0).length >= 2;
  } catch {
    return false;
  }
}

export function AddressBar() {
  const sidebarMode = useUiStore((s) => s.sidebarMode);
  const compact = sidebarMode === 'compact';
  const setAddressBarEditing = useUiStore((s) => s.setAddressBarEditing);

  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const activeTabId = useRuntimeStore((s) =>
    currentWindowId !== null ? (s.activeTabIdByWindow[currentWindowId] ?? null) : null,
  );
  const isSecureTab = useTreeStore((s) => {
    if (!activeWorkspaceId || !activeTabId) return false;
    const node = selectNodeById(s, activeWorkspaceId, activeTabId);
    return node?.kind === 'tab' ? node.isSecure : false;
  });

  const ctrl = useAddressBar();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const urlBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAddressBarEditing(ctrl.editing);
    void window.api.nav.setAddressBarEditing({ editing: ctrl.editing });
    return () => {
      setAddressBarEditing(false);
      void window.api.nav.setAddressBarEditing({ editing: false });
    };
  }, [ctrl.editing, setAddressBarEditing]);

  // DOM focus: whenever editing becomes true, focus and select the input.
  // The hook handles prefix injection internally via focusRequestId.
  useEffect(() => {
    if (!ctrl.editing) return;
    const id = requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
    return () => cancelAnimationFrame(id);
  }, [ctrl.editing]);

  // Close on outside click (editing only).
  useEffect(() => {
    if (!ctrl.editing) return;
    const onMouseDown = (e: MouseEvent): void => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(e.target as Node)) return;
      ctrl.cancelEditing();
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [ctrl.editing, ctrl.cancelEditing]);

  // Escape cancels editing regardless of which element has focus within the bar.
  useEffect(() => {
    if (!ctrl.editing) return;
    const onKeyDown = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      inputRef.current?.blur();
      ctrl.cancelEditing();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [ctrl.editing, ctrl.cancelEditing]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        inputRef.current?.blur();
        ctrl.cancelEditing();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        ctrl.moveSuggestionCursor(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        ctrl.moveSuggestionCursor(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const newTab = e.altKey;
        void ctrl.submit({ newTab });
      }
    },
    [ctrl],
  );

  const showModeChip =
    ctrl.editing &&
    ctrl.modeInfo.mode !== 'url' &&
    ctrl.modeInfo.mode !== 'search';

  const hoverActive = !!ctrl.hoverUrl.url && !ctrl.editing;
  const showBreadcrumb =
    !ctrl.editing && !hoverActive && canShowBreadcrumb(ctrl.displayUrl.raw);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-1 shrink-0 items-center gap-2"
      style={{ padding: compact ? '0 4px' : '0 8px' }}
    >
      <NavButtons
        canGoBack={ctrl.canGoBack}
        canGoForward={ctrl.canGoForward}
        loading={ctrl.loading}
        compact={compact}
        onBack={ctrl.navigate.back}
        onForward={ctrl.navigate.forward}
        onReload={ctrl.navigate.reload}
        onStop={ctrl.navigate.stop}
        onBackContextMenu={(anchorRect) => {
          if (currentWindowId === null) return;
          void window.api.navHistory.open({ windowId: currentWindowId, anchorRect, direction: 'back' });
        }}
        onForwardContextMenu={(anchorRect) => {
          if (currentWindowId === null) return;
          void window.api.navHistory.open({ windowId: currentWindowId, anchorRect, direction: 'forward' });
        }}
      />

      <div
        ref={urlBarRef}
        className="relative flex flex-1 items-center gap-2"
        style={{
          height: compact ? 22 : 28,
          padding: '0 8px',
          borderRadius: 8,
          background: 'var(--vela-suggestion-bg)',
          border: '1px solid var(--vela-addressbar-border)',
          outline: ctrl.editing ? '2px solid var(--vela-accent)' : 'none',
          outlineOffset: -1,
          overflow: 'hidden',
        }}
      >
        {ctrl.loading && !ctrl.editing && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              opacity: 0.2,
              animation: 'vela-boat-traverse 3s linear infinite',
            }}
          >
            <div style={{ animation: 'vela-boat-bob 1.4s ease-in-out infinite' }}>
              <svg
                viewBox="0 0 40 26"
                width="28"
                height="18"
                fill="var(--vela-accent)"
                style={{ display: 'block' }}
              >
                <path d="M20 2 L20 18 L4 18 Z" />
                <path d="M20 7 L20 18 L33 15 Z" opacity={0.75} />
                <path d="M3 18 L37 18 L35 21 Q20 25 5 21 Z" />
                <rect x="19.5" y="1" width="1" height="17" />
              </svg>
            </div>
          </div>
        )}
        <SecurityIndicator
          security={ctrl.security}
          rawUrl={ctrl.displayUrl.raw}
        />
        {isSecureTab && !ctrl.editing && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              padding: '1px 5px',
              borderRadius: 4,
              background: 'color-mix(in srgb, var(--vela-accent) 15%, transparent)',
              color: 'var(--vela-accent)',
              border: '1px solid color-mix(in srgb, var(--vela-accent) 40%, transparent)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Fantasma
          </span>
        )}
        {showModeChip && (
          <ModeChip
            mode={ctrl.modeInfo.mode as Exclude<AddressBarMode, 'url' | 'search'>}
            engineName={ctrl.modeInfo.engineName}
            onClear={ctrl.clearPrefix}
          />
        )}

        <div
          className={`urlbar-content${hoverActive ? ' hover-active' : ''}`}
          onClick={(e) => {
            if (ctrl.editing) return;
            if ((e.target as HTMLElement).closest('button, input, a')) return;
            ctrl.enterEditing();
          }}
        >
          <div className="urlbar-current">
            {showBreadcrumb ? (
              <UrlBreadcrumb
                url={ctrl.displayUrl.raw}
                onNavigate={(url) =>
                  void ctrl.submit({ suggestion: { type: 'navigate', url } })
                }
              />
            ) : (
              <UrlInput
                ref={inputRef}
                editing={ctrl.editing}
                inputValue={ctrl.inputValue}
                display={ctrl.displayUrl}
                compact={compact}
                onChange={ctrl.setInputValue}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  /* el input solo existe en editing; nada que hacer */
                }}
                onBlur={() => {
                  /* el cierre por click fuera lo gestiona el listener global */
                }}
                onActivateDisplay={ctrl.enterEditing}
              />
            )}
          </div>

          {/* Always rendered so CSS transitions work on opacity/transform */}
          <span className="urlbar-separator" aria-hidden>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </span>
          <span className={`urlbar-destination${ctrl.hoverUrl.isExternal ? ' external' : ' same-origin'}`}>
            {ctrl.hoverUrl.url && (
              <HoverUrlDisplay
                url={ctrl.hoverUrl.url}
                isExternal={ctrl.hoverUrl.isExternal}
              />
            )}
          </span>
        </div>

        {/* Always-visible: copy URL */}
        <CopyUrlButton url={ctrl.displayUrl.raw} editing={ctrl.editing} />
        {/* Translate selected text */}
        <TranslateButton editing={ctrl.editing} />
        {/* Camera/mic permission state for current tab's origin */}
        <CameraPermissionButton />
        {/* Notification bell — permission state for current tab's origin */}
        <NotificationBell />
        {/* Vault button — standalone in URL bar so it stays above the WCV */}
        <VaultButton url={ctrl.displayUrl.raw} editing={ctrl.editing} />
        {/* Cluster buttons */}
        <StatusClusterButton url={ctrl.displayUrl.raw} editing={ctrl.editing} />
        <ToolsClusterButton url={ctrl.displayUrl.raw} editing={ctrl.editing} />

        {ctrl.editing && (
          <button
            type="button"
            aria-label="Cancelar edición"
            title="Cancelar (Escape)"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              border: 'none',
              borderRadius: 4,
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--vela-addressbar-fg-muted)',
              padding: 0,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-bg-row-hover)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => ctrl.cancelEditing()}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <line x1="2" y1="2" x2="10" y2="10" />
              <line x1="10" y1="2" x2="2" y2="10" />
            </svg>
          </button>
        )}

        {ctrl.editing ? (
          <SuggestionsList
            suggestions={ctrl.suggestions}
            selectedIndex={ctrl.selectedSuggestionIndex}
            onSelect={(s, newTab) => void ctrl.submit({ newTab, suggestion: s })}
            onHoverIndex={ctrl.setSelectedSuggestionIndex}
            anchorRef={urlBarRef}
          />
        ) : null}
      </div>
    </div>
  );
}
