# ADR 0009 — Contraseña maestra de perfil

- Estado: aceptado
- Fecha: 2026-05-08
- Fase: 3 — Multi-perfil real

## Contexto

Cada perfil necesita una clave criptográfica maestra (`profile_key`)
con la que se cifran los datos sensibles almacenados en `profile.db`
(contraseñas guardadas, tokens, futuros secretos de sync). Esta clave
debe sobrevivir reinicios de la app y, opcionalmente, estar protegida
por una contraseña que solo el usuario conoce.

Los requisitos en conflicto son:

1. **Sin fricción por defecto**: la mayoría de usuarios no querrán
   escribir una contraseña cada vez que abren el navegador.
2. **Protección fuerte opcional**: usuarios que comparten máquina
   o quieren proteger sus credenciales incluso si el SO está
   comprometido necesitan un factor adicional.
3. **Sin transmisión de secretos al servidor**: Vela es local-first;
   la clave nunca sale del dispositivo en texto claro.

## Decisión

**Modelo híbrido**: keychain del SO por defecto, contraseña maestra
opcional con derivación de clave.

### Sin contraseña maestra (por defecto)

La `profile_key` se genera una sola vez al crear el perfil
(32 bytes aleatorios con `libsodium.randombytes_buf`). Se almacena
cifrada con `safeStorage.encryptString` de Electron, que delega en
el keychain del SO (Keychain en macOS, DPAPI en Windows, libsecret /
kwallet en Linux). El ciphertext se guarda en `vela.db`.

Al abrir el perfil, se descifra con `safeStorage.decryptString` y la
clave en claro vive en memoria únicamente mientras el perfil está
abierto. Al cerrarlo se zeriza con `sodium.memzero`.

### Con contraseña maestra

El usuario elige una contraseña. Se deriva una `kek`
(*key-encryption key*) con **Argon2id**:

- Parámetros: `opslimit = SENSITIVE`, `memlimit = SENSITIVE`
  (de libsodium, equivalente a ≥ 512 MB RAM y tiempo > 1 s en
  hardware moderno).
- `salt` de 16 bytes aleatorios, almacenado en claro en `vela.db`
  junto al ciphertext de la clave envuelta.

La `profile_key` se cifra con la `kek` usando
**XChaCha20-Poly1305** (`crypto_secretbox_easy`). Solo el
ciphertext + nonce + salt Argon2id se persisten. La `kek` nunca
se almacena: se deriva en cada apertura del perfil a partir de la
contraseña que introduce el usuario.

### Rate limiting de intentos fallidos

Si el descifrado falla (contraseña incorrecta), el proceso main
registra el intento. Tras 5 fallos consecutivos sin éxito se
impone un backoff de 30 s antes de aceptar el siguiente intento.
El contador se zeriza en cuanto hay un intento exitoso.

### Cambio de contraseña maestra

Requiere la contraseña actual (para derivar la `kek` y descifrar la
`profile_key` existente). Luego se re-cifra la `profile_key` con la
nueva `kek` derivada de la nueva contraseña. La operación es
atómica en SQLite: si falla la escritura, la clave antigua sigue
siendo válida.

### Quitar contraseña maestra

Equivale a volver al modo keychain. Se descifra la `profile_key`
con la contraseña actual, se cifra con `safeStorage.encryptString`
y se actualiza `vela.db`.

### Caso especial: Linux sin libsecret/kwallet

Si `safeStorage.isEncryptionAvailable()` devuelve `false` (distros
sin gestor de claves instalado), el modo por defecto no está
disponible. En ese caso la UI detecta la situación y obliga al
usuario a establecer una contraseña maestra al crear el perfil.
La lógica de derivación Argon2id es la misma que en el modo con
contraseña.

## Alternativas descartadas

**A. Solo keychain.** No proporciona protección si el SO está
comprometido o si el usuario quiere una barrera adicional. Tampoco
funciona en Linux sin libsecret.

**B. Solo contraseña maestra.** Introduce fricción para todos los
usuarios, incluyendo los que operan en una máquina de uso personal
y solo quieren un gestor de contraseñas básico.

**C. Cifrado de la BD completa con SQLCipher.** Descartado en el
ADR 0003: `node:sqlite` no soporta extensiones SQLCipher. El cifrado
a nivel de campo con libsodium es equivalente para los datos
sensibles y no requiere compilación nativa.

**D. Derivación con PBKDF2 en lugar de Argon2id.** Argon2id es el
estándar recomendado para derivación de claves de contraseñas
(ganador de Password Hashing Competition 2015). Su resistencia a
ataques de GPU y ASIC es superior a PBKDF2 y bcrypt gracias al
uso intensivo de memoria.

## Consecuencias

- `ProfileKeyring` en `packages/main/src/profiles/` gestiona toda
  la lógica de keychain y derivación. Los módulos que necesitan
  la clave llaman a `keyring.getProfileKey(profileId)`, nunca
  acceden a la clave directamente.
- La `profile_key` en memoria es un `Uint8Array`. Al cerrar el
  perfil se zeriza con `sodium.memzero(key)` para reducir la
  ventana de exposición si el proceso es volcado.
- Los parámetros Argon2id son revisables sin migración de datos:
  el salt y el ciphertext ya están en BD; solo hay que re-derivar
  con los nuevos parámetros al siguiente cambio de contraseña.
- En Fase 2 (sync), la clave de cifrado E2EE del perfil se derivará
  a partir de la `profile_key`, no de forma independiente, para
  reducir el número de secretos que el usuario debe gestionar.
