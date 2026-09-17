// Logger central del main. La implementación vive en vela-kit (ADR 0106);
// este módulo fija el nombre de fichero de Vela (`vela.log`,
// `vela.YYYY-MM-DD.log`) y mantiene la API que usa el resto del main.
import { initLogger as initKitLogger, type LogLevel } from 'vela-kit/logger';

export { logger, closeLogger } from 'vela-kit/logger';
export type { Logger, LogLevel } from 'vela-kit/logger';

export const LOG_FILE_BASE_NAME = 'vela';

export interface InitLoggerOptions {
  minLevel?: LogLevel;
}

export function initLogger(opts: InitLoggerOptions = {}): void {
  initKitLogger({ fileBaseName: LOG_FILE_BASE_NAME, ...opts });
}
