// StepBuffer tests: the setTimeout(0) producer/consumer preserves the exact deterministic
// trace order (the sequence-integrity invariant), computeImmediate(n) ≡ computeOne()×n,
// captureSteps toggles phase detail, prefill/trimConsumedTo/clearBuffer bookkeeping, and
// manual stepping after produce-ahead never skips entries (the divergence fix over bender).
// Vitest v4 hides console.log on passing tests — every claim is an assertion.

import { describe, it, expect } from 'vitest';
import { createBlankLevel, type Level, type LevelUnit } from '../../core/level';
import type { SolveBounds } from '../../core/solver';
import { SolverRunner, type SolverStepConfig } from './solverRunner';
import { StepBuffer } from './solverBuffer';

function tinyLevel(units: LevelUnit[], cols: number, rows: number): Level {
  const lvl = createBlankLevel('tiny', 'Tiny', cols, rows);
  lvl.objective = 'rival-kings';
  lvl.layers.units = units.map((u) => ({ ...u }));
  return lvl;
}

const BOUNDS: SolveBounds = { wallClockMs: 30_000, maxStates: 5_000_000, maxMemoryBytes: 3 * 2 ** 30 };

/** 3×3 K+Q vs K mate-in-1 — a short retrograde trace, perfect buffer fodder. */
const config = (): SolverStepConfig => ({
  level: tinyLevel([
    { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
    { x: 2, y: 2, side: 'player', type: 'king', facing: 'north' },
    { x: 2, y: 0, side: 'player', type: 'queen', facing: 'north' },
  ], 3, 3),
  bounds: BOUNDS,
  seed: 0,
  mode: 'retrograde',
});

/** The full deterministic step-JSON sequence, from a bare runner (the reference). */
function referenceTrace(): string[] {
  const runner = new SolverRunner(config());
  const out: string[] = [];
  for (;;) {
    const r = runner.runCoarseStep();
    if (!r) break;
    out.push(JSON.stringify(r.step));
  }
  return out;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function waitFor(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const startedAt = Date.now();
  while (!cond()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('waitFor timed out');
    await sleep(2);
  }
}

describe('StepBuffer — produce/consume order', () => {
  it('the async producer + consume() hands out the exact deterministic sequence', async () => {
    const reference = referenceTrace();
    const buffer = new StepBuffer(config(), 4);
    buffer.setBatchSize(2);
    buffer.startProducing();

    const seen: string[] = [];
    while (!buffer.ended) {
      await waitFor(() => buffer.available > 0 || buffer.ended);
      const entry = buffer.consume();
      if (!entry) continue;
      expect(entry.step.index).toBe(seen.length); // contiguous, in order
      seen.push(JSON.stringify(entry.step.step));
    }
    buffer.stopProducing();

    expect(seen).toEqual(reference);
    expect(buffer.consumedCount).toBe(reference.length);
  });

  it('onBufferReady fires when the buffer transitions empty → non-empty', async () => {
    const buffer = new StepBuffer(config(), 4);
    let ready = 0;
    buffer.onBufferReady = () => { ready += 1; };
    buffer.startProducing();
    await waitFor(() => buffer.available > 0);
    expect(ready).toBe(1);
    buffer.stopProducing();
  });
});

describe('StepBuffer — synchronous stepping', () => {
  it('computeImmediate(n) yields the same sequence as computeOne()×n', () => {
    const a = new StepBuffer(config());
    const b = new StepBuffer(config());

    const viaImmediate = a.computeImmediate(6).map((s) => JSON.stringify(s.step));
    const viaOne: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      const entry = b.computeOne();
      expect(entry).not.toBeNull();
      viaOne.push(JSON.stringify(entry!.step.step));
    }
    expect(viaImmediate).toEqual(viaOne);
    expect(viaImmediate).toEqual(referenceTrace().slice(0, 6));
    expect(a.consumedCount).toBe(6);
    expect(b.consumedCount).toBe(6);
  });

  it('manual stepping after produce-ahead DRAINS the buffer — never skips entries', async () => {
    const buffer = new StepBuffer(config(), 6);
    buffer.setBatchSize(3);
    buffer.startProducing();
    await waitFor(() => buffer.available >= 3);
    buffer.stopProducing();

    // The runner produced ahead; a manual step must still hand out index 0.
    const entry = buffer.computeOne()!;
    expect(entry.step.index).toBe(0);
    const next = buffer.computeOne()!;
    expect(next.step.index).toBe(1);

    // computeImmediate keeps draining in order past the buffered region.
    const rest = buffer.computeImmediate(4);
    expect(rest.map((s) => s.index)).toEqual([2, 3, 4, 5]);
  });

  it('captureSteps=true carries phase detail; false produces coarse entries', () => {
    const withPhases = new StepBuffer(config());
    expect(withPhases.captureSteps).toBe(true);
    const full = withPhases.computeOne()!;
    expect(full.phases).toBeDefined();

    const coarse = new StepBuffer(config());
    coarse.captureSteps = false;
    const bare = coarse.computeOne()!;
    expect(bare.phases).toBeUndefined();
    expect(JSON.stringify(bare.step.step)).toBe(JSON.stringify(full.step.step)); // same trace either way
  });
});

describe('StepBuffer — prefill / snapshot / trim bookkeeping', () => {
  it('prefill re-serves the given entries before computing fresh ones (the redo seam)', () => {
    const buffer = new StepBuffer(config());
    const e0 = buffer.computeOne()!;
    const e1 = buffer.computeOne()!;
    expect([e0.step.index, e1.step.index]).toEqual([0, 1]);

    // Undo both: rewind, then redo via prefill.
    buffer.restoreSnapshot({ stepIndex: 0 });
    buffer.trimConsumedTo(0);
    buffer.prefill([e0, e1]);

    const r0 = buffer.computeOne()!;
    const r1 = buffer.computeOne()!;
    expect(JSON.stringify(r0)).toBe(JSON.stringify(e0));
    expect(JSON.stringify(r1)).toBe(JSON.stringify(e1));

    // And the NEXT fresh step continues the sequence — index 2, not a repeat or a skip.
    const r2 = buffer.computeOne()!;
    expect(r2.step.index).toBe(2);
  });

  it('getSnapshot reflects the CONSUME position, not the produced-ahead runner', async () => {
    const buffer = new StepBuffer(config(), 6);
    buffer.setBatchSize(3);
    buffer.startProducing();
    await waitFor(() => buffer.available >= 2);
    buffer.stopProducing();

    expect(buffer.getSnapshot()).toEqual({ stepIndex: 0 }); // nothing consumed yet
    buffer.consume();
    expect(buffer.getSnapshot()).toEqual({ stepIndex: 1 });
  });

  it('clearBuffer rewinds the runner to the consume position (no skipped steps)', async () => {
    const buffer = new StepBuffer(config(), 6);
    buffer.setBatchSize(3);
    buffer.startProducing();
    await waitFor(() => buffer.available >= 3);
    buffer.stopProducing();

    buffer.consume(); // consumed index 0; runner is ahead
    buffer.clearBuffer();
    expect(buffer.available).toBe(0);

    const next = buffer.computeOne()!;
    expect(next.step.index).toBe(1); // continues exactly after the consumed prefix
  });

  it('restoreSnapshot + trimConsumedTo rewind both the trace and the log', () => {
    const buffer = new StepBuffer(config());
    buffer.computeImmediate(5);
    expect(buffer.consumedCount).toBe(5);
    expect(buffer.getRunnerState().stepIndex).toBe(5);

    buffer.restoreSnapshot({ stepIndex: 3 });
    buffer.trimConsumedTo(3);
    expect(buffer.consumedCount).toBe(3);
    expect(buffer.getRunnerState().stepIndex).toBe(3);

    const next = buffer.computeOne()!;
    expect(next.step.index).toBe(3); // re-yields the step that was undone
  });

  it('getRunnerState().view tracks the consumed position and ended only at true exhaustion', () => {
    const reference = referenceTrace();
    const buffer = new StepBuffer(config());
    expect(buffer.ended).toBe(false);

    const results = buffer.computeImmediate(reference.length);
    expect(results.length).toBe(reference.length);
    expect(buffer.ended).toBe(true);

    const state = buffer.getRunnerState();
    expect(state.view.rootValue).toEqual({ outcome: 'win', winner: 'player', distancePlies: 1 });
    expect(state.stepIndex).toBe(reference.length);
    expect(state.mode).toBe('retrograde');
  });
});

/** 3×5 K+P vs K mate-in-5 — a LONG trace (many sweeps), so +10 batches never hit the end. */
const longConfig = (): SolverStepConfig => ({
  level: tinyLevel([
    { x: 2, y: 4, side: 'enemy', type: 'king', facing: 'south' },
    { x: 1, y: 2, side: 'player', type: 'king', facing: 'north' },
    { x: 1, y: 1, side: 'player', type: 'pawn', facing: 'north' },
  ], 3, 5),
  bounds: BOUNDS,
  seed: 0,
  mode: 'retrograde',
});

// The hook's exact gesture sequences (useSolverStepper delegates every position change to
// these buffer calls; there is deliberately NO stored-entry redo stack to fall out of sync).
describe('StepBuffer — hook gesture sequences (regression: stale-redo corruption)', () => {
  it('Step ×3 → +10 → Back(batch) → Step serves the NEXT step, no duplicates, no skips', () => {
    const buffer = new StepBuffer(longConfig());

    // Step ×3 (three gestures, undo entries at 0,1,2).
    for (let i = 0; i < 3; i += 1) expect(buffer.computeOne()!.step.index).toBe(i);

    // +10 as ONE gesture (undo entry at 3).
    const batch = buffer.computeImmediate(10);
    expect(batch.map((s) => s.index)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

    // Back — undoes the WHOLE batch (the hook restores to the pre-gesture position 3).
    buffer.restoreSnapshot({ stepIndex: 3 });
    buffer.trimConsumedTo(3);
    expect(buffer.getRunnerState().stepIndex).toBe(3);

    // Step: must serve trace step 3 again (redo-by-recompute), then 4 — never a stale
    // pre-batch entry, never a skip.
    expect(buffer.computeOne()!.step.index).toBe(3);
    expect(buffer.computeOne()!.step.index).toBe(4);
    // The consumed log is contiguous 0..4 with no duplicates.
    expect(buffer.getConsumedResults().map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it('Step → +10 → Back → Step replays the batch head identically (determinism)', () => {
    const reference = referenceTrace();
    const buffer = new StepBuffer(config());

    buffer.computeOne();
    buffer.computeImmediate(10);
    buffer.restoreSnapshot({ stepIndex: 1 });
    buffer.trimConsumedTo(1);

    const replayed = buffer.computeOne()!;
    expect(replayed.step.index).toBe(1);
    expect(JSON.stringify(replayed.step.step)).toBe(reference[1]);
  });

  it('computeUntil stops INCLUSIVE on the first boundary step (the Sweep transport)', () => {
    const buffer = new StepBuffer(config());
    const results = buffer.computeUntil((r) => r.step.kind === 'retrograde' && r.step.phase === 'Converge');
    expect(results.length).toBeGreaterThan(0);
    const last = results[results.length - 1].step;
    expect(last.phase).toBe('Converge');
    // Everything before the boundary is pre-Converge; nothing after it was consumed.
    for (const r of results.slice(0, -1)) expect(r.step.phase).not.toBe('Converge');
    // The next fresh step continues the sequence exactly.
    const next = buffer.computeOne()!;
    expect(next.step.index).toBe(results.length);
  });

  it('computeUntil drains to the end (empty tail) when no step matches', () => {
    const reference = referenceTrace();
    const buffer = new StepBuffer(config());
    const results = buffer.computeUntil(() => false);
    expect(results.length).toBe(reference.length);
    expect(buffer.ended).toBe(true);
    expect(buffer.computeUntil(() => false)).toEqual([]);
  });
});
