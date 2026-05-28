import { useState, useCallback, useEffect } from 'react';

interface Props {
  onUsePassword: (pwd: string) => void;
}

function generatePassword(opts: {
  length: number;
  uppercase: boolean;
  numbers: boolean;
  symbols: boolean;
}): string {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const nums = '0123456789';
  const syms = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  let pool = lower;
  if (opts.uppercase) pool += upper;
  if (opts.numbers) pool += nums;
  if (opts.symbols) pool += syms;

  const arr = new Uint32Array(opts.length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((v) => pool[v % pool.length]).join('');
}

export function PasswordGenerator({ onUsePassword }: Props) {
  const [length, setLength] = useState(16);
  const [uppercase, setUppercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [password, setPassword] = useState('');
  const [copied, setCopied] = useState(false);

  const regenerate = useCallback(() => {
    setPassword(generatePassword({ length, uppercase, numbers, symbols }));
    setCopied(false);
  }, [length, uppercase, numbers, symbols]);

  useEffect(() => { regenerate(); }, [regenerate]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [password]);

  return (
    <div style={{
      padding: 16,
      borderBottom: '1px solid var(--vela-border)',
      background: 'var(--vela-bg-surface)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--vela-fg)', marginBottom: 10 }}>
        Generador de contraseñas
      </div>

      {/* Password preview */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <input
          type="text"
          readOnly
          value={password}
          style={{
            flex: 1,
            background: 'var(--vela-bg)',
            border: '1px solid var(--vela-border)',
            borderRadius: 5,
            color: 'var(--vela-fg)',
            fontSize: 11,
            fontFamily: 'monospace',
            padding: '5px 8px',
            outline: 'none',
          }}
        />
        <button type="button" onClick={regenerate} title="Regenerar" style={iconBtnStyle}>🔄</button>
        <button type="button" onClick={() => void handleCopy()} style={iconBtnStyle} title="Copiar">
          {copied ? '✓' : '📋'}
        </button>
      </div>

      {/* Length */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <label style={{ fontSize: 11, color: 'var(--vela-fg-muted)', width: 56 }}>Longitud</label>
        <input
          type="range"
          min={8}
          max={64}
          value={length}
          onChange={(e) => setLength(parseInt(e.target.value, 10))}
          style={{ flex: 1 }}
        />
        <span style={{ fontSize: 11, color: 'var(--vela-fg)', width: 24, textAlign: 'right' }}>{length}</span>
      </div>

      {/* Toggles */}
      <div style={{ display: 'flex', gap: 12 }}>
        <Toggle label="A-Z" checked={uppercase} onChange={setUppercase} />
        <Toggle label="0-9" checked={numbers} onChange={setNumbers} />
        <Toggle label="!@#" checked={symbols} onChange={setSymbols} />
      </div>

      {/* Use button */}
      <button
        type="button"
        onClick={() => onUsePassword(password)}
        style={{
          marginTop: 10,
          width: '100%',
          background: 'var(--vela-accent)',
          border: 'none',
          borderRadius: 5,
          color: '#fff',
          fontSize: 11,
          padding: '5px',
          cursor: 'pointer',
          fontWeight: 500,
        }}
      >
        Usar esta contraseña
      </button>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 11, color: 'var(--vela-fg)' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  fontSize: 14,
  padding: 2,
  flexShrink: 0,
};
