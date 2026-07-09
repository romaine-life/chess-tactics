// Phase-1 retrograde strong-solver tests (ADR-0069). Tiny, hand-checkable boards with the
// EXACT solved value asserted. Vitest v4 hides console.log for passing tests, so every claim
// is an assertion. Ground truth was cross-checked against the solver's own enumeration and
// the game rules (kings never adjacent; rival-kings wins on king elimination; the loopy game
// has no repetition rule, so unforced positions resolve to draw at the fixpoint).

import { describe, it, expect } from 'vitest';
import { createBlankLevel, type Level, type LevelUnit, type ObjectiveType, type VictoryRules } from '../level';
import { toSolverInput, terminalOutcome } from './input';
import { enumerateReachable, canonicalKey, decodePosition, positionFromState, encodePosition } from './encode';
import { retrogradeSolve, runSolve, solveStepWithPhases } from './retrograde';
import type { SolveStep } from './types';
import type { GameState } from '../types';

function tinyLevel(units: LevelUnit[], opts: { cols: number; rows: number; objective: ObjectiveType; victory?: VictoryRules }): Level {
  const lvl = createBlankLevel('tiny', 'Tiny', opts.cols, opts.rows);
  lvl.objective = opts.objective;
  lvl.layers.units = units.map((u) => ({ ...u }));
  if (opts.victory) lvl.victory = opts.victory;
  return lvl;
}

function solve(lvl: Level, cap = 5_000_000) {
  const input = toSolverInput(lvl, 0);
  const space = enumerateReachable(input, cap);
  const result = retrogradeSolve(space, input);
  return { input, space, result };
}

// ─── King vs King → draw (the loopy canary) ─────────────────────────────────────────────

describe('K vs K → draw', () => {
  const lvl = tinyLevel([
    { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
    { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
  ], { cols: 4, rows: 4, objective: 'rival-kings' });

  it('the root is a proven draw', () => {
    const { result, space } = solve(lvl);
    expect(space.truncated).toBe(false);
    expect(result.rootValue.outcome).toBe('draw');
    expect(result.rootValue.distancePlies).toBeUndefined();
  });

  it('EVERY reachable position is a draw (no terminal, no forced win)', () => {
    const { result } = solve(lvl);
    expect(result.stats.terminals).toBe(0); // kings are never adjacent, never captured
    expect(result.stats.drawn).toBe(result.stats.states);
    expect(result.stats.solvedWin).toBe(0);
    expect(result.stats.solvedLoss).toBe(0);
  });

  it('enumeration terminates (finite node set despite infinite play)', () => {
    const { result } = solve(lvl);
    expect(result.stats.states).toBeGreaterThan(0);
    expect(Number.isFinite(result.stats.states)).toBe(true);
  });
});

// ─── K+Q vs K → forced win, EXACT mate distance ─────────────────────────────────────────

describe('K+Q vs K → forced win with exact DTM', () => {
  it('3×3 mate-in-1: win for player, distancePlies === 1', () => {
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ], { cols: 3, rows: 3, objective: 'rival-kings' });
    const { result } = solve(lvl);
    expect(result.rootValue).toEqual({ outcome: 'win', winner: 'player', distancePlies: 1 });
  });

  it('4×4: a mate-in-1 by direct king capture (DTM = 1)', () => {
    // The player queen on rank y=0 already checks the enemy king at (0,0) and can capture it
    // this move: (3,0)->(0,0). True DTM = 1 ply. (The prior assertion of 5 codified the DTM
    // inflation bug — a direct king-capture terminal was mislabeled WIN-for-the-capturing-side
    // instead of LOSS-for-the-captured-side, so the mate-in-1 line was never counted and a
    // longer win was reported. Cross-checked against an independent brute-force negamax.)
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
      { x: 3, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ], { cols: 4, rows: 4, objective: 'rival-kings' });
    const { result } = solve(lvl);
    expect(result.rootValue.outcome).toBe('win');
    expect(result.rootValue.winner).toBe('player');
    expect(result.rootValue.distancePlies).toBe(1); // direct king capture, verified vs negamax
    expect(result.stats.solvedWin).toBeGreaterThan(0);
    expect(result.stats.solvedLoss).toBeGreaterThan(0);
  });
});

