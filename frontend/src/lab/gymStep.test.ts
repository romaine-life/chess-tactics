// The gym's step reducer: k advances, the trajectory grows by exactly one, and the
// champion / "established" bookkeeping is correct — the arithmetic that makes a
// book's retained session accumulate. Node env; the reducer is pure (no `self`).

import { describe, it, expect } from 'vitest';
import { advanceSession, type StepConfig } from './gymStep';
import { freshSession } from './openingBooks';
import { generateOpeningBook } from '../game/openingBook';
import { DEFAULT_HYPERPARAMS } from '../game/tuning';
import { DEFAULT_EVAL_WEIGHTS } from '../core/ai';
import { createBlankLevel, type Level } from '../core/level';

const MATCH = { search: { maxDepth: 1, maxNodes: 1000 }, maxPlies: 30 };

function battle(): Level {
  const level = createBlankLevel('gs-battle', 'Battle', 8, 8);
  level.objective = 'capture-all';
  level.layers.units = [
    { x: 1, y: 6, type: 'queen', side: 'player' },
    { x: 3, y: 6, type: 'knight', side: 'player' },
    { x: 6, y: 1, type: 'rook', side: 'enemy' },
    { x: 4, y: 1, type: 'queen', side: 'enemy' },
  ];
  return level;
}

const cfg = (): StepConfig => ({
  level: battle(),
  reference: DEFAULT_EVAL_WEIGHTS,
  hp: DEFAULT_HYPERPARAMS,
  match: MATCH,
  masterSeed: 7,
});
const book = () => generateOpeningBook(battle(), { size: 2, seedBase: 1, plies: 2, variety: 0.5 }, MATCH);

describe('advanceSession', () => {
  it('advances k by one and appends exactly one trajectory point', { timeout: 60_000 }, () => {
    const { point, session } = advanceSession(cfg(), freshSession(), book());
    expect(session.k).toBe(1);
    expect(session.traj).toHaveLength(1);
    expect(session.traj[0]).toEqual(point);
    expect(point.step).toBe(0);
  });

  it('holds the champion when the step cannot beat it, and counts established up', { timeout: 60_000 }, () => {
    const base = freshSession();
    const guarded = { ...base, champion: { step: -1, score: 2, theta: base.theta.slice() }, established: 3 };
    const { session } = advanceSession(cfg(), guarded, book());
    expect(session.champion.score).toBe(2);   // unbeaten -> unchanged
    expect(session.champion.step).toBe(-1);
    expect(session.established).toBe(4);       // +1 since no improvement
  });

  it('advances the champion on a strict improvement and resets established to 0', { timeout: 60_000 }, () => {
    const base = freshSession();
    const beatable = { ...base, champion: { step: -1, score: -2, theta: base.theta.slice() }, established: 5 };
    const { point, session } = advanceSession(cfg(), beatable, book());
    expect(point.score).toBeGreaterThan(-2);
    expect(session.champion.step).toBe(0);
    expect(session.champion.score).toBe(point.score);
    expect(session.established).toBe(0);
  });

  it('is deterministic in (config, session, book)', { timeout: 60_000 }, () => {
    expect(advanceSession(cfg(), freshSession(), book())).toEqual(advanceSession(cfg(), freshSession(), book()));
  });

  it('threads k across chained steps (session in -> session out -> back in)', { timeout: 60_000 }, () => {
    const { session: s1 } = advanceSession(cfg(), freshSession(), book());
    const { session: s2 } = advanceSession(cfg(), s1, book());
    expect(s2.k).toBe(2);
    expect(s2.traj).toHaveLength(2);
    expect(s2.traj[1].step).toBe(1);
  });
});
