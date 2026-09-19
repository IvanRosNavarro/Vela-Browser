import { describe, expect, it } from 'vitest';
import {
  diffVisibleTabs,
  isAutoPipEligible,
  isManualPipEligible,
  pickPipCandidate,
  shouldAutoEnterPip,
  type AutoPipContext,
  type FrameProbe,
  type VideoProbe,
} from './pipPolicy';

/** Vídeo típico reproduciéndose con sonido a 640×360. */
function video(overrides: Partial<VideoProbe> = {}): VideoProbe {
  return {
    index: 0,
    width: 640,
    height: 360,
    paused: false,
    ended: false,
    muted: false,
    volume: 1,
    loop: false,
    readyState: 4,
    disablePictureInPicture: false,
    hasAudio: true,
    inPip: false,
    ...overrides,
  };
}

function frame(videos: VideoProbe[], overrides: Partial<FrameProbe> = {}): FrameProbe {
  return { pipEnabled: true, inPip: false, videos, ...overrides };
}

const CTX: AutoPipContext = {
  enabled: true,
  alive: true,
  visibleElsewhere: false,
  alreadyInPip: false,
};

describe('diffVisibleTabs', () => {
  it('detecta la pestaña que se deja de ver al activar otra', () => {
    expect(diffVisibleTabs(new Set(['a']), new Set(['b']))).toEqual({
      hidden: ['a'],
      shown: ['b'],
    });
  });

  it('no marca nada si la pestaña sigue en el otro panel de Split View', () => {
    // Split con a|b; se activa c en el panel de b: a sigue visible.
    expect(diffVisibleTabs(new Set(['a', 'b']), new Set(['a', 'c']))).toEqual({
      hidden: ['b'],
      shown: ['c'],
    });
  });

  it('al cerrar el split solo se oculta la pestaña del panel sin foco', () => {
    expect(diffVisibleTabs(new Set(['a', 'b']), new Set(['a']))).toEqual({
      hidden: ['b'],
      shown: [],
    });
  });

  it('cambiar a un workspace vacío oculta la pestaña activa', () => {
    expect(diffVisibleTabs(new Set(['a']), new Set())).toEqual({ hidden: ['a'], shown: [] });
  });

  it('un recálculo sin cambios (resize, overlay) no produce transiciones', () => {
    expect(diffVisibleTabs(new Set(['a']), new Set(['a']))).toEqual({ hidden: [], shown: [] });
  });
});

describe('isAutoPipEligible', () => {
  it('acepta un vídeo reproduciéndose con sonido', () => {
    expect(isAutoPipEligible(video())).toBe(true);
  });

  it('rechaza un vídeo en pausa o terminado', () => {
    expect(isAutoPipEligible(video({ paused: true }))).toBe(false);
    expect(isAutoPipEligible(video({ ended: true }))).toBe(false);
  });

  it('rechaza un vídeo sin fotogramas todavía', () => {
    expect(isAutoPipEligible(video({ readyState: 1 }))).toBe(false);
  });

  it('rechaza un vídeo silenciado o a volumen cero (autoplay mudo)', () => {
    expect(isAutoPipEligible(video({ muted: true }))).toBe(false);
    expect(isAutoPipEligible(video({ volume: 0 }))).toBe(false);
  });

  it('rechaza un vídeo de fondo en bucle sin audio', () => {
    expect(isAutoPipEligible(video({ loop: true, hasAudio: false }))).toBe(false);
  });

  it('acepta un bucle con audio y un vídeo cuya pista de audio se desconoce', () => {
    expect(isAutoPipEligible(video({ loop: true, hasAudio: true }))).toBe(true);
    expect(isAutoPipEligible(video({ loop: true, hasAudio: null }))).toBe(true);
  });

  it('rechaza vídeos pequeños o decorativos', () => {
    expect(isAutoPipEligible(video({ width: 199 }))).toBe(false);
    expect(isAutoPipEligible(video({ width: 400, height: 80 }))).toBe(false);
    expect(isAutoPipEligible(video({ width: 200, height: 112 }))).toBe(true);
  });

  it('respeta disablePictureInPicture', () => {
    expect(isAutoPipEligible(video({ disablePictureInPicture: true }))).toBe(false);
  });
});

describe('isManualPipEligible', () => {
  it('admite vídeos en pausa, silenciados o pequeños si el usuario lo pide', () => {
    expect(isManualPipEligible(video({ paused: true, muted: true, width: 120 }))).toBe(true);
  });

  it('exige metadatos y respeta disablePictureInPicture', () => {
    expect(isManualPipEligible(video({ readyState: 0 }))).toBe(false);
    expect(isManualPipEligible(video({ disablePictureInPicture: true }))).toBe(false);
  });
});

describe('pickPipCandidate', () => {
  it('elige el vídeo elegible más grande entre todos los frames', () => {
    const main = frame([video({ index: 0, width: 320, height: 180 })]);
    const iframe = frame([
      video({ index: 0, width: 300, height: 150, muted: true }),
      video({ index: 1, width: 1280, height: 720 }),
    ]);
    const pick = pickPipCandidate(
      [
        { frame: 'main', probe: main },
        { frame: 'iframe', probe: iframe },
      ],
      'auto',
    );
    expect(pick?.frame).toBe('iframe');
    expect(pick?.video.index).toBe(1);
  });

  it('ignora frames sin PiP disponible', () => {
    const pick = pickPipCandidate(
      [{ frame: 'main', probe: frame([video()], { pipEnabled: false }) }],
      'auto',
    );
    expect(pick).toBeNull();
  });

  it('devuelve null si ningún vídeo es elegible en modo auto', () => {
    const pick = pickPipCandidate(
      [{ frame: 'main', probe: frame([video({ paused: true }), video({ index: 1, muted: true })]) }],
      'auto',
    );
    expect(pick).toBeNull();
  });

  it('en modo manual prefiere el que se reproduce aunque sea más pequeño', () => {
    const pick = pickPipCandidate(
      [
        {
          frame: 'main',
          probe: frame([
            video({ index: 0, width: 1280, height: 720, paused: true }),
            video({ index: 1, width: 320, height: 180 }),
          ]),
        },
      ],
      'manual',
    );
    expect(pick?.video.index).toBe(1);
  });

  it('en modo manual acepta un vídeo en pausa si es el único', () => {
    const pick = pickPipCandidate(
      [{ frame: 'main', probe: frame([video({ paused: true })]) }],
      'manual',
    );
    expect(pick?.video.index).toBe(0);
  });
});

describe('shouldAutoEnterPip', () => {
  const candidate = { frame: 'main', video: video() };

  it('entra en PiP al dejar de ver una pestaña con vídeo', () => {
    expect(shouldAutoEnterPip(CTX, candidate)).toBe(true);
  });

  it('no entra si el ajuste está desactivado', () => {
    expect(shouldAutoEnterPip({ ...CTX, enabled: false }, candidate)).toBe(false);
  });

  it('no entra si la pestaña sigue visible en otro panel o ventana', () => {
    expect(shouldAutoEnterPip({ ...CTX, visibleElsewhere: true }, candidate)).toBe(false);
  });

  it('no entra si la pestaña se ha cerrado o descartado', () => {
    expect(shouldAutoEnterPip({ ...CTX, alive: false }, candidate)).toBe(false);
  });

  it('no repite si ya hay un vídeo en PiP en la pestaña', () => {
    expect(shouldAutoEnterPip({ ...CTX, alreadyInPip: true }, candidate)).toBe(false);
  });

  it('no entra sin candidato', () => {
    expect(shouldAutoEnterPip(CTX, null)).toBe(false);
  });
});
