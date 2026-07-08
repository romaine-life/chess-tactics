// Board solver — the instant, pre-commit feasibility read (ADR-0068 §2, Phase 1).
//
// Every number here is cheap: a combinatorial state-space estimate plus a shallow
// legalMoves sample. Nothing starts the heavy solve. This is the number that answers
// "toy vs chess" by computation. Returns the contract FeasibilityReport.
//
// EN PASSANT (F6, soundness): the solver decodes positions with NO lastMove, so its move
// graph cannot produce the en-passant captures the live engine would. A board where en
// passant can fire is therefore REFUSED for a strong solve — verdict is forced to at best
// `hard`, `enPassantUnsound` is set, and a refusal note is added.

import type { Level } from '../level';
import type { GameState, Piece, Side, Vec } from '../types';
import type { MoveEnv } from '../rules';
import type { FeasibilityReport, SolveMode, SolveVerdict } from './types';
import { legalMoves, livingPieces } from '../rules';
import { createRng } from '../rng';
import { toSolverInput } from './input';
import { applyMove } from '../rules';

/** Default memory cap for a Phase-1 feasibility read (~3 GiB). Phase 3 wires the Job limit. */
const DEFAULT_MEMORY_CAP_BYTES = 3 * 2 ** 30;
/** Bytes per tablebase entry (outcome + distance + key), a coarse estimate. */
const BYTES_PER_ENTRY = 4;
/** State-space ceiling under which a strong solve is `solvable` (fits the memory cap comfortably). */
const SOLVABLE_STATE_CEILING = 5_000_000;
/** Default number of seeded random walks for the sampled branching factor. */
const DEFAULT_SAMPLE_WALKS = 200;
/** How deep each sampled walk goes. */
const SAMPLE_WALK_DEPTH = 24;

export interface FeasibilityOptions {
  memoryCapBytes?: number;
  sampleWalks?: number;
}

/**
 * Combinatorial upper bound on reachable states. Each slot independently is DEAD or on one
 * of `C` passable cells; a promotable pawn additionally carries a promoted flag (×2). ×2 for
 * side-to-move, × a clock factor when clockMatters. This is a LOOSE ceiling — it ignores the
 * no-two-pieces-share-a-cell constraint, so the true reachable count is far smaller. We report
 * the no-overlap-corrected figure (falling factorial over the alive count) as the headline and
 * keep the loose radix product in `notes`.
 */
function stateSpaceEstimate(cellCount: number, slots: ReadonlyArray<{ canPromote: boolean }>, clockFactor: number): { corrected: number; loose: number } {
  const s = slots.length;
  // Loose radix product: per slot (C dead-or-cells + 1 dead) × promotion factor.
  let loose = 2 * clockFactor; // side-to-move × clock
  for (const slot of slots) {
    const perSlot = cellCount + 1; // C cells or dead
    loose *= perSlot * (slot.canPromote ? 2 : 1);
    if (!Number.isFinite(loose)) return { corrected: Infinity, loose: Infinity };
  }
  // No-overlap correction: at most `s` distinct occupied cells ⇒ falling factorial C·(C-1)…
  // bounded above by C^s but tightened by distinctness. We approximate the corrected count as
  // 2 · clockFactor · (product over alive-subsets), which for the small Phase-1 boards is close
  // to the true count. A simple, sound corrected bound: sum over k alive pieces of C_choose_k
  // arrangements — we take the dominant term (all alive) with distinct cells + promotion.
  let corrected = 2 * clockFactor;
  let avail = cellCount;
  for (let i = 0; i < s; i += 1) {
    corrected *= Math.max(1, avail);
    avail -= 1;
    if (!Number.isFinite(corrected)) return { corrected: Infinity, loose };
  }
  // Promotion doubles the arrangements for each promotable slot.
  const promo = slots.reduce((acc, slot) => acc * (slot.canPromote ? 2 : 1), 1);
  corrected *= promo;
  return { corrected: Number.isFinite(corrected) ? corrected : Infinity, loose };
}

/** Mean legal-move count over a seeded random walk from the start (deterministic). */
function sampledBranching(start: GameState, env: MoveEnv, walks: number, seed = 12345): number {
  const rng = createRng(seed);
  let total = 0;
  let samples = 0;
  for (let w = 0; w < walks; w += 1) {
    let state = start;
    for (let d = 0; d < SAMPLE_WALK_DEPTH; d += 1) {
      const side: Side = state.turn === 'enemy' ? 'enemy' : 'player';
      const movers = livingPieces(state.pieces, side);
      const all: Array<{ id: string; move: import('../types').Move }> = [];
      for (const p of movers) for (const m of legalMoves(p, state.pieces, state.size, env)) all.push({ id: p.id, move: m });
      if (all.length === 0) break;
      total += all.length;
      samples += 1;
      const pick = all[rng.int(all.length)];
      const { state: next } = applyMove(state, pick.id, pick.move);
      state = next;
      if (next.winner) break;
    }
  }
  return samples > 0 ? total / samples : 0;
}

