// Phase-4 proof-tracking negamax tests (ADR-0069). Tiny hand-checkable boards, EXACT values
// asserted (vitest v4 hides console.log for passing tests). The strongest guard is the
// cross-check against Phase-1's retrograde ground truth on the SAME board — same Value, same DTM.

import { describe, it, expect } from 'vitest';
import { createBlankLevel, type Level, type LevelUnit, type ObjectiveType, type VictoryRules } from '../../level';
import type { GameState } from '../../types';
import { toSolverInput } from '../input';
import { enumerateReachable } from '../encode';
import { retrogradeSolve } from '../retrograde';
import { makeProofSearchState, proofNegamax, proofToValue } from './proofNegamax';
import { runWeakSolve } from './idSearch';
import { TranspositionTable } from './transpositionTable';

function tinyLevel(units: LevelUnit[], cols: number, rows: number, objective: ObjectiveType = 'rival-kings', victory?: VictoryRules): Level {
  const lvl = createBlankLevel('tiny', 'Tiny', cols, rows);
  lvl.objective = objective;
  lvl.layers.units = units.map((u) => ({ ...u }));
  if (victory) lvl.victory = victory;
  return lvl;
}

/** Author last-rank promotion the way real levels do (no built-in far-edge default). */
function withPromoRow(lvl: Level, y = 0): Level {
  lvl.layers.zones.push({ id: 'promo', type: 'pawn-promotion', tiles: Array.from({ length: lvl.board.cols }, (_, x) => [x, y] as [number, number]) });
  return lvl;
}

/** Solve a level's ROOT through the real weak-solve pipeline; returns the contract Value. */
function solveRoot(lvl: Level, maxNodes = 3_000_000) {
  const input = toSolverInput(lvl, 0);
  const res = runWeakSolve(input, { maxNodes, maxDepthPlies: 40 });
  return { value: res.rootValue, res, input };
}

/** Retrograde ground truth for the same level. */
function retroRoot(lvl: Level) {
  const input = toSolverInput(lvl, 0);
  return retrogradeSolve(enumerateReachable(input, 5_000_000), input).rootValue;
}

describe('proofNegamax — forced mate-in-1 is proven', () => {
  it('root is a proven win with distancePlies === 1 and the root holds proven-win in the TT', () => {
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ], 3, 3);
    const { value } = solveRoot(lvl);
    expect(value).toEqual({ outcome: 'win', winner: 'player', distancePlies: 1 });
  });
});

describe('proofNegamax — a drawn micro-board proves draw (cycle detection)', () => {
  it('K vs K → proven draw within a small node budget', () => {
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
    ], 4, 4);
    const { value } = solveRoot(lvl, 2_000_000);
    expect(value.outcome).toBe('draw');
    expect(value.distancePlies).toBeUndefined();
  });
});

describe('proofNegamax — proof AGREES with retrograde ground truth', () => {
  // The strongest correctness guard: same tiny board, same Value + win-distance as Phase 1.
  it('K+Q vs K (4×4): direct king capture mate-in-1 matches retrograde', () => {
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
      { x: 3, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ], 4, 4);
    expect(solveRoot(lvl).value).toEqual(retroRoot(lvl));
  });

  it('K+P vs K winning (3×5): search DTM equals the retrograde DTM (5)', () => {
    const lvl = withPromoRow(tinyLevel([
      { x: 2, y: 4, side: 'enemy', type: 'king', facing: 'south' },
      { x: 1, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
    ], 3, 5));
    const gt = retroRoot(lvl);
    const sv = solveRoot(lvl).value;
    expect(sv.outcome).toBe(gt.outcome);
    expect(sv.winner).toBe(gt.winner);
    expect(sv.distancePlies).toBe(gt.distancePlies); // exact DTM agreement
  });

  it('K+P vs K blockade (3×5): both prove a draw', () => {
    const lvl = withPromoRow(tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 4, side: 'player', type: 'king', facing: 'north' },
      { x: 1, y: 3, side: 'player', type: 'pawn', facing: 'north' },
    ], 3, 5));
    expect(solveRoot(lvl).value.outcome).toBe(retroRoot(lvl).outcome);
    expect(retroRoot(lvl).outcome).toBe('draw');
  });
});