// ─── K+P vs K → queening win AND blockade draw (exercises the promotion radix) ───────────

describe('K+P vs K', () => {
  it('winning variant: the pawn queens and mates (win, player)', () => {
    // Player pawn one rank from promotion, king supporting; enemy king too far to stop it.
    const lvl = tinyLevel([
      { x: 2, y: 4, side: 'enemy', type: 'king', facing: 'south' },
      { x: 1, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
    ], { cols: 3, rows: 5, objective: 'rival-kings' });
    const { result } = solve(lvl);
    expect(result.rootValue.outcome).toBe('win');
    expect(result.rootValue.winner).toBe('player');
    expect(result.rootValue.distancePlies).toBe(5); // hand-verified
  });

  it('blockade-draw variant: the enemy king holds the pawn (draw)', () => {
    // Enemy king in front of the pawn's promotion path with the player king behind: no win.
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 4, side: 'player', type: 'king', facing: 'north' },
      { x: 1, y: 3, side: 'player', type: 'pawn', facing: 'north' },
    ], { cols: 3, rows: 5, objective: 'rival-kings' });
    const { result } = solve(lvl);
    expect(result.rootValue.outcome).toBe('draw');
    expect(result.rootValue.distancePlies).toBeUndefined();
  });

  it('the winning variant actually materialises a promoted queen somewhere in the space', () => {
    const lvl = tinyLevel([
      { x: 2, y: 4, side: 'enemy', type: 'king', facing: 'south' },
      { x: 1, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
    ], { cols: 3, rows: 5, objective: 'rival-kings' });
    const { space, input } = solve(lvl);
    let sawQueen = false;
    for (const key of space.keys) {
      const st = decodePosition(key, input);
      if (st.pieces.some((p) => p.side === 'player' && p.type === 'queen')) { sawQueen = true; break; }
    }
    expect(sawQueen).toBe(true); // the promotion radix + promoted flag round-trip is exercised
  });
});

// ─── Determinism ────────────────────────────────────────────────────────────────────────

describe('determinism', () => {
  it('two solves of the same level produce identical labels + root value', () => {
    const mk = () => tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
      { x: 3, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ], { cols: 4, rows: 4, objective: 'rival-kings' });
    const a = solve(mk());
    const b = solve(mk());
    expect(a.result.rootValue).toEqual(b.result.rootValue);
    expect(a.result.stats).toEqual(b.result.stats);
    expect(Array.from(a.result.outcome)).toEqual(Array.from(b.result.outcome));
    expect(Array.from(a.result.distance)).toEqual(Array.from(b.result.distance));
  });
});

// ─── runSolve orchestrator ──────────────────────────────────────────────────────────────

describe('runSolve orchestrator', () => {
  const bounds = { wallClockMs: 30_000, maxStates: 5_000_000, maxMemoryBytes: 3 * 2 ** 30 };

  it('assembles a complete, well-formed SolveResult with ablation piece values', () => {
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ], { cols: 3, rows: 3, objective: 'rival-kings' });
    const res = runSolve(lvl, bounds);
    expect(res.mode).toBe('retrograde');
    expect(res.complete).toBe(true);
    expect(res.rootValue).toEqual({ outcome: 'win', winner: 'player', distancePlies: 1 });
    expect(res.provenCount).toBe(res.proven.win + res.proven.loss + res.proven.draw);
    expect(res.rootBounds.proven).toBe(true);
    expect(res.rootBounds.lower).toBe('win');
    expect(res.rootBounds.upper).toBe('win');
    // Ablation: removing the queen flips the win to a draw.
    expect(res.pieceValues).toBeDefined();
    const queenEntry = res.pieceValues!.entries.find((e) => e.type === 'queen' && e.side === 'player');
    expect(queenEntry).toBeDefined();
    expect(queenEntry!.outcomeFlipped).toBe(true);
    expect(queenEntry!.ablatedValue.outcome).toBe('draw');
  });

  it('reports progress through the phases', () => {
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ], { cols: 3, rows: 3, objective: 'rival-kings' });
    const phases: string[] = [];
    runSolve(lvl, bounds, (p) => phases.push(p.phase));
    expect(phases).toContain('Propagate');
    expect(phases).toContain('ReadValue');
  });
});

