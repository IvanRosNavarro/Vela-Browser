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
}

export interface ProfileSession {
  profileId: string;
  unlockedAt: number;
}
