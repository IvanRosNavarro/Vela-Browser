/**
 * Cola de peticiones de certificado cliente por WebContents.
 *
 * Una página puede pedir certificado varias veces seguidas (varias peticiones
 * al mismo host antes de que el usuario elija). Cancelar la anterior no es
 * inocuo: Chromium recuerda «sin certificado» para ese host durante la sesión
 * y los intentos siguientes fallan hasta reiniciar. Por eso las peticiones al
 * mismo origen se agrupan y reciben todas la misma respuesta, y las de otro
 * origen esperan su turno. Solo se muestra un selector a la vez por pestaña.
 */

export interface QueuedCaller<C> {
  /** Candidatos que Chromium ofreció a esta petición concreta. */
  certificates: C[];
  callback: (certificate?: C) => void;
}

export interface QueuedRequest<C> {
  origin: string;
  callers: QueuedCaller<C>[];
}

/** Qué debe hacer quien encola: mostrar el selector o nada (ya hay uno). */
export type EnqueueResult = 'show' | 'joined' | 'queued';

export class ClientCertRequestQueue<C> {
  private readonly byWc = new Map<number, QueuedRequest<C>[]>();

  enqueue(wcId: number, origin: string, caller: QueuedCaller<C>): EnqueueResult {
    const queue = this.byWc.get(wcId) ?? [];
    const sameOrigin = queue.find((r) => r.origin === origin);
    if (sameOrigin) {
      sameOrigin.callers.push(caller);
      return 'joined';
    }
    queue.push({ origin, callers: [caller] });
    this.byWc.set(wcId, queue);
    return queue.length === 1 ? 'show' : 'queued';
  }

  /** Petición cuyo selector está (o debe estar) a la vista. */
  current(wcId: number): QueuedRequest<C> | undefined {
    return this.byWc.get(wcId)?.[0];
  }

  /**
   * Resuelve la petición en curso: cada llamador recibe el certificado con esa
   * huella de su propia lista (o nada, si se canceló o no lo tiene). Devuelve
   * la siguiente petición pendiente, si la hay, para mostrar su selector.
   */
  resolveCurrent(
    wcId: number,
    pick: (certificates: C[]) => C | undefined,
  ): QueuedRequest<C> | undefined {
    const queue = this.byWc.get(wcId);
    const request = queue?.shift();
    if (!queue || !request) return undefined;
    if (queue.length === 0) this.byWc.delete(wcId);
    for (const caller of request.callers) {
      try {
        caller.callback(pick(caller.certificates));
      } catch {
        // El WebContents puede haberse destruido; el resto sigue.
      }
    }
    return queue[0];
  }

  /** Cancela todo lo pendiente de un WebContents (p. ej. al destruirse). */
  cancelAll(wcId: number): void {
    const queue = this.byWc.get(wcId);
    this.byWc.delete(wcId);
    for (const request of queue ?? []) {
      for (const caller of request.callers) {
        try { caller.callback(); } catch { /* destruido */ }
      }
    }
  }

  has(wcId: number): boolean {
    return this.byWc.has(wcId);
  }
}
