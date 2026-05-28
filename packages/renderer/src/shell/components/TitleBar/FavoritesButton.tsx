import type { CSSProperties } from 'react';

export function FavoritesButton() {
  function handleClick() {
    void window.api.window.openUrlInNewTab({ url: 'vela://favorites' });
  }

  return (
    <button
      type="button"
      title="Favoritos"
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 5,
        border: 'none',
        background: 'transparent',
        color: 'var(--vela-titlebar-fg)',
        cursor: 'pointer',
        opacity: 0.65,
        flexShrink: 0,
        WebkitAppRegion: 'no-drag',
        padding: 0,
      } as CSSProperties}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-bg-row-hover)';
        (e.currentTarget as HTMLButtonElement).style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        (e.currentTarget as HTMLButtonElement).style.opacity = '0.65';
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}
