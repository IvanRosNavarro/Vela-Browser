# ADR-0023: Auto-descartado avanzado con whitelist multinivel

## Estado
Aceptado — implementado en Sub-fase 4B.

## Contexto

El campo `discarded` y la mecánica de descarte manual ya existían desde Fase 1. La
Sub-fase 4B añade la política temporal automática con un sistema de whitelist flexible
para que el usuario pueda excluir tabs importantes del descarte sin desactivar la
funcionalidad globalmente.

## Decisión

`DiscardManager` (`packages/main/src/discard/DiscardManager.ts`) corre un job cada
60 segundos que evalúa todas las tabs no-activas de todos los perfiles abiertos.

### Configuración (settings en `profile.db`)

| Clave | Tipo | Default | Significado |
|-------|------|---------|-------------|
| `tabs:discard-enabled` | bool | true | Activa/desactiva el auto-descarte |
| `tabs:discard-timeout` | number (minutos) | 60 | Tiempo de inactividad para descartar |
| `tabs:discard-audio` | bool | true | No descartar si hay audio activo |
| `tabs:discard-forms` | bool | true | No descartar si hay formulario con datos |
| `tabs:discard-pinned` | bool | true | No descartar tabs pinneadas |
| `tabs:discard-whitelist` | string (newline-separated) | '' | Dominios globales excluidos |
| `tabs:discard-permanent-whitelist` | string[] | [] | Tab IDs excluidas permanentemente |
| `tabs:discard-workspace-whitelists` | Record<wsId, bool> | {} | Workspaces excluidos |
| `tabs:discard-folder-whitelists` | Record<folderId, bool> | {} | Carpetas excluidas |

### Orden de evaluación (fail-fast)

Para cada tab candidata (kind=tab, no descartada, con WCV activo):

1. **Workspace en whitelist** → skip workspace completo.
2. **Timeout no alcanzado** (`lastActiveAt >= now - timeoutMs`) → skip tab.
3. **Tab pinneada** + `noPinned=true` → skip.
4. **Dominio en whitelist global** (hostname match exacto o subdomain) → skip.
5. **Tab ID en whitelist permanente** → skip.
6. **Tab en carpeta en whitelist** (`node.parentId` en `folderWhitelists`) → skip.
7. **Audio activo** (`TabManager.isTabCurrentlyAudible`) + `noAudio=true` → skip.
8. **Formulario con datos** (`TabManager.getPageFeaturesForTab` incluye `'form'`) + `noForm=true` → skip.
9. → **Descartar** (`tabManager.discardTab`).

### Excepciones automáticas

`isTabCurrentlyAudible` y `getPageFeaturesForTab` se consultan en runtime en el
`TabManager`; no requieren polling. El `DiscardManager` no evalúa tabs sin WCV activo
(`getWindowIdForTab === null`), evitando intentar descartar tabs ya descartadas.

### Menú contextual (acciones de descarte)

Acciones accesibles desde menú de tab, carpeta y workspace:
- **Suspender tab** / **Reactivar tab**: toggle directo `discard:tab`.
- **Suspender todas de la carpeta**: `discard:folder`.
- **Suspender todas del workspace**: `discard:workspace`.
- **Mantener siempre activa**: toggle `permanent-whitelist` por tab ID.
- **Whitelist workspace/carpeta**: toggle en los respectivos records de settings.

### Indicador visual

Las tabs descartadas muestran el favicon en escala de grises (filtro CSS `grayscale(1)`
aplicado en `TabRow.tsx` cuando `node.discarded === true`).

## Consecuencias

- El job corre cada 60 s con `setInterval`. Si la máquina está suspendida, el primer
  tick tras despertar puede descartar muchas tabs a la vez. Aceptable para MVP.
- `DiscardManager.start()` se llama al crear cada ventana de perfil;
  `stop()` al cerrarla. Múltiples ventanas del mismo perfil comparten `DiscardManager`
  (cada perfil tiene una instancia).
- `getPageFeaturesForTab('form')` depende de que el preload script inyecte un listener
  de `input` para detectar formularios con datos no enviados. Si el preload no carga
  (tab interna), la comprobación devuelve false y la tab puede descartarse. Seguro.
