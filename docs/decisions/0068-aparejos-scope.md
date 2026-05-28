# ADR 0068 — Criterio de inclusión como Aparejo

## Contexto

No todas las features de Vela son candidatas a ser Aparejos. El criterio de inclusión debe ser preciso para que la sección no crezca indefinidamente.

## Decisión

Una feature es un Aparejo si y solo si cumple **todos** estos criterios:

1. Tiene un **motor activo de background** (ej: filtrado de red, listener de eventos del SO).
2. Consume recursos de forma continua (CPU, memoria, red).
3. Puede **desactivarse completamente** sin afectar a otras features de Vela.
4. Tiene un **punto de entrada en la URL bar** (icono) que debe desaparecer al desactivarse.

### Aparejos en el MVP (v0.7.0)

| Aparejo | Motor | Icono URL bar |
|---------|-------|---------------|
| Ad Blocker | `ElectronBlocker` en sesión Electron | `ti-shield` |
| Cookie Manager | Listener `session.cookies.on('changed')` | `ti-cookie` |

### NO son Aparejos (herramientas puntuales)

- **Vault de contraseñas**: no tiene motor continuo, es invocado por el usuario.
- **Scripts de usuario**: son ejecutados por el renderer en eventos DOM, no hay motor de background.
- **Bug Snapshot**: acción puntual sin motor.
- **Glance**: es una feature de interacción, no un motor de background.

## Consecuencias

- El Vault, Scripts y otras features puntuales no aparecen en la sección Aparejos.
- Al añadir una nueva feature, se debe evaluar explícitamente si cumple el criterio.
