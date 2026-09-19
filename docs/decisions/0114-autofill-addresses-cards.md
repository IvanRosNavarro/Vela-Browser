# ADR 0114 — Autorrelleno de direcciones y tarjetas

- Estado: aceptado
- Fecha: 2026-09-19
- Versión: v0.2.7

## Contexto

El vault del perfil solo guardaba contraseñas. El encargo y `CLAUDE.md`
hablaban de un `vault.db` separado con AES-256-GCM, pero el código real guarda
las contraseñas en la tabla `password_vault` de `profile.db`, cifradas con
XChaCha20-Poly1305 y la clave del perfil (`ProfileKeyring`). Manda el código.

## Decisión

- **Almacenamiento**: migración `021-vault-addresses-cards.sql` con
  `vault_addresses` y `vault_cards` en `profile.db`. `AutofillVault` cifra cada
  entrada entera como JSON con la clave del perfil y el mismo formato que
  `PasswordVault` (`vaultCrypto.ts`); en claro solo id y fechas. Perfil
  bloqueado → ni relleno ni oferta de guardado.
- **El CVV no se guarda ni se captura nunca**: no hay campo, el esquema zod
  descarta claves extra y la captura ignora `cc-csc`.
- **Sync**: viajan en el mismo blob del vault, que sigue siendo un array con
  elementos `kind: 'address' | 'card'`. Las versiones anteriores los rechazan
  uno a uno por las restricciones NOT NULL sin tocar sus contraseñas; convertir
  el blob en objeto habría roto su pull entero.
- **Detección** con funciones puras en `packages/shared/src/autofill/` (sin zod,
  por el preload sandbox): `autocomplete` estándar primero y heurística en
  español e inglés después. Solo en formularios de dirección con al menos 3
  tipos de campo y sin contraseña visible, o de tarjeta con número.
- **Relleno**: popup no enfocable `vela://autofill-popup`. Rellena todo el
  formulario (misma sección si la hay), sin pisar lo escrito, con `input`/
  `change`, incluidos los `<select>` de país, provincia, mes y año.
- **Seguridad**: los mensajes de la pestaña solo se aceptan del frame principal
  de una pestaña de usuario, con el origen tomado de `event.senderFrame.url`.
  Tarjetas solo en `https:`. Los datos se envían tras la elección del usuario,
  con token de un solo uso, solo al frame que los pidió y comprobando que sigue
  en el mismo origen. No se rellenan campos ocultos. Nada personal en logs.
- **Oferta de guardado** tras enviar el formulario (`vela://autofill-save`), con
  Luhn obligatorio para tarjetas; «Actualizar» si cambia caducidad o titular.
  Lo rechazado no se vuelve a ofrecer en la sesión (se recuerda un hash).
- Gestión en `vela://passwords` (vistas Direcciones y Tarjetas) y ajustes
  `vault:autofill-addresses` / `vault:autofill-cards`, que no se sincronizan.

## Consecuencias

- Los campos de tarjeta dentro de iframes de pasarelas (Stripe, Adyen…) no se
  detectan: el preload no corre en iframes.
- El vault solo se sube al vincular y los borrados no se propagan; es el
  comportamiento previo del vault con las contraseñas.
- Si un dispositivo con una versión anterior sube su vault, el servidor pierde
  direcciones y tarjetas hasta que uno nuevo vuelva a subirlo.
- Una tarjeta rechazada por la pasarela también se ofrece guardar.
