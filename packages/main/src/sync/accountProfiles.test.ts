import { describe, it, expect, vi, afterEach } from 'vitest';
import { encrypt, deriveKey } from './crypto';

// SyncManager importa `safeStorage` de electron para guardar el token cifrado;
// aquí solo se ejercita el listado de perfiles de la cuenta.
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => Buffer.alloc(0),
    decryptString: () => '',
  },
  app: { getPath: () => '', getVersion: () => '0.0.0' },
}));

const { listProfilesWithKey } = await import('./SyncManager');

const key = deriveKey('contraseña de sync', Buffer.alloc(32, 7));
const otherKey = deriveKey('otra contraseña', Buffer.alloc(32, 7));

function profileCiphertext(name: string, host: string, withKey = key): string {
  return encrypt(Buffer.from(JSON.stringify({ name, host }), 'utf-8'), withKey).toString('base64');
}

function mockProfilesResponse(profiles: Array<{ id: string; name_ct: string; updated_at: number }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ profiles }) })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('perfiles de la cuenta', () => {
  it('descifra el nombre y el equipo de cada perfil con la clave en curso', async () => {
    mockProfilesResponse([
      { id: 'remoto-1', name_ct: profileCiphertext('Trabajo', 'PC de Iván'), updated_at: 10 },
      { id: 'remoto-2', name_ct: profileCiphertext('Personal', 'Portátil'), updated_at: 20 },
    ]);

    const profiles = await listProfilesWithKey('token', key);

    expect(profiles).toEqual([
      { id: 'remoto-1', name: 'Trabajo', host: 'PC de Iván', updatedAt: 10 },
      { id: 'remoto-2', name: 'Personal', host: 'Portátil', updatedAt: 20 },
    ]);
  });

  // Una cuenta puede tener perfiles cifrados con otra contraseña (o de una
  // versión anterior): se listan como ilegibles en vez de romper el listado.
  it('un perfil que la clave no abre queda sin nombre, no rompe el resto', async () => {
    mockProfilesResponse([
      { id: 'remoto-1', name_ct: profileCiphertext('Trabajo', 'PC de Iván'), updated_at: 10 },
      { id: 'ajeno', name_ct: profileCiphertext('Otro', 'Otro equipo', otherKey), updated_at: 5 },
    ]);

    const profiles = await listProfilesWithKey('token', key);

    expect(profiles[0]?.name).toBe('Trabajo');
    expect(profiles[1]).toEqual({ id: 'ajeno', name: null, host: null, updatedAt: 5 });
  });

  it('los perfiles de versiones antiguas guardaban el nombre en texto plano', async () => {
    const legacy = encrypt(Buffer.from('profile-abc', 'utf-8'), key).toString('base64');
    mockProfilesResponse([{ id: 'remoto-1', name_ct: legacy, updated_at: 1 }]);

    const profiles = await listProfilesWithKey('token', key);

    expect(profiles[0]).toEqual({ id: 'remoto-1', name: 'profile-abc', host: null, updatedAt: 1 });
  });
});
