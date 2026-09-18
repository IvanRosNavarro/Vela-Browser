/**
 * Reconocedor de swipes horizontales de trackpad a partir de eventos `wheel`.
 *
 * Electron no trae la navegación con dos dedos de Chrome, y la web no ve la
 * fase del gesto (dedos apoyados, levantados, inercia). El gesto se delimita
 * por silencio: tras `idleMs` sin eventos se da por terminado.
 *
 * Es lógica pura, sin DOM: quien lo usa decide qué eventos le pasa (descarta
 * los de Ctrl = pellizco y los de Shift = scroll horizontal con rueda) y le
 * dice, vía `canConsume`, si la página puede absorber el desplazamiento.
 */

export type SwipeDirection = 'back' | 'forward';

export type SwipeUpdate =
  | { kind: 'none' }
  /** `progress` es 0..n; a partir de 1 el gesto está armado. */
  | { kind: 'progress'; direction: SwipeDirection; progress: number }
  | { kind: 'commit'; direction: SwipeDirection }
  | { kind: 'cancel' };

export interface SwipeSample {
  dx: number;
  dy: number;
  /** Marca de tiempo en ms (`event.timeStamp` o `performance.now()`). */
  time: number;
}

export interface SwipeOptions {
  /** Desplazamiento horizontal acumulado (px) que arma el gesto. */
  threshold: number;
  /**
   * Múltiplo de `threshold` a partir del cual se confirma sin esperar al fin
   * del gesto. Con 1 se confirma al armarse. La inercia de un swipe decidido
   * lo alcanza enseguida, así que no hay que esperar a que se agote.
   */
  commitAt: number;
  /** Silencio (ms) que da el gesto por terminado. */
  idleMs: number;
  /** Desplazamiento (px) necesario para decidir si el gesto es horizontal. */
  decideAfterPx: number;
}

export const DEFAULT_SWIPE_OPTIONS: SwipeOptions = {
  threshold: 140,
  commitAt: 2,
  idleMs: 150,
  decideAfterPx: 12,
};

/**
 * Primer evento de un gesto con un salto entero de 100 px o más: es un clic
 * de rueda inclinable (o de rueda con Shift), no un trackpad, que empieza
 * con deltas pequeños. Chrome tampoco navega con la rueda inclinable.
 */
const WHEEL_NOTCH_PX = 100;

/** Un gesto cuenta como horizontal si domina el eje X en esta proporción. */
const HORIZONTAL_RATIO = 1.5;

type Phase = 'idle' | 'deciding' | 'tracking' | 'ignored' | 'done';

export class SwipeTracker {
  private phase: Phase = 'idle';
  private lastTime = Number.NEGATIVE_INFINITY;
  private accX = 0;
  private accY = 0;
  private direction: SwipeDirection = 'back';
  private readonly opts: SwipeOptions;

  constructor(opts: Partial<SwipeOptions> = {}) {
    this.opts = { ...DEFAULT_SWIPE_OPTIONS, ...opts };
  }

  /** Indica si el evento es el primero de un gesto nuevo. */
  isNewGesture(time: number): boolean {
    return this.phase === 'idle' || time - this.lastTime > this.opts.idleMs;
  }

  /**
   * Procesa un evento. `canConsume(direction)` devuelve true si ese
   * desplazamiento le corresponde a la página (queda scroll horizontal, un
   * listener hizo `preventDefault`, no hay historial en esa dirección...).
   * Solo se consulta una vez por gesto, al decidirlo.
   */
  feed(sample: SwipeSample, canConsume: (direction: SwipeDirection) => boolean): SwipeUpdate {
    let update: SwipeUpdate = { kind: 'none' };
    if (this.isNewGesture(sample.time)) {
      // Un gesto anterior que se quedó sin `end()` se cancela aquí.
      if (this.phase === 'tracking') update = { kind: 'cancel' };
      this.phase = 'deciding';
      this.accX = 0;
      this.accY = 0;
      if (Number.isInteger(sample.dx) && Math.abs(sample.dx) >= WHEEL_NOTCH_PX) {
        this.phase = 'ignored';
      }
    }
    this.lastTime = sample.time;

    switch (this.phase) {
      case 'deciding': {
        this.accX += sample.dx;
        this.accY += sample.dy;
        if (Math.abs(this.accX) + Math.abs(this.accY) < this.opts.decideAfterPx) return update;
        if (Math.abs(this.accX) < Math.abs(this.accY) * HORIZONTAL_RATIO) {
          this.phase = 'ignored';
          return update;
        }
        const direction: SwipeDirection = this.accX < 0 ? 'back' : 'forward';
        if (canConsume(direction)) {
          this.phase = 'ignored';
          return update;
        }
        this.direction = direction;
        this.phase = 'tracking';
        return this.progress();
      }
      case 'tracking': {
        this.accX += sample.dx;
        // El gesto queda ligado a su dirección inicial: al volver atrás se
        // cancela, no se convierte en el contrario.
        if (this.direction === 'back' ? this.accX > 0 : this.accX < 0) this.accX = 0;
        if (Math.abs(this.accX) >= this.opts.threshold * this.opts.commitAt) {
          this.phase = 'done';
          return { kind: 'commit', direction: this.direction };
        }
        return this.progress();
      }
      default:
        return update;
    }
  }

  /** Fin del gesto: lo llama quien lo usa tras `idleMs` sin eventos. */
  end(): SwipeUpdate {
    const wasTracking = this.phase === 'tracking';
    this.phase = 'idle';
    if (!wasTracking) return { kind: 'none' };
    return Math.abs(this.accX) >= this.opts.threshold
      ? { kind: 'commit', direction: this.direction }
      : { kind: 'cancel' };
  }

  get idleMs(): number {
    return this.opts.idleMs;
  }

  private progress(): SwipeUpdate {
    return {
      kind: 'progress',
      direction: this.direction,
      progress: Math.abs(this.accX) / this.opts.threshold,
    };
  }
}