// ─── F1: victory-override terminal oracle ───────────────────────────────────────────────

describe('F1 — terminal oracle uses level.victory, not evaluateObjective', () => {
  it('an authored override (win when the enemy bishop is gone) decides differently than the preset', () => {
    // objective preset = capture-all (win needs EVERY enemy gone). Override: player wins the
    // instant the enemy has no bishop. The two disagree on a board where the enemy still has a
    // pawn but no bishop.
    const override: VictoryRules = [
      { name: 'Bishop down', if: [{ kind: 'eliminate', side: 'enemy', filter: { type: 'bishop' } }], do: [{ kind: 'win', side: 'player' }] },
      { name: 'Wiped', if: [{ kind: 'eliminate', side: 'player' }], do: [{ kind: 'lose', side: 'player' }] },
    ];
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 1, y: 0, side: 'enemy', type: 'pawn', facing: 'south' },
      { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ], { cols: 3, rows: 3, objective: 'capture-all', victory: override });
    const input = toSolverInput(lvl, 0);

    // A settled state: enemy has a pawn but no bishop (there never was one) and both kings live.
    const noBishop: GameState = {
      size: { cols: 3, rows: 3 },
      pieces: [
        { id: 'enemy-king-0', side: 'enemy', type: 'king', x: 0, y: 0, alive: true, startY: 0 },
        { id: 'enemy-pawn-1', side: 'enemy', type: 'pawn', x: 1, y: 0, alive: true, startY: 0 },
        { id: 'player-king-2', side: 'player', type: 'king', x: 2, y: 2, alive: true, startY: 2 },
        { id: 'player-queen-3', side: 'player', type: 'queen', x: 2, y: 1, alive: true, startY: 0 },
      ],
      turn: 'player', winner: null,
    };
    // Override oracle: the player already WON (enemy bishop absent). This is the F1-correct read.
    expect(terminalOutcome(noBishop, input, 0)).toBe('player');
    // Sanity: the preset capture-all would NOT have won here (an enemy pawn still lives), which is
    // exactly the wrong answer a solver using evaluateObjective would produce.
    expect(input.victoryRules).toBe(override);
  });
});

// ─── F2: kingSide is populated on the context ───────────────────────────────────────────

describe('F2 — ctx.kingSide is populated (capture-king board)', () => {
  it('kingSide resolves and the enemy king-capture is terminal for the player', () => {
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ], { cols: 3, rows: 3, objective: 'capture-king' });
    const input = toSolverInput(lvl, 0);
    expect(input.ctx.kingSide).toBeDefined();
    expect(input.ctx.kingSide).toBe('enemy'); // enemy holds the King in this King Assault board
    const { result } = solve(lvl);
    // Same forced mate-in-1 as rival-kings on this geometry (capturing the enemy king wins).
    expect(result.rootValue).toEqual({ outcome: 'win', winner: 'player', distancePlies: 1 });
  });
});

// ─── Encoding round-trips + canonicalization ────────────────────────────────────────────

