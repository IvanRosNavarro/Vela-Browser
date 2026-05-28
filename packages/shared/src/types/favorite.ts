export type FavoriteType = 'bookmark' | 'folder';

export interface Favorite {
  id: string;
  url: string | null;
  title: string;
  favicon: string | null;
  position: string;
  createdAt: number;
  type: FavoriteType;
  parentId: string | null;
}
