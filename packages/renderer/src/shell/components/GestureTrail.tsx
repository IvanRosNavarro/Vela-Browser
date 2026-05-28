import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { GestureTrailHandle } from '../hooks/useMouseGestures';

function drawTrail(
  canvas: HTMLCanvasElement,
  points: Array<{ x: number; y: number }>,
) {
  const dpr = window.devicePixelRatio ?? 1;
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Only resize if needed to avoid clearing unnecessarily
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (points.length < 2) return;

  ctx.save();
  ctx.scale(dpr, dpr);

  // Resolve accent color from CSS variable
  const accentColor = getComputedStyle(document.documentElement)
    .getPropertyValue('--vela-accent')
    .trim() || '#7d8cff';

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!pt) continue;
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();

  // Start dot
  const first = points[0];
  if (!first) { ctx.restore(); return; }
  ctx.beginPath();
  ctx.arc(first.x, first.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = 0.4;
  ctx.fill();

  ctx.restore();
}

export const GestureTrail = forwardRef<GestureTrailHandle, object>(
  (_props, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const opacityRef = useRef(0);
    const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        update(points) {
          const canvas = canvasRef.current;
          if (!canvas) return;

          if (fadeTimerRef.current !== null) {
            clearTimeout(fadeTimerRef.current);
            fadeTimerRef.current = null;
          }

          // Show canvas immediately
          if (opacityRef.current === 0) {
            canvas.style.transition = 'none';
            canvas.style.opacity = '1';
            opacityRef.current = 1;
          }

          drawTrail(canvas, points);
        },

        clear() {
          const canvas = canvasRef.current;
          if (!canvas) return;

          // Fade out over 300ms then clear
          canvas.style.transition = 'opacity 300ms ease';
          canvas.style.opacity = '0';
          opacityRef.current = 0;

          fadeTimerRef.current = setTimeout(() => {
            if (!canvasRef.current) return;
            const ctx = canvasRef.current.getContext('2d');
            ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            fadeTimerRef.current = null;
          }, 300);
        },
      }),
      [],
    );

    return (
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 9800,
          pointerEvents: 'none',
          opacity: 0,
        }}
        aria-hidden
      />
    );
  },
);

GestureTrail.displayName = 'GestureTrail';
