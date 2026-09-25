import type { CSSProperties } from 'react';
import { useIntegrationsStore } from '../../../stores/integrationsStore';

const GITHUB_PULLS_URL = 'https://github.com/pulls';

/**
 * Contador discreto de pull requests que te esperan. Se oculta del todo cuando
 * no hay cuenta conectada o no hay nada pendiente: no ocupa sitio para no decir
 * nada.
 */
export function PullRequestsButton() {
  const status = useIntegrationsStore((s) => s.status);
  const openPr = useIntegrationsStore((s) => s.openPr);

  const count = status.pending.length;
  if (status.phase !== 'connected' || !status.enabled || count === 0) return null;

  const titles = status.pending
    .slice(0, 3)
    .map((pr) => `${pr.repo}#${pr.number} · ${pr.title}`)
    .join('\n');
  const rest = count > 3 ? `\n… y ${count - 3} más` : '';

  return (
    <button
      title={`${count} ${count === 1 ? 'pull request te espera' : 'pull requests te esperan'}\n${titles}${rest}`}
      onClick={() => void openPr(GITHUB_PULLS_URL)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 28,
        padding: '0 7px',
        borderRadius: 5,
        border: 'none',
        background: 'transparent',
        color: 'var(--vela-titlebar-fg)',
        cursor: 'pointer',
        flexShrink: 0,
        WebkitAppRegion: 'no-drag',
      } as CSSProperties}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M6 9v6" />
        <circle cx="18" cy="18" r="3" />
        <path d="M18 15V9a3 3 0 0 0-3-3h-4" />
        <path d="m13 3-2 3 2 3" />
      </svg>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1,
          color: 'var(--vela-accent, #4f8ef7)',
        }}
      >
        {count}
      </span>
    </button>
  );
}
