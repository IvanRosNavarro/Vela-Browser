import { useState, useCallback } from 'react';
import type { VaultEntrySummary } from '@vela/shared';

interface Props {
  entries: VaultEntrySummary[];
}

interface HibpResult {
  id: string;
  domain: string;
  username: string;
  breached: boolean | null; // null = not checked
  checking: boolean;
}

function isDuplicatePassword(entries: VaultEntrySummary[]): VaultEntrySummary[][] {
  // We only have summaries here (no password) — duplicates require full entries.
  // This returns empty; a future version could use a hash comparison via IPC.
  return [];
}

function isWeakEntry(entry: VaultEntrySummary): boolean {
  // Can't check password strength without the actual password — stub for now.
  return false;
}

export function SecurityAudit({ entries }: Props) {
  const [hibpResults, setHibpResults] = useState<HibpResult[]>([]);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);

  const handleCheckHibp = useCallback(async () => {
    setChecking(true);
    setChecked(false);
    const results: HibpResult[] = entries.map((e) => ({
      id: e.id,
      domain: e.domain,
      username: e.username,
      breached: null,
      checking: true,
    }));
    setHibpResults([...results]);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      // We need the actual password to check HIBP — fetch it
      const res = await window.api.vault.retrieve({ id: entry.id });
      if (!res.ok || !res.data) continue;

      const password = res.data.password;
      const hash = await sha1Hex(password);
      const prefix = hash.slice(0, 5).toUpperCase();
      const suffix = hash.slice(5).toUpperCase();

      let breached = false;
      try {
        const resp = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
        const text = await resp.text();
        const lines = text.split('\n');
        breached = lines.some((line) => line.split(':')[0]?.toUpperCase() === suffix);
      } catch {
        breached = false;
      }

      setHibpResults((prev) =>
        prev.map((r) =>
          r.id === entry.id ? { ...r, breached, checking: false } : r,
        ),
      );
    }

    setChecking(false);
    setChecked(true);
  }, [entries]);

  const duplicates = isDuplicatePassword(entries);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--vela-fg)', marginBottom: 20 }}>
        Auditoría de seguridad
      </h2>

      {/* Duplicates */}
      <Section title="Contraseñas duplicadas">
        {duplicates.length === 0 ? (
          <p style={{ color: 'var(--vela-fg-muted)', fontSize: 12 }}>
            La detección de duplicados requiere cargar todas las entradas descifradas.<br />
            Esta funcionalidad completa se implementará en una actualización futura.
          </p>
        ) : (
          duplicates.map((group, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              {group.map((e) => (
                <div key={e.id} style={{ fontSize: 12, color: 'var(--vela-warning)', padding: '2px 0' }}>
                  {e.domain} — {e.username}
                </div>
              ))}
            </div>
          ))
        )}
      </Section>

      {/* HIBP */}
      <Section title="Have I Been Pwned (k-anonymity)">
        <p style={{ fontSize: 12, color: 'var(--vela-fg-muted)', marginBottom: 12 }}>
          Comprueba si tus contraseñas aparecen en filtraciones de datos conocidas.
          Solo se envían los primeros 5 caracteres del hash SHA-1 de cada contraseña,
          nunca la contraseña completa ni el dominio.
        </p>
        <button
          type="button"
          onClick={() => void handleCheckHibp()}
          disabled={checking || entries.length === 0}
          style={{
            background: 'var(--vela-accent)',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 12,
            padding: '6px 16px',
            cursor: checking ? 'not-allowed' : 'pointer',
            opacity: checking ? 0.7 : 1,
            marginBottom: 16,
          }}
        >
          {checking ? 'Comprobando…' : 'Comprobar filtraciones'}
        </button>

        {hibpResults.length > 0 && (
          <div>
            {hibpResults.map((r) => (
              <div
                key={r.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid var(--vela-border)',
                }}
              >
                <span style={{ fontSize: 14 }}>
                  {r.checking ? '⏳' : r.breached ? '🔴' : '🟢'}
                </span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 12, color: 'var(--vela-fg)', fontWeight: 500 }}>{r.domain}</span>
                  <span style={{ fontSize: 11, color: 'var(--vela-fg-muted)', marginLeft: 8 }}>{r.username}</span>
                </div>
                {!r.checking && (
                  <span style={{ fontSize: 11, color: r.breached ? 'var(--vela-danger)' : 'var(--vela-success)' }}>
                    {r.breached ? 'Filtrada' : 'Segura'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {checked && !checking && (
          <p style={{ fontSize: 11, color: 'var(--vela-fg-muted)', marginTop: 8 }}>
            Comprobación finalizada. Las contraseñas marcadas como "Filtrada" deberían cambiarse.
          </p>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--vela-fg)', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--vela-border)' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

async function sha1Hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
