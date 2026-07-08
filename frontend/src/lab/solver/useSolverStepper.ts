// The solver stepper's driving React hook (mirrors bender-world's use-buffered-algorithm.ts):
// binds StepBuffer + AnimationClock + undo. High-frequency data (playhead, step log, undo
// stack) lives in REFS; React state is synced only on step boundaries so play at speed never
// storms the render loop.
//
// Undo/redo divergence from bender (deliberate): there is NO stored-entry redo stack. Every
// solve is deterministic and the runner caches its trace, so going forward again after Back
// simply re-consumes the cached steps — byte-identical by the runner's snapshot tests. The
// old redo-prefill design corrupted the consumed sequence whenever a coarse batch (+10/+100,
// Batch>1) intervened: the stored-entry stack and the step log drifted out of alignment and
// prefill rewound the buffer cursor to a stale trace index, re-serving old steps. Determinism
// makes the whole mechanism unnecessary — the buffer cursor is the ONE source of position.
//
// Drives all three sources through one interface: a live retrograde solve, a live bounded
// search, or a pre-recorded SolveStep[] trace (config.trace — the Phase-3 cluster-replay seam).

import { useState, useCallback, useRef, useEffect } from 'react';
import type { RootBounds, SolveMode, SolvePhaseName, Value } from '../../core/solver';
import { StepBuffer, type WalkthroughPhaseStep } from './solverBuffer';
import type { SolvedCounts, SolverStepConfig, SolverStepResult, SolverViewState } from './solverRunner';
import type { SolverPhaseData } from './phaseData';
import { AnimationClock } from './animationClock';

export interface HistorySnapshot {
  /** Consume position BEFORE the user gesture this entry undoes (one Step, or a whole
   * +N/Sweep batch) — restoring rewinds the deterministic trace to exactly here. */
  stepIndex: number;
}

export const MAX_UNDO = 50;

const ZERO_COUNTS: SolvedCounts = { win: 0, loss: 0, draw: 0, undecided: 0 };

/** The coarse "jump to the next sweep" boundary: retrograde stops after a Converge (or the
 * final ReadValue); search stops after a root-level BackUp carrying rootBounds — the end of
 * one iterative-deepening iteration. */
export function isSweepBoundary(r: SolverStepResult): boolean {
  return r.step.kind === 'retrograde'
    ? r.step.phase === 'Converge' || r.step.phase === 'ReadValue'
    : r.step.phase === 'BackUp' && r.step.rootBounds !== undefined;
}

