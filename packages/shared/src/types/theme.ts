export interface Theme {
  id: string;
  name: string;
  /** Base, usado para auto-fallbacks en modo 'system'. */
  type: 'light' | 'dark';
  builtin: boolean;
  variables: Record<string, string>;
}
