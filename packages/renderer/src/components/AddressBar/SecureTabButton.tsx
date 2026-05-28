import { useTreeStore, selectNodeById } from '../../stores/treeStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { useWorkspacesStore } from '../../stores/workspacesStore';

const BTN_STYLE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  cursor: 'default',
  padding: 0,
  flexShrink: 0,
} as const;

function MaskIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 10C2 6.5 6.5 4 12 4s10 2.5 10 6c-1.5 2.5-4.5 3-7 1.5-.5-.3-1-.5-1.5-.5h-3c-.5 0-1 .2-1.5.5C6.5 13 3.5 12.5 2 10z" />
      <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M10.5 15.5Q12 17 13.5 15.5" />
    </svg>
  );
}

function isSecurableUrl(url: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

interface SecureTabButtonProps {
  url: string;
  editing: boolean;
}

export function SecureTabButton({ url, editing }: SecureTabButtonProps) {
  const currentWindowId = useRuntimeStore((s) => s.currentWindowId);
  const activeTabId = useRuntimeStore((s) =>
    currentWindowId !== null ? (s.activeTabIdByWindow[currentWindowId] ?? null) : null,
  );
  const activeWorkspaceId = useWorkspacesStore((s) => s.activeWorkspaceId);
  const isSecureTab = useTreeStore((s) => {
    if (!activeWorkspaceId || !activeTabId) return false;
    const node = selectNodeById(s, activeWorkspaceId, activeTabId);
    return node?.kind === 'tab' ? node.isSecure : false;
  });

  if (editing || !isSecurableUrl(url) || isSecureTab) return null;

  return (
    <button
      type="button"
      aria-label="Abrir en pestaña blindada"
      title="Abrir en pestaña blindada"
      style={{
        ...BTN_STYLE,
        color: 'var(--vela-addressbar-fg-muted)',
        opacity: 0.4,
        transition: 'opacity 150ms, color 150ms',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--vela-bg-row-hover)';
        (e.currentTarget as HTMLButtonElement).style.opacity = '0.8';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        (e.currentTarget as HTMLButtonElement).style.opacity = '0.4';
      }}
      onClick={() => void window.api.tab.createSecure({ url })}
    >
      <MaskIcon />
    </button>
  );
}
