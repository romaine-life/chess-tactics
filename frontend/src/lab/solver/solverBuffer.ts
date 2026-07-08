// Rolling lookahead buffer for the solver stepper (mirrors bender-world's engine/episode-buffer.ts,
// itself adapted from eight-queens' GenerationBuffer). Pre-computes phase micro-steps ahead of
// the animation playhead via a setTimeout(0) producer loop, so stepping never blocks paint.
//
// The buffer unit is one PHASE MICRO-STEP (bender's unit is an episode — documented divergence:
// retrograde/search phases are the thing being watched here, so they ARE the playhead grain).
//
// Sequence-integrity divergence from bender (deliberate): `computeOne()` / `computeImmediate()`
// DRAIN the lookahead buffer before computing fresh from the runner, and `clearBuffer()` REWINDS
// the runner to the consume cursor. In bender, manual stepping past a produced-ahead buffer could
// skip entries (episodes are homogeneous there, so it only blurred a chart); here the consumed
// sequence IS the lesson, so the invariant is hard:
//     runner.stepIndex === cursorIndex + buffer.length
// where cursorIndex is the trace index of the next entry the consumer will receive. Every path
// (consume / computeOne / computeImmediate / prefill / clearBuffer / restoreSnapshot) preserves it.
//
// `prefill` (redo entries pushed back in front) is also the Phase-3 seam: a persisted cluster
// trace replays through the SAME buffer by constructing the runner in trace mode.

import {
  SolverRunner,
  type SolverSnapshot, type SolverStepConfig, type SolverStepResult, type SolverViewState,
} from './solverRunner';
import type { SolveMode } from '../../core/solver';
import type { SolverPhaseData } from './phaseData';

/** One buffered micro-step: the step result, the cumulative view AFTER it, and (when
 * captureSteps) the per-phase panel view-model. */
export interface WalkthroughPhaseStep {
  step: SolverStepResult;
  viewSnapshot: SolverViewState;
  /** Panel detail — present when captureSteps was on when this entry was produced. */
  phases?: SolverPhaseData;
}

export class StepBuffer {
  private runner: SolverRunner;
  private buffer: WalkthroughPhaseStep[] = [];
  private consumedResults: SolverStepResult[] = [];
  /** Trace index of the next entry the consumer will receive (see invariant above). */
  private cursorIndex = 0;
  /** The view AFTER the last entry handed to the consumer — what the user is looking at.
   * The runner's own view may be produced-AHEAD of this; UI sync must read this one. */
  private lastConsumedView: SolverViewState | null = null;
  private maxSize: number;
  private producing = false;
  private produceTimerId: ReturnType<typeof setTimeout> | null = null;
  private batchSize = 1;

  /** When true (default — the panels always want detail), buffered entries carry the
   * per-phase view-model; false produces coarse entries for fast playback. */
  captureSteps = true;

  /** Called when buffer transitions from empty to non-empty */
  onBufferReady: (() => void) | null = null;

  constructor(config: SolverStepConfig, maxSize = 18) {
    this.runner = new SolverRunner(config);
    this.maxSize = maxSize;
  }

  /** Start the background producer loop */
  startProducing(): void {
    if (this.producing) return;
    this.producing = true;
    this.scheduleProduction();
  }

  /** Stop the producer loop */
  stopProducing(): void {
    this.producing = false;
    if (this.produceTimerId !== null) {
      clearTimeout(this.produceTimerId);
      this.produceTimerId = null;
    }
  }

  /** Set how many steps to compute per tick (for high speeds) */
  setBatchSize(size: number): void {
    this.batchSize = Math.max(1, Math.min(size, 50));
  }

  /** Number of unconsumed entries ready for animation */
  get available(): number {
    return this.buffer.length;
  }

  /** Total steps handed to the consumer (consume + computeOne + computeImmediate) */
  get consumedCount(): number {
    return this.consumedResults.length;
  }

  /** Total steps computed (consumed + buffered) */
  get totalComputed(): number {
    return this.cursorIndex + this.buffer.length;
  }

  /** Has the trace been fully consumed? (Buffered-but-unconsumed entries count as remaining.) */
  get ended(): boolean {
    return this.buffer.length === 0 && this.runner.ended;
  }

  /** Peek at an entry by offset from the consume position (0 = next to consume) */
  peek(offset: number): WalkthroughPhaseStep | undefined {
    return this.buffer[offset];
  }

  /** Consume the next entry (animation crossed a step boundary) */
  consume(): WalkthroughPhaseStep | undefined {
    const entry = this.buffer.shift();
    if (entry) {
      this.cursorIndex += 1;
      this.consumedResults.push(entry.step);
      this.lastConsumedView = entry.viewSnapshot;
      if (this.producing && this.buffer.length < this.maxSize) {
        this.scheduleProduction();
      }
    }
    return entry;
  }

  /** All step results handed out so far. */
  getConsumedResults(): SolverStepResult[] {
    return [...this.consumedResults];
  }

  /** Prefill the buffer with entries (the redo stack after a goBack, or a persisted-trace
   * page). Entries must be CONTIGUOUS trace steps immediately preceding the current buffer
   * head (or, buffer empty, starting at the consume position — redo satisfies both by
   * construction). The runner is fast-forwarded past everything buffered (a cache-cheap
   * index restore) so fresh production continues AFTER the prefill instead of duplicating it. */
  prefill(entries: WalkthroughPhaseStep[]): void {
    if (entries.length === 0) return;
    this.buffer.unshift(...entries);
    this.cursorIndex = entries[0].step.index;
    this.runner.restoreSnapshot({ stepIndex: this.cursorIndex + this.buffer.length });
  }

