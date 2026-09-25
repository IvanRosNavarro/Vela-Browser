export type TitleBarIconId =
  | 'media'
  | 'windows'
  | 'sync'
  | 'split-view'
  | 'device-mode'
  | 'pull-requests';

export interface TitleBarIconConfig {
  id: TitleBarIconId;
  visible: boolean;
}

export const DEFAULT_TITLEBAR_CONFIG: TitleBarIconConfig[] = [
  { id: 'media',       visible: true  },
  { id: 'windows',     visible: true  },
  { id: 'sync',        visible: false },
  { id: 'split-view',  visible: true  },
  { id: 'device-mode', visible: true  },
  { id: 'pull-requests', visible: true  },
];

export const TITLEBAR_ICON_LABELS: Record<TitleBarIconId, string> = {
  'media':       'Control multimedia',
  'windows':     'Indicador de ventanas',
  'sync':        'Estado de sincronización',
  'split-view':  'Vista dividida',
  'device-mode': 'Modo dispositivo',
  'pull-requests': 'Pull requests pendientes',
};
