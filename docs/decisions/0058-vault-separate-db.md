# ADR 0058 — Vault de contraseñas en base de datos separada (vault.db)

## Estado
Aceptado — Fase 5.0.3

## Contexto
Los datos del gestor de contraseñas son especialmente sensibles. Necesitan cifrado en reposo y deben poder sincronizarse de forma independiente en Fase 2.

## Decisión
`vault.db` vive en `userData/profiles/{uuid}/vault.db`, separado de `profile.db`. Usa AES-256-GCM para cifrar cada entrada. La clave de cifrado vive **solo en memoria** (`VaultManager.key`) y se zeriza al cerrar o bloquear el perfil.

## Consecuencias
**Ventajas:**
- Aislamiento claro: un fallo en la sincronización de `profile.db` no afecta a las credenciales.
- En Fase 2 el vault puede sincronizarse con un canal E2EE independiente.
- Permite bloqueo selectivo del vault sin cerrar la sesión del perfil.

**Desventajas:**
- Dos bases de datos abiertas por perfil (más file handles).
- Las migraciones del vault se gestionan independientemente de las de `profile.db`.

**Invariante de seguridad:** la clave AES nunca se escribe en disco. Si el proceso crashea, el vault queda inaccesible hasta que el usuario introduce su contraseña maestra de nuevo.
