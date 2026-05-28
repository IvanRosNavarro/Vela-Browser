import { getCategoryLabel } from './useCommandPalette';
import { CommandPaletteItem } from './CommandPaletteItem';
import type { PaletteEntry } from './useCommandPalette';

interface CommandPaletteListProps {
  filteredCommands: PaletteEntry[];
  groupedCommands: Map<string, PaletteEntry[]>;
  hasQuery: boolean;
  selectedIndex: number;
  listRef: React.RefObject<HTMLDivElement>;
  onActivate: (entry: PaletteEntry) => void;
  onHover: (index: number) => void;
}

export function CommandPaletteList({
  filteredCommands,
  groupedCommands,
  hasQuery,
  selectedIndex,
  listRef,
  onActivate,
  onHover,
}: CommandPaletteListProps) {
  if (filteredCommands.length === 0) {
    return (
      <div
        style={{
          padding: '32px 14px',
          textAlign: 'center',
          color: 'var(--vela-fg-muted)',
          fontSize: 13,
        }}
      >
        No se encontraron comandos
      </div>
    );
  }

  if (hasQuery) {
    // Flat list sorted by score, no group headers.
    return (
      <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
        {filteredCommands.map((entry, i) => (
          <CommandPaletteItem
            key={entry.id}
            entry={entry}
            isFocused={selectedIndex === i}
            navIndex={i}
            hasQuery={hasQuery}
            onActivate={() => onActivate(entry)}
            onHover={() => onHover(i)}
          />
        ))}
      </div>
    );
  }

  // Grouped by category.
  let globalIndex = 0;
  const groups: Array<{ category: string; entries: PaletteEntry[]; startIndex: number }> = [];
  for (const [cat, entries] of groupedCommands) {
    groups.push({ category: cat, entries, startIndex: globalIndex });
    globalIndex += entries.length;
  }

  return (
    <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
      {groups.map(({ category, entries, startIndex }) => (
        <div key={category}>
          <div
            style={{
              padding: '4px 14px',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--vela-fg-muted)',
              background: 'var(--vela-bg-elevated)',
              borderBottom: '1px solid var(--vela-border)',
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}
          >
            {getCategoryLabel(category)}
          </div>
          {entries.map((entry, i) => (
            <CommandPaletteItem
              key={entry.id}
              entry={entry}
              isFocused={selectedIndex === startIndex + i}
              navIndex={startIndex + i}
              hasQuery={false}
              onActivate={() => onActivate(entry)}
              onHover={() => onHover(startIndex + i)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
