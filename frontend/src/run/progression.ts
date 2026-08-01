import { INSTALLED_ATARAXIA_MAX_TIER, type AtaraxiaTier } from './model';

const RUN_PROGRESSION_KEY = 'chess-tactics:run-progression:v1';
export const RUN_PROGRESSION_EVENT = 'chess-tactics:run-progression';

export interface RunProgression {
  formatVersion: 1;
  highestCompletedAtaraxiaTier: number;
}

export const EMPTY_RUN_PROGRESSION: RunProgression = Object.freeze({
  formatVersion: 1,
  highestCompletedAtaraxiaTier: -1,
});

export function normalizeRunProgression(value: unknown): RunProgression {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...EMPTY_RUN_PROGRESSION };
  const tier = Number((value as Partial<RunProgression>).highestCompletedAtaraxiaTier);
  return {
    formatVersion: 1,
    highestCompletedAtaraxiaTier: Number.isSafeInteger(tier)
      ? Math.max(-1, Math.min(100, tier))
      : -1,
  };
}

export function mergeRunProgression(left: RunProgression, right: RunProgression): RunProgression {
  return {
    formatVersion: 1,
    highestCompletedAtaraxiaTier: Math.max(
      normalizeRunProgression(left).highestCompletedAtaraxiaTier,
      normalizeRunProgression(right).highestCompletedAtaraxiaTier,
    ),
  };
}

export function readRunProgression(): RunProgression {
  try {
    return normalizeRunProgression(JSON.parse(localStorage.getItem(RUN_PROGRESSION_KEY) ?? 'null'));
  } catch {
    return { ...EMPTY_RUN_PROGRESSION };
  }
}

export function writeRunProgression(progression: RunProgression): void {
  const normalized = normalizeRunProgression(progression);
  try { localStorage.setItem(RUN_PROGRESSION_KEY, JSON.stringify(normalized)); } catch { /* keep play available */ }
  try { window.dispatchEvent(new CustomEvent(RUN_PROGRESSION_EVENT)); } catch { /* non-browser tests */ }
}

export function recordAtaraxiaCompletion(tier: AtaraxiaTier): RunProgression {
  const next = mergeRunProgression(readRunProgression(), {
    formatVersion: 1,
    highestCompletedAtaraxiaTier: tier,
  });
  writeRunProgression(next);
  return next;
}

export function highestUnlockedAtaraxiaTier(progression: RunProgression): AtaraxiaTier {
  const unlocked = Math.max(0, normalizeRunProgression(progression).highestCompletedAtaraxiaTier + 1);
  return Math.min(INSTALLED_ATARAXIA_MAX_TIER, unlocked) as AtaraxiaTier;
}
