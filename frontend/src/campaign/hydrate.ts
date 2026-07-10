// Hydrate the shared campaign workspace store (useCampaigns) the way the play screen
// and editor both consume it: OFFICIAL campaigns are global game content and load for
// EVERYONE (signed in or not, even with the DB down); the signed-in user's OWN
// campaigns are then merged on top. Both screens read the one store, so the two lists
// can't drift.
//
// This replaces the old "first non-empty source wins, else demo" logic, whose
// signed-in-but-empty case showed nothing (a 200-empty workspace failed the
// non-empty check, and because the fetch succeeded the demo fallback never fired) —
// the prod "no campaigns" bug. See ADR-0038.

import { useCampaigns } from './store';
import { loadOfficialCampaignsResult, loadWorkspace } from '../net/campaignWorkspace';
import { isUnauthorized } from '../net/auth';

export interface CampaignHydrationResult {
  officialAvailable: boolean;
  userWorkspace: 'loaded' | 'signed-out' | 'unavailable';
}

let officialAvailable = false;
let userWorkspace: CampaignHydrationResult['userWorkspace'] = 'unavailable';
let inFlight: Promise<CampaignHydrationResult> | null = null;

export function ensureCampaignsHydrated(): Promise<CampaignHydrationResult> {
  // Join the active load before inspecting partially-merged store state. The official slice is
  // merged first, so checking it before inFlight would let a second caller return while the user
  // workspace was still pending — exactly the unsafe window a standalone Save must avoid.
  if (inFlight) return inFlight;
  const userReady = userWorkspace === 'loaded' || userWorkspace === 'signed-out';
  // Once both slices are settled, reuse the store rather than clobbering unsaved edits. If just
  // one source was unavailable, later callers retry ONLY that source; a transient official
  // outage must not trigger another private-workspace merge over in-memory authoring changes.
  if (officialAvailable && userReady) return Promise.resolve({ officialAvailable, userWorkspace });
  inFlight = (async () => {
    try {
      if (!officialAvailable) {
        // Officials are public. Merge only a successful response; on a transient failure retain
        // any in-memory official edits and let the next caller retry this slice alone.
        const official = await loadOfficialCampaignsResult();
        if (official.available) useCampaigns.getState().mergeOfficial(official.workspace);
        officialAvailable = official.available;
      }
      if (!userReady) {
        // A 401 is a complete, safe anonymous result. Network/5xx failures are different: the
        // private workspace is unknown, so callers must keep Save locked and retry later rather
        // than PUT a partial store over it.
        try {
          useCampaigns.getState().mergeUser(await loadWorkspace());
          userWorkspace = 'loaded';
        } catch (error) {
          userWorkspace = isUnauthorized(error) ? 'signed-out' : 'unavailable';
        }
      }
      return { officialAvailable, userWorkspace };
    } finally {
      // Never cache a rejected promise: if a merge ever throws, the next visit must
      // retry instead of every future caller inheriting the poisoned inFlight.
      inFlight = null;
    }
  })();
  return inFlight;
}
