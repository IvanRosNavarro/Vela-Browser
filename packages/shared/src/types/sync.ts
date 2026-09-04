export interface SyncStatus {
  configured: boolean;
  connected: boolean;
  lastSyncAt: number | null;
  syncInProgress: boolean;
  /** Token del magic link recibido vía vela://sync-callback, pendiente de confirmar con contraseña. */
  pendingCallbackToken?: string | null;
}

export interface DeviceInfo {
  tokenSuffix: string;
  userAgent: string;
  lastSeenAt: number;
  isCurrent: boolean;
}

/**
 * Perfil ya existente en el servidor de sync. Se ofrece al vincular un
 * dispositivo nuevo: elegir el perfil correcto es lo que hace que los datos
 * de ambos equipos converjan (el servidor particiona todo por este id).
 */
export interface RemoteSyncProfile {
  id: string;
  /** Nombre descifrado, o null si la contraseña de sync no lo abre. */
  name: string | null;
  /** Equipo donde se creó el perfil, si se conoce. */
  host: string | null;
  updatedAt: number;
}

/**
 * Categorías que el usuario puede activar o desactivar en
 * `vela://settings#sync`. Agrupan los `entity_type` internos en unidades que
 * significan algo para quien las lee: "Workspaces y pestañas" cubre los
 * workspaces y todo el árbol (carpetas, pestañas, Anclas y Cargas), que no
 * tienen sentido por separado.
 */
export type SyncCategory =
  | 'workspaces'
  | 'favorites'
  | 'passwords'
  | 'scripts'
  | 'notes'
  | 'adblocker'
  | 'settings';

export interface SyncCategoryInfo {
  id: SyncCategory;
  label: string;
  description: string;
  /**
   * `entity_type` que cubre la categoría. Vacío cuando no viaja como entidad
   * sincronizable: el vault va como blob y las notas como documento Yjs.
   */
  entityTypes: string[];
}

export const SYNC_CATEGORIES: readonly SyncCategoryInfo[] = [
  {
    id: 'workspaces',
    label: 'Workspaces y pestañas',
    description: 'Incluye carpetas, Anclas y Cargas',
    entityTypes: ['workspace', 'treenode'],
  },
  {
    id: 'favorites',
    label: 'Favoritos',
    description: 'La franja de favoritos del perfil',
    entityTypes: ['favorite'],
  },
  {
    id: 'passwords',
    label: 'Gestor de contraseñas',
    description: 'Las credenciales guardadas en el vault',
    entityTypes: [],
  },
  {
    id: 'scripts',
    label: 'Scripts de usuario',
    description: 'Userscripts y userstyles',
    entityTypes: ['user_script'],
  },
  {
    id: 'notes',
    label: 'Notas rápidas',
    description: 'La nota de cada workspace',
    entityTypes: [],
  },
  {
    id: 'adblocker',
    label: 'Excepciones del adblocker',
    description: 'Los sitios donde has desactivado el bloqueo',
    entityTypes: ['adblocker_exception'],
  },
  {
    id: 'settings',
    label: 'Configuración del perfil',
    description: 'Tema, motor de búsqueda y demás preferencias',
    entityTypes: ['setting'],
  },
] as const;

/** `entity_type` → categoría a la que pertenece. */
export const SYNC_TYPE_TO_CATEGORY: Readonly<Record<string, SyncCategory>> =
  Object.fromEntries(
    SYNC_CATEGORIES.flatMap((c) => c.entityTypes.map((t) => [t, c.id])),
  );
