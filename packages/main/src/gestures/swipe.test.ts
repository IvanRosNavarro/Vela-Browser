import { describe, expect, it } from 'vitest';
import { SwipeTracker, type SwipeDirection, type SwipeUpdate } from '@vela/shared';

const OPTS = { threshold: 100, commitAt: 2, idleMs: 150, decideAfterPx: 10 };
const never = (): boolean => false;

/** Alimenta un gesto de eventos seguidos (16 ms) y devuelve la última respuesta. */
function run(
  tracker: SwipeTracker,
  deltas: Array<[number, number]>,
  start = 0,
  canConsume: (direction: SwipeDirection) => boolean = never,
): SwipeUpdate {
  let last: SwipeUpdate = { kind: 'none' };
  deltas.forEach(([dx, dy], i) => {
    last = tracker.feed({ dx, dy, time: start + i * 16 }, canConsume);
  });
  return last;
}

const steps = (n: number, dx: number, dy = 0): Array<[number, number]> =>
  Array.from({ length: n }, () => [dx, dy]);

describe('SwipeTracker', () => {
  it('reconoce un swipe horizontal hacia atrás y confirma al terminar pasado el umbral', () => {
    const t = new SwipeTracker(OPTS);
    const update = run(t, steps(12, -10));
    expect(update).toEqual({ kind: 'progress', direction: 'back', progress: 1.2 });
    expect(t.end()).toEqual({ kind: 'commit', direction: 'back' });
  });

  it('dx positivo es adelante', () => {
    const t = new SwipeTracker(OPTS);
    expect(run(t, steps(3, 10))).toMatchObject({ kind: 'progress', direction: 'forward' });
  });

  it('cancela si termina antes del umbral', () => {
    const t = new SwipeTracker(OPTS);
    run(t, steps(5, -10));
    expect(t.end()).toEqual({ kind: 'cancel' });
  });

  it('confirma sin esperar al fin del gesto al llegar a commitAt', () => {
    const t = new SwipeTracker(OPTS);
    expect(run(t, steps(20, -10))).toEqual({ kind: 'commit', direction: 'back' });
    // El resto del gesto (inercia) ya no hace nada.
    expect(t.feed({ dx: -10, dy: 0, time: 20 * 16 }, never)).toEqual({ kind: 'none' });
    expect(t.end()).toEqual({ kind: 'none' });
  });

  it('volver atrás lo cancela en vez de convertirlo en el gesto contrario', () => {
    const t = new SwipeTracker(OPTS);
    run(t, [...steps(12, -10), ...steps(20, 10)]);
    expect(t.end()).toEqual({ kind: 'cancel' });
  });

  it('ignora el scroll vertical', () => {
    const t = new SwipeTracker(OPTS);
    expect(run(t, steps(20, -3, 20))).toEqual({ kind: 'none' });
    expect(t.end()).toEqual({ kind: 'none' });
  });

  it('ignora el gesto si la página puede absorberlo', () => {
    const t = new SwipeTracker(OPTS);
    const consulted: string[] = [];
    const update = run(t, steps(20, -10), 0, (d) => {
      consulted.push(d);
      return true;
    });
    expect(update).toEqual({ kind: 'none' });
    expect(consulted).toEqual(['back']);
  });

  it('ignora un clic de rueda inclinable', () => {
    const t = new SwipeTracker(OPTS);
    expect(run(t, [[-120, 0], ...steps(10, -10)])).toEqual({ kind: 'none' });
  });

  it('tras el silencio empieza un gesto nuevo aunque no se llame a end()', () => {
    const t = new SwipeTracker(OPTS);
    run(t, steps(5, -10));
    expect(t.isNewGesture(5 * 16 + 1000)).toBe(true);
    // El gesto huérfano se cancela al empezar el siguiente.
    expect(t.feed({ dx: 3, dy: 0, time: 5 * 16 + 1000 }, never)).toEqual({ kind: 'cancel' });
  });

  it('con commitAt = 1 confirma al armarse', () => {
    const t = new SwipeTracker({ ...OPTS, commitAt: 1 });
    expect(run(t, steps(10, 10))).toEqual({ kind: 'commit', direction: 'forward' });
  });
});
