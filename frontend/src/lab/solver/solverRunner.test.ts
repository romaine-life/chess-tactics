// SolverRunner tests: phase order + ground-truth values on tiny hand-checked boards,
// deterministic replay (two runs → identical step sequences), snapshot step→back→step
// re-yields the IDENTICAL step, both vocabularies (retrograde + bounded search), and
// pre-recorded SolveStep[] trace replay through the same interface.
// Vitest v4 hides console.log on passing tests — every claim is an assertion.

import { describe, it, expect } from 'vitest';
import { createBlankLevel, type Level, type LevelUnit, type ObjectiveType } from '../../core/level';
import type { SolveBounds, SolveStep } from '../../core/solver';
import { SEARCH_PHASES } from '../../core/solver';
import { SolverRunner, foldStepIntoView, initialViewState, type SolverStepConfig } from './solverRunner';

function tinyLevel(units: LevelUnit[], cols: number, rows: number, objective: ObjectiveType = 'rival-kings'): Level {
  const lvl = createBlankLevel('tiny', 'Tiny', cols, rows);
  lvl.objective = objective;
  lvl.layers.units = units.map((u) => ({ ...u }));
  return lvl;
}

const BOUNDS: SolveBounds = { wallClockMs: 30_000, maxStates: 5_000_000, maxMemoryBytes: 3 * 2 ** 30 };

