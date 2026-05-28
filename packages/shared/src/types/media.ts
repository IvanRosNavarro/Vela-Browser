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
}
