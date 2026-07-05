// Per-player campaign progress: which levels are cleared, kept in localStorage
// (the play loop's source of truth). A custom event lets open screens refresh live
// when a battle is won.

import type { Campaign, CampaignLevelRef } from '../core/level';

const KEY = 'chess-tactics-campaign-progress-v1';
export const CAMPAIGN_PROGRESS_EVENT = 'chess-tactics:campaign-progress';

export interface LevelProgress {
  completed: boolean;
}

export type CampaignProgress = Record<string, LevelProgress>;

function normalizedProgress(value: unknown): CampaignProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: CampaignProgress = {};
  for (const [levelId, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    out[levelId] = { completed: Boolean((entry as { completed?: unknown }).completed) };
  }
  return out;
}

export function readProgress(): CampaignProgress {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return normalizedProgress(parsed);
  } catch {
    return {};
  }
}

/** Overwrite the whole progress map and notify open screens. Used by the account sync to persist a
 *  merged (local + account) view; recordLevelWin is the per-level path. */
export function writeProgress(progress: CampaignProgress): void {
  try { localStorage.setItem(KEY, JSON.stringify(normalizedProgress(progress))); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(CAMPAIGN_PROGRESS_EVENT)); } catch { /* ignore */ }
}

/** Record a cleared level and notify open screens (which the account sync also listens to,
 *  writing the win through to the signed-in account). */
export function recordLevelWin(levelId: string): void {
  const progress = readProgress();
  progress[levelId] = { completed: true };
  writeProgress(progress);
}

/** A campaign's levels in play order. */
export function orderedLevels(campaign: Campaign): CampaignLevelRef[] {
  return [...campaign.levels].sort((a, b) => a.ordinal - b.ordinal);
}

/** Campaign levels are always directly playable; progress only drives cleared display. */
export function isLevelUnlocked(_levels: CampaignLevelRef[], _index: number, _progress: CampaignProgress): boolean {
  return true;
}

/** The next level after `levelId` in play order, or null at the end. */
export function nextLevelRef(levels: CampaignLevelRef[], levelId: string): CampaignLevelRef | null {
  const i = levels.findIndex((ref) => ref.levelId === levelId);
  return i >= 0 && i + 1 < levels.length ? levels[i + 1] : null;
}
