# ADR 0004 — Licencia GPL-3.0-only

- Estado: aceptado
- Fecha: 2026-05-07
- Fase: 0 — Cimientos (Paso 5, justo antes del primer release)
- Reemplaza la licencia MIT que tuvo Vela hasta este punto.

## Contexto

Vela depende de [`electron-chrome-extensions`](https://github.com/samuelmaddock/electron-browser-shell)
para cargar extensiones de Chrome Web Store (Bitwarden, uBlock Origin,
Cookie-Editor, Analytics Debugger — validados en
[`docs/extension-validation.md`](../extension-validation.md)).

El paquete se distribuye con licencia dual:

- **GPL-3.0-only** — gratis, pero exige que el binario que la
  incorpora sea también GPL-3.0-or-compatible.
- **`Patron-License-2020-11-19`** — licencia comercial. Hace falta
  patrocinar al autor en GitHub Sponsors al tier que la concede.

El plan inicial del repo arrancó con `LICENSE` = MIT por inercia,
sin haber tomado todavía la decisión sobre extensiones. Esta cuestión
se quedó marcada como pendiente en el informe del Paso 3
(`extension-validation.md`) y se aplazó la resolución hasta el Paso 5
(empaquetado y primer release), porque hasta entonces no había
distribución y por tanto el conflicto era latente, no efectivo.

## Decisión

Vela pasa a estar licenciada bajo **GPL-3.0-only**.

- `LICENSE` contiene el texto canónico de la GPL-3.0.
- `package.json` raíz declara `"license": "GPL-3.0-only"`.
- Se mantiene la cadena `license: 'GPL-3.0'` en el constructor de
  `ElectronChromeExtensions` ([packages/main/src/index.ts](../../packages/main/src/index.ts)).
- A partir de aquí, cualquier nueva dependencia debe ser
  GPL-compatible. Las MIT, Apache-2.0, BSD y similares son
  compatibles. Las que no: AGPL-only sin "or-later", licencias
  propietarias, EULAs ad-hoc — vetadas salvo decisión expresa.

## Alternativas descartadas

- **Pagar `Patron-License-2020-11-19`** y mantener Vela bajo MIT:
  preserva la apertura máxima del código pero impone un coste
  recurrente y un punto de fallo en una sola persona. No descartado
  para siempre — si el proyecto crece y la GPL nos limita
  comercialmente (por ejemplo, mezclar con código propietario
  cliente), reabriremos esta puerta.
- **Reemplazar `electron-chrome-extensions`** con un fork MIT o una
  alternativa: no existe una alternativa madura hoy. Hacer un fork
  amigable con la licencia es factible pero supone mantener nosotros
  toda la integración del API de extensiones de Chrome — un trabajo
  enorme y duplicación gratuita.
- **Mantener MIT y aceptar incompatibilidad** "porque nadie va a
  mirar": no es un camino. La GPL es viral por diseño y el riesgo de
  reclamación legítima existe.

## Consecuencias

### Positivas
- El proyecto es legítimamente distribuible. El primer release
  público puede salir sin warnings.
- Filosofía coherente con el espíritu del código abierto: el código
  que ejecutas, lo puedes ver, modificar y redistribuir bajo los
  mismos términos.
- Cero coste recurrente.

### Negativas
- Cualquier integración futura con código propietario (un SDK
  comercial, un wrapper para empresa, un enterprise tier) se complica.
  Hay patrones para hacerlo (servicio en otro proceso, IPC entre
  binarios, doble licencia con copyright assignment) pero requieren
  diseño previo.
- Algunas dependencias futuras pueden quedar fuera por incompatibilidad.
  Lo iremos viendo caso a caso; por ahora el árbol de deps es
  GPL-compatible al 100% (todas MIT/BSD/Apache).
- Si quisiéramos cambiar de licencia más adelante, tendríamos que
  conseguir el consentimiento de todos los contribuyentes salvo que
  exijamos copyright assignment desde el día uno. **No** vamos a
  pedir copyright assignment — los contribuyentes mantienen sus
  derechos.

## Cómo aplicar la licencia a archivos nuevos

Para código fuente (no obligatorio en cada archivo, pero sí
recomendado en headers de módulos importantes):

```
// Vela Browser — <descripción>
// Copyright (C) 2026 Vela Browser contributors
// Licensed under GPL-3.0-only. See LICENSE for the full text.
```

Para `package.json` de paquetes nuevos del workspace, añadir
`"license": "GPL-3.0-only"`.

## Revisión

Volveremos a revisar esta decisión si:
- Encontramos un argumento de negocio fuerte para distribuir Vela en
  modo dual (open + propietario para empresa).
- `electron-chrome-extensions` cambia su licenciamiento.
- Decidimos asumir el coste de la `Patron-License-2020-11-19`.
