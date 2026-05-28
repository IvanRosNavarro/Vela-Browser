import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { Session } from 'electron';
import type { Profile } from '@vela/shared';
import { IPC_EVENTS } from '@vela/shared';
import type { Logger } from '../logger';
import type { MainEventBus } from '../ipc/events';
import {
  AdblockerExceptionsRepository,
  AutoGroupRuleRepository,
  FavoritesRepository,
  HistoryRepository,
  NotificationRepository,
  ProfileMetadataRepository,
  ProfileNotFoundError,
  ProfileRepository,
  ProfileSettingsRepository,
  PushSubscriptionRepository,
  QuickNotesRepository,
  RecentFilesRepository,
  SyncPendingRepository,
  TreeNodeRepository,
  UserScriptsRepository,
  WorkspaceRepository,
} from '../storage/repositories';
import { ProfileMigrationRunner } from '../storage/ProfileMigrationRunner';
import { PasswordVault } from '../passwords/PasswordVault';
import type { ProfileExtensionManager } from '../extensions/ProfileExtensionManager';
import {
  getProfileDbPath,
  getProfileDir,
  getProfilesRoot,
} from './paths';
import { openProfileDb } from './profileDb';
import type { ProfileKeyring } from './ProfileKeyring';
import {
  clearSessionData,
  configureSessionDefaults,
  getSessionForProfile,
} from './sessions';

export interface ProfileRepositories {
  workspaces: WorkspaceRepository;
  treeNodes: TreeNodeRepository;
  autoGroupRules: AutoGroupRuleRepository;
  metadata: ProfileMetadataRepository;
  settings: ProfileSettingsRepository;
  passwordVault: PasswordVault;
  notifications: NotificationRepository;
  pushSubscriptions: PushSubscriptionRepository;
  history: HistoryRepository;
  recentFiles: RecentFilesRepository;
  quickNotes: QuickNotesRepository;
  favorites: FavoritesRepository;
  adBlockerExceptions: AdblockerExceptionsRepository;
  userScripts: UserScriptsRepository;
  syncPending: SyncPendingRepository;
}

export interface CreateProfileInput {
  name: string;
  icon?: string | null;
  color?: string | null;
  /**
   * Si se proporciona, el keyring guarda la clave en modo wrapped (Argon2id +
   * XChaCha20-Poly1305). Si no, en modo safe-storage del SO.
   */
  masterPassword?: string;
  passwordHint?: string | null;
}

export interface ProfileManagerCtx {
  profileRepo: ProfileRepository;
  logger: Logger;
  events: MainEventBus;
  keyring: ProfileKeyring;
  /**
   * Inyectado opcionalmente: el manager lo enchufa en `openProfile` para
   * cargar las extensiones del perfil en su sesión Electron. Es opcional
   * porque el ciclo de bootstrap construye primero el manager (sin el
   * extensionManager) y luego setea la dependencia con `setExtensionManager`
   * para evitar dependencia circular en el wiring.
   */
  extensionManager?: ProfileExtensionManager;
  notificationManager?: import('../notifications/NotificationManager').NotificationManager;
  onProfileSessionReady?: (profileId: string, session: Session) => void;
}

export class ProfileNotOpenError extends Error {
  readonly profileId: string;
  constructor(profileId: string) {
    super(`Profile ${profileId} is not open`);
    this.name = 'ProfileNotOpenError';
    this.profileId = profileId;
  }
}

export class MasterPasswordRequiredError extends Error {
  readonly profileId: string;
  constructor(profileId: string) {
    super(`Profile ${profileId} requires a master password to be opened`);
    this.name = 'MasterPasswordRequiredError';
    this.profileId = profileId;
  }
}

/**
 * La contraseña maestra introducida no coincide con la del perfil.
 * El campo `failedAttempts` lo rellena el rate limiter externo cuando
 * mapea el error al canal IPC; aquí se inicializa a 0 porque el manager
 * no conoce la cuenta global de fallos.
 */
export class InvalidMasterPasswordError extends Error {
  readonly profileId: string;
  failedAttempts: number;
  constructor(profileId: string, failedAttempts = 0) {
    super(`Invalid master password for profile ${profileId}`);
    this.name = 'InvalidMasterPasswordError';
    this.profileId = profileId;
    this.failedAttempts = failedAttempts;
  }
}

