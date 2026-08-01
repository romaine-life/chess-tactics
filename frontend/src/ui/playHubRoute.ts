import { normalizeRoutePath } from './navigation';

export const PLAY_SELECTOR_ROOT = '/play/select';
export const PLAY_CONTINUE_SELECTOR_HREF = `${PLAY_SELECTOR_ROOT}/continue`;
export const PLAY_SKIRMISH_SELECTOR_HREF = `${PLAY_SELECTOR_ROOT}/skirmish`;
export const PLAY_RUN_SELECTOR_HREF = `${PLAY_SELECTOR_ROOT}/run`;
export const PLAY_RUN_CURRENT_SELECTOR_HREF = `${PLAY_RUN_SELECTOR_HREF}/current`;
export const PLAY_RUN_NEW_SELECTOR_HREF = `${PLAY_RUN_SELECTOR_HREF}/new`;
export const PLAY_LEVELS_SELECTOR_HREF = `${PLAY_SELECTOR_ROOT}/levels`;

export type PlayRunChoice = 'current' | 'new';
export type PlayContinueChoice = 'campaign' | 'skirmish' | 'run' | 'levels';

export type PlayHubSelection =
  | { mode: 'hub' }
  | { mode: 'continue'; choice: PlayContinueChoice | null }
  | { mode: 'skirmish' }
  | { mode: 'run'; choice: PlayRunChoice | null }
  | { mode: 'levels' }
  | { mode: 'campaign'; campaignId: string };

export function playCampaignSelectorHref(campaignId: string): string {
  return `${PLAY_SELECTOR_ROOT}/campaign/${encodeURIComponent(campaignId)}`;
}

export function playContinueSelectorHref(choice: PlayContinueChoice): string {
  return `${PLAY_CONTINUE_SELECTOR_HREF}/${choice}`;
}

export function isPlaySelectorPath(pathname: string): boolean {
  const path = normalizeRoutePath(pathname);
  return path === PLAY_SELECTOR_ROOT || path.startsWith(`${PLAY_SELECTOR_ROOT}/`);
}

export function playHubSelection(pathname: string): PlayHubSelection | null {
  const path = normalizeRoutePath(pathname);
  // The installed bare root is a compatibility entry address. Once resume
  // authority settles, PlayMenu canonicalizes it to Continue and its most recent
  // available activity without ever launching that activity automatically.
  if (path === PLAY_SELECTOR_ROOT) return { mode: 'hub' };
  if (path === PLAY_CONTINUE_SELECTOR_HREF) return { mode: 'continue', choice: null };
  const continueMatch = path.match(/^\/play\/select\/continue\/(campaign|skirmish|run|levels)$/);
  if (continueMatch) return { mode: 'continue', choice: continueMatch[1] as PlayContinueChoice };
  if (path === PLAY_SKIRMISH_SELECTOR_HREF) return { mode: 'skirmish' };
  if (path === PLAY_RUN_SELECTOR_HREF) return { mode: 'run', choice: null };
  if (path === PLAY_RUN_CURRENT_SELECTOR_HREF) return { mode: 'run', choice: 'current' };
  if (path === PLAY_RUN_NEW_SELECTOR_HREF) return { mode: 'run', choice: 'new' };
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
