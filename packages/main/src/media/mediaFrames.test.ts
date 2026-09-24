import { describe, expect, it } from 'vitest';
import {
  isWorthShowing,
  pickElement,
  type FrameMediaProbe,
  type MediaElementProbe,
} from './mediaFrames';

function element(patch: Partial<MediaElementProbe> = {}): MediaElementProbe {
  return {
    index: 0,
    paused: false,
    ended: false,
    muted: false,
    volume: 1,
    duration: 180,
    currentTime: 10,
    readyState: 4,
    hasAudio: true,
    ...patch,
  };
}

function probe(patch: Partial<FrameMediaProbe> = {}): FrameMediaProbe {
  return {
    elements: [],
    title: null,
    artist: null,
    album: null,
    artworkUrl: null,
    playbackState: 'none',
    hasMediaSession: false,
    actions: [],
    position: null,
    ...patch,
  };
}

describe('pickElement', () => {
  it('sin elementos devuelve null', () => {
    expect(pickElement(probe())).toBeNull();
  });

  it('prefiere el que está sonando al que está pausado', () => {
    const playing = element({ index: 1 });
    const paused = element({ index: 0, paused: true });
    expect(pickElement(probe({ elements: [paused, playing] }))?.index).toBe(1);
  });

  it('entre dos sonando gana el que no está silenciado', () => {
    const muted = element({ index: 0, muted: true });
    const audible = element({ index: 1 });
    expect(pickElement(probe({ elements: [muted, audible] }))?.index).toBe(1);
  });

  it('descarta el que ya ha terminado frente a uno pausado', () => {
    const ended = element({ index: 0, ended: true });
    const paused = element({ index: 1, paused: true });
    expect(pickElement(probe({ elements: [ended, paused] }))?.index).toBe(1);
  });

  it('a igualdad de condiciones se queda con el primero', () => {
    const first = element({ index: 0 });
    const second = element({ index: 1 });
    expect(pickElement(probe({ elements: [first, second] }))?.index).toBe(0);
  });
});

describe('isWorthShowing', () => {
  it('lo que suena entra siempre', () => {
    expect(isWorthShowing(true, probe(), null)).toBe(true);
  });

  it('un reproductor con Media Session entra aunque esté callado', () => {
    expect(isWorthShowing(false, probe({ hasMediaSession: true }), null)).toBe(true);
  });

  it('un vídeo con pista de audio sin silenciar entra', () => {
    expect(isWorthShowing(false, probe(), element())).toBe(true);
  });

  it('el banner decorativo silenciado se queda fuera', () => {
    expect(isWorthShowing(false, probe(), element({ muted: true }))).toBe(false);
  });

  it('el vídeo a volumen cero se queda fuera', () => {
    expect(isWorthShowing(false, probe(), element({ volume: 0 }))).toBe(false);
  });

  it('el vídeo sin pista de audio se queda fuera', () => {
    expect(isWorthShowing(false, probe(), element({ hasAudio: false }))).toBe(false);
  });

  it('con el audio aún por determinar no se muestra hasta que suene', () => {
    expect(isWorthShowing(false, probe(), element({ hasAudio: null }))).toBe(false);
  });
});
