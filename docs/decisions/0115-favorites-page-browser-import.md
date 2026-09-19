# ADR 0115 — Favoritos como página e importación desde otros navegadores

- Estado: aceptado
- Fecha: 2026-09-19
- Versión: v0.2.7
- Sustituye en parte a: ADRs 0052–0054 (franja de Favoritos en la sidebar)

## Contexto

Favoritos se mostraba como franja en la sidebar (`GlobalFavoritesBar`) y como
botón en la barra de título. El usuario no quiere Favoritos en ninguna barra:
se abren solo desde el menú o con un atajo, en una página igual a la de Carpeta
(`vela://folder-view`), con buscador y edición. Además, Vela no podía importar
datos de otros navegadores, que es la mayor barrera para cambiarse.

## Decisión

### Favoritos

- Fuera `GlobalFavoritesBar` y el botón de la barra de título. `FavoritesBar.tsx`
  se queda: pese al nombre, es la franja de Cargas. La estrella de la barra de
  URL sigue sirviendo para añadir y quitar.
- Se abren con `internal.openFavorites` (id existente, para no invalidar atajos
  personalizados) con `Ctrl+Shift+O`, el del gestor de marcadores de Chrome.
- **Vista compartida** (`renderer/src/shared-ui/collection-view/`) para
  `vela://favorites` y `vela://folder-view`: cabecera con renombrado, migas de
  pan, buscador en subcarpetas, lista/cuadrícula, edición in situ y eliminar a
  la derecha de editar. En Favoritos se editan nombre y dirección; en Carpeta,
  solo el nombre.
- **Carpetas** (el esquema ya las tenía desde la migración 017): crear,
  renombrar, mover y eliminar. Al eliminar una con contenido se pregunta si
  borrar solo la carpeta (el contenido sube un nivel) o todo.
- **Sync**:
  - un borrado recibido ya no se reenvía al servidor (`syncDelete`);
  - dos dispositivos con la misma URL e ids distintos convergen al id menor;
  - las operaciones masivas se suben en lotes con `SyncManager.pushChanges`.
- Los canales `favorites:*` pasan a llevar `guardTrustedFrame` y zod.
- El modo de vista de Carpeta pasa de `localStorage` a `folder-view:view-mode`.

### Importación

- Página `vela://import-data` (Ajustes → General y Favoritos). Detecta Chrome,
  Edge, Brave, Vivaldi, Opera, Opera GX, Chromium y Firefox con sus perfiles, en
  Windows, macOS y Linux.
- El renderer solo elige de la lista detectada por main; al importar, main
  vuelve a detectar, así que nunca recibe una ruta.
- Los SQLite se copian a un temporal (con su `-wal`) antes de abrirlos.
- **Marcadores → Favoritos** dentro de «Importado de <Navegador>», con toda la
  jerarquía. Reimportar no duplica: la URL de un favorito es única.
- **Historial → `history`**, sin duplicados, respetando «No registrar historial»
  y la retención. Las fechas de Chromium (µs desde 1601) se convierten en SQL
  porque superan `Number.MAX_SAFE_INTEGER`.
- **Contraseñas desde el CSV** que exporta cada navegador: desde 2024 Chrome las
  cifra con una clave ligada a la app que otro programa no puede leer. El parser
  pasa a `passwords/passwordCsv.ts` (RFC 4180, columnas por nombre); el anterior
  partía por líneas y rompía las notas multilínea de Chrome.

## Consecuencias

- Un marcador que está en dos carpetas del navegador de origen se importa una
  vez, en la primera.
- Los favoritos importados no traen favicon.
- En Carpeta, eliminar una pestaña la cierra; Ctrl+Shift+T la reabre en la raíz
  del workspace.
