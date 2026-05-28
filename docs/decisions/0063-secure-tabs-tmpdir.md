# ADR 0063 — Tabs blindadas con directorio temporal del SO

## Estado
Aceptado — Fase 5.0.4

## Contexto
Las tabs blindadas deben ofrecer un nivel de aislamiento superior al modo incógnito estándar. El modo incógnito de Electron (`session.fromPartition('...')` sin `persist:`) mantiene datos en memoria pero no garantiza que el SO no los lleve a swap.

## Decisión
Cada tab blindada usa un directorio temporal creado con `fs.mkdtempSync(path.join(os.tmpdir(), 'vela-secure-'))` y lo pasa como `userData` a una sesión particionada en ese directorio. Al cerrar la tab, el directorio se elimina con `fs.rmSync({ recursive: true, force: true })`. Al arrancar Vela, `SecureTabManager.cleanResidualDirs()` elimina cualquier directorio `vela-secure-*` residual de cierres anteriores abruptos.

## Consecuencias
**Ventajas:**
- El SO destruye los datos físicamente al eliminar el directorio.
- Limpieza automática de residuos en el siguiente arranque.
- Compatible con las tres plataformas (tmpdir() funciona en Windows, macOS y Linux).

**Desventajas:**
- La destrucción no es criptográfica (overwrite seguro). En SSDs con wear leveling, los datos pueden persistir en bloques no sobreescritos hasta que el SSD los recicle. Nivel de riesgo aceptado para MVP.
