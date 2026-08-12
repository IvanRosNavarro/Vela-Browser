import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '/downloads' },
  BrowserWindow: { getAllWindows: () => [] },
}));

const { DownloadManager } = await import('./DownloadManager');

type AnySession = Parameters<InstanceType<typeof DownloadManager>['attachToSession']>[0];

function fakeSession(): EventEmitter & AnySession {
  return new EventEmitter() as unknown as EventEmitter & AnySession;
}

function fakeItem(filename: string): EventEmitter & Electron.DownloadItem {
  const item = new EventEmitter() as unknown as EventEmitter & Electron.DownloadItem;
  Object.assign(item, {
    getFilename: () => filename,
    getURL: () => `https://example.test/${filename}`,
    getTotalBytes: () => 9500,
    getReceivedBytes: () => 0,
    getMimeType: () => 'application/pdf',
    getSavePath: () => '',
    isPaused: () => false,
  });
  return item;
}

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const events = { emit: vi.fn() };

function newManager() {
  return new DownloadManager(
    events as never,
    logger as never,
  );
}

describe('DownloadManager', () => {
  it('registra una sola entrada aunque la sesión se adjunte varias veces', () => {
    // Reabrir un perfil (cerrar su última ventana y volver a entrar) reinvoca
    // attachToSession sobre la MISMA Session de Electron.
    const manager = newManager();
    const session = fakeSession();

    manager.attachToSession(session, 'profile-1');
    manager.attachToSession(session, 'profile-1');
    manager.attachToSession(session, 'profile-1');

    session.emit('will-download', {}, fakeItem('factura.pdf'));

    expect(manager.getAll()).toHaveLength(1);
  });

  it('ignora un DownloadItem que ya se había registrado', () => {
    const manager = newManager();
    const session = fakeSession();
    manager.attachToSession(session, 'profile-1');

    const item = fakeItem('factura.pdf');
    session.emit('will-download', {}, item);
    session.emit('will-download', {}, item);

    expect(manager.getAll()).toHaveLength(1);
  });

  it('registra descargas distintas por separado', () => {
    const manager = newManager();
    const session = fakeSession();
    manager.attachToSession(session, 'profile-1');

    session.emit('will-download', {}, fakeItem('a.pdf'));
    session.emit('will-download', {}, fakeItem('b.pdf'));

    expect(manager.getAll().map((d) => d.filename).sort()).toEqual(['a.pdf', 'b.pdf']);
  });
});
