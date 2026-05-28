# ADR 0008 — Estrategia de aislamiento de perfiles

- Estado: aceptado
- Fecha: 2026-05-08
- Fase: 3 — Multi-perfil real

## Contexto

Vela soporta múltiples perfiles de usuario. Cada perfil debe estar
completamente aislado de los demás: cookies, sesión Electron,
historial de navegación, workspaces, extensiones, contraseñas y
ajustes de aspecto. Un usuario puede tener abiertos simultáneamente
varios perfiles en ventanas distintas, y ninguno debe ver o afectar
al otro.

Las opciones principales para implementar este aislamiento son:

**A) Una `userData` por perfil.**
Cada perfil es una instalación de Electron independiente con su
propio directorio de datos. Simple conceptualmente, pero implica
múltiples instancias del proceso main, duplicación de recursos,
y no hay forma sencilla de compartir datos globales (atajos
del usuario, perfil último activo, etc.).

**B) Una sola `userData` con subdirectorios por perfil.**
Un único proceso main. Los perfiles viven en
`userData/profiles/{uuid}/`. Los datos globales viven en
`userData/vela.db`. La sesión Electron se particiona con
`session.fromPartition`. Las extensiones se cargan desde la
carpeta de cada perfil.

## Decisión

**Opción B**: una sola `userData` con subdirectorios por perfil.

### Estructura de directorios

```
userData/
  vela.db                    ← BD principal (perfiles, metadata, atajos globales)
  backups/                   ← backups pre-migración
  profiles/
    {uuid-A}/
      profile.db             ← workspaces, tree_nodes, settings_profile, vault…
      extensions/            ← extensiones instaladas en este perfil
    {uuid-B}/
      profile.db
      extensions/
```

### Sesiones Electron

Cada perfil usa `session.fromPartition('persist:profile-{uuid}')`.
Esta partition tiene su propia caché, cookies, almacenamiento web
e historial de navegación, completamente aislados de los demás
perfiles.

### Base de datos

- `vela.db` (BD principal): solo contiene `app_metadata`,
  `schema_migrations` y `profiles`. Es la fuente de verdad de
  qué perfiles existen y cuál fue el último activo.
- `profile.db` (por perfil): contiene `workspaces`, `tree_nodes`,
  `auto_group_rules`, `settings_profile`, `password_vault`.
  Se crea al crear el perfil. Se borra junto con su directorio
  al eliminar el perfil.

### Extensiones

`ProfileExtensionManager` carga las extensiones de cada perfil
desde `profiles/{uuid}/extensions/` usando la sesión del perfil.
No hay extensiones globales: cada perfil gestiona las suyas.

### Una ventana = un perfil

En esta fase, una ventana pertenece a un perfil estable durante
toda su vida. Para usar otro perfil hay que abrir una nueva ventana.
`switchWindowProfile` (cambiar perfil sin reabrir) queda pendiente
para Fase 4.

## Alternativas descartadas

**A. Una userData por perfil.** Requiere múltiples instancias del
proceso main, sin mecanismo nativo de comunicación entre ellas para
compartir estado global (último perfil activo, atajos globales).
Electron no está diseñado para este patrón.

**C. Usar `webContents.session` de forma efímera (sin partition).**
Equivale a navegación de incógnito: los datos no persisten entre
reinicios. No válido para un perfil con sesión duradera.

## Consecuencias

- Los repositories se obtienen vía
  `ProfileManager.getRepositories(profileId)`, no directamente
  desde una instancia global de DB. Los handlers IPC usan
  `getReposForFrame(frame)` para resolver el perfil correcto
  a partir del `WebContents` emisor.
- Abrir dos ventanas con el mismo perfil a la vez queda bloqueado
  en `ProfileManager.openProfile` para evitar race conditions en
  la DB (SQLite en modo WAL solo soporta un escritor concurrente
  sin riesgo de corrupción si se serializa correctamente, pero
  la complejidad no merece la pena en esta fase).
- Al eliminar un perfil se borra todo: el directorio, la sesión
  Electron y la fila en `vela.db`. Esta operación es irreversible;
  la UI exige confirmación con nombre exacto.
- En Fase 2 (sync), el `sync-server` sabrá desde el inicio que
  existen múltiples perfiles y diseñará el modelo de Y.Doc por
  perfil.
