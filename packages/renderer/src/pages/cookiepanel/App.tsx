import { useState, useEffect, useMemo } from 'react';
import { getGlassStyle } from '../../lib/popupGlass';
import type { ElectronCookie } from '@vela/shared';
import { CookieHeader } from '../../shell/components/CookiePanel/CookieHeader';
import { CookieSearch } from '../../shell/components/CookiePanel/CookieSearch';
import { CookieList } from '../../shell/components/CookiePanel/CookieList';
import { CookieForm } from '../../shell/components/CookiePanel/CookieForm';

function parseParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    url: p.get('url') ?? '',
  };
}

export function App() {
  const params = useMemo(() => parseParams(), []);
  const [cookies, setCookies] = useState<ElectronCookie[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  let hostname = '';
  try { hostname = new URL(params.url).hostname; } catch { /* noop */ }

  const filtered = search
    ? cookies.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : cookies;

  async function loadCookies() {
    if (!params.url) return;
    const res = await window.api.cookies.getForUrl(params.url);
    if (res.ok) setCookies(res.data as ElectronCookie[]);
  }

  useEffect(() => {
    void loadCookies();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDeleteAll() {
    if (!confirmDeleteAll) { setConfirmDeleteAll(true); return; }
    await window.api.cookies.removeAllForDomain(hostname);
    setCookies([]);
    setConfirmDeleteAll(false);
    window.close();
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--vela-bg-elevated)',
      border: '1px solid var(--vela-border)',
      borderRadius: 10,
      boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
      overflow: 'hidden',
      fontSize: 13,
      color: 'var(--vela-fg)',
      ...getGlassStyle('var(--vela-bg-elevated)'),
    }}>
      <CookieHeader
        hostname={hostname}
        count={cookies.length}
        confirmDeleteAll={confirmDeleteAll}
        onDeleteAll={() => void handleDeleteAll()}
        onCancelDelete={() => setConfirmDeleteAll(false)}
        onClose={() => window.close()}
      />
      <CookieSearch value={search} onChange={setSearch} />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <CookieList
          url={params.url}
          hostname={hostname}
          cookies={filtered}
          onReload={() => void loadCookies()}
        />
      </div>
      {showForm ? (
        <CookieForm
          url={params.url}
          hostname={hostname}
          onSaved={() => { setShowForm(false); void loadCookies(); }}
          onCancel={() => setShowForm(false)}
        />
      ) : (
        <div style={{ borderTop: '1px solid var(--vela-border)', padding: '8px 12px' }}>
          <button
            onClick={() => setShowForm(true)}
            style={{
              fontSize: 12, color: 'var(--vela-accent)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            + Nueva cookie
          </button>
        </div>
      )}
    </div>
  );
}
