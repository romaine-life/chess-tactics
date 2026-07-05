// Account-scoped campaign progress: fold this browser's localStorage progress together with the
// signed-in account's stored progress, so clears follow you across devices. Progress is
// MONOTONIC (you only ever gain a cleared level), so the merge is a conflict-free union
// — no reconciliation policy needed. localStorage stays the immediate/offline source of truth
// (campaign/progress.ts); this layer syncs it to the account on load and writes wins through after.
// Fail-soft: signed out or offline ⇒ everything stays local-only and play is never blocked.

import { CAMPAIGN_PROGRESS_EVENT, readProgress, writeProgress, type CampaignProgress } from './progress';
import { getAccountProgress, putAccountProgress } from '../net/accountProgress';

/** Conflict-free union of two progress maps: per level, cleared if either says so. */
export function mergeProgress(a: CampaignProgress, b: CampaignProgress): CampaignProgress {
  const out: CampaignProgress = {};
  for (const src of [a, b]) {
    for (const [levelId, p] of Object.entries(src)) {
      if (!p || typeof p !== 'object') continue;
      const prev = out[levelId];
      out[levelId] = {
        completed: Boolean(prev?.completed) || Boolean(p.completed),
      };
    }
  }
  return out;
}

let started = false;
let accountLinked = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

function schedulePush(): void {
  if (!accountLinked) return;
  if (pushTimer) clearTimeout(pushTimer);
  // Debounce: a burst of wins (or a merge write) coalesces into one PUT.
  pushTimer = setTimeout(() => { void putAccountProgress(readProgress()); }, 800);
}

/**
 * Run once at app start. If signed in, merge the account's progress with this browser's and persist
 * the union to BOTH (this is the guest→account merge), then write subsequent local wins through to
 * the account. Idempotent and fail-soft — a signed-out or offline load just leaves progress local.
 */
export async function initProgressSync(): Promise<void> {
  if (started) return;
  started = true;
  const remote = await getAccountProgress();
  if (remote === null) return; // signed out / unavailable — keep localStorage as the only store
  const merged = mergeProgress(readProgress(), remote);
  // Attach the write-through listener BEFORE the merge write so a genuine change is pushed, but the
  // initial seed PUT below is what actually reconciles the union up front.
  window.addEventListener(CAMPAIGN_PROGRESS_EVENT, schedulePush);
  accountLinked = true;
  writeProgress(merged);
  await putAccountProgress(merged);
}

/** Test seam: reset module state so unit tests can re-run initProgressSync deterministically. */
export function __resetProgressSyncForTests(): void {
  started = false;
  accountLinked = false;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = undefined;
}
