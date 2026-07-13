export const DEFAULT_LEVEL_NAME = 'Untitled level';
export const LEVEL_NAME_MAX = 80;

/** One persisted-name policy shared by every Level Editor naming surface. */
export function normalizeLevelName(name: string): string {
  return name.trim().slice(0, LEVEL_NAME_MAX) || DEFAULT_LEVEL_NAME;
}
