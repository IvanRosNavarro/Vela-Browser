interface HoverUrlDisplayProps {
  url: string;
  isExternal: boolean;
}

export function HoverUrlDisplay({ url, isExternal }: HoverUrlDisplayProps) {
  let hostname = '';
  let path = '';
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    path = parsed.pathname + parsed.search + parsed.hash;
    if (path === '/') path = '';
  } catch {
    return <span style={{ fontSize: 12 }}>{url}</span>;
  }

  return (
    <>
      <span
        style={{
          fontSize: 12,
          fontWeight: isExternal ? 500 : 400,
          opacity: isExternal ? 1 : 0.6,
          color: 'var(--vela-addressbar-fg)',
          flexShrink: 0,
        }}
      >
        {hostname}
      </span>
      {path && (
        <span
          style={{
            fontSize: 12,
            opacity: 0.5,
            color: 'var(--vela-addressbar-fg)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {path.length > 40 ? `${path.slice(0, 40)}…` : path}
        </span>
      )}
    </>
  );
}
