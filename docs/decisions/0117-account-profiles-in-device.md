# ADR 0117 — Perfiles de la cuenta en cada dispositivo

- Estado: aceptado
- Fecha: 2026-09-20
- Versión: v0.2.8

## Contexto

Desde el ADR 0101 el servidor particiona todo por perfil remoto y cada perfil
local se vincula al suyo por separado, con sus propias credenciales en
`settings_profile`. Eso resuelve "dos equipos ven los mismos datos", pero deja
fuera el caso normal de quien tiene una cuenta con varios perfiles: no hay
ninguna vista de la cuenta, un equipo nuevo solo puede traerse el perfil que
elija durante el alta, y traer el segundo obliga a repetir el enlace mágico y
la contraseña. Vela Android sincroniza ya la cuenta completa y deja elegir qué
perfiles quiere el dispositivo; Desktop debía ofrecer lo mismo.

El obstáculo es que el vínculo (`sync:remote-profile-id`) vive dentro de cada
`profile.db`, que solo se puede leer con el perfil abierto — y con contraseña
maestra, ni eso. Sin ese dato no se puede pintar "estos perfiles de la cuenta
ya están en este equipo".

## Decisión

- **El vínculo se copia en `vela.db`** (migración `007-profile-sync-link`):
  `profiles.remote_profile_id` y `profiles.sync_paused`. Es una copia de solo
  lectura para la interfaz; la fuente de verdad sigue siendo
  `sync:remote-profile-id` de cada perfil. Se escribe al configurar, al
  restaurar la sesión y al desactivar.
- **`SyncManager.configureWithKey(token, syncKey, remoteProfileId, {pushLocal})`**:
  `configure()` pasa a ser el caso "deriva la clave de la contraseña" de este
  método. Permite vincular un perfil con la sesión y la clave que ya tiene otro
  perfil del mismo equipo, sin enlace mágico ni contraseña.
- **`sync:adopt-remote-profile`** crea el perfil local para un perfil de la
  cuenta que aún no está aquí y lo vincula. El perfil nace **sin** el workspace
  `Default` (`skipDefaultWorkspace`): ese workspace vacío se subiría al servidor
  y aparecería en el resto de dispositivos. Por lo mismo se adopta con
  `pushLocal: false`.
- **`sync:set-profile-paused`** pausa un perfil sin desvincularlo: se corta el
  WebSocket y se deja de escuchar cambios, pero las credenciales y el cursor
  se quedan. Al abrir un perfil en pausa no se restaura la sesión. Se distingue
  de "Desactivar sincronización", que sí borra las credenciales del perfil.
- **`sync:list-account-profiles`** cruza los perfiles del servidor (descifrados
  con la clave en memoria, sin volver a pedir la contraseña) con los perfiles
  locales, y alimenta la sección "Perfiles de la cuenta" de
  `vela://settings#sync`.

## Consecuencias

- La clave de sync no sale del proceso principal: `getCredentialsForLinking()`
  es main-only y el renderer nunca la ve.
- Adoptar un perfil renombra su etiqueta en el servidor solo si el nombre local
  cambia después: el perfil local se crea con el nombre remoto, así que el
  `registerProfile()` posterior escribe el mismo valor.
- Un perfil de la cuenta cifrado con otra contraseña sigue apareciendo como
  ilegible; no se puede traer hasta vincular con esa contraseña.
- `vela.db` guarda ahora un dato derivado que puede quedar obsoleto si alguien
  manipula `profile.db` a mano. Se corrige solo en el siguiente arranque del
  perfil.
