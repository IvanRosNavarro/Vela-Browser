import type { IntegrationAccount, IntegrationProviderId } from '@vela/shared';
import type { SafeStorageAdapter } from '../profiles/ProfileKeyring';
import type { ProfileSettingsRepository } from '../storage/repositories';

/**
 * El prefijo `integrations:` no se sincroniza (ver `NON_SYNCABLE_PREFIXES`):
 * guarda una credencial de otra plataforma, que es de este equipo y no debe
 * viajar a los demás dispositivos de la cuenta.
 */
function key(provider: IntegrationProviderId, suffix: string): string {
  return `integrations:${provider}:${suffix}`;
}

export class SafeStorageUnavailableForTokenError extends Error {
  constructor() {
    super(
      'El sistema no ofrece almacenamiento cifrado, y Vela no guarda un token en claro.',
    );
    this.name = 'SafeStorageUnavailableForTokenError';
  }
}

/**
 * Custodia de los tokens de integración.
 *
 * Se cifran con `safeStorage` (llavero del SO), no con la clave del vault,
 * porque el sondeo tiene que arrancar solo: el vault empieza bloqueado en cada
 * arranque y esperar a que el usuario teclee su contraseña dejaría los avisos
 * en silencio hasta entonces.
 */
export class TokenStore {
  constructor(private readonly safeStorage: SafeStorageAdapter) {}

  isAvailable(): boolean {
    return this.safeStorage.isEncryptionAvailable();
  }

  saveToken(
    settings: ProfileSettingsRepository,
    provider: IntegrationProviderId,
    token: string,
  ): void {
    if (!this.isAvailable()) throw new SafeStorageUnavailableForTokenError();
    const encrypted = this.safeStorage.encryptString(token);
    settings.set(key(provider, 'token'), encrypted.toString('base64'));
  }

  readToken(
    settings: ProfileSettingsRepository,
    provider: IntegrationProviderId,
  ): string | null {
    const raw = settings.get(key(provider, 'token'));
    if (!raw) return null;
    try {
      return this.safeStorage.decryptString(Buffer.from(raw, 'base64'));
    } catch {
      // Llavero cambiado o perfil copiado a otro equipo: la credencial ya no
      // se puede recuperar y hay que volver a conectar.
      return null;
    }
  }

  saveAccount(
    settings: ProfileSettingsRepository,
    provider: IntegrationProviderId,
    account: IntegrationAccount,
  ): void {
    settings.set(key(provider, 'account'), JSON.stringify(account));
  }

  readAccount(
    settings: ProfileSettingsRepository,
    provider: IntegrationProviderId,
  ): IntegrationAccount | null {
    const raw = settings.get(key(provider, 'account'));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as IntegrationAccount;
    } catch {
      return null;
    }
  }

  isEnabled(settings: ProfileSettingsRepository, provider: IntegrationProviderId): boolean {
    return settings.get(key(provider, 'enabled')) !== '0';
  }

  setEnabled(
    settings: ProfileSettingsRepository,
    provider: IntegrationProviderId,
    enabled: boolean,
  ): void {
    settings.set(key(provider, 'enabled'), enabled ? '1' : '0');
  }

  /** Client id propio, para quien prefiera registrar su propia OAuth App. */
  readClientId(
    settings: ProfileSettingsRepository,
    provider: IntegrationProviderId,
  ): string | null {
    const value = settings.get(key(provider, 'client-id'));
    return value && value.trim() ? value.trim() : null;
  }

  setClientId(
    settings: ProfileSettingsRepository,
    provider: IntegrationProviderId,
    clientId: string,
  ): void {
    settings.set(key(provider, 'client-id'), clientId.trim());
  }

  /** `id de PR -> updated_at ya notificado`. */
  readSeen(
    settings: ProfileSettingsRepository,
    provider: IntegrationProviderId,
  ): Record<string, number> {
    const raw = settings.get(key(provider, 'seen'));
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
    } catch {
      return {};
    }
  }

  saveSeen(
    settings: ProfileSettingsRepository,
    provider: IntegrationProviderId,
    seen: Record<string, number>,
  ): void {
    // Se poda para que el ajuste no crezca sin fin: lo que ya no aparece en el
    // sondeo tampoco se va a volver a notificar.
    const entries = Object.entries(seen)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 200);
    settings.set(key(provider, 'seen'), JSON.stringify(Object.fromEntries(entries)));
  }

  clear(settings: ProfileSettingsRepository, provider: IntegrationProviderId): void {
    for (const suffix of ['token', 'account', 'seen']) {
      settings.delete(key(provider, suffix));
    }
  }
}
