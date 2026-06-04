import { useState, useCallback, useRef } from 'react';

function toBase64(text: string, urlSafe: boolean): string {
  try {
    let b64 = btoa(unescape(encodeURIComponent(text)));
    if (urlSafe) b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return b64;
  } catch { return ''; }
}

function fromBase64(b64: string, urlSafe: boolean): string {
  try {
    let s = b64;
    if (urlSafe) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; }
    return decodeURIComponent(escape(atob(s)));
  } catch { return ''; }
}

export function Base64() {
  const [text, setText] = useState('');
  const [encoded, setEncoded] = useState('');
  const [urlSafe, setUrlSafe] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onTextChange = useCallback((v: string) => {
    setText(v);
    setEncoded(toBase64(v, urlSafe));
    setPreview(null);
  }, [urlSafe]);

  const onEncodedChange = useCallback((v: string) => {
    setEncoded(v);
    setText(fromBase64(v, urlSafe));
    // Check if it decodes to an image
    const isImg = /^data:image\//.test(v) || v.startsWith('/9j/') || v.startsWith('iVBOR');
    if (isImg) {
      const prefix = v.startsWith('data:') ? v : `data:image/png;base64,${v}`;
      setPreview(prefix);
    } else {
      setPreview(null);
    }
  }, [urlSafe]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = String(ev.target?.result ?? '');
      setPreview(dataUrl);
      const b64part = dataUrl.split(',')[1] ?? '';
      const b64 = urlSafe ? b64part.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64part;
      setEncoded(b64);
      setText(`[Archivo binario: ${file.name}]`);
    };
    reader.readAsDataURL(file);
  }, [urlSafe]);

  const inputSize = text.length;
  const outputSize = encoded.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={urlSafe} onChange={(e) => { setUrlSafe(e.target.checked); setEncoded(toBase64(text, e.target.checked)); }} className="accent-[var(--vela-accent)]" />
          <span>Base64url (URL-safe)</span>
        </label>
        {inputSize > 0 && (
          <span className="text-[var(--vela-fg-muted)] ml-auto">
            {inputSize} B → {outputSize} chars (+{Math.round(((outputSize - inputSize) / inputSize) * 100)}%)
          </span>
        )}
      </div>

      <div
        className="flex flex-col gap-1"
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <label className="text-xs text-[var(--vela-fg-muted)]">Texto / Binario</label>
        <textarea
          className="font-mono text-sm resize-none rounded-lg border border-[var(--vela-border)] p-3 focus:outline-none focus:border-[var(--vela-accent)] bg-[var(--vela-bg-app)] text-[var(--vela-fg)] h-28"
          placeholder="Texto a codificar o arrastra un archivo…"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-[var(--vela-fg-muted)]">Base64</label>
          <button className="text-xs px-2 py-0.5 rounded border border-[var(--vela-border)] hover:bg-[var(--vela-bg-hover)]" onClick={() => void navigator.clipboard.writeText(encoded)}>⎘ Copiar</button>
        </div>
        <textarea
          className="font-mono text-sm resize-none rounded-lg border border-[var(--vela-border)] p-3 focus:outline-none focus:border-[var(--vela-accent)] bg-[var(--vela-bg-app)] text-[var(--vela-fg)] h-28"
          placeholder="Base64 a decodificar…"
          value={encoded}
          onChange={(e) => onEncodedChange(e.target.value)}
          spellCheck={false}
        />
      </div>

      {preview && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[var(--vela-fg-muted)]">Vista previa</label>
          <img src={preview} alt="preview" className="max-h-40 rounded-lg border border-[var(--vela-border)] object-contain bg-[var(--vela-bg-app)]" />
        </div>
      )}

      <input ref={fileRef} type="file" className="hidden" onChange={(e) => {
        const f = e.target.files?.[0]; if (!f) return;
        const r = new FileReader(); r.onload = (ev) => {
          const dataUrl = String(ev.target?.result ?? '');
          setPreview(dataUrl);
          const b64part = dataUrl.split(',')[1] ?? '';
          setEncoded(urlSafe ? b64part.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64part);
          setText(`[Archivo: ${f.name}]`);
        }; r.readAsDataURL(f);
      }} />
    </div>
  );
}
