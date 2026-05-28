export interface VaultEntrySummary {
  id: string;
  domain: string;
  loginUrl: string | null;
  username: string;
  folder: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

export interface VaultEntry extends VaultEntrySummary {
  password: string;
  notes: string | null;
}

export interface VaultCredentialsPending {
  windowId: number;
  tabId: string;
  domain: string;
  loginUrl: string;
  username: string;
  password: string;
  hasExisting: boolean;
  existingId: string | null;
}
