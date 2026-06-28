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
import { loadOfficialCampaigns, loadWorkspace } from '../net/campaignWorkspace';

let hydrated = false;
let inFlight: Promise<void> | null = null;

export function ensureCampaignsHydrated(): Promise<void> {
  const state = useCampaigns.getState();
  // If the editor left the store in official-AUTHORING mode (whole-store editable
  // official drafts), the play screen must NOT reuse it — rebuild the player view.
  // Otherwise: already populated (a fresh page load starts empty; the editor may have
  // hydrated it this SPA session) — reuse it rather than clobbering unsaved edits.
  if (!state.officialMode && (hydrated || state.campaigns.length)) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    // 1. Officials — always, for everyone. loadOfficialCampaigns never throws (it
    //    falls back to the committed static file on any backend failure).
    useCampaigns.getState().mergeOfficial(await loadOfficialCampaigns());
    // 2. The signed-in user's own campaigns, merged on top. 401 / unreachable ⇒ skip,
    //    leaving officials in place.
    try {
      useCampaigns.getState().mergeUser(await loadWorkspace());
    } catch {
      /* not signed in, or no /api proxy (dev) ⇒ officials only */
    }
    hydrated = true;
    inFlight = null;
  })();
  return inFlight;
}
