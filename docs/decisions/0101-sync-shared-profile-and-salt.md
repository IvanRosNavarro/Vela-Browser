# 0101 — La sincronización usa un perfil remoto compartido y un salt del servidor

Fecha: 2026-09-03
Estado: aceptado

## Contexto

La sincronización de Fase 2 nunca llegó a transferir un solo dato entre
dispositivos, aunque la interfaz mostrara "Sincronización activa ·
Conectado" y la lista de dispositivos conectados fuera correcta. La lista
de dispositivos funcionaba porque `GET /sync/devices` filtra por
`user_id`; todo lo demás no, por tres motivos independientes, cada uno
suficiente por sí solo para que no viajara nada.

### 1. El `profile_id` era local de cada máquina

El servidor particiona **todo** por `profile_id`: entidades, ydocs y
vault (`packages/sync-server/src/sync/router.ts`). El cliente enviaba el
UUID del perfil local, obtenido de `getFrameContext(event, ctx)`.

Cada instalación de Vela genera sus propios UUID al crear su perfil, así
que el equipo A subía a `profile_id=A` y el equipo B pedía
`profile_id=B`: lista vacía siempre. En el servidor quedaban dos
perfiles hermanos del mismo usuario que jamás se cruzaban.

### 2. El salt de derivación de clave era aleatorio y local

`configure()` generaba `sync:key-salt` con `getRandomValues` la primera
vez y lo guardaba solo en `settings_profile`. La misma contraseña de
sync con salts distintos produce claves AES distintas, así que aunque
los datos hubieran llegado, `decrypt` habría fallado en el destino.

### 3. No existía push inicial

`configure()` solo hacía `pullChanges()`. Nada subía el estado ya
existente: solo se enviaban las mutaciones *posteriores*, vía
`syncEvents`. Un dispositivo recién vinculado no encontraba nada que
bajar aunque el otro llevara meses en uso.

Además, `ProfileSettingsRepository` no emitía `entity:changed` (los
ajustes no se sincronizaban pese a tener serializer y aceptación en el
servidor), `loadYDocWithSync` no lo llamaba nadie (notas rápidas), y
`pushVault`/`pullVault` no tenían ningún caller.

## Decisión

**El perfil remoto se elige al vincular y es independiente del id
local.** `SyncConfig.remoteProfileId` se persiste en
`settings_profile` bajo `sync:remote-profile-id` y es lo que viaja en
todas las peticiones. Al activar la sincronización, el cliente consulta
`GET /sync/profiles` (`listRemoteProfiles`), descifra los nombres con la
clave derivada y ofrece al usuario elegir a cuál engancharse o crear uno
nuevo. El nombre del perfil viaja cifrado como
`{ name, host }` para que sea reconocible sin que el servidor lo lea.

**El salt lo custodia el servidor, no el dispositivo.** Nueva tabla
`user_key_salts` (migración `003_key_salt.ts`) y endpoint
`POST /sync/key-salt`, que inserta el salt propuesto solo si el usuario
no tenía uno y devuelve **siempre** el canónico. El salt no es secreto:
su función es encarecer las tablas precomputadas. Lo que nunca sale del
dispositivo es la contraseña. Es de escritura única: cambiarlo dejaría
ilegible todo lo cifrado con la clave derivada de él.

**Al vincular se sube el estado local completo** (`pushAllLocal`), antes
de bajar el remoto. La fusión la resuelve el LWW por `updatedAt` que ya
existía en `mergeEntity`, así que nada se pierde en ninguno de los dos
lados. Los lotes se parten por número de entidades (200) y por tamaño
(~1,2 MB) porque el servidor monta `express.json({ limit: '2mb' })`.

## Consecuencias

- **Las vinculaciones anteriores no son recuperables.** Sus datos en el
  servidor están cifrados con claves derivadas de salts que ya no
  existen en ningún sitio compartido. `restoreFromStorage` detecta la
  ausencia de `sync:remote-profile-id`, limpia las credenciales y deja
  el perfil sin configurar para que el usuario vuelva a vincular. La
  interfaz de selección no bloquea cuando los perfiles remotos resultan
  ilegibles: los cuenta como restos de la versión anterior y deja crear
  uno nuevo.
- `ProfileSettingsRepository` emite `entity:changed` y sella
  `updated_at` en cada `set`. Los prefijos `sync:`, `keyring:`,
  `vault:`, `client-cert:`, `push:` y `extensions:` no se sincronizan
  nunca: son material criptográfico o estado propio del equipo.
- El serializer de `treenode` incluye ahora `anchored`, `anchoredUrl`,
  `pinnedUrl` y `collapsed`; sin ellos las Anclas y las Cargas llegaban
  al otro dispositivo convertidas en pestañas normales.
- El vault viaja como un blob único con las entradas **descifradas
  dentro** del blob cifrado con la clave de sync: en cada dispositivo
  están cifradas con la clave de su propio perfil, que no sale de ahí.
  `PasswordVault.syncUpsert` las reimporta preservando id y timestamps.
- Las notas rápidas se fusionan con Yjs en cada ciclo de sync.
  `loadYDocWithSync` pasa a indexar por `profileId:workspaceId` y a
  registrar el observer una sola vez por documento; antes cada llamada
  añadía un observer más.
- **El servidor debe desplegarse antes que el cliente.** Sin
  `POST /sync/key-salt`, `configure()` falla con un error visible en
  lugar de vincular en silencio contra un salt local.
