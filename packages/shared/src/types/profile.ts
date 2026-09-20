export interface Profile {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  position: string;
  partitionId: string;
  hasMasterPassword: boolean;
  passwordHint: string | null;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
  lastUsedAt: number | null;
  /** Perfil de la cuenta de sync con el que se empareja, si está vinculado. */
  remoteProfileId: string | null;
  /** Vinculado pero en pausa: no conecta ni envía nada mientras esté a true. */
  syncPaused: boolean;
}

export interface ProfileSession {
  profileId: string;
  unlockedAt: number;
}
