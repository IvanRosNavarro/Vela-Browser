# ADR 0003 — `node:sqlite` en lugar de `better-sqlite3`

- Estado: aceptado
- Fecha: 2026-05-06
- Fase: 0 — Cimientos (Paso 4, persistencia local)

## Contexto

El plan inicial del proyecto, recogido en la primera versión de
`CLAUDE.md`, listaba `better-sqlite3` como driver de SQLite síncrono.
Es un módulo nativo (C++, bindings vía N-API) que requiere compilarse
contra el ABI exacto de la versión de Node embebida en Electron.

Al integrar la capa de storage sobre Electron 42 (ver ADR 0002) nos
chocamos con un blocker:

- Electron 42 trae **Node 24.15** y **V8 14.8** (`NODE_MODULE_VERSION = 146`).
- La última publicada de `better-sqlite3` es **12.9.0** (12 abr 2026).
- Sus prebuilts cubren hasta `NODE_MODULE_VERSION = 145` (Electron 41).
- Compilación desde fuente con `@electron/rebuild` falla porque V8 14
  cambió la firma de `v8::External::New` y `v8::External::Value`,
  y `better-sqlite3` aún no se ha adaptado:

  ```
  error C2660: 'v8::External::New': la función no acepta 2 argumentos
  error C2660: 'v8::External::Value': la función no acepta 0 argumentos
  ```

Es el patrón típico de un native module que va siempre con cierto
retraso respecto a Electron stable. No es culpa de nadie; es el coste
de tener bindings C++ explícitos contra el API de V8.

## Decisión

Usaremos **`node:sqlite`** (el módulo built-in del Node embebido en
Electron) como driver de SQLite. API síncrona, mismo modelo mental
que `better-sqlite3`:

```ts
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('/ruta/vela.db');
db.exec('CREATE TABLE ...');
db.prepare('SELECT * FROM t WHERE id = ?').get(42);
```

`node:sqlite` se introdujo en Node 22.5 como experimental, se estabilizó
en Node 24.0, y el Node 24.15 que trae Electron 42 la expone sin flags.
Verificado funciona en nuestro setup:

```bash
electron -e "
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE t(x INTEGER); INSERT INTO t VALUES (1),(2),(3);');
  console.log(db.prepare('SELECT sum(x) AS s FROM t').get());
"
# → [Object: null prototype] { s: 6 }
```

## Consecuencias

### Positivas
- **Cero compilación nativa.** Desaparece todo el aparato de
  `@electron/rebuild`, `node-gyp`, dependencia de Visual Studio Build
  Tools en Windows, scripts `rebuild:native`, postinstall hooks.
  `pnpm install` deja el proyecto listo para `pnpm dev` sin pasos
  adicionales.
- **No se desfasa.** Cada bump de Electron arrastra la versión de
  `node:sqlite` que va dentro de su Node embebido. No hay que esperar
  releases de un paquete tercero.
- **Bundle de release más simple.** Fuera el `asarUnpack` para
  `node_modules/better-sqlite3/**` en `electron-builder.yml`. Fuera la
  preocupación de empaquetar un `.node` específico por plataforma.
- **API equivalente.** Lo que escribiríamos con `better-sqlite3` se
  traduce 1:1 con cambios cosméticos: `new DatabaseSync(path)` en
  lugar de `new Database(path)`, `db.prepare(sql)` igual, `.run/.get/
  .all` iguales, `db.exec(sql)` igual.

### Negativas
- **Diferencias menores en transacciones.** `better-sqlite3` ofrece
  `db.transaction(fn)` con savepoints anidados; `node:sqlite` no trae
  helper, hay que envolver con `BEGIN/COMMIT/ROLLBACK` manualmente.
  Solucionado con un wrapper `transaction(db, fn)` de cinco líneas en
  `storage/db.ts`.
- **Sin user-defined functions ni extensiones C custom.**
  `better-sqlite3` permite cargar extensiones SQLite y registrar
  funciones JS callable desde SQL. `node:sqlite` (a fecha de hoy) no.
  No tenemos casos de uso planeados que las requieran.
- **Madurez relativa.** `better-sqlite3` lleva 5+ años en producción
  en miles de proyectos. `node:sqlite` lleva ~12 meses estable.
  Riesgo evaluado bajo: usamos SQL clásico, sin rinconadas del API.

### Trade-off
A cambio de perder dos features que no usamos, eliminamos el problema
crónico de los native modules en Electron: el desfase entre versiones,
los problemas de compilación cross-platform, los `electron-rebuild`
en CI, los binarios pesados específicos por plataforma en el
instalador. Para Vela el trade es claramente positivo.

## Verificación

Tras aplicar la decisión:
- `pnpm install` no requiere ningún paso post-install.
- `pnpm typecheck` pasa los 4 paquetes (los tipos de `node:sqlite`
  vienen en `@types/node@^22`, que tuvimos que bumpear desde 20.x para
  cubrirlos).
- Vela arranca, crea `vela.db` en `app.getPath('userData')`, aplica las
  migraciones pendientes, y la segunda ejecución no las reaplica
  (mecánica registrada en `schema_migrations`).

## Revisión

Volveremos a revisar esta decisión si:
- Necesitamos extensiones SQLite específicas (FTS5 ya está incluido,
  pero alguna extensión de terceros podría requerir vincular un .so).
- `node:sqlite` introduce regresiones serias en alguna release de Node.
- `better-sqlite3` reduce drásticamente su retraso respecto a
  Electron y nos sale a cuenta volver.

## Anotación operativa

Si en el futuro reincorporamos un native module por necesidad
(`bcrypt`, `keytar`, lo que sea), el patrón establecido con
`@electron/rebuild` en este Paso 4 (luego retirado) es la receta que
revisitar. Para evitar el desfase, mirar siempre primero si el
sustituto vive en Node core o en wasm puro.
