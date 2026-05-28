# ADR 0045 — Cookie Manager nativo en sustitución de Cookie Editor bundled

## Estado
Aceptado — implementado en Fase 4.5.4c

## Contexto
Vela incluía Cookie Editor como extensión bundled para que los usuarios
pudieran inspeccionar y editar cookies. Esta solución tenía problemas:
- Requería instalar y mantener una extensión de terceros.
- Operaba bajo restricciones MV3 (acceso a cookies vía `chrome.cookies`
  con permisos explícitos).
- UI genérica de extensión, no integrada en la shell de Vela.
- Actualizaciones dependían del maintainer de la extensión.

## Decisión
- Cookie Editor se retira de las extensiones bundled.
- Se implementa un Cookie Manager nativo con acceso directo a
  `session.cookies` desde el main process.
- Punto de entrada: icono `ti-cookie` en la URL bar con el número
  de cookies del dominio activo.
- Panel flotante (`CookiePanel`) implementado como BrowserWindow hijo
  (`parent: mainWindow, focusable: true, frame: false`).
- Tabs en el panel: **Primera parte** (dominio activo), **Terceros**
  (otros dominios), **Sesión** (sin fecha de expiración).
- Operaciones: listar, buscar, expandir, editar campos, crear, eliminar
  individual, eliminar todas (con confirmación inline).
- Actualización automática: `session.cookies.on('changed')` dispara
  un push IPC al panel abierto.

## Alternativas descartadas
- **Mantener Cookie Editor bundled**: deuda de mantenimiento, sin
  integración nativa. Descartado.
- **Extensión propia MV3**: misma restricción de permisos; más trabajo
  con menos acceso que `session.cookies`. Descartado.

## Consecuencias
- Acceso completo a cookies sin restricciones MV3.
- Push IPC en tiempo real desde `session.cookies.on('changed')`.
- Cookie Editor eliminado de la lista de extensiones bundled.
- Ver ADR 0046 para la decisión técnica sobre `session.cookies`.
