# ADR 0013 — Arquitectura del sistema de temas: variables CSS, builtin vs custom, validación de CSS custom

## Estado
Aceptado — Sub-fase 4A (mayo 2026).

## Contexto

Vela necesita un sistema de temas que:

1. Permita aplicar cambios de aspecto en vivo sin recargar la app.
2. Ofrezca un conjunto de temas predefinidos (builtin) mantenidos por
   el proyecto.
3. Permita al usuario crear, editar, importar y exportar temas
   propios.
4. Admita CSS custom por perfil para ajustes finos no cubiertos por
   las variables.
5. Sea seguro: el CSS custom no debe poder cargar recursos externos,
   exfiltrar datos ni atacar la UI de la shell.

## Decisión

### 1. Variables CSS como API de temas

Todos los colores, radios, sombras y tipografías de la shell se
expresan como **variables CSS** en `:root` (o en el elemento raíz
de la shell). Un tema es un objeto `Record<string, string>` que
mapea cada variable a su valor.

```css
/* Ejemplo de variables públicas */
--vela-bg-base: #1e1e2e;
--vela-bg-surface: #181825;
--vela-fg-primary: #cdd6f4;
--vela-accent: #89b4fa;
--vela-titlebar-bg: #11111b;
```

El renderer aplica un tema llamando a:

```ts
applyTheme(vars: Record<string, string>) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}
```

Este mecanismo es **instantáneo y sin reload**, y funciona tanto
para temas builtin como para temas custom.

### 2. Temas builtin

Los 8 temas iniciales se distribuyen como objetos TypeScript en
`packages/renderer/src/styles/themes/`. Cada fichero exporta un
`BuiltinTheme` con `id`, `name`, `isDark` y `vars`.

Los temas builtin no se almacenan en BD: están en el bundle y se
cargan en memoria al arrancar. El setting `theme:active` guarda el
`id` del tema (builtin o custom).

### 3. Temas custom

Un tema custom añade `isCustom: true` y un `uuid` como `id`. Se
persiste serializado en `settings_profile` bajo la clave
`theme:custom:{uuid}`. El esquema de exportación es
`.vela-theme.json`:

```json
{
  "velaThemeVersion": 1,
  "name": "Mi Dracula",
  "isDark": true,
  "vars": {
    "--vela-bg-base": "#282a36",
    "...": "..."
  }
}
```

El importador valida el JSON con zod antes de persistir. Las claves
de `vars` que no empiecen por `--vela-` son ignoradas (no se
inyectan variables externas).

### 4. CSS custom por perfil

El usuario puede introducir CSS adicional en el editor de
`vela://settings#aspecto`. Este CSS se persiste en
`settings_profile` bajo la clave `theme:custom-css` y se inyecta
en el documento de la shell mediante un `<style id="vela-custom-css">`
actualizado en caliente.

#### Validación de seguridad

El CSS custom pasa por un validador antes de persistir o inyectar:

- **`url()` bloqueado**: cualquier declaración que contenga `url(`
  con una URL que no sea `data:` es rechazada con error descriptivo.
  Esto previene carga de recursos externos, tracking de red y
  exfiltración via CSS `background-image` con URL dinámica.
- **`@import` bloqueado**: no se permite importar hojas externas.
- **`-webkit-app-region`**: bloqueado para evitar que el CSS custom
  rompa las regiones de arrastre del titlebar.
- El resto de propiedades CSS válidas están permitidas: el usuario
  puede re-colorear, reposicionar o animar cualquier selector de la
  shell.

El validador es una función pura en
`packages/renderer/src/styles/customCssValidator.ts` y se ejecuta
tanto en el renderer (feedback inmediato) como en el main (antes de
persistir, para no confiar solo en el cliente).

#### Selectores estables vs internos

Ver sección "Custom CSS" de `CLAUDE.md` para la lista de selectores
públicos que se comprometen a ser estables entre versiones.

### 5. Persistencia

| Dato | Dónde | Clave |
|---|---|---|
| ID del tema activo | `settings_profile` | `theme:active` |
| Definición de un tema custom | `settings_profile` | `theme:custom:{uuid}` |
| CSS custom del perfil | `settings_profile` | `theme:custom-css` |

Scope: por perfil. No se mezcla con `vela.db` (global).

## Consecuencias

- Añadir un nuevo tema builtin es crear un fichero en
  `packages/renderer/src/styles/themes/` y exportarlo desde el
  barrel. No requiere cambio de BD ni de IPC.
- Los temas custom sobreviven a actualizaciones de la app porque
  están en `profile.db`, no en el bundle.
- La validación dual (renderer + main) garantiza que el CSS que llega
  a BD siempre ha sido validado, incluso si el preload fuese
  comprometido.
- El validador puede ampliarse en el futuro (p.ej. bloquear
  `position: fixed` en selectores fuera de `#vela-custom-css`) sin
  cambiar la arquitectura.
