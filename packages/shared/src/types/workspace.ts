import type { WindowLayout } from './layout';

export interface Workspace {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  position: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  layoutConfig: WindowLayout | null;
}
