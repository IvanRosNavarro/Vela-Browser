import { randomBytes } from 'node:crypto';
import type { WebContents, WebFrameMain } from 'electron';

/** Tope por frame: un iframe colgado no debe bloquear el control. */
const FRAME_SCRIPT_TIMEOUT_MS = 1500;

/**
 * Nombre del puente que se instala en el mundo de la página. Aleatorio por
 * ejecución para que un sitio no pueda detectar Vela buscando un global fijo,
 * igual que el switch `disable-blink-features=AutomationControlled`.
 */
const BRIDGE_KEY = `__v${randomBytes(8).toString('hex')}`;

/** Un elemento `<video>`/`<audio>` concreto dentro de un frame. */
export interface MediaElementProbe {
  index: number;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  volume: number;
  duration: number | null;
  currentTime: number;
  readyState: number;
  /** `null` cuando el navegador aún no sabe si el elemento lleva audio. */
  hasAudio: boolean | null;
}

/** Lo que un frame sabe de su reproducción. */
export interface FrameMediaProbe {
  elements: MediaElementProbe[];
  title: string | null;
  artist: string | null;
  album: string | null;
  artworkUrl: string | null;
  playbackState: string;
  hasMediaSession: boolean;
  /** Acciones que la página registró en `navigator.mediaSession`. */
  actions: string[];
  /** Posición declarada por la página con `setPositionState`, si la usa. */
  position: { duration: number; position: number; playbackRate: number } | null;
}

/** El elemento que manda en una pestaña, con el frame donde vive. */
export interface MediaTarget {
  frame: WebFrameMain;
  probe: FrameMediaProbe;
  element: MediaElementProbe | null;
}

/**
 * Recoge los elementos de medios del documento, incluidos los de shadow roots
 * abiertos de primer nivel. El orden es estable entre el sondeo y el comando,
 * que localiza el elemento por índice — mismo contrato que `PipManager`.
 */
const COLLECT_JS = `
  const collectMedia = () => {
    const out = Array.from(document.querySelectorAll('video,audio'));
    for (const host of document.querySelectorAll('*')) {
      if (host.shadowRoot) out.push(...host.shadowRoot.querySelectorAll('video,audio'));
    }
    return out;
  };
`;

/**
 * Envuelve `setActionHandler` y `setPositionState` para poder invocar después
 * los handlers reales de la página. Es la única vía: los handlers registrados
 * no se pueden leer desde la API pública, y una tecla multimedia inyectada en
 * el renderer llega como un `keydown` normal, sin llegar nunca a la sesión.
 *
 * Se ejecuta en el mundo de la página (`WebFrameMain.executeJavaScript`), que
 * no pasa por el CSP del sitio. Solo captura lo que se registre a partir de
 * ese momento, así que se reinstala en cada arranque de reproducción: los
 * reproductores que mandan (Spotify, YouTube Music) vuelven a registrar sus
 * handlers en cada cambio de pista.
 */
function installBridgeJs(): string {
  return `(() => {
    try {
      const KEY = '${BRIDGE_KEY}';
      if (window[KEY]) return true;
      const ms = navigator.mediaSession;
      if (!ms || typeof ms.setActionHandler !== 'function') return false;

      const handlers = new Map();
      const origSet = ms.setActionHandler.bind(ms);
      ms.setActionHandler = function (action, handler) {
        if (handler) handlers.set(action, handler);
        else handlers.delete(action);
        return origSet(action, handler);
      };

      let position = null;
      if (typeof ms.setPositionState === 'function') {
        const origPosition = ms.setPositionState.bind(ms);
        ms.setPositionState = function (state) {
          position = state
            ? {
                duration: Number(state.duration) || 0,
                position: Number(state.position) || 0,
                playbackRate: Number(state.playbackRate) || 1,
                at: Date.now(),
              }
            : null;
          return origPosition(state);
        };
      }

      Object.defineProperty(window, KEY, {
        value: {
          actions: () => Array.from(handlers.keys()),
          position: () => position,
          invoke: (action) => {
            const handler = handlers.get(action);
            if (!handler) return false;
            try { handler({ action }); return true; } catch (e) { return false; }
          },
        },
        enumerable: false,
        configurable: false,
        writable: false,
      });
      return true;
    } catch (e) { return false; }
  })()`;
}

