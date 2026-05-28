import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const ALLOWED_SEND = new Set(['ctx:action', 'ctx:close', 'ctx:resize']);
const ALLOWED_ON = new Set(['ctx:payload']);

contextBridge.exposeInMainWorld('velaCtx', {
  send(channel: string, data?: unknown): void {
    if (ALLOWED_SEND.has(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  on(channel: string, listener: (data: unknown) => void): () => void {
    if (!ALLOWED_ON.has(channel)) return () => {};
    const wrapped = (_e: IpcRendererEvent, data: unknown) => listener(data);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.off(channel, wrapped);
  },
});