/** 3×3 K+Q vs K — mate-in-1, ground truth {win, player, 1} (retrograde.test.ts). */
const mateIn1 = () => tinyLevel([
  { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
  { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
  { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
], 3, 3);

/** 4×4 K vs K — every position drawn (the loopy canary). */
const kvk = () => tinyLevel([
  { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
  { x: 3, y: 3, side: 'player', type: 'king', facing: 'north' },
], 4, 4);

/** 3×5 K+P vs K — mate-in-5 via queening; a real interior search for the search phases. */
const pawnBoard = () => tinyLevel([
  { x: 2, y: 4, side: 'enemy', type: 'king', facing: 'south' },
  { x: 1, y: 2, side: 'player', type: 'king', facing: 'north' },
  { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
], 3, 5);

const retroConfig = (level: Level): SolverStepConfig => ({ level, bounds: BOUNDS, seed: 0, mode: 'retrograde' });
const searchConfig = (level: Level): SolverStepConfig => ({
  level, bounds: { ...BOUNDS, maxStates: 200_000 }, seed: 0, mode: 'search', searchDepthPlies: 6,
});

/** Drive a runner to exhaustion, collecting every consumed step. */
function drain(runner: SolverRunner): SolveStep[] {
  const steps: SolveStep[] = [];
  for (;;) {
    const r = runner.runStepWithPhases();
    if (!r) break;
    steps.push(r.stepResult.step);
  }
  return steps;
}

describe('SolverRunner — retrograde vocabulary', () => {
  it('emits phases in order: Enumerate, SeedTerminals, (Propagate, Converge)×N, ReadValue', () => {
    const runner = new SolverRunner(retroConfig(mateIn1()));
    const phases = drain(runner).map((s) => s.phase);

    expect(phases[0]).toBe('Enumerate');
    expect(phases[1]).toBe('SeedTerminals');
    expect(phases[phases.length - 1]).toBe('ReadValue');
    // The middle is strict Propagate/Converge alternation.
    const middle = phases.slice(2, -1);
    expect(middle.length).toBeGreaterThan(0);
    expect(middle.length % 2).toBe(0);
    for (let i = 0; i < middle.length; i += 2) {
      expect(middle[i]).toBe('Propagate');
      expect(middle[i + 1]).toBe('Converge');
    }
  });

  it('mate-in-1 ends at the ground-truth root value {win, player, 1}', () => {
    const runner = new SolverRunner(retroConfig(mateIn1()));
    drain(runner);
    const view = runner.getCurrentState();
    expect(view.rootValue).toEqual({ outcome: 'win', winner: 'player', distancePlies: 1 });
    expect(view.rootBounds).toEqual({ lower: 'win', upper: 'win', bestDistancePlies: 1, proven: true });
    expect(view.solvedCounts.win).toBeGreaterThan(0);
    expect(view.solvedCounts.loss).toBeGreaterThan(0);
    expect(view.atFixpoint).toBe(true);
    expect(runner.ended).toBe(true);
  });

  it('K vs K ends at a proven draw with zero decisive positions', () => {
    const runner = new SolverRunner(retroConfig(kvk()));
    drain(runner);
    const view = runner.getCurrentState();
    expect(view.rootValue).toEqual({ outcome: 'draw' });
    expect(view.solvedCounts.win).toBe(0);
    expect(view.solvedCounts.loss).toBe(0);
    expect(view.solvedCounts.draw).toBeGreaterThan(0);
    expect(view.terminals).toBe(0); // kings are never adjacent, never captured
  });

  it('step results carry monotonically increasing indexes and the running headline counters', () => {
    const runner = new SolverRunner(retroConfig(mateIn1()));
    let i = 0;
    for (;;) {
      const r = runner.runStepWithPhases();
      if (!r) break;
      expect(r.stepResult.index).toBe(i);
      expect(r.stepResult.phase).toBe(r.stepResult.step.phase);
      expect(r.stepResult.phaseIndex).toBeGreaterThanOrEqual(0);
      expect(r.stepResult.phaseIndex).toBeLessThan(5);
      i += 1;
      if (r.stepResult.done) {
        expect(runner.runStepWithPhases()).toBeNull();
        break;
      }
    }
    expect(i).toBe(runner.stepIndex);
  });
});

describe('SolverRunner — deterministic replay', () => {
  it('two retrograde runs yield byte-identical step sequences', () => {
    const a = drain(new SolverRunner(retroConfig(pawnBoard())));
    const b = drain(new SolverRunner(retroConfig(pawnBoard())));
    expect(a.length).toBe(b.length);
    expect(a.map((s) => JSON.stringify(s))).toEqual(b.map((s) => JSON.stringify(s)));
  });

  it('two search runs yield byte-identical step sequences', () => {
    const a = drain(new SolverRunner(searchConfig(pawnBoard())));
    const b = drain(new SolverRunner(searchConfig(pawnBoard())));
    expect(a.length).toBeGreaterThan(0);
    expect(a.map((s) => JSON.stringify(s))).toEqual(b.map((s) => JSON.stringify(s)));
  });
});

describe('SolverRunner — snapshot / step-back', () => {
  it('step → back → step re-yields the IDENTICAL step and view', () => {
    const runner = new SolverRunner(retroConfig(mateIn1()));
    for (let i = 0; i < 3; i += 1) expect(runner.runStepWithPhases()).not.toBeNull();

    const snap = runner.getSnapshot();
    expect(snap).toEqual({ stepIndex: 3 });

    const first = runner.runStepWithPhases()!;
    const viewAfter = runner.getCurrentState();

    runner.restoreSnapshot(snap);
    expect(runner.stepIndex).toBe(3);

    const again = runner.runStepWithPhases()!;
    expect(JSON.stringify(again.stepResult)).toBe(JSON.stringify(first.stepResult));
    expect(JSON.stringify(again.phases)).toBe(JSON.stringify(first.phases));
    expect(JSON.stringify(runner.getCurrentState())).toBe(JSON.stringify(viewAfter));
  });

  it('restore to 0 refolds to the initial view; the whole rerun matches a fresh drain', () => {
    const runner = new SolverRunner(retroConfig(mateIn1()));
    const full = drain(runner);

    runner.restoreSnapshot({ stepIndex: 0 });
    expect(runner.stepIndex).toBe(0);
    expect(JSON.stringify(runner.getCurrentState())).toBe(JSON.stringify(initialViewState('retrograde')));

    const rerun = drain(runner);
    expect(rerun.map((s) => JSON.stringify(s))).toEqual(full.map((s) => JSON.stringify(s)));
  });

  it('restore can fast-forward past the cursor (redo without recompute)', () => {
    const runner = new SolverRunner(retroConfig(mateIn1()));
    const full = drain(new SolverRunner(retroConfig(mateIn1())));

    runner.restoreSnapshot({ stepIndex: 5 });
    expect(runner.stepIndex).toBe(5);
    const next = runner.runStepWithPhases()!;
    expect(JSON.stringify(next.stepResult.step)).toBe(JSON.stringify(full[5]));
  });
});

describe('SolverRunner — search vocabulary', () => {
  it('emits all five contract search phases — Quiesce included', () => {
    const steps = drain(new SolverRunner(searchConfig(pawnBoard())));
    expect(steps.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const s of steps) {
      expect(s.kind).toBe('search');
      expect(SEARCH_PHASES).toContain(s.phase);
      seen.add(s.phase);
    }
    expect(seen.has('Generate')).toBe(true);
    expect(seen.has('Order')).toBe(true);
    expect(seen.has('Descend')).toBe(true);
    expect(seen.has('Quiesce')).toBe(true); // the leaf phase — every PhaseBar segment can light
    expect(seen.has('BackUp')).toBe(true);
  });

  it('folds the αβ window and root bounds into the view', () => {
    const runner = new SolverRunner(searchConfig(pawnBoard()));
    drain(runner);
    const view = runner.getCurrentState();
    expect(view.mode).toBe('search');
    expect(view.window).not.toBeNull();
    expect(view.window!.depth).toBeGreaterThan(0);
  });

  it('a completed live search SHOWS ITS ANSWER: the folded view carries proven root bounds', () => {
    // Regression: no step ever carried rootBounds, so the status strip read "root unknown"
    // after the owner watched the entire solve prove mate.
    const runner = new SolverRunner(searchConfig(pawnBoard()));
    const steps = drain(runner);
    const withBounds = steps.filter((s) => s.kind === 'search' && s.phase === 'BackUp' && s.rootBounds !== undefined);
    expect(withBounds.length).toBeGreaterThan(0); // one per completed deepening iteration
    const view = runner.getCurrentState();
    expect(view.rootBounds).not.toBeNull();
    expect(view.rootBounds!.proven).toBe(true);
    expect(view.rootValue).toEqual({ outcome: 'win', winner: 'player', distancePlies: 5 }); // K+P mate-in-5 ground truth
  });

  it('the board line walks back UP the tree with the values: line length === window.ply on every BackUp/Order/Quiesce', () => {
    // Regression: the fold never trimmed view.line on BackUp, so during a back-up cascade the
    // board stayed frozen at the deepest leaf while the panel narrated parent nodes.
    const runner = new SolverRunner(searchConfig(pawnBoard()));
    let view = initialViewState('search');
    let checked = 0;
    for (;;) {
      const r = runner.runCoarseStep();
      if (!r) break;
      view = foldStepIntoView(view, r.step);
      if (r.step.kind === 'search' && (r.step.phase === 'BackUp' || r.step.phase === 'Order' || r.step.phase === 'Quiesce')) {
        expect(view.line.length).toBe(r.step.window.ply);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('SolverRunner — retrograde progression is honest (fold-level)', () => {
  it('proven counts accumulate across sweeps and unknown drops to ZERO at the fixpoint', () => {
    const runner = new SolverRunner(retroConfig(pawnBoard()));
    let view = initialViewState('retrograde');
    const provenTotals: number[] = [];
    for (;;) {
      const r = runner.runCoarseStep();
      if (!r) break;
      view = foldStepIntoView(view, r.step);
      if (r.step.kind === 'retrograde' && r.step.phase === 'Converge') {
        provenTotals.push(view.solvedCounts.win + view.solvedCounts.loss + view.solvedCounts.draw);
      }
    }
    expect(provenTotals.length).toBeGreaterThan(2);
    expect(provenTotals[0]).toBeLessThan(provenTotals[provenTotals.length - 1]); // it MOVES
    // Trace complete: everything proven, nothing unknown, coverage whole.
    expect(view.atFixpoint).toBe(true);
    expect(view.remainingUnknown).toBe(0);
    expect(view.solvedCounts.undecided).toBe(0);
    expect(view.solvedCounts.win + view.solvedCounts.loss + view.solvedCounts.draw).toBe(view.enumerated);
  });
});

describe('SolverRunner — recorded-trace replay (the cluster-run seam)', () => {
  it('a recorded retrograde trace replays step-for-step identically to the live run', () => {
    const liveRunner = new SolverRunner(retroConfig(mateIn1()));
    const recorded = drain(liveRunner);
    const liveView = liveRunner.getCurrentState();

    const replayRunner = new SolverRunner({ level: mateIn1(), bounds: BOUNDS, seed: 0, trace: recorded });
    expect(replayRunner.solveMode).toBe('retrograde');
    const replayed = drain(replayRunner);

    expect(replayed.map((s) => JSON.stringify(s))).toEqual(recorded.map((s) => JSON.stringify(s)));
    expect(JSON.stringify(replayRunner.getCurrentState())).toBe(JSON.stringify(liveView));
  });

  it('a recorded search trace replays identically too (mode derived from the steps)', () => {
    const recorded = drain(new SolverRunner(searchConfig(pawnBoard())));
    const replayRunner = new SolverRunner({ level: pawnBoard(), bounds: BOUNDS, seed: 0, trace: recorded });
    expect(replayRunner.solveMode).toBe('search');
    const replayed = drain(replayRunner);
    expect(replayed.map((s) => JSON.stringify(s))).toEqual(recorded.map((s) => JSON.stringify(s)));
  });
});

describe('SolverRunner — coarse batches', () => {
  it('runSweep stops on Converge boundaries then ReadValue; runDepth jumps to the fixpoint', () => {
    const bySweep = new SolverRunner(retroConfig(mateIn1()));
    const first = bySweep.runSweep()!;
    expect(first.step.phase).toBe('Converge');

    // Sweeping to the end visits only Converge boundaries then the final ReadValue.
    let last = first;
    for (;;) {
      const r = bySweep.runSweep();
      if (!r) break;
      expect(['Converge', 'ReadValue']).toContain(r.step.phase);
      last = r;
    }
    expect(last.step.phase).toBe('ReadValue');
    expect(bySweep.ended).toBe(true);

    const byDepth = new SolverRunner(retroConfig(mateIn1()));
    const fix = byDepth.runDepth()!;
    expect(fix.step.kind).toBe('retrograde');
    expect(fix.step.kind === 'retrograde' && fix.step.phase === 'Converge' && fix.step.atFixpoint).toBe(true);
    const readout = byDepth.runDepth()!;
    expect(readout.step.phase).toBe('ReadValue');
    expect(byDepth.runDepth()).toBeNull();
  });

  it('search runDepth batches exactly one deepening iteration at a time', () => {
    const micro = drain(new SolverRunner(searchConfig(pawnBoard())));
    const runner = new SolverRunner(searchConfig(pawnBoard()));

    // The first batch consumes only steps of ONE iteration (constant depth+ply sum).
    const r1 = runner.runDepth()!;
    expect(r1.step.kind).toBe('search');
    const firstBatch = micro.slice(0, runner.stepIndex);
    const sums = new Set(firstBatch.map((s) => (s.kind === 'search' ? s.window.depth + s.window.ply : -1)));
    expect(sums.size).toBe(1);

    // Draining by iterations covers the SAME full sequence, in more than one batch.
    let calls = 1;
    while (runner.runDepth() !== null) calls += 1;
    expect(runner.stepIndex).toBe(micro.length);
    expect(calls).toBeGreaterThan(1);
  });

  it('coarse batches consume the SAME underlying sequence as micro-steps', () => {
    const micro = drain(new SolverRunner(retroConfig(mateIn1())));
    const coarse = new SolverRunner(retroConfig(mateIn1()));
    while (coarse.runSweep() !== null) { /* drain by sweeps */ }
    expect(coarse.stepIndex).toBe(micro.length);
    expect(JSON.stringify(coarse.getCurrentState())).toBe(
      JSON.stringify(micro.reduce(foldStepIntoView, initialViewState('retrograde'))),
    );
  });
});