  /**
   * Compute N steps immediately (synchronous, for stepN). Drains buffered entries first
   * (sequence integrity), then computes coarse from the runner. Returns the step results.
   */
  computeImmediate(count: number): SolverStepResult[] {
    const results: SolverStepResult[] = [];
    for (let i = 0; i < count; i += 1) {
      const buffered = this.buffer.shift();
      if (buffered) {
        this.cursorIndex += 1;
        this.consumedResults.push(buffered.step);
        this.lastConsumedView = buffered.viewSnapshot;
        results.push(buffered.step);
        continue;
      }
      const step = this.runner.runCoarseStep();
      if (!step) break;
      this.cursorIndex += 1;
      this.consumedResults.push(step);
      this.lastConsumedView = this.runner.getCurrentState();
      results.push(step);
    }
    return results;
  }

  /**
   * Compute steps immediately UNTIL one satisfies `stop` (inclusive) or the trace ends —
   * the coarse "jump to the next sweep / next deepening iteration" transport. Same
   * sequence-integrity path as computeImmediate (drains the lookahead first). `cap` bounds
   * a runaway predicate; the engine trace is already fully cached after the first pull, so
   * this is fold work, not solve work.
   */
  computeUntil(stop: (step: SolverStepResult) => boolean, cap = 200_000): SolverStepResult[] {
    const results: SolverStepResult[] = [];
    for (let i = 0; i < cap; i += 1) {
      const batch = this.computeImmediate(1);
      if (batch.length === 0) break;
      results.push(batch[0]);
      if (stop(batch[0])) break;
    }
    return results;
  }

  /**
   * Compute a single step immediately (synchronous, for manual step). Drains a buffered
   * entry first; otherwise computes fresh (with phases when captureSteps).
   */
  computeOne(): WalkthroughPhaseStep | null {
    const buffered = this.buffer.shift();
    if (buffered) {
      this.cursorIndex += 1;
      this.consumedResults.push(buffered.step);
      this.lastConsumedView = buffered.viewSnapshot;
      return buffered;
    }
    const entry = this.produceEntry();
    if (!entry) return null;
    this.cursorIndex += 1;
    this.consumedResults.push(entry.step);
    this.lastConsumedView = entry.viewSnapshot;
    return entry;
  }

  /** Get a snapshot of the consume position for undo/redo. NOTE: this is the CONSUMER's
   * position (cursorIndex), not the produced-ahead runner cursor, so restoring it lands
   * exactly where the user last saw the trace. */
  getSnapshot(): SolverSnapshot {
    return { stepIndex: this.cursorIndex };
  }

  /** Restore to a snapshot: rewind the runner, drop stale lookahead entries. */
  restoreSnapshot(snapshot: SolverSnapshot): void {
    this.runner.restoreSnapshot(snapshot);
    this.buffer = [];
    this.cursorIndex = this.runner.stepIndex;
    this.lastConsumedView = this.runner.getCurrentState();
  }

  /** Get the seed used for this run */
  getSeed(): number {
    return this.runner.seed;
  }

  /** State for UI display — the CONSUMER's position and view (what the user has seen),
   * never the produced-ahead runner cursor. */
  getRunnerState(): {
    view: SolverViewState;
    stepIndex: number;
    ended: boolean;
    mode: SolveMode;
    seed: number;
  } {
    return {
      view: this.lastConsumedView ?? this.runner.getCurrentState(),
      stepIndex: this.cursorIndex,
      ended: this.ended,
      mode: this.runner.solveMode,
      seed: this.runner.seed,
    };
  }

  /** Reset with a new config */
  reset(config: SolverStepConfig): void {
    this.stopProducing();
    this.runner = new SolverRunner(config);
    this.buffer = [];
    this.consumedResults = [];
    this.cursorIndex = 0;
    this.lastConsumedView = null;
  }

  /** Trim the consumed log to a given length (for undo/back) */
  trimConsumedTo(length: number): void {
    this.consumedResults = this.consumedResults.slice(0, length);
  }

  /** Drop the lookahead and rewind the runner to the consume position (for undo — the
   * dropped entries are re-produced identically on demand; determinism guarantees it). */
  clearBuffer(): void {
    this.buffer = [];
    this.runner.restoreSnapshot({ stepIndex: this.cursorIndex });
  }

  private produceEntry(): WalkthroughPhaseStep | null {
    if (this.captureSteps) {
      const r = this.runner.runStepWithPhases();
      if (!r) return null;
      return { step: r.stepResult, phases: r.phases, viewSnapshot: this.runner.getCurrentState() };
    }
    const step = this.runner.runCoarseStep();
    if (!step) return null;
    return { step, viewSnapshot: this.runner.getCurrentState() };
  }

  private scheduleProduction(): void {
    if (this.produceTimerId !== null) return;
    if (!this.producing) return;

    this.produceTimerId = setTimeout(() => {
      this.produceTimerId = null;
      if (!this.producing) return;

      const wasEmpty = this.buffer.length === 0;

      for (let i = 0; i < this.batchSize; i += 1) {
        if (this.buffer.length >= this.maxSize) break;
        const entry = this.produceEntry();
        if (!entry) {
          this.producing = false;
          break;
        }
        this.buffer.push(entry);
      }

      if (wasEmpty && this.buffer.length > 0 && this.onBufferReady) {
        this.onBufferReady();
      }

      if (this.producing && this.buffer.length < this.maxSize) {
        this.scheduleProduction();
      }
    }, 0);
  }
}
