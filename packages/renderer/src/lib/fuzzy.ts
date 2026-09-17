// Fuzzy matching del Tab Switcher y la Command Palette (ADR 0042). La
// implementación vive en vela-kit (ADR 0106); la interfaz pública
// `fuzzyMatch`/`fuzzyFilter`/`highlightMatch` no cambia.
export { fuzzyMatch, fuzzyFilter, highlightMatch } from 'vela-kit/ui';
export type { FuzzyMatch } from 'vela-kit/ui';
