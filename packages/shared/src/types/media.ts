/** Resultado de alternar la imagen en imagen de una pestaña. */
export type PipToggleResult = 'entered' | 'exited' | 'none';

export interface MediaSource {
  tabId: string;
  profileId: string;
  windowId: number;
  title: string;
  artist: string | null;
  album: string | null;
  artworkUrl: string | null;
  isPlaying: boolean;
  duration: number | null;
  currentTime: number | null;
  hasMediaSession: boolean;
  /**
   * La página registró un handler de cambio de pista. Sin él no hay forma de
   * pasar de canción, así que la UI apaga el botón en vez de fingir.
   */
  canSkipNext: boolean;
  canSkipPrev: boolean;
  /** Hay un elemento con duración conocida sobre el que se puede saltar. */
  canSeek: boolean;
}
