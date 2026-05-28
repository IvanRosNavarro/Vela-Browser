import { useEffect, useState } from 'react';

interface Props {
  accept: string;
  onSelect: (dataUrl: string) => void;
}

function acceptsImages(accept: string): boolean {
  if (!accept) return true;
  return accept.split(',').some((t) => {
    const tok = t.trim().toLowerCase();
    return tok === 'image/*' || tok.startsWith('image/') || tok === '*/*';
  });
}

export function ClipboardSection({ accept, onSelect }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!acceptsImages(accept)) return;
    void (async () => {
      const res = await window.api.filepicker.clipboardImage();
      if (res.ok && res.data.dataUrl) setDataUrl(res.data.dataUrl);
    })();
  }, [accept]);

  if (!dataUrl) return null;

  return (
    <section>
      <p
        style={{
          fontSize: '10px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--vela-fg-muted)',
          padding: '8px 12px 4px',
        }}
      >
        Portapapeles
      </p>
      <div style={{ padding: '4px 12px 8px' }}>
        <button
          onClick={() => onSelect(dataUrl)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            padding: '6px 8px',
            border: '1px solid var(--vela-border)',
            borderRadius: '6px',
            background: 'var(--vela-bg-surface)',
            color: 'var(--vela-fg)',
            textAlign: 'left',
            transition: 'background 80ms',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--vela-hover)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--vela-bg-surface)'; }}
        >
          <img
            src={dataUrl}
            alt="Portapapeles"
            style={{
              width: '40px',
              height: '40px',
              objectFit: 'cover',
              borderRadius: '4px',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: '13px' }}>Pegar imagen del portapapeles</span>
        </button>
      </div>
    </section>
  );
}
