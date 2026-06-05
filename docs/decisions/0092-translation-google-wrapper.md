# ADR 0092 — Traducción básica de texto seleccionado

## Estado
Aceptado

## Contexto
Los usuarios necesitan poder traducir texto seleccionado de cualquier página web directamente
en Vela, sin salir del navegador. La funcionalidad debe ser opcional, explícita (solo texto
seleccionado por el usuario) y sin requerir API key.

## Decisión

### Dependencia
Se usa `@vitalets/google-translate-api` (MIT), un wrapper ligero de la API pública de Google
Translate. No requiere autenticación ni clave de API. Las llamadas HTTP se realizan **únicamente
desde el main process** (Node.js), nunca desde el renderer.

### Modelo de datos
Tabla `translation_settings` en `vela.db` (global, no por perfil):

```sql
CREATE TABLE IF NOT EXISTS translation_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  target_lang TEXT NOT NULL DEFAULT 'es',
  source_mode TEXT NOT NULL DEFAULT 'auto',
  source_lang TEXT NOT NULL DEFAULT 'en'
);
```

### Flujo principal
1. El usuario selecciona texto en una web y activa la traducción mediante:
   - Clic derecho → "Traducir" en el menú contextual
   - Botón globo en la URL bar
   - Comando `translate.selectedText` (accesible desde Command Palette)
2. `translateAndShow(ctx, windowId, text)` en `ipc/translation.ts`:
   a. Lee los settings de `TranslationSettingsRepository`
   b. Llama a `TranslationManager.translate(text, targetLang, sourceLang)`
   c. Crea o actualiza el popup `TranslationPopup` para esa ventana
   d. Emite `TRANSLATION_STATUS_CHANGED` con `status: 'translated'` a la ventana padre
3. El popup `vela://translate-result` muestra el resultado. No se cierra al perder el foco.

### Popup (`TranslationPopup`)
- `BrowserWindow` nativa, `alwaysOnTop: true`, sin barra de título
- Posición: esquina inferior derecha del área de contenido, con margen 16 px
- Ciclo de vida manual (no usa `wirePopupLifecycle`): no se cierra en blur
- Se cierra al: pulsar ×, pulsar "Copiar" (copia al portapapeles + cierra), navegar la pestaña activa, o cerrar la ventana padre
- Un único popup por ventana principal (Map<windowId, BrowserWindow>)

### Botón en URL bar (`TranslateButton`)
Tres estados visuales según `useTranslationStore`:
- `neutral` — globo a 30% de opacidad
- `suggested` — globo al 100% + punto de color accent (idioma de página ≠ idioma destino)
- `translated` — globo con relleno accent (hay una traducción activa en esta pestaña)

El estado `suggested` se activa cuando `TranslationPopup` detecta el idioma de la página
en `did-finish-load` y difiere del `target_lang` configurado.

### Prohibiciones explícitas
- ❌ No se traduce la página completa; solo texto seleccionado explícitamente
- ❌ No hay banner ni popup automático sugiriendo traducción
- ❌ El popup no se cierra al perder el foco (blur)
- ❌ No se hacen llamadas HTTP de traducción desde el renderer
- ❌ Los settings no se persisten en localStorage

## Consecuencias
- Las traducciones dependen de la disponibilidad de la API pública de Google Translate,
  que no tiene SLA garantizado. Si Google bloquea las peticiones, la función dejará de
  funcionar sin aviso.
- No hay coste de API key por ahora. Si en el futuro se requiere auth, habrá que migrar
  a la API oficial de Google Cloud Translation.
- La tabla `translation_settings` vive en `vela.db` (scope global) en lugar de
  `settings_profile` (scope por perfil) por decisión explícita: los usuarios esperan
  un único idioma destino para todo el navegador.
