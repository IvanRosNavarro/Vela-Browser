# 0105 — Capturar credenciales sin depender del evento `submit`

Fecha: 2026-09-04
Estado: aceptado

## Contexto

La oferta de guardado de contraseñas no aparecía en la mayoría de sitios. La
detección del preload colgaba de un único evento:

```ts
document.addEventListener('submit', …, true)
```

Y buscaba el identificador del usuario con
`form.querySelectorAll('input')`, es decir, solo dentro del `<form>`.

La mayoría de los formularios de acceso actuales son un botón con un handler de
`click` que llama a `fetch` y nunca envían un `<form>`; muchos ni siquiera
tienen uno. En esos sitios el evento no llega jamás, el main no recibe
credenciales provisionales y sin provisionales no hay oferta pendiente: ni
llave en la barra, ni clic, ni modal.

## Decisión

Tres señales de envío en lugar de una:

- `submit` del formulario, como antes.
- **clic** sobre `button`, `input[type=submit|button]`, `[role=button]` o
  `a[href="#"]` cuando hay un campo de contraseña relleno en el mismo `<form>`
  o, si no lo hay, en el documento.
- **Enter** sobre el campo de contraseña.

El identificador se busca con `compareDocumentPosition`: el último campo de
texto relleno que **precede** al campo de contraseña, dentro del `<form>` si
existe y en todo el documento si no. Si ninguno lo precede —formularios que
piden el correo después— vale el primero relleno.

Se deduplica por `URL + usuario + contraseña`, con reenvío pasados
`RESEND_AFTER_MS`: un acceso rechazado se reintenta con las mismas
credenciales y esa segunda vez sí puede acertar.

Nada de esto cambia **cuándo** se ofrece guardar. Esa decisión sigue siendo del
main, que espera a que la pestaña navegue de verdad o a que el formulario
desaparezca. Un botón que resulte no ser el de acceso genera una provisional
que caduca en silencio a los `PROVISIONAL_TTL_MS`.

## Carrera en el renderer

`VaultButton` descartaba el evento `VAULT_CREDENTIALS_PENDING` cuando
`payload.tabId !== activeTabId`. En un acceso SPA la URL no cambia, así que el
efecto que relee `vault:get-pending` no se vuelve a disparar y la oferta se
perdía para siempre. Ahora, si los identificadores de pestaña no cuadran, se
consulta al main —la fuente de verdad— en vez de descartar.

## Consecuencias

- La contraseña escrita vive en una variable del preload hasta el siguiente
  envío, igual que en la implementación anterior (`detectedCreds`).
- Un botón de "mostrar contraseña" puede generar una provisional. Es inocuo: el
  usuario ya había escrito la contraseña, y la oferta solo se materializa si el
  acceso prospera.
