import { Suspense, lazy, useDeferredValue, useMemo, useState } from 'react';
import { icons as lucideIcons } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { buildLucideValue, isLucideIcon, lucideName } from './WorkspaceIcon';

const EmojiPicker = lazy(() => import('emoji-picker-react'));

type LucideIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const LUCIDE_ENTRIES: Array<[string, LucideIconComponent]> = Object.entries(
  lucideIcons as Record<string, LucideIconComponent>,
);

export interface IconPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
}

type Tab = 'emoji' | 'lucide';

function pascalToWords(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const initialTab: Tab = value && isLucideIcon(value) ? 'lucide' : 'emoji';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  const filteredLucide = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) {
      return LUCIDE_ENTRIES.slice(0, 240);
    }
    const matches: typeof LUCIDE_ENTRIES = [];
    for (const entry of LUCIDE_ENTRIES) {
      if (matches.length >= 240) break;
      const words = pascalToWords(entry[0]);
      if (words.includes(q)) matches.push(entry);
    }
    return matches;
  }, [deferredSearch]);

  return (
    <div className="flex flex-col gap-2" style={{ minHeight: 280 }}>
      <div
        className="flex items-center gap-2 rounded-md border p-1"
        style={{ borderColor: 'var(--vela-border)' }}
      >
        <button
          type="button"
          onClick={() => setTab('emoji')}
          className="rounded px-2 py-1 text-[12px]"
          style={{
            background:
              tab === 'emoji' ? 'var(--vela-bg-row-hover)' : 'transparent',
            color:
              tab === 'emoji' ? 'var(--vela-fg)' : 'var(--vela-fg-muted)',
          }}
        >
          Emoji
        </button>
        <button
          type="button"
          onClick={() => setTab('lucide')}
          className="rounded px-2 py-1 text-[12px]"
          style={{
            background:
              tab === 'lucide' ? 'var(--vela-bg-row-hover)' : 'transparent',
            color:
              tab === 'lucide' ? 'var(--vela-fg)' : 'var(--vela-fg-muted)',
          }}
        >
          Lucide
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-auto rounded px-2 py-1 text-[11px] text-[var(--vela-fg-muted)] hover:text-[var(--vela-fg)]"
        >
          Sin icono
        </button>
      </div>

      {tab === 'emoji' ? (
        <Suspense
          fallback={
            <div className="grid place-items-center text-[12px] text-[var(--vela-fg-muted)]">
              Cargando emojis…
            </div>
          }
        >
          <div className="vela-emoji-picker">
            <EmojiPicker
              onEmojiClick={(data) => onChange(data.emoji)}
              autoFocusSearch={false}
              lazyLoadEmojis
              width="100%"
              height={300}
            />
          </div>
        </Suspense>
      ) : (
        <>
          <input
            type="text"
            placeholder="Buscar icono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border bg-[var(--vela-bg-app)] px-2 py-1 text-[12px] text-[var(--vela-fg)] outline-none"
            style={{ borderColor: 'var(--vela-border)' }}
          />
          <div
            className="grid gap-1 overflow-y-auto"
            style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(28px, 1fr))',
              maxHeight: 220,
            }}
          >
            {filteredLucide.map(([name, Icon]) => {
              const fullValue = buildLucideValue(name);
              const selected = value === fullValue;
              return (
                <button
                  key={name}
                  type="button"
                  title={pascalToWords(name)}
                  onClick={() => onChange(fullValue)}
                  className="flex items-center justify-center rounded p-1 transition hover:bg-[var(--vela-bg-row-hover)]"
                  style={{
                    background: selected
                      ? 'var(--vela-bg-row-hover)'
                      : 'transparent',
                    color: selected
                      ? 'var(--vela-fg)'
                      : 'var(--vela-fg-muted)',
                  }}
                >
                  <Icon width={16} height={16} strokeWidth={2} />
                </button>
              );
            })}
            {filteredLucide.length === 0 && (
              <div className="col-span-full px-2 py-3 text-center text-[11px] text-[var(--vela-fg-muted)]">
                Sin resultados.
              </div>
            )}
          </div>
        </>
      )}

      {value && (
        <div className="flex items-center gap-2 text-[11px] text-[var(--vela-fg-muted)]">
          <span>Seleccionado:</span>
          <code className="rounded bg-[var(--vela-bg-app)] px-1.5 py-0.5">
            {isLucideIcon(value) ? lucideName(value) : value}
          </code>
        </div>
      )}
    </div>
  );
}
