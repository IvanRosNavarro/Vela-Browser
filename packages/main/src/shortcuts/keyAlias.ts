/**
 * Atajos que casan por el carácter de la tecla (`input.key`) en vez de por la
 * tecla física (`input.code`), que es lo que usa la `ShortcutTable`.
 *
 * Hacen falta para los atajos cuyo carácter cambia de sitio según la
 * distribución: en el teclado español «+» y «-» son teclas propias (códigos
 * `BracketRight` y `Slash`) y en el estadounidense «+» es Shift+«=». También
 * cubren el teclado numérico, que produce los mismos caracteres.
 *
 * Shift se ignora a propósito: según la distribución, el carácter pide Shift
 * o no. Alt sí cuenta, así que AltGr (Ctrl+Alt en Windows) no dispara nada.
 */
export interface KeyAlias {
  key: string;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}

/** Subconjunto de `Electron.Input` que se consulta. */
export interface KeyAliasInput {
  type: string;
  key: string;
  control: boolean;
  alt: boolean;
  meta: boolean;
}

export function matchesKeyAlias(alias: KeyAlias, input: KeyAliasInput): boolean {
  return (
    input.type === 'keyDown' &&
    input.key === alias.key &&
    input.control === alias.ctrl &&
    input.alt === alias.alt &&
    input.meta === alias.meta
  );
}

export function keyAliasLabel(alias: KeyAlias): string {
  const mods: string[] = [];
  if (alias.ctrl) mods.push('Ctrl');
  if (alias.alt) mods.push('Alt');
  if (alias.meta) mods.push('Meta');
  mods.push(`«${alias.key}»`);
  return mods.join('+');
}
