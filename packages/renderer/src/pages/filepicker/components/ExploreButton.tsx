interface Props {
  windowId: number;
  profileId: string;
  accept: string;
  multiple: boolean;
  pickerId: string;
  onFiles?: (paths: string[]) => void;
}

export function ExploreButton({ windowId, profileId, accept, multiple, pickerId, onFiles }: Props) {
  async function handleClick() {
    const res = await window.api.filepicker.openNative({
      windowId,
      profileId,
      accept,
      multiple,
      pickerId,
    });
    if (res.ok && res.data.paths.length > 0) {
      onFiles?.(res.data.paths);
    }
  }

  return (
    <button
      onClick={() => void handleClick()}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        width: '100%',
        padding: '9px 16px',
        border: '1px solid var(--vela-border)',
        borderRadius: '7px',
        background: 'var(--vela-bg-surface)',
        color: 'var(--vela-fg)',
        fontSize: '13px',
        fontWeight: 500,
        transition: 'background 80ms, border-color 80ms',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.background = 'var(--vela-hover)';
        el.style.borderColor = 'var(--vela-accent)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.background = 'var(--vela-bg-surface)';
        el.style.borderColor = 'var(--vela-border)';
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
      </svg>
      Explorar archivos…
    </button>
  );
}
