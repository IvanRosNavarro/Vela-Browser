import { useState } from 'react';
import type { ElectronCookie } from '@vela/shared';
import { CookieRow } from './CookieRow';

type CookieTab = 'first' | 'third' | 'session';

interface CookieListProps {
  url: string;
  hostname: string;
  cookies: ElectronCookie[];
  onReload: () => void;
}

export function CookieList({ url, hostname, cookies, onReload }: CookieListProps) {
  const [tab, setTab] = useState<CookieTab>('first');

  const first = cookies.filter((c) => {
    const d = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
    return hostname.endsWith(d) || d === hostname;
  });
  const third = cookies.filter((c) => {
    const d = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
    return !(hostname.endsWith(d) || d === hostname);
  });
  const sessionCookies = cookies.filter((c) => !c.expirationDate);

  const tabData: Record<CookieTab, ElectronCookie[]> = { first, third, session: sessionCookies };
  const shown = tabData[tab];

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 11, fontWeight: active ? 600 : 400,
    color: active ? 'var(--vela-accent)' : 'var(--vela-fg-muted)',
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
    borderBottom: active ? '2px solid var(--vela-accent)' : '2px solid transparent',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--vela-border)', flexShrink: 0, paddingLeft: 4 }}>
        <button style={tabStyle(tab === 'first')} onClick={() => setTab('first')}>
          Primera parte ({first.length})
        </button>
        <button style={tabStyle(tab === 'third')} onClick={() => setTab('third')}>
          Terceros ({third.length})
        </button>
        <button style={tabStyle(tab === 'session')} onClick={() => setTab('session')}>
          Sesión ({sessionCookies.length})
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {shown.length === 0 ? (
          <div style={{ padding: '16px 12px', color: 'var(--vela-fg-muted)', fontSize: 12, textAlign: 'center' }}>
            No hay cookies de este tipo.
          </div>
        ) : (
          shown.map((cookie) => (
            <CookieRow
              key={`${cookie.domain}|${cookie.name}`}
              url={url}
              cookie={cookie}
              onReload={onReload}
            />
          ))
        )}
      </div>
    </div>
  );
}
