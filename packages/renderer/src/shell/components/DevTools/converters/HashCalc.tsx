import { useState, useEffect, useCallback, useRef } from 'react';
import md5 from 'md5';

type HashAlgo = 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-512';
const ALGOS: HashAlgo[] = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'];

async function digest(algo: string, data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest(algo, data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bufToBase64(hex: string): string {
  const bytes = hex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? [];
  return btoa(String.fromCharCode(...bytes));
}

export function HashCalc() {
  const [input, setInput] = useState('');
  const [hashes, setHashes] = useState<Record<HashAlgo, string>>({ 'MD5': '', 'SHA-1': '', 'SHA-256': '', 'SHA-512': '' });
  const [asBase64, setAsBase64] = useState(false);
  const [hmacMode, setHmacMode] = useState(false);
  const [hmacKey, setHmacKey] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const compute = useCallback(async (text: string) => {
    const enc = new TextEncoder().encode(text);
    const md5hash = md5(text);
    const [sha1, sha256, sha512] = await Promise.all([
      digest('SHA-1', enc),
      digest('SHA-256', enc),
      digest('SHA-512', enc),
    ]);
    const fmt = (h: string) => asBase64 ? bufToBase64(h) : h;
    setHashes({ MD5: fmt(md5hash), 'SHA-1': fmt(sha1), 'SHA-256': fmt(sha256), 'SHA-512': fmt(sha512) });
  }, [asBase64]);

  useEffect(() => { void compute(input); }, [input, asBase64, compute]);

  const computeHmac = useCallback(async () => {
    if (!hmacKey || !input) return;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(hmacKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(input));
    const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
    const key512 = await crypto.subtle.importKey('raw', enc.encode(hmacKey), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
    const sig512 = await crypto.subtle.sign('HMAC', key512, enc.encode(input));
    const hex512 = Array.from(new Uint8Array(sig512)).map((b) => b.toString(16).padStart(2, '0')).join('');
    const fmt = (h: string) => asBase64 ? bufToBase64(h) : h;
    setHashes((prev) => ({ ...prev, 'SHA-256': fmt(hex), 'SHA-512': fmt(hex512) }));
  }, [hmacKey, input, asBase64]);

  const handleFile = useCallback((file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setProgress(0);
      const reader = new FileReader();
      reader.onprogress = (e) => { if (e.lengthComputable) setProgress(e.loaded / e.total); };
      reader.onload = async (ev) => {
        setProgress(null);
        const buf = ev.target?.result as ArrayBuffer;
        const arr = new Uint8Array(buf);
        const md5hash = md5(Array.from(arr) as unknown as string);
        const [sha1, sha256, sha512] = await Promise.all([digest('SHA-1', arr), digest('SHA-256', arr), digest('SHA-512', arr)]);
        const fmt = (h: string) => asBase64 ? bufToBase64(h) : h;
        setHashes({ MD5: fmt(md5hash), 'SHA-1': fmt(sha1), 'SHA-256': fmt(sha256), 'SHA-512': fmt(sha512) });
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => setInput(String(ev.target?.result ?? ''));
      reader.readAsText(file);
    }
  }, [asBase64]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0]; if (f) handleFile(f);
  }, [handleFile]);

  const copy = useCallback((val: string) => void navigator.clipboard.writeText(val), []);

  return (
    <div className="flex flex-col gap-4" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-[var(--vela-fg-muted)]">Entrada</label>
          <div className="flex gap-2 text-xs">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={asBase64} onChange={(e) => setAsBase64(e.target.checked)} className="accent-[var(--vela-accent)]" />
              <span>Base64</span>
            </label>
            <button className="px-2 py-0.5 rounded border border-[var(--vela-border)] hover:bg-[var(--vela-bg-hover)]" onClick={() => fileRef.current?.click()}>Archivo</button>
          </div>
        </div>
        <textarea
          className="font-mono text-sm resize-none rounded-lg border border-[var(--vela-border)] p-3 focus:outline-none focus:border-[var(--vela-accent)] bg-[var(--vela-bg-app)] text-[var(--vela-fg)] h-24"
          placeholder="Texto a calcular (o arrastra un archivo)…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
        />
        {progress !== null && (
          <div className="h-1 rounded-full bg-[var(--vela-border)] overflow-hidden">
            <div className="h-full bg-[var(--vela-accent)] transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {ALGOS.map((algo) => (
          <div key={algo} className="flex items-center gap-2">
            <span className="font-mono text-xs text-[var(--vela-fg-muted)] w-14 shrink-0">{algo}</span>
            <span className="flex-1 font-mono text-xs text-[var(--vela-fg)] truncate bg-[var(--vela-bg-app)] border border-[var(--vela-border)] rounded px-2 py-1.5">{hashes[algo] || '—'}</span>
            <button className="text-xs shrink-0 px-2 py-1.5 rounded border border-[var(--vela-border)] hover:bg-[var(--vela-bg-hover)]" onClick={() => copy(hashes[algo])}>⎘</button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-1 text-xs cursor-pointer">
          <input type="checkbox" checked={hmacMode} onChange={(e) => setHmacMode(e.target.checked)} className="accent-[var(--vela-accent)]" />
          <span>Modo HMAC</span>
        </label>
        {hmacMode && (
          <div className="flex gap-2">
            <input
              className="flex-1 font-mono text-sm rounded-lg border border-[var(--vela-border)] px-3 py-2 focus:outline-none focus:border-[var(--vela-accent)] bg-[var(--vela-bg-app)] text-[var(--vela-fg)]"
              placeholder="Clave secreta HMAC…"
              value={hmacKey}
              onChange={(e) => setHmacKey(e.target.value)}
              type="password"
            />
            <button className="px-3 py-2 rounded-lg border border-[var(--vela-border)] text-xs hover:bg-[var(--vela-bg-hover)]" onClick={() => { void computeHmac(); }}>Calcular</button>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}
