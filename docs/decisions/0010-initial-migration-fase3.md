# ADR 0010 — Estrategia de migración inicial Fase 3

- Estado: aceptado
- Fecha: 2026-05-08
- Fase: 3 — Multi-perfil real

## Contexto

Antes de Fase 3, Vela tenía una única instancia: `vela.db` con las
tablas `workspaces`, `tree_nodes`, `auto_group_rules`, `settings`,
`password_vault` (y las de infraestructura `app_metadata`,
`schema_migrations`). No existía el concepto de perfil.

Al arrancar Fase 3 por primera vez en una instalación real de
Fase 1, hay que:

1. Crear un perfil "default" en `vela.db.profiles`.
2. Crear `profiles/{uuid-default}/profile.db` con el esquema
   completo de Fase 3.
3. Mover los datos existentes de `vela.db` a `profile.db`:
   workspaces, tree_nodes, auto_group_rules, settings_profile,
   password_vault.
4. Dejar `vela.db` solo con: `app_metadata`, `schema_migrations`,
   `profiles`.

Esta operación es **destructiva**: después del paso 4 las tablas
de datos de usuario ya no existen en `vela.db`. Si algo falla a
mitad, la instalación puede quedar inutilizable.

## Decisión

`InitialProfileMigration` en
`packages/main/src/storage/ProfileMigrationRunner.ts` ejecuta
la migración en tres fases: backup, migración y verificación.

### Fase 1: backup

Antes de tocar nada, se copia `vela.db` a
`userData/backups/vela-pre-fase3-{timestamp}.db`. Si la copia
falla, la migración se aborta sin haber modificado nada.

El directorio `backups/` no se borra automáticamente. El usuario
puede limpiarlo manualmente si lo desea.

### Fase 2: migración (transacción atómica)

Todo el proceso ocurre dentro de una única transacción SQLite en
`vela.db` con `BEGIN IMMEDIATE`. Los pasos son:

1. Insertar el perfil "default" en `profiles`.
2. Crear `profiles/{uuid}/` en disco.
3. Abrir `profile.db` y aplicar el esquema completo.
4. Para cada tabla a migrar (`workspaces`, `tree_nodes`,
   `auto_group_rules`, `settings_profile`, `password_vault`):
   a. `ATTACH DATABASE 'profile.db' AS prof`.
   b. `INSERT INTO prof.{tabla} SELECT * FROM main.{tabla}`.
   c. `DETACH prof`.
5. `DROP TABLE workspaces` (y resto) en `vela.db`.
6. Registrar la migración 004 en `schema_migrations`.
7. `COMMIT`.

Si cualquier paso lanza una excepción, el `catch` ejecuta
`ROLLBACK`. En ese caso `vela.db` queda intacta (el backup es
redundante pero sigue siendo la salvaguarda si el rollback mismo
falla en un escenario de disco lleno).

### Fase 3: verificación

Tras el commit, se comprueba que:
- La fila del perfil "default" existe en `vela.db.profiles`.
- `profile.db` contiene al menos las tablas `workspaces`,
  `tree_nodes` y `settings_profile`.
- El número de filas en `profile.db.workspaces` coincide con el
  recuento pre-migración.

Si la verificación falla, la app muestra un error fatal y propone
restaurar desde el backup.

### Rollback manual

El usuario puede restaurar manualmente copiando el backup sobre
`vela.db`:

```
cp userData/backups/vela-pre-fase3-{timestamp}.db userData/vela.db
rm -rf userData/profiles/
```

Esto devuelve la instalación al estado de Fase 1. Se documenta en
la UI de error.

### Detección de si la migración ya se ejecutó

`InitialProfileMigration.isNeeded(db)` comprueba si la tabla
`profiles` existe en `vela.db` y si existe al menos un perfil.
Si ya existe, `run()` es un no-op. Esto hace que la migración sea
idempotente.

## Alternativas descartadas

**A. Migración lazy (ejecutar solo al acceder a datos).** Introduce
complejidad en todos los repositorios: tienen que manejar el caso
de datos aún en `vela.db`. Una migración eager al arranque es
más simple.

**B. Sin backup, solo rollback transaccional.** La transacción
SQLite protege contra fallos eléctricos o crashes, pero no contra
bugs del código de migración que hagan un `COMMIT` de datos
erróneos. El backup pre-migración es el seguro real.

**C. Migración fuera de banda (herramienta de línea de comandos).**
La mayoría de usuarios de Vela no son desarrolladores. La migración
automática al primer arranque con Fase 3 es la opción con menor
fricción.

## Consecuencias

- La migración inicial es el único lugar donde `vela.db` contiene
  datos de usuario. Después del commit, `vela.db` es solo
  infraestructura.
- Si en el futuro se añaden columnas a tablas de perfil, se añade
  una migración en `profile.db` (no en `vela.db`). Las migraciones
  de `vela.db` son raras y solo afectan a la tabla `profiles`.
- Los backups de `userData/backups/` deben ser excluidos del
  control de versiones (ya en `.gitignore`) pero deben incluirse
  en cualquier utilidad de backup del usuario.
- En Fase 2 (sync), el protocolo de sincronización debe asumir que
  puede llegar una `profile.db` recién creada sin historial de
  cambios y arrancar la sincronización desde cero para ese perfil.
