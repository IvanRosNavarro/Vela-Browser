export interface ExtensionAction {
  extensionId: string;
  title: string;
  iconDataUrl: string | null;
  popupUrl: string | null;
  badgeText: string;
  badgeBackgroundColor: string | null;
  enabled: boolean;
}

export interface InstalledExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  iconUrl: string | null;
  enabled: boolean;
  hasPopup: boolean;
  hasOptionsPage: boolean;
  homepageUrl: string | null;
  permissions: string[];
  hostPermissions: string[];
  manifestVersion: 2 | 3;
  installPath: string;
  /** true para extensiones pre-instaladas con Vela */
  bundled?: boolean;
  /** false si el usuario ha "despinado" la extensión de la barra de título */
  pinnedToBar?: boolean;
  /** true si el usuario permite que la extensión corra en tabs blindadas */
  allowedInSecureTabs?: boolean;
}
