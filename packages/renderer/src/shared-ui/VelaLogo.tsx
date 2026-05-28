import velaIcon from '../assets/vela-icon.png';

interface Props {
  className?: string;
  /** Tamaño base en rem (por defecto 3.5). El icono escala al 88 %. */
  size?: number;
  /** Opacidad del logo completo (por defecto 1). */
  opacity?: number;
}

export function VelaLogo({ className = '', size = 3.5, opacity = 1 }: Props) {
  const iconSize = size * 0.88;
  return (
    <div
      aria-label="Vela"
      className={`flex items-center select-none ${className}`}
      style={{ opacity, gap: `${size * 0.25}rem` }}
    >
      <div
        style={{
          width: `${iconSize}rem`,
          height: `${iconSize}rem`,
          maskImage: `url(${velaIcon})`,
          WebkitMaskImage: `url(${velaIcon})`,
          maskSize: 'contain',
          WebkitMaskSize: 'contain',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskPosition: 'center',
          backgroundColor: 'var(--vela-fg)',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: 'inherit',
          fontSize: `${size}rem`,
          fontWeight: 100,
          letterSpacing: '0.55em',
          paddingLeft: '0.55em',
          color: 'var(--vela-fg)',
          lineHeight: 1,
        }}
      >
        VELA
      </span>
    </div>
  );
}