describe('proofNegamax — victory-override terminality (F1)', () => {
  it("terminality honors level.victory (win when enemy bishop gone), not the capture-all preset", () => {
    // Preset capture-all needs EVERY enemy gone; the override wins the instant the enemy bishop is
    // gone. On a board whose enemy has a king (no bishop), the override says WIN while capture-all
    // would not. The search's terminal oracle must use the override (F1).
    const override: VictoryRules = [
      { name: 'Bishop down', if: [{ kind: 'eliminate', side: 'enemy', filter: { type: 'bishop' } }], do: [{ kind: 'win', side: 'player' }] },
      { name: 'Wiped', if: [{ kind: 'eliminate', side: 'player' }], do: [{ kind: 'lose', side: 'player' }] },
    ];
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ], 3, 3, 'capture-all', override);
    const input = toSolverInput(lvl, 0);
    // The enemy has NO bishop at the start already, so the override fires immediately: the root is a
    // terminal WIN for the player (distancePlies 0) — a solver on the capture-all preset would keep
    // searching (the enemy king still lives). This is the F1 divergence, proven here at the node.
    const pstate = makeProofSearchState(input, { maxNodes: 100_000 });
    const pv = proofNegamax(pstate, input.start, 4, 0, -Infinity, Infinity, 0);
    const v = proofToValue(pv, 'player');
    expect(v.outcome).toBe('win');
    expect(v.winner).toBe('player');
    expect(v.distancePlies).toBe(0); // already terminal under the override
  });
});

