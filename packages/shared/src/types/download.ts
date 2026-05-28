export type DownloadState = 'progressing' | 'completed' | 'cancelled' | 'interrupted';

export interface DownloadItem {
  id: string;
  filename: string;
  url: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  state: DownloadState;
  startedAt: number;
  completedAt: number | null;
  mimeType: string;
  paused: boolean;
}
