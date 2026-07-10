// The solver stepper's rAF fractional playhead — ported near-verbatim from bender-world's
// engine/animation-clock.ts (domain-agnostic; itself ported from eight-queens' GenerationClock).
// floor(playhead) = current step index; the fractional part interpolates between steps for
// panel/frontier animation. `onBoundary` fires once per integer crossing, ascending, which is
// what drives the buffer's consume cadence in useSolverStepper.
//
// The ONE local change from bender: requestAnimationFrame/cancelAnimationFrame are
// constructor-injectable so node tests can drive ticks manually. The browser defaults bind
// lazily inside the methods, so importing this module in node (vitest) is safe.

type Raf = (cb: (timestamp: number) => void) => number;
type Caf = (id: number) => void;

export class AnimationClock {
  private rafId: number | null = null;
  private lastTimestamp = 0;
  private _playhead = -1;
  private _stepsPerMs = 0.001; // 1 step/s until setSpeed is called
  private _running = false;

  // Stop-at-boundary flag: when true, clock stops after next integer crossing
  private _stopAtBoundary = false;

  // Fast-sweep state
  private sweepMode = false;
  private sweepTarget = 0;
  private sweepDuration = 600;
  private sweepStartTime = 0;
  private sweepStartPlayhead = 0;
  private sweepEasing: 'ease-out' | 'ease-in-out' = 'ease-out';

  // Clamping: max playhead the clock is allowed to reach
  maxPlayhead = 0;

  // Speed multiplier — boundaries fire N× faster
  speedMultiplier = 1;

  // Callbacks
  onBoundary: ((stepIndex: number) => void) | null = null;
  onTick: ((playhead: number, dt: number) => void) | null = null;
  onSweepComplete: (() => void) | null = null;

  private readonly raf: Raf;
  private readonly caf: Caf;

  constructor(raf?: Raf, caf?: Caf) {
    this.raf = raf ?? ((cb) => requestAnimationFrame(cb));
    this.caf = caf ?? ((id) => cancelAnimationFrame(id));
  }

  get playhead(): number {
    return this._playhead;
  }

  get running(): boolean {
    return this._running;
  }

  /** UI speed IS the step rate: `uiSpeed` steps per second (0.25–500 on the slider). The
   * bender original mapped the slider to a delay (501 − uiSpeed ms/step), which made the
   * "steps/s" label a lie — the labelled 0.25 played ~2/s and the slow-study end of the dial
   * didn't exist. Here the label is honored exactly: 0.25 ⇒ one step per 4 s. */
  setSpeed(uiSpeed: number): void {
    this._stepsPerMs = Math.max(1e-6, uiSpeed) / 1000;
  }

  /** Snap playhead to a specific value (for back/redo navigation) */
  setPlayhead(value: number): void {
    this._playhead = value;
  }

  /** Request the clock to stop after the playhead crosses the next integer boundary. */
  stopAtNextBoundary(): void {
    if (!this._running) return;
    const frac = this._playhead - Math.floor(this._playhead);
    if (frac < 1e-9) {
      this.stop();
      return;
    }
    this._stopAtBoundary = true;
  }

  /** Start the rAF loop. ALWAYS clears a pending stop-at-boundary first: start() means "keep
   * playing", so a Pause→Play inside one step interval must cancel the armed stop — otherwise
   * the still-running clock silently halts at the very next integer crossing while the UI
   * believes playback resumed. */
  start(): void {
    this._stopAtBoundary = false;
    if (this._running) return;
    this._running = true;
    this.lastTimestamp = 0;
    this.rafId = this.raf(this.tick);
  }

  /** Stop the rAF loop; playhead freezes where it is */
  stop(): void {
    this._running = false;
    if (this.rafId !== null) {
      this.caf(this.rafId);
      this.rafId = null;
    }
  }

  /** Enter fast-sweep mode: animate playhead to target over duration */
  startSweep(targetStep: number, durationMs = 600, easing: 'ease-out' | 'ease-in-out' = 'ease-out'): void {
    this.sweepMode = true;
    this.sweepTarget = targetStep;
    this.sweepDuration = durationMs;
    this.sweepEasing = easing;
    this.sweepStartTime = 0;
    this.sweepStartPlayhead = this._playhead;

    if (!this._running) {
      this._running = true;
      this.lastTimestamp = 0;
      this.rafId = this.raf(this.tick);
    }
  }

  /** Immediately complete any in-progress sweep */
  finishSweepImmediate(): void {
    if (!this.sweepMode) return;
    this.sweepMode = false;
    this._playhead = this.sweepTarget;
    if (this.onTick) this.onTick(this._playhead, 0);
    const cb = this.onSweepComplete;
    this.onSweepComplete = null;
    if (cb) cb();
    this._running = false;
    if (this.rafId !== null) {
      this.caf(this.rafId);
      this.rafId = null;
    }
  }

  /** Reset playhead and stop */
  reset(): void {
    this.stop();
    this._playhead = -1;
    this.maxPlayhead = 0;
    this.sweepMode = false;
    this._stopAtBoundary = false;
    this.speedMultiplier = 1;
  }

  private tick = (timestamp: number): void => {
    if (!this._running) return;

    if (this.lastTimestamp === 0) {
      this.lastTimestamp = timestamp;
      if (this.sweepMode && this.sweepStartTime === 0) {
        this.sweepStartTime = timestamp;
      }
      this.rafId = this.raf(this.tick);
      return;
    }

    const dt = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    const oldPlayhead = this._playhead;
    let newPlayhead: number;

    if (this.sweepMode) {
      if (this.sweepStartTime === 0) this.sweepStartTime = timestamp;
      const elapsed = timestamp - this.sweepStartTime;
      const t = Math.min(elapsed / this.sweepDuration, 1);
      const eased = this.sweepEasing === 'ease-in-out'
        ? (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
        : 1 - Math.pow(1 - t, 3);
      newPlayhead = this.sweepStartPlayhead + (this.sweepTarget - this.sweepStartPlayhead) * eased;

      if (t >= 1) {
        newPlayhead = this.sweepTarget;
        this.sweepMode = false;
        this._playhead = newPlayhead;
        if (this.onTick) this.onTick(this._playhead, dt);
        if (this.onSweepComplete) this.onSweepComplete();
        this._running = false;
        return;
      }
    } else {
      // Normal mode: advance at constant rate, clamped to maxPlayhead
      const advance = dt * this._stepsPerMs * this.speedMultiplier;
      newPlayhead = Math.min(oldPlayhead + advance, this.maxPlayhead);
    }

    // Detect boundary crossings (skip during sweep — state already set)
    if (!this.sweepMode) {
      const oldFloor = Math.floor(oldPlayhead);
      const newFloor = Math.floor(newPlayhead);
      if (this.onBoundary) {
        for (let i = oldFloor + 1; i <= newFloor; i++) {
          this.onBoundary(i);
        }
      }
      if (this._stopAtBoundary && newFloor > oldFloor) {
        this._playhead = newFloor;
        if (this.onTick) this.onTick(this._playhead, dt);
        this._stopAtBoundary = false;
        this.stop();
        return;
      }
    }

    this._playhead = newPlayhead;

    if (this.onTick) {
      this.onTick(this._playhead, dt);
    }

    if (this._running) {
      this.rafId = this.raf(this.tick);
    }
  };
}
