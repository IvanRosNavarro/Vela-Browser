# ADR 0081 — Cifrado E2EE: AES-256-GCM con derivación scrypt

## Estado
Aceptado — Fase 2

## Contexto
Los datos de sync deben ser opacos para el servidor. El servidor no debe poder leer workspaces, tabs, favoritos ni notas aunque tenga acceso directo a la base de datos.

Algoritmos candidatos para derivación de clave:
- **PBKDF2**: estándar, ampliamente soportado pero vulnerable a hardware especializado (GPU, ASIC).
- **bcrypt**: resistente pero limitado a passwords de 72 bytes.
- **scrypt**: resistente a GPU y ASIC por diseño (memory-hard), parámetros configurables.
- **Argon2id**: ganador de PHC, más moderno que scrypt. Ya usado en Fase 3 para vault.

## Decisión
**AES-256-GCM** para cifrado simétrico. **scrypt** (N=32768, r=8, p=1) para derivación de la sync key desde la sync password del usuario.

Scrypt en lugar de Argon2id para la sync key porque:
1. `node:crypto.scrypt` está disponible en el runtime de Electron sin dependencias adicionales.
2. Argon2id ya se usa para el vault (separación de responsabilidades).
3. Los parámetros elegidos son equivalentes al nivel de seguridad de Argon2id con t=3, m=65536.

El IV (nonce) de 96 bits se genera aleatoriamente por cada cifrado con `crypto.getRandomValues`. El tag de autenticación de 128 bits detecta cualquier manipulación del ciphertext.

La sync key vive **solo en memoria** en `SyncManager.config`. Nunca se escribe a disco ni a logs.

## Consecuencias
**Ventajas:**
- El servidor almacena blobs opacos; un atacante con acceso a `sync.db` no puede leer datos de usuario sin la sync password.
- Sin dependencias adicionales: `node:crypto` ya está en el runtime.
- IV aleatorio por operación: sin reutilización de nonce.

**Desventajas:**
- Si el usuario pierde la sync password, los datos en el servidor son irrecuperables (zero-knowledge by design).
- El onboarding debe comunicar claramente la Recovery Card como único mecanismo de recuperación.
