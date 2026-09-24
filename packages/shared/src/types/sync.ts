export interface SyncStatus {
  configured: boolean;
  connected: boolean;
  lastSyncAt: number | null;
  syncInProgress: boolean;
  /** Token del magic link recibido vía vela://sync-callback, pendiente de confirmar con contraseña. */
  pendingCallbackToken?: string | null;
  /** Cuenta a la que está vinculado este perfil. null si aún no se conoce. */
  accountEmail?: string | null;
}

/**
 * Estado del cifrado del vault en la sincronización.
 *
 * - `unset`: este perfil aún no tiene contraseña de vault; las contraseñas no
 *   se sincronizan.
 * - `locked`: la hay, pero no se ha tecleado en esta sesión. La clave vive solo
 *   en memoria, así que cada arranque empieza aquí.
 * - `unlocked`: la clave está en memoria y el vault sube y baja con normalidad.
 */
export type VaultSyncMode = 'unset' | 'locked' | 'unlocked';

export interface VaultSyncState {
  mode: VaultSyncMode;
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
 * Un perfil de la cuenta visto desde este equipo: si ya tiene un perfil local
 * emparejado, cuál, y si su sincronización está en pausa. Es lo que pinta la
 * sección "Perfiles de la cuenta" de Ajustes › Sincronización.
 */
export interface AccountProfile {
  /** Id en el servidor. */
  remoteId: string;
  /** Nombre descifrado, o null si esta contraseña no lo abre. */
  name: string | null;
  host: string | null;
  updatedAt: number;
  /** Perfil de este equipo emparejado con él, si lo hay. */
  localProfileId: string | null;
  localName: string | null;
  /** Vinculado pero sin sincronizar hasta que se reanude. */
  paused: boolean;
  /** Es el perfil de esta ventana: no se puede pausar desde aquí. */
  isCurrent: boolean;
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
    description: 'Las credenciales, direcciones y tarjetas guardadas en el vault',
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