/** A rough wall-clock ETA to a COMPLETE strong solve, in seconds (a low-confidence hint). */
function estimateEtaSeconds(states: number, branching: number): number {
  if (!Number.isFinite(states)) return Infinity;
  // Enumeration touches ~states × branching edges; retrograde ~states × branching × sweeps.
  // A very coarse throughput of ~2M edges/sec, sweeps ~ small constant for tiny boards.
  const edges = states * Math.max(1, branching);
  const sweepsFactor = Math.min(20, Math.max(2, Math.log2(states + 2)));
  return (edges * sweepsFactor) / 2_000_000;
}

export function estimateFeasibility(level: Level, opts: FeasibilityOptions = {}): FeasibilityReport {
  const memoryCap = opts.memoryCapBytes ?? DEFAULT_MEMORY_CAP_BYTES;
  const walks = opts.sampleWalks ?? DEFAULT_SAMPLE_WALKS;
  const input = toSolverInput(level, 0);
  const notes: string[] = [];

  const cellCount = input.passableCells.length;
  // The clock multiplier is the SAME radix the encoder uses (max over surviveTurns AND every
  // authored turnLimit condition, +1) — deriving it from surviveTurns alone understates the
  // state space on a turnLimit-override board and could push a mis-solvable board to 'solvable'.
  const clockFactor = input.clockMatters ? input.clockCeil : 1;
  const { corrected, loose } = stateSpaceEstimate(cellCount, input.slots, clockFactor);

  notes.push(`${input.slots.length} pieces over ${cellCount} passable cells`);
  notes.push(`loose radix-product ceiling ≈ ${Number.isFinite(loose) ? loose.toExponential(2) : 'Infinity'}`);
  if (input.clockMatters) notes.push(`clock-dependent objective: turnsElapsed folded into the key (×${clockFactor})`);
  else notes.push('clock inert for this objective: turnsElapsed omitted from the key');

  // Branching.
  const env: MoveEnv = input.env;
  let branchingRoot = 0;
  const rootSide: Side = input.start.turn === 'enemy' ? 'enemy' : 'player';
  for (const p of livingPieces(input.start.pieces, rootSide)) {
    branchingRoot += legalMoves(p, input.start.pieces, input.start.size, env).length;
  }
  const branchingSampled = sampledBranching(input.start, env, walks);

  // Memory.
  const tablebaseBytesEstimate = Number.isFinite(corrected) ? corrected * BYTES_PER_ENTRY : Infinity;

  // En passant refusal (F6) — from the single shared flag on SolverInput (also consulted by the
  // search runner's retrograde draw-proof fallback, so the refusal holds at both places).
  const enPassantUnsound = input.enPassantUnsound;
  if (enPassantUnsound) {
    notes.push('REFUSED for strong solve: board can trigger en passant, whose successors the '
      + 'decoded (lastMove-free) move graph cannot reproduce (F6). Verdict capped at `hard`.');
  }

  // Verdict + recommended mode.
  const fitsMemory = tablebaseBytesEstimate <= memoryCap;
  let verdict: SolveVerdict;
  if (enPassantUnsound) {
    verdict = Number.isFinite(corrected) ? 'hard' : 'infeasible';
  } else if (Number.isFinite(corrected) && corrected <= SOLVABLE_STATE_CEILING && fitsMemory) {
    verdict = 'solvable';
  } else if (Number.isFinite(corrected) && fitsMemory) {
    verdict = 'hard';
  } else {
    verdict = 'infeasible';
    notes.push(`tablebase estimate ${Number.isFinite(tablebaseBytesEstimate) ? tablebaseBytesEstimate.toExponential(2) : 'Infinity'} bytes exceeds the memory cap ${memoryCap.toExponential(2)}`);
  }
  const recommendedMode: SolveMode = verdict === 'solvable' ? 'retrograde' : 'search';

  const etaSeconds = estimateEtaSeconds(corrected, branchingSampled || branchingRoot || 1);

  return {
    stateSpaceUpperBound: corrected,
    branchingRoot,
    branchingSampled,
    tablebaseBytesEstimate,
    verdict,
    etaSeconds,
    recommendedMode,
    enPassantUnsound,
    notes,
  };
}
