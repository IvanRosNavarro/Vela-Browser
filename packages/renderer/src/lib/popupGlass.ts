import type { CSSProperties } from 'react';

const params = new URLSearchParams(window.location.search);
const _enabled = params.get('glass') === '1';
const _blurPx = _enabled ? parseInt(params.get('blurPx') ?? '24', 10) : 24;
const _bgOpacity = _enabled ? parseFloat(params.get('bgOpacity') ?? '0.85') : 0.85;

/**
 * Devuelve estilos adicionales para el contenedor raíz de un popup cuando
 * glassmorphism está activo. Se mezcla (spread) sobre el estilo existente:
 *   style={{ background: '...', border: '...', ...getGlassStyle() }}
 *
 * Cuando glassmorphism está desactivado devuelve {} — sin cambios.
 */
export function getGlassStyle(baseColor = 'var(--vela-bg-surface, #1c1f26)'): CSSProperties {
  if (!_enabled) return {};
  const pct = Math.round(_bgOpacity * 100);
  return {
    background: `color-mix(in srgb, ${baseColor} ${pct}%, transparent)`,
    backdropFilter: `blur(${_blurPx}px) saturate(1.8)`,
    WebkitBackdropFilter: `blur(${_blurPx}px) saturate(1.8)`,
  };
}

export const glassEnabled = _enabled;