describe('encoding round-trips + canonicalization', () => {
  it('every enumerated key decodes and re-encodes to itself', () => {
    const lvl = tinyLevel([
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
    ], { cols: 3, rows: 3, objective: 'rival-kings' });
    const { space, input } = solve(lvl);
    for (const key of space.keys) {
      const st = decodePosition(key, input);
      const re = canonicalKey(st, input, 0);
      expect(re).toBe(key);
    }
  });

  it('two identical same-side rooks swapped produce the SAME canonical key', () => {
    // Rooks (like knights/bishops/queens) are GENUINELY interchangeable — their move graph
    // depends on neither facing nor start — so swapping their squares must yield one key.
    const lvl = tinyLevel([
      { x: 0, y: 3, side: 'enemy', type: 'king', facing: 'south' },
      { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
      { x: 0, y: 1, side: 'player', type: 'rook', facing: 'north' },
      { x: 1, y: 1, side: 'player', type: 'rook', facing: 'north' },
    ], { cols: 4, rows: 4, objective: 'rival-kings' });
    const input = toSolverInput(lvl, 0);

    const base: GameState = decodePosition(canonicalKey(input.start, input, 0), input);
    const rooks = base.pieces.filter((p) => p.side === 'player' && p.type === 'rook');
    expect(rooks.length).toBe(2);
    const swapped: GameState = {
      ...base,
      pieces: base.pieces.map((p) => {
        if (p.id === rooks[0].id) return { ...p, x: rooks[1].x, y: rooks[1].y };
        if (p.id === rooks[1].id) return { ...p, x: rooks[0].x, y: rooks[0].y };
        return p;
      }),
    };
    expect(canonicalKey(swapped, input, 0)).toBe(canonicalKey(base, input, 0));
  });

  it('pawns with DIFFERENT facing are NOT interchangeable (different keys when swapped)', () => {
    // A north-facing and an east-facing pawn have different move/capture graphs (Risk 6): swapping
    // them changes the game, so they must be different classes ⇒ different canonical keys. (Merging
    // them corrupted decode∘encode and collided two distinct move graphs to one proof.)
    const lvl = tinyLevel([
      { x: 0, y: 3, side: 'enemy', type: 'king', facing: 'south' },
      { x: 4, y: 3, side: 'player', type: 'king', facing: 'north' },
      { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
      { x: 2, y: 1, side: 'player', type: 'pawn', facing: 'east' },
    ], { cols: 5, rows: 5, objective: 'rival-kings' });
    const input = toSolverInput(lvl, 0);
    const base: GameState = decodePosition(canonicalKey(input.start, input, 0), input);
    const pawns = base.pieces.filter((p) => p.side === 'player' && p.type === 'pawn');
    expect(pawns.length).toBe(2);
    const swapped: GameState = {
      ...base,
      pieces: base.pieces.map((p) => {
        if (p.id === pawns[0].id) return { ...p, x: pawns[1].x, y: pawns[1].y };
        if (p.id === pawns[1].id) return { ...p, x: pawns[0].x, y: pawns[0].y };
        return p;
      }),
    };
    // Swapping non-fungible pawns lands them on each other's squares WITH THEIR OWN facing kept,
    // which is a genuinely different position ⇒ a different key.
    expect(canonicalKey(swapped, input, 0)).not.toBe(canonicalKey(base, input, 0));
  });

  it('a promoted pawn round-trips as a queen', () => {
    const lvl = tinyLevel([
      { x: 2, y: 4, side: 'enemy', type: 'king', facing: 'south' },
      { x: 1, y: 2, side: 'player', type: 'king', facing: 'north' },
      { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
    ], { cols: 3, rows: 5, objective: 'rival-kings' });
    const input = toSolverInput(lvl, 0);
    // Hand-build a position where the pawn slot is promoted.
    const pos = positionFromState(input.start, input, 0);
    const pawnSlot = input.slots.find((s) => s.canPromote)!;
    pos.promoted[pawnSlot.index] = 1;
    const key = encodePosition(pos, input);
    const decoded = decodePosition(key, input);
    const promoted = decoded.pieces.find((p) => p.id === pawnSlot.id);
    expect(promoted).toBeDefined();
    expect(promoted!.type).toBe('queen');
    expect(canonicalKey(decoded, input, 0)).toBe(key);
  });
});

// ─── solveStepWithPhases frontier emission (the Phase-2 stepper's board feed) ────────────

describe('solveStepWithPhases — frontier emission', () => {
  const bounds = { wallClockMs: 30_000, maxStates: 5_000_000, maxMemoryBytes: 3 * 2 ** 30 };
  const kqk = () => tinyLevel([
    { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
    { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
    { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
  ], { cols: 3, rows: 3, objective: 'rival-kings' });
  const drain = (): SolveStep[] => [...solveStepWithPhases(kqk(), bounds)];

  it('Enumerate carries the decoded root position and its branching', () => {
    const first = drain()[0];
    expect(first.kind).toBe('retrograde');
    if (first.kind !== 'retrograde' || first.phase !== 'Enumerate') throw new Error('first step must be Enumerate');
    expect(first.current).toBeDefined();
    expect(first.current!.key.length).toBeGreaterThan(0);
    expect(first.current!.branching).toBeGreaterThan(0);
    // The inline root board decodes to the three authored living pieces.
    expect(first.current!.state).toBeDefined();
    expect(first.current!.state!.pieces.filter((p) => p.alive).length).toBe(3);
  });

  it('SeedTerminals carries decisive seeds at distance 0 with inline boards', () => {
    const steps = drain();
    const seed = steps.find((s) => s.phase === 'SeedTerminals');
    if (!seed || seed.kind !== 'retrograde' || seed.phase !== 'SeedTerminals') throw new Error('no SeedTerminals step');
    expect(seed.seeded.length).toBeGreaterThan(0);
    expect(seed.seeded.length).toBeLessThanOrEqual(16); // FRONTIER_SAMPLE_CAP
    for (const d of seed.seeded) {
      expect(d.key.length).toBeGreaterThan(0);
      expect(['win', 'loss']).toContain(d.value.outcome);
      expect(d.value.distancePlies).toBe(0);
      expect(d.value.winner === 'player' || d.value.winner === 'enemy').toBe(true);
      expect(d.state).toBeDefined();
      expect(d.state!.pieces.some((p) => p.alive)).toBe(true);
    }
  });

  it('Propagate sweep d carries positions at exactly DTM d, capped, consistent with Converge', () => {
    const steps = drain();
    let sawFrontier = false;
    for (let i = 0; i < steps.length; i += 1) {
      const s = steps[i];
      if (s.kind !== 'retrograde' || s.phase !== 'Propagate') continue;
      const next = steps[i + 1];
      if (!next || next.kind !== 'retrograde' || next.phase !== 'Converge') throw new Error('Propagate must pair with Converge');
      expect(s.newlyDecided.length).toBeLessThanOrEqual(16); // FRONTIER_SAMPLE_CAP
      // The sample never claims more than the sweep actually decided (Converge's exact count).
      expect(s.newlyDecided.length).toBeLessThanOrEqual(next.decidedThisSweep);
      for (const d of s.newlyDecided) {
        sawFrontier = true;
        expect(d.value.distancePlies).toBe(s.sweep);
        expect(['win', 'loss']).toContain(d.value.outcome);
        expect(d.state).toBeDefined();
      }
    }
    expect(sawFrontier).toBe(true); // mate-in-1 has a real sweep-1 frontier
  });

  it('the enriched emission is deterministic (two drains byte-identical)', () => {
    const a = drain().map((s) => JSON.stringify(s));
    const b = drain().map((s) => JSON.stringify(s));
    expect(a).toEqual(b);
  });
});

// ─── solveStepWithPhases honest progression (the watch-the-value-spread contract) ─────────
// The K+P 3×5 board takes multiple real sweeps, so the census must visibly ACCUMULATE —
// emitting the end-of-run totals on every sweep froze the whole story at its final frame.

describe('solveStepWithPhases — honest per-sweep census, drain, why, ablation', () => {
  const bounds = { wallClockMs: 30_000, maxStates: 5_000_000, maxMemoryBytes: 3 * 2 ** 30 };
  const kpk = () => tinyLevel([
    { x: 2, y: 4, side: 'enemy', type: 'king', facing: 'south' },
    { x: 1, y: 2, side: 'player', type: 'king', facing: 'north' },
    { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
  ], { cols: 3, rows: 5, objective: 'rival-kings' });
  const steps = [...solveStepWithPhases(kpk(), bounds)];
  const converges = steps.filter((s): s is Extract<SolveStep, { phase: 'Converge' }> => s.phase === 'Converge');

  it('SeedTerminals carries the seed census: decisive layer-0 + draw terminals', () => {
    const seed = steps.find((s) => s.phase === 'SeedTerminals');
    if (!seed || seed.kind !== 'retrograde' || seed.phase !== 'SeedTerminals') throw new Error('no SeedTerminals');
    expect(seed.seedCounts).toBeDefined();
    expect(seed.seedCounts!.win + seed.seedCounts!.loss + seed.seedCounts!.draw).toBe(seed.totalTerminals);
  });

  it('Converge census ACCUMULATES sweep by sweep (never the final totals from sweep 1)', () => {
    expect(converges.length).toBeGreaterThan(2); // a real multi-sweep board
    const totals = converges.map((c) => c.proven.win + c.proven.loss + c.proven.draw);
    for (let i = 1; i < totals.length; i += 1) expect(totals[i]).toBeGreaterThanOrEqual(totals[i - 1]);
    // The story must actually move: the first Converge is NOT already the final census.
    expect(totals[0]).toBeLessThan(totals[totals.length - 1]);
    // Sweep math: each pre-fixpoint sweep adds exactly decidedThisSweep to win+loss.
    for (let i = 1; i < converges.length - 1; i += 1) {
      const winLossDelta = (converges[i].proven.win + converges[i].proven.loss)
        - (converges[i - 1].proven.win + converges[i - 1].proven.loss);
      expect(winLossDelta).toBe(converges[i].decidedThisSweep);
    }
  });

  it('draws stay at the terminal count until the fixpoint drain proves the loopy draws', () => {
    const preFix = converges.filter((c) => !c.atFixpoint);
    const drawCounts = new Set(preFix.map((c) => c.proven.draw));
    expect(drawCounts.size).toBe(1); // constant before the drain
    const fix = converges[converges.length - 1];
    expect(fix.atFixpoint).toBe(true);
    expect(fix.drainedToDraw).toBeDefined();
    expect(fix.proven.draw).toBe([...drawCounts][0] + fix.drainedToDraw!);
    // At the fixpoint the census covers the ENTIRE enumerated space.
    const enumerated = steps[0].kind === 'retrograde' && steps[0].phase === 'Enumerate' ? steps[0].enumerated : -1;
    expect(fix.proven.win + fix.proven.loss + fix.proven.draw).toBe(enumerated);
  });

  it('sampled frontier wins carry the witness move; losses the successor census — with exact +1 arithmetic', () => {
    let sawWinWhy = false;
    let sawLossWhy = false;
    for (const s of steps) {
      if (s.kind !== 'retrograde' || s.phase !== 'Propagate') continue;
      for (const d of s.newlyDecided) {
        expect(d.successorCensus).toBeDefined();
        const census = d.successorCensus!;
        if (d.value.outcome === 'win') {
          sawWinWhy = true;
          expect(d.witnessMove).toBeDefined();
          // WIN in d ⇐ the witness child is a proven loss-for-opponent at d−1.
          expect(d.witnessMove!.childValue.outcome).toBe('loss');
          expect(d.witnessMove!.childValue.distancePlies).toBe(d.value.distancePlies! - 1);
          expect(census.opponentLosses).toBeGreaterThan(0);
        } else {
          sawLossWhy = true;
          // LOSS ⇐ EVERY move reaches a proven opponent win; best defence sets the DTM.
          expect(census.opponentWins).toBe(census.moves);
          expect(census.opponentLosses).toBe(0);
          expect(census.draws).toBe(0);
          expect(census.bestDefenceDTM).toBe(d.value.distancePlies! - 1);
        }
      }
    }
    expect(sawWinWhy).toBe(true);
    expect(sawLossWhy).toBe(true);
  });

  it('terminal seeds carry NO witness (they are decided by the rules, not the back-up rule)', () => {
    const seed = steps.find((s) => s.phase === 'SeedTerminals');
    if (!seed || seed.kind !== 'retrograde' || seed.phase !== 'SeedTerminals') throw new Error('no SeedTerminals');
    for (const d of seed.seeded) {
      expect(d.witnessMove).toBeUndefined();
      expect(d.successorCensus).toBeUndefined();
    }
  });

  it('ReadValue carries the piece-value ablation report (the card-promised headline)', () => {
    const rv = steps[steps.length - 1];
    if (rv.kind !== 'retrograde' || rv.phase !== 'ReadValue') throw new Error('last step must be ReadValue');
    expect(rv.pieceValues).toBeDefined();
    expect(rv.pieceValues!.entries.length).toBeGreaterThan(0);
    // The K+P win is carried by the pawn: ablating it must flip/degrade the outcome.
    const pawn = rv.pieceValues!.entries.find((e) => e.type === 'pawn' && e.side === 'player');
    expect(pawn).toBeDefined();
    expect(pawn!.outcomeFlipped).toBe(true);
  });
});