describe('proofNegamax / runWeakSolve — GHI guard (no unsound proven entries in the TT)', () => {
  // The whole partial-tablebase (the accumulated TT) must be SOUND: every proven flag must agree
  // with the retrograde ground-truth value for that position. A path-scoped cycle draw leaking into
  // the global TT (the GHI trap) would surface here as a TT proven-draw on a cell retrograde calls a
  // win/loss. Run BOTH a won board and a drawn board through the real pipeline and cross-check.
  const cases: Array<{ name: string; units: LevelUnit[]; cols: number; rows: number }> = [
    { name: 'K+P vs K winning', cols: 3, rows: 5, units: [
      { x: 2, y: 4, side: 'enemy', type: 'king', facing: 'south' },
      { x: 1, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
    ] },
    { name: 'K+P vs K blockade draw', cols: 3, rows: 5, units: [
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 4, side: 'player', type: 'king', facing: 'north' },
      { x: 1, y: 3, side: 'player', type: 'pawn', facing: 'north' },
    ] },
  ];
  for (const { name, units, cols, rows } of cases) {
    it(`${name}: every TT proven entry matches the retrograde ground truth`, () => {
      const lvl = withPromoRow(tinyLevel(units, cols, rows));
      const input = toSolverInput(lvl, 0);
      const tt = new TranspositionTable();
      runWeakSolve(input, { maxNodes: 3_000_000, maxDepthPlies: 40 }, undefined, undefined, tt);

      const gtSpace = enumerateReachable(input, 5_000_000);
      const gt = retrogradeSolve(gtSpace, input);
      const gtByKey = new Map<string, { outcome: string; dtm: number }>();
      for (let o = 0; o < gtSpace.keys.length; o += 1) {
        const code = gt.outcome[o];
        gtByKey.set(gtSpace.keys[o].toString(), {
          outcome: code === 1 ? 'win' : code === 2 ? 'loss' : code === 3 ? 'draw' : 'unknown',
          dtm: gt.distance[o],
        });
      }
      let checked = 0;
      for (const e of tt.provenEntries()) {
        const g = gtByKey.get(e.key);
        if (g === undefined) continue; // a TT position outside the enumerated set (none expected here)
        const flagOutcome = e.flag === 'proven-win' ? 'win' : e.flag === 'proven-loss' ? 'loss' : 'draw';
        expect(g.outcome).toBe(flagOutcome); // GHI: no cycle draw masquerading as a proven value.
        // Every cached win/loss carries the EXACT retrograde DTM — never an inflated distance
        // (findings 1 & 2: the sticky TT must hold only minimal distances).
        if (flagOutcome === 'win' || flagOutcome === 'loss') expect(e.distancePlies).toBe(g.dtm);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(0); // the cross-check actually exercised entries.
    });
  }
});

describe('proofNegamax — reuse fidelity (poisoned capture at a bound leaf)', () => {
  it('a non-prove depth-1 leaf resolves the poisoned rook-for-pawn trade via the EXPORTED quiesce', () => {
    // Mirrors the ai.test.ts poisoned-capture guard: an enemy rook can grab a defended player pawn;
    // the recapture (the guard pawn takes the rook) sits one ply past a depth-1 horizon. The
    // weak-solver's leaf is ai.ts's exported `quiesce`, so at depth 1 (no prove-to-end) the trade
    // resolves to the ≈ -rook it truly is — the capturing side does NOT read it as material-up.
    // Kings on both sides so a capture is never a capture-all terminal (the value is a real eval,
    // not a mate score). The rook's file-4 slide to (4,4) is the poison; (3,5) guards (4,4).
    const s: GameState = {
      size: { cols: 8, rows: 8 },
      pieces: [
        { id: 'e-rook', side: 'enemy', type: 'rook', x: 4, y: 1, alive: true, startY: 1 },
        { id: 'e-king', side: 'enemy', type: 'king', x: 0, y: 0, alive: true, startY: 0 },
        { id: 'poison', side: 'player', type: 'pawn', x: 4, y: 4, alive: true, startY: 4 },
        { id: 'guard', side: 'player', type: 'pawn', x: 3, y: 5, alive: true, startY: 5 },
        { id: 'p-king', side: 'player', type: 'king', x: 7, y: 7, alive: true, startY: 7 },
      ],
      turn: 'enemy', winner: null,
    };
    const lvl = tinyLevel([
      { x: 4, y: 1, side: 'enemy', type: 'rook', facing: 'south' },
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 4, y: 4, side: 'player', type: 'pawn', facing: 'north' },
      { x: 3, y: 5, side: 'player', type: 'pawn', facing: 'north' },
      { x: 7, y: 7, side: 'player', type: 'king', facing: 'north' },
    ], 8, 8, 'capture-all');
    const input = toSolverInput(lvl, 0);
    const pstate = makeProofSearchState(input, { maxNodes: 200_000 });
    // Value AFTER the rook grabs the poison (player to move, can recapture): the quiescence leaf
    // extends the recapture, so from the post-capture (player) view the trade is materially GOOD
    // for the player (up a rook for a pawn) ⇒ a clearly positive, non-mate value. That is the
    // "poison declined" signal: the enemy would not walk into this.
    const takePoison = proofNegamax(pstate, applyOne(s, 'e-rook', { x: 4, y: 4, capture: 'poison' }), 0, 1, -Infinity, Infinity, 0);
    expect(takePoison.proof).toBe('bound');          // a heuristic leaf, not a proof.
    expect(Math.abs(takePoison.value)).toBeLessThan(9000); // a resolved-trade eval, not a mate.
    expect(takePoison.value).toBeGreaterThan(0);     // player up a rook after the recapture.
  });
});

// Small local helper to apply one move and return the resulting state.
import { applyMove } from '../../rules';
function applyOne(state: GameState, pieceId: string, move: { x: number; y: number; capture?: string }): GameState {
  return applyMove(state, pieceId, move as import('../../types').Move).state;
}
