import path from 'node:path';
import { app } from 'electron';

export function getProfilesRoot(): string {
  return path.join(app.getPath('userData'), 'profiles');
}

export function getProfileDir(profileId: string): string {
  return path.join(getProfilesRoot(), profileId);
}

export function getProfileDbPath(profileId: string): string {
  return path.join(getProfileDir(profileId), 'profile.db');
}

export function getProfileExtensionsDir(profileId: string): string {
  return path.join(getProfileDir(profileId), 'extensions');
}

export function getProfileLogsDir(profileId: string): string {
  return path.join(getProfileDir(profileId), 'logs');
}
