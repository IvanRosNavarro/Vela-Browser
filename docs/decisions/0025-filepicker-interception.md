# ADR 0025 — File Picker: Interceptación de input[type=file] vía preload

**Estado**: Aceptado  
**Fecha**: 2026-05-13  
**Contexto**: Sub-fase 4B2

## Contexto

Los navegadores delegan la selección de archivos al picker nativo del SO cuando el usuario
hace click en un `input[type=file]`. Queremos mostrar nuestro propio panel (con Recientes,
Descargas y Portapapeles) antes de abrir el picker del SO, sin modificar el comportamiento
del formulario destino.

## Decisión

Interceptar el evento `click` en fase de **captura** desde el preload script, antes de que
el navegador lo procese y abra el diálogo nativo.

### Mecanismo

1. **Preload** (`webTab.ts`) registra `document.addEventListener('click', handler, true)` —
   el tercer argumento `true` pone el listener en fase de captura, antes que cualquier
   listener del sitio web.
2. Si el target es un `input[type=file]` (o un label/button que lo activa), se llama
   `event.preventDefault()` para suprimir el picker nativo y se envía IPC `filepicker:open`
   con la posición del elemento en pantalla y el atributo `accept`.
3. Main abre una `BrowserWindow` posicionada bajo el input (ver ADR 0026).
4. Cuando el usuario selecciona un archivo, el panel envía IPC `filepicker:select` con
   la lista de rutas.
5. Preload recibe la respuesta y construye un `FileList` sintético usando la `DataTransfer`
   API:
   ```ts
   const dt = new DataTransfer();
   // Para cada ruta, crea un File con el nombre del archivo
   dt.items.add(new File([buffer], filename, { type: mimeType }));
   input.files = dt.files;
   input.dispatchEvent(new Event('change', { bubbles: true }));
   ```
6. Si el sitio usa un Dropzone u otro mecanismo custom que no reacciona al evento `change`,
   el preload detecta que `input.files` no ha cambiado tras un timeout de 300 ms y lanza
   el picker nativo como fallback.

### Filtrado por `accept`

El atributo `accept` del input se pasa al panel. El panel filtra Recientes y Descargas para
mostrar solo los tipos compatibles. Reglas:
- `image/*` → solo imágenes (JPEG, PNG, GIF, WEBP, SVG…).
- `audio/*`, `video/*` → análogo.
- Extensiones concretas (`.pdf`, `.csv`) → solo esas extensiones.
- Vacío → sin filtro.

### Toggle en settings

El usuario puede desactivar el picker de Vela en `vela://settings#privacy`. Cuando está
desactivado, el preload no intercepta el click y el SO abre su picker directamente.

## Consecuencias

**Positivas**:
- Sin modificar el comportamiento del formulario: la inyección vía `DataTransfer` es
  indistinguible de una selección nativa para el código del sitio web.
- Fallback automático garantiza que ningún upload quede bloqueado si el sitio usa un
  mecanismo no estándar.
- El historial de Recientes mejora con el uso sin intervención del usuario.

**Negativas / trade-offs**:
- La inyección de archivos grandes puede ser lenta porque el contenido pasa por IPC
  (main → renderer). Para archivos > 50 MB podría notarse latencia. Alternativa futura:
  pasar solo la ruta y dejar que el site use `input.files[0].path` (Electron-specific).
- Algunos sitios comparan `e.isTrusted` en el evento `change`. Como el evento es sintético,
  `isTrusted` es `false`. Estos sitios recibirán el fallback nativo.
