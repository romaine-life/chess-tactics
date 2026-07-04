// The player's chosen battle clock for a FREE / random skirmish (single-player, no
// authored level). A free skirmish is timed by default — DEFAULT_TIME_CONTROL (5:00) —
// and this preference, set in the HUD Controls tab and applied by "New skirmish", lets
// the player pick a different control or turn the clock off entirely. Persisted to
// localStorage so the choice survives a reload and seeds the next fresh skirmish.
//
// Levels (campaign play, editor Test Play, ?board=/?map= links) author their OWN clock
// and never read this — only the no-level free skirmish does.

import type { TimeControl } from '../core/level';
import { DEFAULT_TIME_CONTROL } from '../core/clock';

const KEY = 'chess-tactics.skirmish-clock-v1';

/** `null` = the player turned the clock OFF (untimed skirmish); a TimeControl = timed. */
export type SkirmishClockPref = TimeControl | null;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
}

/** The saved preference, or the 5:00 default when never set / unreadable / corrupt. */
export function loadSkirmishClockPref(): SkirmishClockPref {
  const store = storage();
  if (!store) return DEFAULT_TIME_CONTROL;
  let raw: string | null;
  try { raw = store.getItem(KEY); } catch { return DEFAULT_TIME_CONTROL; }
  if (raw === null) return DEFAULT_TIME_CONTROL; // never chosen → the default
  if (raw === 'off') return null; // explicitly untimed
  try {
    const parsed = JSON.parse(raw) as Partial<TimeControl> | null;
    if (parsed && typeof parsed.initialSeconds === 'number' && typeof parsed.incrementSeconds === 'number') {
      return { initialSeconds: parsed.initialSeconds, incrementSeconds: parsed.incrementSeconds };
    }
  } catch { /* corrupt blob → fall through to the default */ }
  return DEFAULT_TIME_CONTROL;
}

/** Persist the chosen control (or `null` for untimed). Best-effort — a blocked/full
 *  store just means the in-memory choice applies for this session only. */
export function saveSkirmishClockPref(pref: SkirmishClockPref): void {
  const store = storage();
  if (!store) return;
  try { store.setItem(KEY, pref === null ? 'off' : JSON.stringify(pref)); } catch { /* best-effort */ }
}
