/**
 * Lógica pura de decisión de la imagen en imagen (PiP): qué pestañas dejan
 * de verse en una transición, qué vídeo es candidato y si procede entrar o
 * salir de PiP automáticamente. Sin Electron: se prueba en `pipPolicy.test.ts`.
 */

/** Ancho mínimo (px CSS) para considerar un vídeo "de verdad" y no decorativo. */
export const PIP_MIN_WIDTH = 200;
/** Alto mínimo (px CSS), por la misma razón. */
export const PIP_MIN_HEIGHT = 112;
/** `HTMLMediaElement.HAVE_CURRENT_DATA`: hay al menos un fotograma decodificado. */
const HAVE_CURRENT_DATA = 2;
/** `HTMLMediaElement.HAVE_METADATA`: dimensiones conocidas. */
const HAVE_METADATA = 1;

/** Lo que un frame informa de cada `<video>` que contiene. */
export interface VideoProbe {
  /** Posición del vídeo en la lista del frame (para volver a encontrarlo). */
  index: number;
  /** Ancho mostrado en px CSS (o el intrínseco si la vista está oculta). */
  width: number;
  height: number;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  volume: number;
  loop: boolean;
  readyState: number;
  disablePictureInPicture: boolean;
  /**
   * Si Chromium ha decodificado audio del vídeo (`webkitAudioDecodedByteCount`).
   * `null` si el navegador no lo expone.
   */
  hasAudio: boolean | null;
  /** Este vídeo es el `document.pictureInPictureElement` de su frame. */
  inPip: boolean;
}

/** Resultado de sondear un frame. */
export interface FrameProbe {
  /** `document.pictureInPictureEnabled` del frame. */
  pipEnabled: boolean;
  /** El frame ya tiene un vídeo en PiP. */
  inPip: boolean;
  videos: VideoProbe[];
}

/** Un vídeo concreto dentro de un frame concreto de la pestaña. */
export interface PipCandidate<F> {
  frame: F;
  video: VideoProbe;
}

export interface VisibilityDiff {
  /** Pestañas que se veían y ya no se ven. */
  hidden: string[];
  /** Pestañas que no se veían y ahora sí. */
  shown: string[];
}

/** Compara dos conjuntos de pestañas visibles de una misma ventana. */
export function diffVisibleTabs(
  prev: ReadonlySet<string>,
  next: ReadonlySet<string>,
): VisibilityDiff {
  const hidden: string[] = [];
  const shown: string[] = [];
  for (const id of prev) if (!next.has(id)) hidden.push(id);
  for (const id of next) if (!prev.has(id)) shown.push(id);
  return { hidden, shown };
}

/** Área mostrada del vídeo; es el criterio para elegir "el más grande". */
function area(v: VideoProbe): number {
  return Math.max(0, v.width) * Math.max(0, v.height);
}

/**
 * ¿Es este vídeo candidato a PiP automático?
 *
 * - Tiene que estar reproduciéndose (ni en pausa ni terminado) y con imagen.
 * - Silenciado o a volumen 0 no: son los vídeos de autoplay (previas de
 *   noticias, portadas) que el navegador solo deja arrancar mudos.
 * - En bucle y sin pista de audio tampoco: vídeos de fondo decorativos.
 * - Menor de `PIP_MIN_WIDTH`×`PIP_MIN_HEIGHT`: miniaturas y adornos.
 * - Respeta `disablePictureInPicture`.
 */
export function isAutoPipEligible(v: VideoProbe): boolean {
  if (v.paused || v.ended) return false;
  if (v.readyState < HAVE_CURRENT_DATA) return false;
  if (v.disablePictureInPicture) return false;
  if (v.muted || v.volume <= 0) return false;
  if (v.loop && v.hasAudio === false) return false;
  if (v.width < PIP_MIN_WIDTH || v.height < PIP_MIN_HEIGHT) return false;
  return true;
}

/**
 * ¿Puede el usuario pedir PiP a mano para este vídeo? Mucho más permisivo:
 * si lo pide explícitamente, vale aunque esté en pausa o silenciado.
 */
export function isManualPipEligible(v: VideoProbe): boolean {
  return v.readyState >= HAVE_METADATA && !v.disablePictureInPicture;
}

/**
 * Elige el vídeo para PiP entre todos los frames sondeados. En modo `auto`
 * solo cuentan los vídeos elegibles; en modo `manual` se prefieren los que se
 * están reproduciendo y, a igualdad, el más grande.
 */
export function pickPipCandidate<F>(
  frames: ReadonlyArray<{ frame: F; probe: FrameProbe }>,
  mode: 'auto' | 'manual',
): PipCandidate<F> | null {
  let best: PipCandidate<F> | null = null;
  let bestScore = -1;
  for (const { frame, probe } of frames) {
    if (!probe.pipEnabled) continue;
    for (const video of probe.videos) {
      const eligible = mode === 'auto' ? isAutoPipEligible(video) : isManualPipEligible(video);
      if (!eligible) continue;
      const playing = !video.paused && !video.ended;
      // En manual, reproducirse pesa más que cualquier tamaño.
      const score = area(video) + (mode === 'manual' && playing ? 1e12 : 0);
      if (score > bestScore) {
        best = { frame, video };
        bestScore = score;
      }
    }
  }
  return best;
}

export interface AutoPipContext {
  /** Ajuste `media:auto-pip`. */
  enabled: boolean;
  /** La pestaña se sigue viendo en otra ventana o panel. */
  visibleElsewhere: boolean;
  /** La pestaña sigue viva (no se ha cerrado ni descartado). */
  alive: boolean;
  /** Algún frame de la pestaña ya tiene un vídeo en PiP. */
  alreadyInPip: boolean;
}

/**
 * Decide si una pestaña que acaba de dejar de verse debe pasar a PiP. El
 * candidato es el que devolvió `pickPipCandidate(…, 'auto')`.
 */
export function shouldAutoEnterPip<F>(
  ctx: AutoPipContext,
  candidate: PipCandidate<F> | null,
): candidate is PipCandidate<F> {
  if (!ctx.enabled || !ctx.alive) return false;
  if (ctx.visibleElsewhere) return false;
  if (ctx.alreadyInPip) return false;
  return candidate !== null;
}
