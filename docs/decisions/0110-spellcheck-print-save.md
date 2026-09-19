# ADR 0110 — Corrector ortográfico, imprimir y guardar página

- Estado: aceptado
- Fecha: 2026-09-19
- Versión: v0.2.7

## Contexto

- El corrector estaba apagado desde Fase 1 (commit eafaa7b) con un
  `setSpellCheckerEnabled(false)` y el comentario «Fase 4 lo gestionará por
  perfil». Era provisional y nunca se retomó; no respondía a ningún fallo.
- El menú contextual web anunciaba Ctrl+P y Ctrl+S, pero esos atajos no
  existían, y no había forma de guardar una página.

## Decisión

- **Corrector por perfil** (`packages/main/src/spellcheck/`):
  `spellcheck:enabled` (activo por defecto) y `spellcheck:languages`
  (`string[] | null`; `null` = idiomas preferidos del sistema con diccionario).
  Se aplica al abrir el perfil, en caliente desde `settings:set` y al llegar
  por sync. Las pestañas fantasma reciben los ajustes del perfil.
- **Ambos ajustes se sincronizan**. Como los diccionarios dependen de cada
  máquina, los idiomas se resuelven en local (exacto → idioma base → otra
  región) y los que no existen se ignoran. Para aplicarlos en caliente,
  `SyncManager.mergeEntity` emite `entity:applied` en `syncEvents`, genérico
  para otros consumidores.
- **Menú contextual web**: con `params.misspelledWord`, hasta 5 sugerencias,
  «Sin sugerencias» si no hay y «Añadir al diccionario».
- **Plataformas**: en macOS y Windows se usa el corrector del sistema (en macOS
  no se elige idioma). En Linux Electron descarga los diccionarios Hunspell de
  un CDN de Google; se avisa en el ajuste.
- **Imprimir y guardar**: comandos `page.print` (Ctrl+P) y `page.save` (Ctrl+S)
  con un helper común (`tabs/pageActions.ts`) que usan también el menú
  contextual y el menú de Vela. «Guardar página como…» ofrece página completa,
  solo HTML y MHTML; el formato se deduce de la extensión, porque
  `showSaveDialog` no devuelve el filtro elegido.
- **Atajos de página con overlay**: `page.print` y `page.save` no se interceptan
  mientras un overlay oculta el WCV (`TabManager.isOverlayActive`). Así Ctrl+S
  sigue guardando la captura en el editor de capturas.

## Consecuencias

- En Linux, cambiar de filtro en el diálogo puede no cambiar la extensión, y
  con ella el formato.
- El ADR 0024 menciona `cleanSeparators`, que no existe en el código: los
  separadores del menú contextual se colocan a mano.