export function useSolverStepper() {
  const bufferRef = useRef<StepBuffer | null>(null);
  const clockRef = useRef<AnimationClock | null>(null);
  const undoStackRef = useRef<HistorySnapshot[]>([]);
  /** Every consumed step result, in trace order (the walkthrough log). Mutated in place —
   * a per-step array copy would be O(n²) over a long search trace. */
  const allStepsRef = useRef<SolverStepResult[]>([]);
  const chartPlayheadRef = useRef(-1);

  // React state — synced on boundaries only.
  const [running, setRunning] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const [phase, setPhase] = useState<SolvePhaseName | null>(null);
  const [sweepIndex, setSweepIndex] = useState(0);
  const [solvedCounts, setSolvedCounts] = useState<SolvedCounts>(ZERO_COUNTS);
  const [rootBounds, setRootBounds] = useState<RootBounds | null>(null);
  const [rootValue, setRootValue] = useState<Value | null>(null);
  const [viewState, setViewState] = useState<SolverViewState | null>(null);
  const [phaseTrace, setPhaseTrace] = useState<SolverPhaseData | null>(null);
  const [stepCount, setStepCount] = useState(0);
  const [solved, setSolved] = useState(false);
  const [mode, setMode] = useState<SolveMode | null>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [lastStep, setLastStep] = useState<SolverStepResult | null>(null);

  // Sync UI state from the buffer's consumed position.
  const syncState = useCallback(() => {
    const buffer = bufferRef.current;
    if (!buffer) return;
    const s = buffer.getRunnerState();
    setViewState(s.view);
    setPhase(s.view.phase);
    setSweepIndex(s.view.sweep);
    setSolvedCounts(s.view.solvedCounts);
    setRootBounds(s.view.rootBounds);
    setRootValue(s.view.rootValue);
    setStepCount(s.stepIndex);
    setSolved(s.ended);
    setMode(s.mode);
  }, []);

  const pushUndo = useCallback((snapshot: HistorySnapshot) => {
    const stack = undoStackRef.current;
    stack.push(snapshot);
    if (stack.length > MAX_UNDO) stack.shift();
    setCanGoBack(true);
  }, []);

  const updateCanGoBack = useCallback(() => {
    setCanGoBack(undoStackRef.current.length > 0);
  }, []);

  // Record a consumed entry into the walkthrough log + panel trace.
  const captureEntry = useCallback((entry: WalkthroughPhaseStep) => {
    allStepsRef.current.push(entry.step);
    setLastStep(entry.step);
    setPhaseTrace(entry.phases ?? null);
  }, []);

  // Toggle per-phase capture on the buffer (off for very fast playback).
  const setCaptureSteps = useCallback((enabled: boolean) => {
    const buffer = bufferRef.current;
    if (buffer) buffer.captureSteps = enabled;
  }, []);

  const finishPendingSweep = useCallback(() => {
    const clock = clockRef.current;
    if (clock) clock.finishSweepImmediate();
  }, []);

  /** Hard-stop playback (a manual gesture — Step/+N/Back — always interrupts the clock,
   * including the pause glide toward the next boundary, so the playhead can't drift past
   * the position the gesture just established). */
  const haltClock = useCallback(() => {
    const clock = clockRef.current;
    const buffer = bufferRef.current;
    if (clock && clock.running) clock.stop();
    if (buffer) buffer.stopProducing();
    setRunning(false);
  }, []);

  // ---- Actions ----

  /** Build a fresh buffer+clock for a config (does not auto-play; call resume()). */
  const start = useCallback((config: SolverStepConfig) => {
    if (clockRef.current) clockRef.current.reset();
    if (bufferRef.current) bufferRef.current.stopProducing();

    const buffer = new StepBuffer(config);
    const clock = new AnimationClock();

    bufferRef.current = buffer;
    clockRef.current = clock;
    undoStackRef.current = [];
    allStepsRef.current = [];
    chartPlayheadRef.current = -1;

    setRunning(false);
    setPhaseTrace(null);
    setLastStep(null);
    setCanGoBack(false);
    syncState();
  }, [syncState]);

  const resume = useCallback(() => {
    const buffer = bufferRef.current;
    const clock = clockRef.current;
    if (!buffer || !clock || buffer.ended) return;

    finishPendingSweep();

    clock.onBoundary = () => {
      // Snapshot BEFORE consuming, so goBack lands exactly one step back.
      const before: HistorySnapshot = { stepIndex: allStepsRef.current.length };
      const entry = buffer.consume();
      if (!entry) return;

      pushUndo(before);
      captureEntry(entry);
      syncState();

      if (buffer.ended) {
        clock.stop();
        buffer.stopProducing();
        setRunning(false);
        setSolved(true);
      }
    };

    clock.onTick = (playhead) => {
      chartPlayheadRef.current = playhead;
      clock.maxPlayhead = allStepsRef.current.length + buffer.available;
    };

    buffer.setBatchSize(Math.max(1, Math.ceil(speed / 100)));
    buffer.startProducing();
    clock.maxPlayhead = allStepsRef.current.length + buffer.available;
    clock.start(); // clears any stop-at-boundary armed by a recent pause
    setRunning(true);
  }, [speed, syncState, pushUndo, captureEntry, finishPendingSweep]);

  const pause = useCallback(() => {
    finishPendingSweep();

    const clock = clockRef.current;
    const buffer = bufferRef.current;

    if (clock && clock.running) {
      clock.stopAtNextBoundary();
      if (buffer) buffer.stopProducing();
      setRunning(false);
      return;
    }

    if (clock) clock.stop();
    if (buffer) buffer.stopProducing();
    setRunning(false);
  }, [finishPendingSweep]);

  const stepOnce = useCallback(() => {
    const buffer = bufferRef.current;
    if (!buffer) return;

    finishPendingSweep();
    haltClock();

    const before: HistorySnapshot = { stepIndex: allStepsRef.current.length };
    const entry = buffer.computeOne();
    if (!entry) {
      updateCanGoBack();
      return;
    }
    // Undo is pushed only AFTER a successful consume — pushing first and popping on failure
    // silently shifted out the oldest history entry when the stack was full.
    pushUndo(before);
    captureEntry(entry);

    const clock = clockRef.current;
    const targetPlayhead = allStepsRef.current.length - 1;
    chartPlayheadRef.current = targetPlayhead;
    if (clock) clock.setPlayhead(targetPlayhead);
    syncState();
    updateCanGoBack();
  }, [pushUndo, captureEntry, syncState, updateCanGoBack, finishPendingSweep, haltClock]);

  /** Shared tail for coarse batches (+N / sweep): log, sync, playhead sweep animation. */
  const applyBatch = useCallback((results: SolverStepResult[], before: HistorySnapshot) => {
    pushUndo(before);
    for (const r of results) allStepsRef.current.push(r);
    // Coarse batch: no per-entry phase detail; the UI re-derives panel math from the step.
    setLastStep(results[results.length - 1]);
    setPhaseTrace(null);
    syncState();

    const clock = clockRef.current;
    const targetPlayhead = allStepsRef.current.length - 1;
    if (clock) {
      clock.maxPlayhead = targetPlayhead;
      clock.onTick = (playhead) => { chartPlayheadRef.current = playhead; };
      clock.onBoundary = null;
      clock.onSweepComplete = () => {
        chartPlayheadRef.current = targetPlayhead;
        clock.onSweepComplete = null;
      };
      clock.startSweep(targetPlayhead, Math.min(800, Math.max(400, results.length * 6)));
    } else {
      chartPlayheadRef.current = targetPlayhead;
    }

    updateCanGoBack();
  }, [pushUndo, syncState, updateCanGoBack]);

  const stepN = useCallback((count: number) => {
    const buffer = bufferRef.current;
    if (!buffer) return;

    finishPendingSweep();
    haltClock();

    const before: HistorySnapshot = { stepIndex: allStepsRef.current.length };
    const results = buffer.computeImmediate(count);
    if (results.length === 0) {
      updateCanGoBack();
      return;
    }
    applyBatch(results, before);
  }, [finishPendingSweep, haltClock, applyBatch, updateCanGoBack]);

  /** Jump to the next sweep boundary: retrograde ⇒ through the next Converge (or ReadValue);
   * search ⇒ through the next completed iterative-deepening iteration (the root BackUp that
   * carries rootBounds). One undo entry, like +N. */
  const stepSweep = useCallback(() => {
    const buffer = bufferRef.current;
    if (!buffer) return;

    finishPendingSweep();
    haltClock();

    const before: HistorySnapshot = { stepIndex: allStepsRef.current.length };
    const results = buffer.computeUntil(isSweepBoundary);
    if (results.length === 0) {
      updateCanGoBack();
      return;
    }
    applyBatch(results, before);
  }, [finishPendingSweep, haltClock, applyBatch, updateCanGoBack]);

  const goBack = useCallback(() => {
    finishPendingSweep();

    const undoStack = undoStackRef.current;
    if (undoStack.length === 0) return;

    const buffer = bufferRef.current;
    if (!buffer) return;

    // A pause may still be gliding the clock to its boundary — Back must hard-stop it, or
    // the late boundary tick bumps the playhead past the position we are about to set.
    haltClock();

    const prev = undoStack.pop()!;

    buffer.restoreSnapshot({ stepIndex: prev.stepIndex });
    buffer.trimConsumedTo(prev.stepIndex);
    allStepsRef.current.length = prev.stepIndex;

    // Redo is recompute: determinism re-serves the identical steps from the runner's cache,
    // so no stored redo entries exist to fall out of sync with the log.
    const tail = allStepsRef.current[allStepsRef.current.length - 1] ?? null;
    setLastStep(tail);
    setPhaseTrace(null); // panel math is re-derived from lastStep (pure + identical)

    const newPlayhead = Math.max(0, prev.stepIndex - 1);
    chartPlayheadRef.current = newPlayhead;
    if (clockRef.current) clockRef.current.setPlayhead(newPlayhead);

    syncState();
    updateCanGoBack();
  }, [syncState, updateCanGoBack, finishPendingSweep, haltClock]);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeedState(newSpeed);
    if (bufferRef.current) bufferRef.current.setBatchSize(Math.max(1, Math.ceil(newSpeed / 100)));
  }, []);

  const setClockSpeed = useCallback((uiSpeed: number) => {
    if (clockRef.current) clockRef.current.setSpeed(uiSpeed);
  }, []);

  const reset = useCallback(() => {
    if (clockRef.current) clockRef.current.reset();
    if (bufferRef.current) bufferRef.current.stopProducing();

    bufferRef.current = null;
    clockRef.current = null;
    undoStackRef.current = [];
    allStepsRef.current = [];
    chartPlayheadRef.current = -1;

    setRunning(false);
    setSpeedState(1);
    setPhase(null);
    setSweepIndex(0);
    setSolvedCounts(ZERO_COUNTS);
    setRootBounds(null);
    setRootValue(null);
    setViewState(null);
    setPhaseTrace(null);
    setStepCount(0);
    setSolved(false);
    setMode(null);
    setCanGoBack(false);
    setLastStep(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clockRef.current) clockRef.current.reset();
      if (bufferRef.current) bufferRef.current.stopProducing();
    };
  }, []);

  return {
    // state
    running,
    speed,
    phase,
    sweepIndex,
    solvedCounts,
    rootBounds,
    rootValue,
    viewState,
    phaseTrace,
    stepCount,
    solved,
    mode,
    canGoBack,
    lastStep,
    // high-frequency refs
    chartPlayheadRef,
    allStepsRef,
    // actions
    start,
    resume,
    pause,
    step: stepOnce,
    stepN,
    stepSweep,
    goBack,
    reset,
    setSpeed: handleSpeedChange,
    setClockSpeed,
    setCaptureSteps,
  };
}
