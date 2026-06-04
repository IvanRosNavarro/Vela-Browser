import { useDevToolsStore, type ConverterTab } from '../../../stores/devtoolsStore';
import { CssUnits } from './converters/CssUnits';
import { Base64 } from './converters/Base64';
import { HashCalc } from './converters/HashCalc';
import { UuidGen } from './converters/UuidGen';
import { Timestamps } from './converters/Timestamps';

const TABS: Array<{ id: ConverterTab; label: string }> = [
  { id: 'css', label: 'Unidades CSS' },
  { id: 'base64', label: 'Base64' },
  { id: 'hash', label: 'Hash' },
  { id: 'uuid', label: 'UUID / NanoID' },
  { id: 'timestamp', label: 'Timestamps' },
];

export function Converters() {
  const tab = useDevToolsStore((s) => s.converterTab);
  const setTab = useDevToolsStore((s) => s.setConverterTab);

  return (
    <div className="flex gap-4 h-full">
      {/* Tab list */}
      <nav className="flex flex-col gap-1 w-36 shrink-0 pt-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            className={`text-left px-3 py-2 rounded-lg text-sm transition-colors ${tab === id ? 'bg-[var(--vela-accent)] text-white font-medium' : 'hover:bg-[var(--vela-bg-hover)] text-[var(--vela-fg)]'}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Separator */}
      <div className="w-px bg-[var(--vela-border)] shrink-0" />

      {/* Panel */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {tab === 'css' && <CssUnits />}
        {tab === 'base64' && <Base64 />}
        {tab === 'hash' && <HashCalc />}
        {tab === 'uuid' && <UuidGen />}
        {tab === 'timestamp' && <Timestamps />}
      </div>
    </div>
  );
}