export class ProfileManager {
  private readonly dbsByProfile = new Map<string, DatabaseSync>();
  private readonly reposByProfile = new Map<string, ProfileRepositories>();
  private readonly sessionsByProfile = new Map<string, Session>();
  // Mutex por perfil: serializa open/close/delete del mismo perfil.
  // Evita que dos openProfile concurrentes abran la BD dos veces.
  private readonly locks = new Map<string, Promise<unknown>>();

  constructor(private readonly ctx: ProfileManagerCtx) {}

  async initialize(): Promise<void> {
    const root = getProfilesRoot();
    fs.mkdirSync(root, { recursive: true });
    this.ctx.logger.info(`[profile-manager] root listo: ${root}`);
  }

  async createProfile(input: CreateProfileInput): Promise<Profile> {
    const profile = this.ctx.profileRepo.create({
      name: input.name,
      icon: input.icon ?? null,
      color: input.color ?? null,
      hasMasterPassword: !!input.masterPassword,
      passwordHint: input.passwordHint ?? null,
    });

    const dir = getProfileDir(profile.id);
    const dbPath = getProfileDbPath(profile.id);
    let dirCreated = false;
    let db: DatabaseSync | null = null;
    try {
      fs.mkdirSync(dir, { recursive: true });
      dirCreated = true;
      // Aseguramos el esquema antes de abrir la conexión de seed: así si en
      // el futuro openProfileDb deja de aplicar migraciones, la BD del perfil
      // sigue creándose con todas las tablas. runMigrations es idempotente.
      await new ProfileMigrationRunner(dbPath).runMigrations();
      db = openProfileDb(dbPath);
      const workspaces = new WorkspaceRepository(db);
      workspaces.create({ id: 'default', name: 'Default' });

      // Inicializa el keyring del perfil. La clave queda en memoria — el
      // perfil se queda "desbloqueado" implícitamente tras crearse. El
      // primer openProfile reutilizará la clave en memoria si todavía está;
      // si la app se cierra antes de openProfile, la clave se reconstruirá
      // al abrir vía el modo persistido (safe-storage o master-password).
      const settings = new ProfileSettingsRepository(db);
      await this.ctx.keyring.createKeyForProfile(
        profile.id,
        settings,
        input.masterPassword,
      );

      db.close();
      db = null;
      this.ctx.logger.info(
        `[profile-manager] perfil creado: ${profile.id} (${profile.name})`,
      );
      this.ctx.events.emit(IPC_EVENTS.PROFILES_CHANGED);
      return profile;
    } catch (err) {
      this.ctx.logger.error(
        `[profile-manager] fallo creando perfil ${profile.id}, haciendo rollback`,
        err,
      );
      try {
        if (db) db.close();
      } catch {
        // si la BD ya estaba en mal estado, ignorar; el rm se la lleva
      }
      if (dirCreated) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch (rmErr) {
          this.ctx.logger.warn(
            `[profile-manager] rollback fs falló para ${dir}`,
            rmErr,
          );
        }
      }
      try {
        this.ctx.profileRepo.delete(profile.id);
      } catch (delErr) {
        this.ctx.logger.warn(
          `[profile-manager] rollback DB falló para ${profile.id}`,
          delErr,
        );
      }
      throw err;
    }
  }

  async openProfile(
    profileId: string,
    masterPassword?: string,
  ): Promise<void> {
    await this.withLock(profileId, async () => {
      if (this.dbsByProfile.has(profileId)) return;

      const profile = this.ctx.profileRepo.getById(profileId);
      if (!profile) throw new ProfileNotFoundError(profileId);

      if (profile.hasMasterPassword && !masterPassword) {
        throw new MasterPasswordRequiredError(profileId);
      }

      const db = openProfileDb(getProfileDbPath(profileId));
      let unlocked = false;
      try {
        const settings = new ProfileSettingsRepository(db);
        // Desbloquea el keyring antes de instanciar el resto de repositorios.
        // Si la contraseña es incorrecta, lanza InvalidMasterPasswordError y
        // dejamos la BD limpia (cerrada) en el catch — sin estado a medias.
        await this.ctx.keyring.unlockProfile(
          profileId,
          settings,
          masterPassword,
        );
        unlocked = true;

        const repos: ProfileRepositories = {
          workspaces: new WorkspaceRepository(db, profileId),
          treeNodes: new TreeNodeRepository(db, profileId),
          autoGroupRules: new AutoGroupRuleRepository(db),
          metadata: new ProfileMetadataRepository(db),
          settings,
          passwordVault: new PasswordVault({
            db,
            keyring: this.ctx.keyring,
            profileId,
            logger: this.ctx.logger,
          }),
          notifications: new NotificationRepository(db),
          pushSubscriptions: new PushSubscriptionRepository(db),
          history: new HistoryRepository(db),
          recentFiles: new RecentFilesRepository(db),
          quickNotes: new QuickNotesRepository(db),
          favorites: new FavoritesRepository(db, profileId),
          adBlockerExceptions: new AdblockerExceptionsRepository(db, profileId),
          userScripts: new UserScriptsRepository(db, profileId),
          syncPending: new SyncPendingRepository(db),
        };
        this.dbsByProfile.set(profileId, db);
        this.reposByProfile.set(profileId, repos);

        const ses = getSessionForProfile(profile.partitionId);
        await configureSessionDefaults(ses, profileId, this.ctx.notificationManager);
        this.sessionsByProfile.set(profileId, ses);
        this.ctx.onProfileSessionReady?.(profileId, ses);

        // Carga de extensiones del perfil. No es bloqueante para abrir el
        // perfil: una extensión rota no debe impedir que el usuario use
        // el navegador.
        if (this.ctx.extensionManager) {
          try {
            const disabledRaw = repos.settings.get('extensions:disabled');
            const disabledIds: Set<string> = disabledRaw
              ? new Set<string>(JSON.parse(disabledRaw) as string[])
              : new Set<string>();
            await this.ctx.extensionManager.loadExtensionsForProfile(
              profileId,
              ses,
              disabledIds,
            );
          } catch (err) {
            this.ctx.logger.error(
              `[profile-manager] loadExtensionsForProfile lanzó (continúo)`,
              err,
            );
          }
        }

        this.ctx.profileRepo.setLastUsedAt(profileId, Date.now());

        this.ctx.logger.info(
          `[profile-manager] perfil abierto: ${profileId} (partition=${profile.partitionId})`,
        );
        this.ctx.events.emit(IPC_EVENTS.PROFILE_UNLOCKED, { profileId });
      } catch (err) {
        // Rollback: si fallamos tras abrir la BD pero antes de fijar el
        // estado, la cerramos para no dejar handles colgando. Si llegamos a
        // unlockear el keyring, también lo bloqueamos para no mantener la
        // clave en memoria de un perfil que no terminó de abrirse.
        if (unlocked) {
          this.ctx.keyring.lockProfile(profileId);
        }
        try {
          db.close();
        } catch {
          // BD ya en mal estado o cerrada — el error original es lo que importa
        }
        throw err;
      }
    });
  }

  async closeProfile(profileId: string): Promise<void> {
    await this.withLock(profileId, async () => {
      const db = this.dbsByProfile.get(profileId);
      if (!db) return;
      try {
        db.close();
      } catch (err) {
        this.ctx.logger.warn(
          `[profile-manager] error cerrando BD del perfil ${profileId}`,
          err,
        );
      }
      this.dbsByProfile.delete(profileId);
      this.reposByProfile.delete(profileId);
      // La sesión Electron no se "cierra" — sigue viva mientras la app exista.
      // Solo soltamos la referencia para no mantenerla cacheada en este map.
      this.sessionsByProfile.delete(profileId);
      // Zeriza la clave de cifrado en memoria. A partir de aquí cualquier
      // intento de leer del PasswordVault del perfil lanzará ProfileLockedError.
      this.ctx.keyring.lockProfile(profileId);
      this.ctx.logger.info(`[profile-manager] perfil cerrado: ${profileId}`);
      this.ctx.events.emit(IPC_EVENTS.PROFILE_LOCKED, { profileId });
    });
  }

  /**
   * Inyección tardía del extensionManager. El wiring lo necesita porque el
   * extensionManager depende del propio profileManager (para resolver la
   * sesión de cada perfil), creando una dependencia circular en la
   * construcción. Se llama una sola vez tras instanciar ambos.
   */
  setExtensionManager(extensionManager: ProfileExtensionManager): void {
    this.ctx.extensionManager = extensionManager;
  }

  setNotificationManager(
    nm: import('../notifications/NotificationManager').NotificationManager,
  ): void {
    this.ctx.notificationManager = nm;
  }

  setProfileSessionReadyCallback(cb: (profileId: string, session: Session) => void): void {
    this.ctx.onProfileSessionReady = cb;
  }

  getRepositories(profileId: string): ProfileRepositories {
    const repos = this.reposByProfile.get(profileId);
    if (!repos) throw new ProfileNotOpenError(profileId);
    return repos;
  }

  /**
   * Devuelve la sesión Electron particionada del perfil. Solo válido para
   * perfiles abiertos: si el perfil no está abierto, lanza ProfileNotOpenError
   * para evitar que un caller cree un WebContentsView con una partición que
   * todavía no se ha configurado (handler de permisos, etc).
   */
  getSession(profileId: string): Session {
    const ses = this.sessionsByProfile.get(profileId);
    if (!ses) throw new ProfileNotOpenError(profileId);
    return ses;
  }

  isOpen(profileId: string): boolean {
    return this.dbsByProfile.has(profileId);
  }

  getOpenProfileIds(): string[] {
    return [...this.dbsByProfile.keys()];
  }

  async deleteProfile(profileId: string): Promise<void> {
    const profile = this.ctx.profileRepo.getById(profileId);
    if (!profile) throw new ProfileNotFoundError(profileId);

    await this.closeProfile(profileId);

    await this.withLock(profileId, async () => {
      try {
        await clearSessionData(profile.partitionId);
      } catch (err) {
        this.ctx.logger.warn(
          `[profile-manager] limpiando sesión ${profile.partitionId} falló`,
          err,
        );
      }

      const dir = getProfileDir(profileId);
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        this.ctx.logger.error(
          `[profile-manager] no se pudo borrar ${dir}`,
          err,
        );
        throw err;
      }

      this.ctx.profileRepo.delete(profileId);
      this.ctx.logger.info(`[profile-manager] perfil eliminado: ${profileId}`);
      this.ctx.events.emit(IPC_EVENTS.PROFILES_CHANGED);
    });
  }

  async shutdown(): Promise<void> {
    const ids = [...this.dbsByProfile.keys()];
    for (const id of ids) {
      await this.closeProfile(id);
    }
  }

  // Versión sin locks ni emisión de eventos para usar en `app.before-quit`,
  // que es síncrono y se ejecuta cuando la app ya está bajando.
  shutdownSync(): void {
    for (const [id, db] of this.dbsByProfile.entries()) {
      try {
        db.close();
      } catch (err) {
        this.ctx.logger.warn(
          `[profile-manager] cerrando BD ${id} en shutdown`,
          err,
        );
      }
    }
    this.dbsByProfile.clear();
    this.reposByProfile.clear();
    this.sessionsByProfile.clear();
    this.locks.clear();
    // Zerizamos todas las claves en memoria antes de salir.
    this.ctx.keyring.lockAll();
  }

  private async withLock<T>(
    profileId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const prev = this.locks.get(profileId) ?? Promise.resolve();
    const run = (async () => {
      try {
        await prev;
      } catch {
        // un fallo previo no debe bloquear nuevas operaciones sobre este perfil
      }
      return fn();
    })();
    // El lock almacenado nunca rechaza: solo señala "operación en curso/terminada".
    // Quien llama recibe el error vía `await run`.
    const tracked = run.then(
      () => undefined,
      () => undefined,
    );
    this.locks.set(profileId, tracked);
    try {
      return await run;
    } finally {
      if (this.locks.get(profileId) === tracked) {
        this.locks.delete(profileId);
      }
    }
  }
}
