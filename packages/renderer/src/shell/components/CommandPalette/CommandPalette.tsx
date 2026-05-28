import ReactDOM from 'react-dom';
import { useEffect } from 'react';
import { useOverlayStore } from '../../../stores/overlayStore';
import { useCommandPaletteStore } from '../../../stores/commandPaletteStore';
import { useCommandPalette } from './useCommandPalette';
import { CommandPaletteSearch } from './CommandPaletteSearch';
import { CommandPaletteList } from './CommandPaletteList';
import { CommandPaletteArgs } from './CommandPaletteArgs';
import type { PaletteEntry } from './useCommandPalette';

export function CommandPalette() {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const acquire = useOverlayStore((s) => s.acquire);
  const release = useOverlayStore((s) => s.release);

  useEffect(() => {
    if (!isOpen) return;
    acquire();
    return () => { release(); };
  }, [isOpen, acquire, release]);

  const {
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    mode,
    selectedCommand,
    argValues,
    setArgValue,
    backToList,
    filteredCommands,
    groupedCommands,
    hasQuery,
    executeOrSelectCommand,
    executeWithArgs,
    handleKeyDown,
    inputRef,
    listRef,
    close,
    tabOptions,
    workspaceOptions,
  } = useCommandPalette();

  if (!isOpen) return null;

  const modal = (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
        background: 'rgba(0,0,0,0.55)',
      }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={mode === 'list' ? handleKeyDown : undefined}
        style={{
          width: 560,
          maxHeight: '70vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'color-mix(in srgb, var(--vela-bg-elevated) calc(var(--sidebar-background-opacity, 1) * 100%), transparent)',
          backdropFilter: 'var(--sidebar-backdrop-filter)',
          borderRadius: 'var(--vela-radius-lg)',
          border: '1px solid var(--vela-border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          animation: 'command-palette-in 150ms ease-out',
        }}
      >
        <style>{`
          @keyframes command-palette-in {
            from { opacity: 0; transform: scale(0.96); }
            to   { opacity: 1; transform: scale(1); }
          }
        `}</style>

        {mode === 'list' ? (
          <>
            <CommandPaletteSearch
              inputRef={inputRef as React.RefObject<HTMLInputElement>}
              query={query}
              onQueryChange={setQuery}
              onKeyDown={handleKeyDown}
            />
            <CommandPaletteList
              filteredCommands={filteredCommands}
              groupedCommands={groupedCommands}
              hasQuery={hasQuery}
              selectedIndex={selectedIndex}
              listRef={listRef as React.RefObject<HTMLDivElement>}
              onActivate={(entry: PaletteEntry) => executeOrSelectCommand(entry)}
              onHover={(i) => setSelectedIndex(i)}
            />
          </>
        ) : selectedCommand ? (
          <CommandPaletteArgs
            command={selectedCommand}
            argValues={argValues}
            onArgChange={setArgValue}
            onExecute={() => { void executeWithArgs(); }}
            onBack={backToList}
            tabOptions={tabOptions}
            workspaceOptions={workspaceOptions}
          />
        ) : null}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
