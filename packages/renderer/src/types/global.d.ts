import type { PreloadApi } from '@vela/shared';

declare global {
  interface Window {
    api: PreloadApi;
  }
}

export {};
