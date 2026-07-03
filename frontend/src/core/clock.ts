// Battle-clock helpers shared by the skirmish title bar (live countdown readout)
// and the Level Editor's RULES panel (time-control authoring). Pure — the actual
// countdown (deadline, ticker, flag fall) lives in game/store.ts.

import type { TimeControl } from './level';

/** The editor's default when the clock is toggled ON — 5:00, no increment. */
export const DEFAULT_TIME_CONTROL: TimeControl = { initialSeconds: 300, incrementSeconds: 0 };

// The authoring ladders: standard chess starting banks (bullet → classical-ish) and
// Fischer increments. Steppers walk these rungs rather than free-typing seconds, so
// every authored control is a recognizable one.
export const CLOCK_INITIAL_SECONDS: readonly number[] = [30, 60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600];
export const CLOCK_INCREMENT_SECONDS: readonly number[] = [0, 1, 2, 3, 5, 10, 15, 30];

/** One stepper click along a ladder: snap the current value to its nearest rung
 * (hand-edited levels may sit between rungs), then move one rung, clamped at the
 * ends. `dir` is +1 / -1. */
export function stepLadder(ladder: readonly number[], value: number, dir: 1 | -1): number {
  let nearest = 0;
  for (let i = 1; i < ladder.length; i += 1) {
    if (Math.abs(ladder[i] - value) < Math.abs(ladder[nearest] - value)) nearest = i;
  }
  return ladder[Math.min(ladder.length - 1, Math.max(0, nearest + dir))];
}

/** Live-readout format: m:ss above ten seconds, 0:ss.t below — tenths appear exactly
 * when they start mattering, like an OTB digital clock. Remaining time rounds UP
 * (59.2s reads 1:00), matching how physical clocks display a started second;
 * 0 renders as the flag-fall 0:00. */
export function formatClockMs(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped === 0) return '0:00';
  if (clamped < 10_000) {
    const tenths = Math.ceil(clamped / 100);
    return `0:${String(Math.floor(tenths / 10)).padStart(2, '0')}.${tenths % 10}`;
  }
  const totalSeconds = Math.ceil(clamped / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

/** Whole-second m:ss for authored values ("5:00", "0:30", "60:00") — the editor's
 * stepper readout. */
export function formatClockSeconds(seconds: number): string {
  const clamped = Math.max(0, Math.round(seconds));
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, '0')}`;
}
