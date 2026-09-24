# ADR 0119 — Sincronización del vault con contraseña propia

- Estado: aceptado
- Fecha: 2026-09-24
- Versión: v0.2.9

## Contexto

Las contraseñas guardadas no se sincronizaban. El código existía desde v0.2.0
—`pushVaultSnapshot` / `pullVaultSnapshot`, ruta `/sync/vault` en el servidor—
pero nadie lo llamaba en el momento que hacía falta:

- **La subida solo ocurría dentro de `pushAllLocal()`**, es decir al vincular el
  dispositivo. Guardar, editar o borrar una credencial después no subía nada:
  las entradas del vault no emiten `entity:changed`, así que no había ningún
  hook que disparase la subida.
- **La bajada solo ocurría dentro de `syncAll()`**: al arrancar el perfil o al
  pulsar «Sincronizar ahora». Los avisos del WebSocket disparan `pullChanges()`,
  que recorre entidades y no toca el vault, aunque el servidor sí notifica al
  guardar un vault nuevo.
- **Los borrados no viajaban de ninguna manera.** El blob lleva lo que existe
  ahora y el receptor hace upsert; sin nada que dijera «esto se ha borrado», el
  equipo que no se enteró conservaba la entrada y en su siguiente subida la
  resucitaba para todos.

Además, lo que sí llegó a viajar lo hacía con menos protección de la que
aparenta un vault: el blob iba cifrado con la **clave de sync**, la misma que
cubre workspaces, pestañas y ajustes, y las entradas viajaban **en claro dentro
de él**. Esa clave se guarda en cada equipo envuelta con `safeStorage` del
sistema operativo para poder reconectar sin preguntar nada, así que quien
llegase a un perfil desbloqueado llegaba a las credenciales de todos los
dispositivos.

## Decisión

**Una contraseña propia para el vault, distinta de la de sincronización.**

- Se deriva con **Argon2id** (`crypto_pwhash`, parámetros MODERATE) y la clave
  resultante **solo vive en memoria**: no se escribe en disco ni se envuelve con
  `safeStorage`, a diferencia de la clave de sync. Cada arranque de Vela empieza
  en estado `locked` y hay que teclearla. Es el coste aceptado a cambio de que
  el disco del equipo no baste para abrir el vault.
- En `settings_profile` solo quedan los parámetros de derivación
  (`vault:sync-kdf`) y un **verificador** (`vault:sync-check`), que permite
  saber si la contraseña es correcta sin tocar la red ni los datos. Ambas claves
  llevan el prefijo `vault:`, que no se sincroniza.
- Si se pierde la contraseña, lo que hay en el servidor es irrecuperable. La
  interfaz lo dice antes de establecerla.

**Formato v2 del blob, cifrado entrada a entrada** (`sync/vaultSyncCrypto.ts`):

```
{ v: 2, kdf: {alg, salt, ops, mem}, check, items: [{ id, updatedAt, ct }] }
```

- Cada `ct` es XChaCha20-Poly1305 IETF (`nonce(24) || ciphertext+tag`) sobre el
  JSON de la entrada.
- El **AAD** de cada entrada es `vela-vault-v2|<remoteProfileId>|<id>`: un
  ciphertext no se puede recolocar en otra entrada, en otro perfil ni degradar a
  un formato anterior sin que la autenticación falle. Hay test de las tres cosas.
- `id` y `updatedAt` van en claro **dentro** del sobre, que a su vez sigue
  cifrado con la clave de sync antes de salir del equipo: el servidor no los ve,
  y el dispositivo puede fusionar por LWW sin descifrar entrada por entrada.
- Una entrada corrupta o manipulada se descarta sola, sin arrastrar al resto.

**Corte limpio, sin convivencia con v1.** Vela Android no usa `/sync/vault`
(solo `entities`, `profiles`, `account` y `key-salt`), así que el corte afecta
únicamente a versiones anteriores del navegador. Al establecer la contraseña,
`importLegacyVaultBlob()` baja una última vez el blob antiguo —todavía legible
con la clave de sync— y lo fusiona en local antes de subir el v2, para no perder
credenciales que solo estuvieran en el servidor.

**Lápidas para los borrados** (migración `022-vault-tombstones.sql`):

- Tabla `vault_tombstones(id, kind, deleted_at)`. Solo el id y la fecha: saber
  que existió una credencial no debe revelar cuál era.
- `PasswordVault.delete` y `AutofillVault.remove` la escriben; viajan como un
  item más del snapshot (`kind: 'tombstone'`) y se aplican con el mismo LWW: una
  entrada reescrita después del borrado gana a su lápida.
- Se podan a los 90 días, al construir cada subida.

**Transporte, que era el fallo de fondo:**

- `PasswordVault` y `AutofillVault` emiten `vault:changed` en sus mutaciones;
  `SyncManager` sube con 2 s de debounce. No se emite desde `syncUpsert` (viene
  de otro dispositivo, sería un bucle) ni desde `markUsed`/`touch` (cada
  autorrelleno subiría el vault entero).
- El aviso del servidor por WebSocket baja ahora también el vault:
  `pullChanges().then(() => pullVaultSnapshot())`.

**Interfaz:** sección «Contraseña del vault» en `vela://settings#sync`
(establecer, desbloquear, cambiar, bloquear) y, al arrancar con el vault
bloqueado, un toast que lleva allí. Los cuatro canales IPC nuevos manejan la
contraseña en claro, así que llevan `guardTrustedFrame`.

## Consecuencias

- Hay que teclear la contraseña del vault **en cada dispositivo y tras cada
  reinicio de Vela**. Mientras no se haga, todo lo demás sincroniza con
  normalidad y las contraseñas quedan en espera. Es el compromiso que se eligió
  frente a guardar la clave con el resto.
- Un dispositivo con una versión anterior de Vela deja de ver las contraseñas
  sincronizadas: su `pullVaultSnapshot` recibe un objeto donde espera un array y
  lo descarta. No pierde nada de lo que ya tuviera en local.
- El vault sigue viajando entero en cada subida. Con un vault grande eso son
  varios cientos de KB por cambio; el tope del servidor son ~1,1 MB por blob
  (`MAX_BLOB_B64_LEN`). Si llega a apretar, el siguiente paso es subir solo las
  entradas tocadas, que el formato v2 ya permite al ir cifradas por separado.
- Las lápidas viven 90 días. Un dispositivo que pase más tiempo sin sincronizar
  puede resucitar una entrada borrada.
- `lastUsedAt` no dispara subida, así que puede quedar desfasado entre equipos
  hasta el siguiente cambio real.
