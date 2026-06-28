// Hydrate the shared campaign workspace store (useCampaigns) the same way the
// Campaign Editor does, so the Campaign (play) screen lists exactly the campaigns
// the editor shows: the server workspace when it's reachable and non-empty,
// otherwise the bundled demo workspace. Both screens read the one store, so the two
// lists can't drift.

import { useCampaigns } from './store';
import { createDemoWorkspace } from './demoWorkspace';
import { loadWorkspace } from '../net/campaignWorkspace';

let inFlight: Promise<void> | null = null;

export function ensureCampaignsHydrated(): Promise<void> {
  // Already populated (e.g. the editor hydrated it earlier this session) — reuse it.
  if (useCampaigns.getState().campaigns.length) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const ws = await loadWorkspace();
      // Server reachable and non-empty wins; reachable-but-empty stays empty, as
      // the editor leaves it.
      if (ws.campaigns.length) useCampaigns.getState().hydrate(ws);
    } catch {
      // No reachable workspace (dev has no /api proxy; or unauthorized) → fall back
      // to the same demo the editor seeds.
      if (useCampaigns.getState().campaigns.length === 0) {
        useCampaigns.getState().hydrate(createDemoWorkspace());
      }
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
