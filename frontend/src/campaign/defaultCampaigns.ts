// Seed campaigns the Campaign (play) screen lists by default, so the screen has
// something to pick before an authored scenario lands. This is a placeholder to
// be replaced/extended when the real campaign scenario is provided. Local for now;
// a remote source (the campaign workspace) can be merged in behind loadCampaigns().

import type { Campaign } from '../core/level';
import { CAMPAIGN_FORMAT_VERSION } from '../core/level';

export const DEFAULT_CAMPAIGNS: Campaign[] = [
  {
    formatVersion: CAMPAIGN_FORMAT_VERSION,
    id: 'campaign-one',
    name: 'Campaign One',
    difficulty: 'normal',
    chapters: 1,
    levels: [],
  },
];

// The campaigns the play screen offers. Returns the bundled defaults today; swap
// the body to fetch/merge a remote list when the authored scenario is wired up.
export function loadCampaigns(): Campaign[] {
  return DEFAULT_CAMPAIGNS;
}