/** Sondeo de solo lectura: estado de los elementos y metadata del frame. */
const PROBE_JS = `(() => {
  try {
    ${COLLECT_JS}
    const ms = navigator.mediaSession;
    const meta = ms && ms.metadata;
    const bridge = window['${BRIDGE_KEY}'];
    const elements = collectMedia().map((el, index) => {
      const decoded = el.webkitAudioDecodedByteCount;
      return {
        index,
        paused: el.paused,
        ended: el.ended,
        muted: el.muted,
        volume: el.volume,
        duration: isFinite(el.duration) && el.duration > 0 ? el.duration : null,
        currentTime: el.currentTime,
        readyState: el.readyState,
        hasAudio: typeof decoded === 'number' ? decoded > 0 : null,
      };
    });
    return {
      elements,
      title: meta ? (meta.title || null) : null,
      artist: meta ? (meta.artist || null) : null,
      album: meta ? (meta.album || null) : null,
      artworkUrl: meta && meta.artwork && meta.artwork.length
        ? (meta.artwork[meta.artwork.length - 1].src || null)
        : null,
      playbackState: ms ? ms.playbackState : 'none',
      hasMediaSession: !!(ms && (meta || ms.playbackState !== 'none')),
      actions: bridge ? bridge.actions() : [],
      position: bridge ? bridge.position() : null,
    };
  } catch (e) { return null; }
})()`;

function playJs(index: number): string {
  return `(async () => {
    ${COLLECT_JS}
    const el = collectMedia()[${index}];
    if (!el) return false;
    try { await el.play(); return true; } catch (e) { return false; }
  })()`;
}

function pauseJs(index: number): string {
  return `(() => {
    ${COLLECT_JS}
    const el = collectMedia()[${index}];
    if (!el) return false;
    el.pause();
    return true;
  })()`;
}

function seekJs(index: number, delta: number): string {
  return `(() => {
    ${COLLECT_JS}
    const el = collectMedia()[${index}];
    if (!el || !isFinite(el.duration)) return false;
    el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + (${delta})));
    return true;
  })()`;
}

function seekToJs(index: number, time: number): string {
  return `(() => {
    ${COLLECT_JS}
    const el = collectMedia()[${index}];
    if (!el || !isFinite(el.duration)) return false;
    el.currentTime = Math.max(0, Math.min(el.duration, ${time}));
    return true;
  })()`;
}

