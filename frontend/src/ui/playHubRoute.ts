import { normalizeRoutePath } from './navigation';

export const PLAY_SELECTOR_ROOT = '/play/select';
export const PLAY_SKIRMISH_SELECTOR_HREF = `${PLAY_SELECTOR_ROOT}/skirmish`;
export const PLAY_LEVELS_SELECTOR_HREF = `${PLAY_SELECTOR_ROOT}/levels`;

export type PlayHubSelection =
  | { mode: 'skirmish' }
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
  if (path === PLAY_SKIRMISH_SELECTOR_HREF) return { mode: 'skirmish' };
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
