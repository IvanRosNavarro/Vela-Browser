import {
  scryptSync,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';

/**
 * Deriva una clave de 32 bytes desde la sync password usando scrypt.
 * scrypt es más resistente a ataques GPU/ASIC que PBKDF2.
 * Parámetros: N=32768, r=8, p=1 — equilibrio entre seguridad y tiempo de derivación.
 */
export function deriveKey(password: string, salt: Buffer): Buffer {
  // maxmem explícito: el default de Node (32 MiB) es exactamente N*r*128 bytes
  // y Electron/OpenSSL lo rechaza por el overhead mínimo. 64 MiB da margen.
  return scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }) as Buffer;
}

/**
 * Cifra con AES-256-GCM.
 * Formato de salida: [12 bytes IV][N bytes ciphertext][16 bytes authTag]
 */
export function encrypt(data: Buffer | string, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const input = typeof data === 'string' ? Buffer.from(data, 'utf-8') : data;
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]);
}

/**
 * Descifra un buffer producido por encrypt().
 * Lanza si la clave es incorrecta o los datos están corrompidos (authTag falla).
 */
export function decrypt(packed: Buffer, key: Buffer): Buffer {
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(packed.length - 16);
  const ct = packed.subarray(12, packed.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}
