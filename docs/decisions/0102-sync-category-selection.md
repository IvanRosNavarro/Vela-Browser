# 0102 — Selección de qué se sincroniza, por categorías y en ambos sentidos

Fecha: 2026-09-04
Estado: aceptado

## Contexto

Tras el ADR 0101 la sincronización funciona, pero es todo o nada. La
sección `vela://settings#sync` mostraba dos columnas ("Se sincroniza" /
"No se sincroniza") que eran **texto estático**: no había ningún ajuste
detrás, y `SyncManager` recorría todas las entidades sin filtro.

Quien no quisiera sincronizar, por ejemplo, sus workspaces y pestañas
—porque cada equipo tiene su propia organización— solo podía desactivar
la sincronización entera, lo que deja fuera también las contraseñas, los
favoritos, las notas y los ajustes.

La lista estática además ya mentía: le faltaban los favoritos y las
excepciones del adblocker, que sí se sincronizan.

## Decisión

**Categorías, no `entity_type`.** `SYNC_CATEGORIES`
(`packages/shared/src/types/sync.ts`) agrupa los tipos internos en siete
unidades con sentido para quien las lee. "Workspaces y pestañas" cubre
`workspace` y `treenode` juntos: sincronizar workspaces sin su árbol deja
workspaces vacíos, y el árbol sin sus workspaces son pestañas huérfanas.
El vault y las notas rápidas tienen categoría pero no `entityTypes`,
porque no viajan como entidades (blob y documento Yjs); se filtran con su
propio guard.

La lista de la interfaz se genera de esa constante, así que no puede
volver a desincronizarse de la realidad.

**El filtro se aplica al enviar y al recibir.** Filtrar solo la subida
sería inútil: el otro dispositivo seguiría enviando sus workspaces y
`mergeEntity` los aplicaría igual. Los puntos de filtrado son
`onEntityChanged`, `pushAllLocal`, `mergeEntity`, `flushPending` (lo
encolado antes de desactivar la categoría tampoco debe salir) y los
guards de `pushVaultSnapshot`/`pullVaultSnapshot` y
`pushYDoc`/`pullYDoc`. El guard de las notas va en `pushYDoc`, no en
`syncQuickNotes`, para cubrir también al observer de Yjs que dispara
desde el handler `notes:save`.

**La elección es de cada dispositivo.** El ajuste vive en
`sync:disabled-categories`, y el prefijo `sync:` ya está en
`NON_SYNCABLE_PREFIXES`, así que no viaja. Es deliberado: permite tener
el portátil sin workspaces y el sobremesa con ellos, y evita la paradoja
de desactivar la categoría `settings`, que impediría que viajara la
propia lista de exclusiones.

**Desactivar no borra.** Lo ya subido se queda en el servidor por si el
usuario vuelve a activar la categoría. Borrarlo habría sido más limpio en
cuanto a qué datos hay en el servidor, pero lo eliminaría también para
los demás dispositivos que sí la tuvieran activada — un efecto
destructivo y a distancia desde un interruptor que no lo sugiere.

**Un tipo sin categoría se sincroniza.** `isTypeEnabled` devuelve `true`
cuando el `entity_type` no está en `SYNC_TYPE_TO_CATEGORY`: preferimos
sincronizar de más a perder datos por un registro olvidado. Como eso deja
al usuario sin poder desactivarlo, un test de `sync.test.ts` falla si
algún serializer se queda sin categoría.

## Consecuencias

- `disabledCategories()` lee el ajuste en cada operación en vez de
  cachearlo. Son lecturas de SQLite en memoria, y así un cambio surte
  efecto en el ciclo siguiente sin invalidaciones que mantener.
- Un ajuste corrupto (JSON inválido, no-array) se trata como "ninguna
  categoría desactivada": ante la duda, sincronizar de más.
- Al añadir una entidad sincronizable nueva hay un paso más: asignarle
  categoría en `SYNC_CATEGORIES`. Está en la lista de `CLAUDE.md`.
- Mientras una categoría está desactivada, sus entidades se descartan en
  `mergeEntity` pero el lote avanza `lastSeq` igual. Para que reactivarla
  sirva de algo, `rewindIfCategoryReenabled` compara al inicio de cada
  pull la lista actual con la de la vez anterior
  (`sync:last-disabled-categories`) y pone `lastSeq` a 0 si alguna se ha
  reactivado, releyendo el historial completo. El re-pull es idempotente:
  el LWW descarta lo que ya esté al día.
