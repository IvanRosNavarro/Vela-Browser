import sodium from 'libsodium-wrappers-sumo';

/**
 * Cifrado de entradas del vault con la clave del perfil. Mismo formato que
 * `PasswordVault`: `nonce(24) || ciphertext+tag`, XChaCha20-Poly1305 IETF.
 */

const NONCE_LEN = 24; // crypto_aead_xchacha20poly1305_ietf_NPUBBYTES

export function encryptVaultString(plaintext: string, key: Uint8Array): Uint8Array {
  const nonce = sodium.randombytes_buf(NONCE_LEN);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    sodium.from_string(plaintext),
    null,
    null,
    nonce,
    key,
  );
  const out = new Uint8Array(nonce.length + ciphertext.length);
  out.set(nonce, 0);
  out.set(ciphertext, nonce.length);
  return out;
}

export function decryptVaultString(blob: Uint8Array, key: Uint8Array): string {
  if (blob.length < NONCE_LEN) {
    throw new Error('[vault] blob inválido (demasiado corto)');
  }
  const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    blob.subarray(NONCE_LEN),
    null,
    blob.subarray(0, NONCE_LEN),
    key,
  );
  return sodium.to_string(plain);
}
