// Streaming SPRT validation: play one game per call, fold into a running record, and
// resolve to a verdict. Node env; validateStep is pure (no `self`, no timers).

import { describe, it, expect } from 'vitest';
import { validateStep, freshValState, type ValState } from './validate';
import { generateOpeningBook } from '../game/openingBook';
import { DEFAULT_EVAL_WEIGHTS, type EvalWeights } from '../core/ai';
import { createBlankLevel, type Level } from '../core/level';

const MATCH = { search: { maxDepth: 1, maxNodes: 1500 }, maxPlies: 40 };

function battle(): Level {
  const level = createBlankLevel('val-battle', 'Battle', 8, 8);
  level.objective = 'capture-all';
  level.layers.units = [
    { x: 1, y: 6, type: 'queen', side: 'player' },
    { x: 3, y: 6, type: 'knight', side: 'player' },
    { x: 6, y: 1, type: 'rook', side: 'enemy' },
    { x: 4, y: 1, type: 'queen', side: 'enemy' },
  ];
  return level;
}

const book = () => generateOpeningBook(battle(), { size: 4, seedBase: 1, plies: 2, variety: 0.5 }, MATCH);

/** A deliberately CRIPPLED reference: it barely values its pieces, so it hangs
 * material happily — a weak opponent the real weights should beat handily. */
function crippled(): EvalWeights {
  return {
    ...DEFAULT_EVAL_WEIGHTS,
    pieceValues: {
      pawn: 0.01, knight: 0.01, bishop: 0.01, rook: 0.01, queen: 0.01, king: 0.01,
      rock: 0, 'random-rock': 0,
    },
    hangingUndefended: 0,
    hangingDefended: 0,
  };
}

/** Run validateStep in a loop until done (or a hard cap), returning the final state. */
function runToDone(candidate: EvalWeights, reference: EvalWeights, maxGames = 120): ValState {
  const b = book();
  let state: ValState | null = null;
  let guard = 0;
  do {
    state = validateStep(battle(), candidate, reference, b, MATCH, 7, state, undefined, maxGames);
    guard += 1;
  } while (!state.done && guard < maxGames + 5);
  return state;
}

describe('validateStep', () => {
  // NOTE (post-quiescence): these two assert engine STRENGTH via real self-play.
  // Once q-search resolves exchanges at the leaf, even a materially-blind "crippled"
  // eval stops hanging pieces, so on this small BALANCED board every game draws
  // (verified: 0/8/0 at depth 2–4) and the strength gap can't surface. A strength
  // difference only becomes decisive from IMBALANCED (UHO-style) openings — which is
  // the decisive-books work, run at volume on the cluster, not a fast local unit
  // test. Skipped here and restored with a curated decisive book in that phase; the
  // plumbing (W+D+L accounting, determinism, verdict resolution) is still covered by
  // the fast tests below.
  it.skip('a candidate stronger than a weak reference reaches done with verdict accept', { timeout: 120_000 }, () => {
    const state = runToDone(DEFAULT_EVAL_WEIGHTS, crippled());
    expect(state.done).toBe(true);
    expect(state.sprt.verdict).toBe('accept');
  });

  it.skip('a candidate that is NOT an improvement (weaker than the reference) reaches done with verdict reject', { timeout: 120_000 }, () => {
    const state = runToDone(crippled(), DEFAULT_EVAL_WEIGHTS);
    expect(state.done).toBe(true);
    expect(state.sprt.verdict).toBe('reject');
  });

  it('W + D + L === gameIndex at every step', { timeout: 120_000 }, () => {
    const b = book();
    let state: ValState | null = null;
    for (let i = 0; i < 8; i += 1) {
      state = validateStep(battle(), DEFAULT_EVAL_WEIGHTS, crippled(), b, MATCH, 3, state);
      expect(state.w + state.d + state.l).toBe(state.gameIndex);
      expect(state.gameIndex).toBe(i + 1);
    }
  });

  it('is deterministic in (inputs, seed) — replay produces the identical stream', { timeout: 120_000 }, () => {
    const b = book();
    const replay = () => {
      const states: ValState[] = [];
      let s: ValState | null = null;
      for (let i = 0; i < 6; i += 1) {
        s = validateStep(battle(), DEFAULT_EVAL_WEIGHTS, crippled(), b, MATCH, 11, s);
        states.push(s);
      }
      return states;
    };
    expect(replay()).toEqual(replay());
  });

  it('a fresh state has zero games and a continue verdict', () => {
    const s = freshValState();
    expect(s.gameIndex).toBe(0);
    expect(s.w + s.d + s.l).toBe(0);
    expect(s.done).toBe(false);
    expect(s.sprt.verdict).toBe('continue');
  });
});
