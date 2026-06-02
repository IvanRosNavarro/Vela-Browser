export const BLINDED_PROFILE_MARKER = '__blinded__';

export function isBlindedProfile(p: { icon: string | null }): boolean {
  return p.icon === BLINDED_PROFILE_MARKER;
}
