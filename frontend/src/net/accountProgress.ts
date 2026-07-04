// Client for account-scoped campaign progress (backend: campaign_progress, per-owner). The play
// loop keeps localStorage as its immediate/offline source of truth (campaign/progress.ts); this is
// the durable cross-device copy that a monotonic merge folds guest progress into on sign-in.
// Both endpoints require sign-in; callers treat any failure as "offline / not signed in" and keep
// playing off localStorage — progress persistence must never block play.

import type { CampaignProgress } from '../campaign/progress';

/** The signed-in user's stored progress, or null when signed out / unavailable (never throws). */
export async function getAccountProgress(): Promise<CampaignProgress | null> {
  try {
    const res = await fetch('/api/campaign-progress', { credentials: 'include', cache: 'no-cache' });
    if (!res.ok) return null;
    const body = (await res.json()) as { progress?: CampaignProgress };
    return body.progress && typeof body.progress === 'object' ? body.progress : {};
  } catch {
    return null;
  }
}

/** Write the merged progress to the account. Best-effort — returns false on any failure. */
export async function putAccountProgress(progress: CampaignProgress): Promise<boolean> {
  try {
    const res = await fetch('/api/campaign-progress', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ progress }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
