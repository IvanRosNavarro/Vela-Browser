import { EventEmitter } from 'node:events';
import { BrowserWindow, webContents } from 'electron';
import { IPC_EVENTS, type MainEventPayloads } from '@vela/shared';
import { logger } from '../logger';

type EventName = keyof MainEventPayloads;

export interface MainEventBus {
  emit<E extends EventName>(
    name: E,
    ...args: MainEventPayloads[E] extends void ? [] : [MainEventPayloads[E]]
  ): void;
  on<E extends EventName>(
    name: E,
    listener: (
      payload: MainEventPayloads[E] extends void ? undefined : MainEventPayloads[E],
    ) => void,
  ): () => void;
}

export function createMainEventBus(): MainEventBus {
  const inner = new EventEmitter();
  inner.setMaxListeners(50);

  const knownEvents = Object.values(IPC_EVENTS);

  const broadcast = (name: EventName, payload: unknown): void => {
    const sent = new Set<number>();

    // Shell BrowserWindows (main shell + popups)
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      try {
        win.webContents.send(name, payload);
        sent.add(win.webContents.id);
      } catch (err) {
        logger.warn(`[events] webContents.send falló para ${name}`, err);
      }
    }

    // WebContentsViews (tabs) que cargan páginas internas vela://
    try {
      for (const wc of webContents.getAllWebContents()) {
        if (sent.has(wc.id) || wc.isDestroyed()) continue;
        const url = wc.getURL();
        if (!url.startsWith('vela://')) continue;
        try {
          wc.send(name, payload);
        } catch (err) {
          logger.warn(`[events] webContents.send (WCV vela://) falló para ${name}`, err);
        }
      }
    } catch { /* getAllWebContents no disponible en esta versión de Electron */ }
  };

  for (const name of knownEvents) {
    inner.on(name, (payload: unknown) => {
      broadcast(name as EventName, payload);
    });
  }

  return {
    emit(name, ...args) {
      const payload = args[0];
      inner.emit(name, payload);
    },
    on(name, listener) {
      const wrapped = (payload: unknown): void => {
        listener(payload as never);
      };
      inner.on(name, wrapped);
      return () => inner.off(name, wrapped);
    },
  };
}
