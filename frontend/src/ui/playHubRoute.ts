import { normalizeRoutePath } from './navigation';

export const PLAY_SELECTOR_ROOT = '/play/select';
export const PLAY_SKIRMISH_SELECTOR_HREF = `${PLAY_SELECTOR_ROOT}/skirmish`;
export const PLAY_RUN_SELECTOR_HREF = `${PLAY_SELECTOR_ROOT}/run`;
export const PLAY_LEVELS_SELECTOR_HREF = `${PLAY_SELECTOR_ROOT}/levels`;

export type PlayHubSelection =
  | { mode: 'hub' }
  | { mode: 'skirmish' }
  | { mode: 'run' }
  | { mode: 'levels' }
  | { mode: 'campaign'; campaignId: string };

export function playCampaignSelectorHref(campaignId: string): string {
  return `${PLAY_SELECTOR_ROOT}/campaign/${encodeURIComponent(campaignId)}`;
}

export function isPlaySelectorPath(pathname: string): boolean {
  const path = normalizeRoutePath(pathname);
  return path === PLAY_SELECTOR_ROOT || path.startsWith(`${PLAY_SELECTOR_ROOT}/`);
}

export function playHubSelection(pathname: string): PlayHubSelection | null {
  const path = normalizeRoutePath(pathname);
  // The bare root is the installed Play landing: it resumes the one in-progress
  // activity when there is one and otherwise shows the hub with no mode selected.
  if (path === PLAY_SELECTOR_ROOT) return { mode: 'hub' };
  if (path === PLAY_SKIRMISH_SELECTOR_HREF) return { mode: 'skirmish' };
  if (path === PLAY_RUN_SELECTOR_HREF) return { mode: 'run' };
  if (path === PLAY_LEVELS_SELECTOR_HREF) return { mode: 'levels' };
  const campaignMatch = path.match(/^\/play\/select\/campaign\/([^/]+)$/);
  if (campaignMatch) {
    try {
      return { mode: 'campaign', campaignId: decodeURIComponent(campaignMatch[1]) };
    } catch {
      return null;
    }
  }
  return null;
}
