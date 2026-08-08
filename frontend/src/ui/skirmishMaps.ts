import type { Campaign, Level } from '../core/level';
import { PLAY_LEVELS_SELECTOR_HREF } from './playHubRoute';

export function skirmishMapLevels(campaigns: Campaign[], levels: Record<string, Level>): Level[] {
  const referenced = new Set(campaigns.flatMap((campaign) => campaign.levels.map((ref) => ref.levelId)));
  return Object.values(levels)
    .filter((level) => !referenced.has(level.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

export function playSkirmishLevelHref(levelId: string, returnTo = PLAY_LEVELS_SELECTOR_HREF): string {
  return `/play?levelId=${encodeURIComponent(levelId)}&mode=skirmish&returnTo=${encodeURIComponent(returnTo)}`;
}
