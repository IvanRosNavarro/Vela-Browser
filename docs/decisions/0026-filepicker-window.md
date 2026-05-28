# ADR 0026 — File Picker: Ventana del panel (BrowserWindow frameless)

**Estado**: Aceptado  
**Fecha**: 2026-05-13  
**Contexto**: Sub-fase 4B2

## Contexto

El panel del selector de archivos debe aparecer posicionado justo debajo del
`input[type=file]` que lo activó, usar la sesión del perfil activo para acceder
a `recent_files`, y cerrarse al hacer click fuera o al seleccionar un archivo.

## Decisión

Implementar el panel como una `BrowserWindow` **frameless** con `alwaysOnTop: true`,
que carga `vela://filepicker`.

### Configuración de la ventana

```ts
new BrowserWindow({
  width: 400,
  height: 480,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  webPreferences: {
    session: profileSession,   // sesión del perfil activo
    preload: filePickerPreload,
    contextIsolation: true,
  },
})
```

### Posicionado relativo al input

1. El preload envía las coordenadas del input en pantalla:
   ```ts
   const rect = input.getBoundingClientRect();
   const { x, y } = await window.velaApi.getWindowPosition();
   // Coordenadas absolutas en pantalla
   const screenX = x + rect.left;
   const screenY = y + rect.bottom;
   ```
2. Main posiciona la `BrowserWindow` en `(screenX, screenY)`, ajustando si el panel
   se saldría del monitor (clamp a los bounds del display).

### Cierre por blur

La ventana se cierra cuando pierde el foco (`blur` event en main):
```ts
pickerWin.on('blur', () => pickerWin.close());
```
Esto cubre el caso de click fuera del panel.

### Sesión del perfil

Se pasa la sesión `session.fromPartition('persist:profile-{uuid}')` del perfil activo.
Esto garantiza que:
- El renderer del picker puede acceder a los datos del perfil correcto vía IPC.
- Las cookies/credenciales no se mezclan entre perfiles si el usuario tiene varios abiertos.

### Protocolo vela://filepicker

El panel se sirve vía el protocolo `vela:` existente (ADR 0011). En dev, el servidor
de Vite sirve el entry point `filepicker`; en producción se resuelve desde el ASAR.
El vite.config del renderer define el input `filepicker` como MPA adicional.

### IPC relevante

| Canal | Dirección | Descripción |
|---|---|---|
| `filepicker:open` | renderer→main | Abre el panel con `{ accept, x, y, multiple }` |
| `filepicker:select` | main→renderer (preload) | Devuelve `{ paths: string[] }` seleccionados |
| `filepicker:cancel` | main→renderer (preload) | El usuario cerró sin seleccionar |
| `filepicker:get-recent` | picker→main | Solicita los archivos recientes del perfil |
| `filepicker:get-downloads` | picker→main | Solicita los archivos de la carpeta de descargas |
| `filepicker:explore` | picker→main | Lanza el picker nativo del SO |

## Consecuencias

**Positivas**:
- `alwaysOnTop` garantiza que el panel flota sobre el `WebContentsView` (que es nativo)
  sin necesidad de `useOverlayStore` ni recalcular bounds.
- La sesión del perfil aísla correctamente los datos entre perfiles.
- Frameless + transparent permiten darle la apariencia de un popover de la shell de Vela.

**Negativas / trade-offs**:
- `alwaysOnTop` también flota sobre otras aplicaciones del SO mientras el panel está abierto.
  Es aceptable porque el panel es efímero (se cierra en blur) y de tamaño pequeño.
- En Linux con gestores de ventanas tiling, `alwaysOnTop` puede comportarse de forma
  inesperada. No es prioridad para MVP (soporte Linux best-effort).