/** Invoca un handler real de la página a través del puente. */
function invokeActionJs(action: string): string {
  return `(() => {
    const bridge = window['${BRIDGE_KEY}'];
    return bridge ? bridge.invoke('${action}') : false;
  })()`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Frames vivos de la pestaña, iframes de otro origen incluidos. */
export function liveFrames(wc: WebContents): WebFrameMain[] {
  try {
    return wc.mainFrame.framesInSubtree.filter((f) => !f.detached);
  } catch {
    return [];
  }
}

/**
 * Instala el puente de Media Session en todos los frames. Silencioso: un frame
 * puede haber desaparecido entre la enumeración y la ejecución.
 */
export async function installMediaBridge(wc: WebContents): Promise<void> {
  if (wc.isDestroyed()) return;
  const js = installBridgeJs();
  await Promise.all(
    liveFrames(wc).map((frame) =>
      // Sin `userGesture`: instalar el puente no debe dejar al sitio creyendo
      // que el usuario ha interactuado con él.
      withTimeout(frame.executeJavaScript(js, false) as Promise<unknown>, FRAME_SCRIPT_TIMEOUT_MS),
    ),
  );
}

/** Sondea un único frame, para refrescar sin recorrer toda la pestaña. */
export async function probeFrame(frame: WebFrameMain): Promise<FrameMediaProbe | null> {
  if (frame.detached) return null;
  return (await withTimeout(
    frame.executeJavaScript(PROBE_JS, false) as Promise<FrameMediaProbe | null>,
    FRAME_SCRIPT_TIMEOUT_MS,
  )) as FrameMediaProbe | null;
}

/** Puntúa un elemento: gana el que de verdad está sonando. */
function scoreElement(el: MediaElementProbe): number {
  if (el.ended) return -1;
  let score = 0;
  if (!el.paused) score += 100;
  if (el.hasAudio !== false && !el.muted && el.volume > 0) score += 50;
  if (el.readyState > 2) score += 10;
  if (el.duration !== null) score += 5;
  return score;
}

/**
 * Deja fuera los vídeos decorativos: un banner que se autorreproduce mudo no
 * es una fuente que el usuario quiera controlar. Entra lo que suena, lo que se
 * declara como reproductor con Media Session, y lo que tiene pista de audio
 * propia sin silenciar.
 */
export function isWorthShowing(
  audible: boolean,
  probe: FrameMediaProbe,
  element: MediaElementProbe | null,
): boolean {
  if (audible) return true;
  if (probe.hasMediaSession) return true;
  return !!element && element.hasAudio === true && !element.muted && element.volume > 0;
}

/** El elemento con más papeletas de ser el que el usuario está oyendo. */
export function pickElement(probe: FrameMediaProbe): MediaElementProbe | null {
  let best: MediaElementProbe | null = null;
  let bestScore = -Infinity;
  for (const candidate of probe.elements) {
    const score = scoreElement(candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * Busca en toda la pestaña el elemento que manda y el frame donde vive. Un
 * frame con metadata de Media Session gana a uno sin ella aunque tenga un
 * `<video>` decorativo sonando: es el reproductor de verdad de la página.
 */
export async function findMediaTarget(wc: WebContents): Promise<MediaTarget | null> {
  if (wc.isDestroyed()) return null;
  const frames = liveFrames(wc);
  const probes = await Promise.all(
    frames.map(async (frame) => {
      const probe = (await withTimeout(
        frame.executeJavaScript(PROBE_JS, false) as Promise<FrameMediaProbe | null>,
        FRAME_SCRIPT_TIMEOUT_MS,
      )) as FrameMediaProbe | null;
      return probe ? { frame, probe } : null;
    }),
  );

  let best: MediaTarget | null = null;
  let bestScore = -Infinity;
  for (const entry of probes) {
    if (!entry) continue;
    const { frame, probe } = entry;
    const element = pickElement(probe);
    const elementScore = element ? scoreElement(element) : 0;
    const frameScore =
      elementScore +
      (probe.hasMediaSession ? 200 : 0) +
      (probe.actions.length > 0 ? 25 : 0);
    if (frameScore > bestScore) {
      bestScore = frameScore;
      best = { frame, probe, element };
    }
  }
  return best;
}

/** Acción de transporte sobre la pestaña. */
export type MediaAction =
  | { kind: 'play' }
  | { kind: 'pause' }
  | { kind: 'nexttrack' }
  | { kind: 'previoustrack' }
  | { kind: 'seekBy'; delta: number }
  | { kind: 'seekTo'; time: number };

/**
 * Ejecuta la acción sobre el objetivo, una sola vez. Cada comando viaja por un
 * único camino: dos vías a la vez hacían el salto doble (el puente saltaba 15 s
 * y `executeJavaScript` volvía a saltar el delta).
 *
 * Play/pause/seek van al elemento — funcionan en cualquier sitio. Siguiente y
 * anterior necesitan el handler de la página: Spotify y YouTube reutilizan un
 * único elemento con MediaSource, así que no hay "siguiente elemento" al que
 * saltar y mover `currentTime` al final no cambia de pista.
 */
export async function runMediaAction(
  target: MediaTarget,
  action: MediaAction,
): Promise<boolean> {
  const { frame, probe, element } = target;
  if (frame.detached) return false;

  const run = (js: string): Promise<unknown> =>
    withTimeout(frame.executeJavaScript(js, true) as Promise<unknown>, FRAME_SCRIPT_TIMEOUT_MS);

  switch (action.kind) {
    case 'nexttrack':
    case 'previoustrack': {
      if (!probe.actions.includes(action.kind)) return false;
      return (await run(invokeActionJs(action.kind))) === true;
    }
    case 'play': {
      if (element) {
        if ((await run(playJs(element.index))) === true) return true;
      }
      if (!probe.actions.includes('play')) return false;
      return (await run(invokeActionJs('play'))) === true;
    }
    case 'pause': {
      if (element) {
        if ((await run(pauseJs(element.index))) === true) return true;
      }
      if (!probe.actions.includes('pause')) return false;
      return (await run(invokeActionJs('pause'))) === true;
    }
    case 'seekBy': {
      if (!element) return false;
      return (await run(seekJs(element.index, action.delta))) === true;
    }
    case 'seekTo': {
      if (!element) return false;
      return (await run(seekToJs(element.index, action.time))) === true;
    }
  }
}
