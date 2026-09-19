import { describe, expect, it } from 'vitest';
import { keyAliasLabel, matchesKeyAlias, type KeyAlias } from './keyAlias';

const ctrlPlus: KeyAlias = { key: '+', ctrl: true, alt: false, meta: false };

interface FakeInput {
  type: string;
  key: string;
  control: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

function input(over: Partial<FakeInput>): FakeInput {
  return { type: 'keyDown', key: '+', control: true, shift: false, alt: false, meta: false, ...over };
}

describe('matchesKeyAlias', () => {
  it('casa Ctrl+«+» con o sin Shift (teclado español, EE. UU. y numérico)', () => {
    expect(matchesKeyAlias(ctrlPlus, input({}))).toBe(true);
    // En EE. UU. «+» es Shift+«=»: Electron entrega key '+' con shift=true,
    // y Shift no se compara.
    expect(matchesKeyAlias(ctrlPlus, input({ shift: true }))).toBe(true);
  });

  it('no casa sin Ctrl, con Alt (AltGr) ni con Meta', () => {
    expect(matchesKeyAlias(ctrlPlus, input({ control: false }))).toBe(false);
    expect(matchesKeyAlias(ctrlPlus, input({ alt: true }))).toBe(false);
    expect(matchesKeyAlias(ctrlPlus, input({ meta: true }))).toBe(false);
  });

  it('no casa otro carácter ni el keyUp', () => {
    expect(matchesKeyAlias(ctrlPlus, input({ key: '=' }))).toBe(false);
    expect(matchesKeyAlias(ctrlPlus, input({ type: 'keyUp' }))).toBe(false);
  });

  it('etiqueta legible para depurar', () => {
    expect(keyAliasLabel(ctrlPlus)).toBe('Ctrl+«+»');
  });
});
