import { useEffect, useRef, useState, useCallback } from 'react';
import { IPC_EVENTS } from '@vela/shared';

const params = new URLSearchParams(window.location.search);
const parentWindowId = parseInt(params.get('windowId') ?? '0', 10);

interface Frame {
  hex: string;
  r: number;
  g: number;
  b: number;
  cropDataUrl: string;
}

export function App() {
  const [frame, setFrame] = useState<Frame | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Listen for pixel frames from main
  useEffect(() => {
    const off = window.api.on(IPC_EVENTS.DEVTOOLS_EYEDROPPER_FRAME, (f) => {
      setFrame(f);
    });
    return off;
  }, []);

  // Track cursor position
  useEffect(() => {
    const onMove = (e: MouseEvent) => setCursor({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Cancel on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Draw magnifier canvas from crop image
  useEffect(() => {
    if (!frame || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Crosshair
      const cx = canvas.width / 2; const cy = canvas.height / 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(canvas.width, cy); ctx.stroke();
      // Center pixel border
      const cell = canvas.width / 40;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1;
      ctx.strokeRect(cx - cell / 2, cy - cell / 2, cell, cell);
    };
    img.src = frame.cropDataUrl;
  }, [frame]);

  const handleClick = useCallback(() => {
    if (!frame) return;
    void window.api.devtoolsHelpers.eyedropperPickColor({
      parentWindowId,
      hex: frame.hex,
      r: frame.r,
      g: frame.g,
      b: frame.b,
    });
  }, [frame]);

  // Magnifier offset: show above-right of cursor to not cover the pixel
  const LUPA_SIZE = 160;
  const OFFSET = 20;
  const x = Math.min(cursor.x + OFFSET, window.innerWidth - LUPA_SIZE - 4);
  const y = Math.max(cursor.y - LUPA_SIZE - OFFSET, 4);

  return (
    <div
      style={{ width: '100vw', height: '100vh', position: 'relative', cursor: 'crosshair', background: 'transparent' }}
      onClick={handleClick}
    >
      {/* Magnifier HUD */}
      <div
        style={{
          position: 'fixed',
          left: x,
          top: y,
          width: LUPA_SIZE,
          pointerEvents: 'none',
          borderRadius: 10,
          overflow: 'hidden',
          border: '2px solid rgba(255,255,255,0.5)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        }}
      >
        <canvas
          ref={canvasRef}
          width={LUPA_SIZE}
          height={LUPA_SIZE}
          style={{ width: LUPA_SIZE, height: LUPA_SIZE, display: 'block', imageRendering: 'pixelated' }}
        />
        {frame && (
          <div style={{
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: 12,
            fontWeight: 600,
            textAlign: 'center',
            padding: '4px 0',
            letterSpacing: '0.05em',
          }}>
            {frame.hex}
          </div>
        )}
      </div>

      {/* Instruction badge */}
      <div style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.7)',
        color: 'rgba(255,255,255,0.8)',
        fontSize: 11,
        padding: '5px 14px',
        borderRadius: 20,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}>
        Clic para capturar · Escape para cancelar
      </div>
    </div>
  );
}
