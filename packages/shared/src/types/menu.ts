export type MenuItemSpec =
  | {
      type: 'separator';
    }
  | {
      type: 'normal';
      id: string;
      label: string;
      enabled?: boolean;
    }
  | {
      type: 'submenu';
      label: string;
      enabled?: boolean;
      submenu: MenuItemSpec[];
    };

export interface MenuShowResult {
  id: string | null;
}
