// Board solver — honest per-piece values by ablation against perfect play (ADR-0068 §1).
//
// Removing every piece of a slot from the root and re-solving yields the ablated root value;
// the DIFFERENCE from the unablated baseline is that piece's honest, board-specific worth in
// OUTCOME + win-distance terms, measured against perfect play (not heuristic scores).
//
// Cost + budget (Risk 8): ablation re-solves once per removable non-king slot — N× the base
// solve — so it is POST-SOLVE, best-effort, and budget-aware: it stops and sets `partial:true`
// when the remaining budget is exhausted. Each ablated board is rebuilt FROM THE LEVEL and run
// through toSolverInput/enumerateReachable/retrogradeSolve afresh (a fresh slot map) — never by
// poking the base SolverInput, which would desync slot indices.

import type { Level, LevelUnit } from '../level';
import type { Value, SolveBounds, PieceValueReport, PieceValueEntry } from './types';
import type { PieceType, Side } from '../types';
import { toSolverInput } from './input';
import { enumerateReachable } from './encode';
import { retrogradeSolve } from './retrograde';

export interface AblationResult {
  baseline: Value;
  partial: boolean;
  perPiece: Array<{
    slotIndex: number;
    side: Side;
    type: PieceType;
    /** Root value with this piece removed at the start. */
    removedValue: Value;
    deltaOutcome: 'flip' | 'same';
    /** Change in distance-to-mate (plies) when both share an outcome; undefined on a flip. */
    deltaDistance?: number;
  }>;
}

/** Solve a level to its root Value via a fresh enumerate + retrograde pass. Returns null if
 * the board is too big to enumerate under `cap` (truncated) — such a slot is skipped. */
function solveRootValue(level: Level, cap: number): Value | null {
  const input = toSolverInput(level, 0);
  const space = enumerateReachable(input, cap);
  if (space.truncated) return null;
  return retrogradeSolve(space, input).rootValue;
}

/** A Level with the unit at (x,y,side,type) removed from layers.units. Pure (deep-ish copy of
 * the units layer only — everything else is shared, which is safe since we never mutate it). */
function levelWithoutUnit(level: Level, unit: { x: number; y: number; side: Side; type: PieceType }): Level {
  let removed = false;
  const units: LevelUnit[] = [];
  for (const u of level.layers.units) {
    if (!removed && u.x === unit.x && u.y === unit.y && u.side === unit.side && u.type === unit.type) {
      removed = true;
      continue;
    }
    units.push(u);
  }
  return { ...level, layers: { ...level.layers, units } };
}

/**
 * Compute per-piece ablation values. Budget-aware: each re-solve consumes wall-clock, and we
 * stop (partial:true) once the remaining budget is spent. Kings are never removed (a kingless
 * side changes the objective's terminal structure, not a piece's marginal worth).
 */
export function pieceValuesByAblation(level: Level, remainingBudget: SolveBounds, _seed = 0): AblationResult {
  const startedAt = Date.now();
  const cap = Math.max(1, Math.min(remainingBudget.maxStates, Math.floor(remainingBudget.maxMemoryBytes / 4)));

  const base = toSolverInput(level, 0);
  const baseSpace = enumerateReachable(base, cap);
  const baseline: Value = baseSpace.truncated ? { outcome: 'unknown' } : retrogradeSolve(baseSpace, base).rootValue;

  const perPiece: AblationResult['perPiece'] = [];
  let partial = false;

  for (const slot of base.slots) {
    if (slot.isRoyal) continue; // kings are not ablated
    // Budget check: a NON-POSITIVE remaining wall clock means the enclosing solve already spent the
    // whole budget ⇒ there is no time for ablation, so stop immediately (partial). A positive budget
    // stops once it is consumed. (The old `wallClockMs > 0 &&` guard SKIPPED the check when the clock
    // hit exactly 0 — i.e. when the budget was most exhausted — letting ablation run unbounded.)
    if (remainingBudget.wallClockMs <= 0 || Date.now() - startedAt >= remainingBudget.wallClockMs) {
      partial = true;
      break;
    }
    const modified = levelWithoutUnit(level, { x: slot.startX, y: slot.startY, side: slot.side, type: slot.origType });
    const removedValue = solveRootValue(modified, cap);
    if (removedValue === null) { partial = true; continue; }

    const flipped = removedValue.outcome !== baseline.outcome;
    const deltaDistance = !flipped
      && baseline.distancePlies !== undefined
      && removedValue.distancePlies !== undefined
      ? removedValue.distancePlies - baseline.distancePlies
      : undefined;
    perPiece.push({
      slotIndex: slot.index,
      side: slot.side,
      type: slot.origType,
      removedValue,
      deltaOutcome: flipped ? 'flip' : 'same',
      deltaDistance,
    });
  }

  return { baseline, partial, perPiece };
}

/**
 * Map the internal AblationResult onto the contract PieceValueReport. `rootValue` is the
 * baseline the ablations are measured against.
 */
export function ablationToReport(result: AblationResult, rootValue: Value, _level: Level): PieceValueReport {
  const entries: PieceValueEntry[] = result.perPiece.map((p) => ({
    type: p.type,
    side: p.side,
    baselineValue: rootValue,
    ablatedValue: p.removedValue,
    distanceDeltaPlies: p.deltaDistance,
    outcomeFlipped: p.deltaOutcome === 'flip',
  }));
  return { rootValue, entries, partial: result.partial || undefined };
}
