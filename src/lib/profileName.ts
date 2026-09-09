/** Max length for individual profile names (input-enforced). */
export const PROFILE_NAME_MAX = 20;
/** Max length for entity profile names (double the individual limit). */
export const ENTITY_PROFILE_NAME_MAX = PROFILE_NAME_MAX * 2;

export function clipProfileName(value: string, max = PROFILE_NAME_MAX): string {
  return Array.from(value).slice(0, max).join("");
}

export function persistProfileName(value: string, max = PROFILE_NAME_MAX): string {
  return clipProfileName(value, max).trim();
}

export function persistOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
