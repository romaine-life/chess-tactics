import type { Level } from '../core/level';
import { PLAY_SKIRMISH_SELECTOR_HREF } from './playHubRoute';

export const SKIRMISH_PROFILE_ID_PREFIX = 'skirmish-profile-';

export function isSkirmishProfileLevel(levelOrId: Level | string | undefined): boolean {
  const id = typeof levelOrId === 'string' ? levelOrId : levelOrId?.id;
  return Boolean(id?.startsWith(SKIRMISH_PROFILE_ID_PREFIX));
}

export function skirmishProfileLevels(levels: Record<string, Level>): Level[] {
  return Object.values(levels)
    .filter(isSkirmishProfileLevel)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

export function editSkirmishProfileHref(levelId: string, returnTo = PLAY_SKIRMISH_SELECTOR_HREF): string {
  return `/editor/level?levelId=${encodeURIComponent(levelId)}&returnTo=${encodeURIComponent(returnTo)}`;
}
