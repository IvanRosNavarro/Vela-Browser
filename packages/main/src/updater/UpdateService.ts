import type { UpdateStatus } from '@vela/shared';

/**
 * Lo que usamos de `autoUpdater` de electron-updater. Se inyecta por
 * constructor para poder testear el servicio sin Electron.
 */
export interface Updater {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(event: 'checking-for-update', listener: () => void): unknown;
  on(
    event: 'update-available' | 'update-not-available' | 'update-downloaded',
    listener: (info: { version: string }) => void,
  ): unknown;
  on(event: 'download-progress', listener: (progress: { percent: number }) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface UpdateServiceOptions {
  updater: Updater;
  currentVersion: string;
  /** false en desarrollo: no hay feed de actualizaciones que consultar. */
  packaged: boolean;
  /** false en macOS mientras el binario no esté firmado (Squirrel.Mac lo exige). */
  canInstall: boolean;
  autoCheckEnabled: () => boolean;
  onChange: (status: UpdateStatus) => void;
  openExternal: (url: string) => void;
  releasesUrl: string;
  log?: (message: string) => void;
  now?: () => number;
}

export const AUTO_CHECK_DELAY_MS = 10_000;
export const AUTO_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * Fuente de verdad del actualizador en main: mantiene un único `UpdateStatus`
 * y lo emite entero en cada cambio. El renderer no reconstruye nada.
 */
export class UpdateService {
  private status: UpdateStatus;
  private timers: Array<ReturnType<typeof setTimeout>> = [];
  private checking: Promise<UpdateStatus> | null = null;

  constructor(private readonly options: UpdateServiceOptions) {
    this.status = {
      phase: options.packaged ? 'idle' : 'unsupported',
      currentVersion: options.currentVersion,
      version: null,
      percent: 0,
      error: null,
      checkedAt: null,
      canInstall: options.canInstall,
    };
    if (!options.packaged) return;

    const { updater } = options;
    // La descarga la decide el usuario: un instalador de ~100 MB no debe
    // competir por el ancho de banda con lo que esté haciendo en el navegador.
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = options.canInstall;

    updater.on('checking-for-update', () => this.set({ phase: 'checking', error: null }));
    updater.on('update-available', ({ version }) =>
      this.set({ phase: 'available', version, checkedAt: this.now() }),
    );
    updater.on('update-not-available', () =>
      this.set({ phase: 'up-to-date', version: null, checkedAt: this.now() }),
    );
    updater.on('download-progress', ({ percent }) =>
      this.set({ phase: 'downloading', percent: Math.round(percent) }),
    );
    updater.on('update-downloaded', ({ version }) =>
      this.set({ phase: 'downloaded', version, percent: 100 }),
    );
    updater.on('error', (err) => {
      this.log(`error: ${err.message}`);
      // Un fallo de descarga no borra la versión encontrada: se puede reintentar.
      this.set({ phase: 'error', error: err.message });
    });
  }

  get current(): UpdateStatus {
    return this.status;
  }

  /** Comprobación al arrancar (con retardo) y periódica, si el ajuste lo permite. */
  startAutoCheck(): void {
    if (!this.options.packaged) return;
    const tick = () => {
      if (this.options.autoCheckEnabled()) void this.check().catch(() => undefined);
    };
    this.timers.push(
      setTimeout(tick, AUTO_CHECK_DELAY_MS),
      setInterval(tick, AUTO_CHECK_INTERVAL_MS),
    );
  }

  stop(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }

  async check(): Promise<UpdateStatus> {
    if (!this.options.packaged) return this.status;
    // Con la descarga en curso o terminada, volver a comprobar reiniciaría el estado.
    if (this.status.phase === 'downloading' || this.status.phase === 'downloaded') {
      return this.status;
    }
    this.checking ??= this.options.updater
      .checkForUpdates()
      .catch((err: unknown) => {
        // El evento `error` ya habrá actualizado el estado; aquí solo se evita
        // que el rechazo salga del servicio.
        if (this.status.phase !== 'error') {
          this.set({ phase: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      })
      .then(() => this.status)
      .finally(() => {
        this.checking = null;
      });
    return this.checking;
  }

  async download(): Promise<void> {
    if (!this.options.canInstall || !this.status.version) return;
    if (this.status.phase === 'downloading' || this.status.phase === 'downloaded') return;
    this.set({ phase: 'downloading', percent: 0, error: null });
    await this.options.updater.downloadUpdate().catch((err: unknown) => {
      if (this.status.phase === 'downloading') {
        this.set({ phase: 'error', error: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  install(): void {
    if (this.status.phase !== 'downloaded') return;
    // Con el instalador visible y reabriendo Vela al terminar.
    this.options.updater.quitAndInstall(false, true);
  }

  /** Salida para plataformas sin instalación automática (macOS sin firmar). */
  openRelease(): void {
    const { version } = this.status;
    this.options.openExternal(
      version ? `${this.options.releasesUrl}/tag/v${version}` : this.options.releasesUrl,
    );
  }

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  private log(message: string): void {
    this.options.log?.(message);
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...patch };
    this.options.onChange(this.status);
  }
}
