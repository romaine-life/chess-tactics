// AnimationClock tests (bender-world port). Node-driven: the clock takes injected
// requestAnimationFrame/cancelAnimationFrame so ticks are advanced manually with exact
// timestamps. Vitest v4 hides console.log on passing tests — every claim is an assertion.

import { describe, it, expect } from 'vitest';
import { AnimationClock } from './animationClock';

/** A manual rAF harness: `tick(t)` fires the single pending frame callback at time t. */
function makeClock() {
  const pending: Array<(t: number) => void> = [];
  let nextId = 1;
  const clock = new AnimationClock(
    (cb) => { pending.push(cb); return nextId++; },
    () => { pending.length = 0; },
  );
  const tick = (t: number): void => {
    const cb = pending.shift();
    if (cb) cb(t);
  };
  return { clock, tick, pending };
}

describe('AnimationClock — boundaries', () => {
  it('fires onBoundary once per integer crossing, in ascending order', () => {
    const { clock, tick } = makeClock();
    const crossed: number[] = [];
    clock.onBoundary = (i) => crossed.push(i);
    clock.maxPlayhead = 10;
    clock.setSpeed(1000); // 1000 steps/s = 1 step per ms
    clock.start();

    tick(1000); // first frame: initializes lastTimestamp, no advance (rAF t is never 0)
    tick(1005); // dt=5ms → playhead -1 → 4: crosses 0,1,2,3,4
    expect(crossed).toEqual([0, 1, 2, 3, 4]);
    expect(clock.playhead).toBe(4);

    tick(1007); // dt=2ms → playhead 4 → 6: crosses 5,6
    expect(crossed).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('clamps at maxPlayhead and never fires boundaries beyond it', () => {
    const { clock, tick } = makeClock();
    const crossed: number[] = [];
    clock.onBoundary = (i) => crossed.push(i);
    clock.maxPlayhead = 2;
    clock.setSpeed(1000);
    clock.start();

    tick(1000);
    tick(1100); // would advance 100 steps, clamps at 2
    expect(clock.playhead).toBe(2);
    expect(crossed).toEqual([0, 1, 2]);
  });

  it('stopAtNextBoundary stops exactly ON the next integer and stops the clock', () => {
    const { clock, tick } = makeClock();
    const crossed: number[] = [];
    clock.onBoundary = (i) => crossed.push(i);
    clock.maxPlayhead = 10;
    clock.setSpeed(1000);
    clock.start();

    tick(1000);
    tick(1000.4);           // playhead -1 → -0.6 (no crossing)
    expect(crossed).toEqual([]);
    clock.stopAtNextBoundary();
    tick(1003);             // dt=2.6 → would reach 2.0; stops snapped at the crossing floor
    expect(crossed[0]).toBe(0);
    expect(clock.running).toBe(false);
    expect(Number.isInteger(clock.playhead)).toBe(true);
  });

  it('start() clears a pending stop-at-boundary — Pause then Play never freezes playback', () => {
    // Regression: pause() arms stopAtNextBoundary while the clock keeps gliding; pressing
    // Play again used to early-return (already running) WITHOUT clearing the armed stop, so
    // the clock silently halted at the next integer while the UI said it was running.
    const { clock, tick } = makeClock();
    const crossed: number[] = [];
    clock.onBoundary = (i) => crossed.push(i);
    clock.maxPlayhead = 10;
    clock.setSpeed(1000);
    clock.start();

    tick(1000);
    tick(1000.4);            // fractional playhead — mid-step
    clock.stopAtNextBoundary(); // Pause
    clock.start();              // Play again before the boundary lands
    tick(1002);                 // crosses 0 and beyond
    expect(clock.running).toBe(true); // did NOT stop at the boundary
    expect(crossed.length).toBeGreaterThan(0);
    tick(1004);
    expect(clock.running).toBe(true);
  });
});

describe('AnimationClock — the speed label is the real rate', () => {
  it('setSpeed(N) advances N steps per second (N=4: one step per 250ms)', () => {
    const { clock, tick } = makeClock();
    const crossed: number[] = [];
    clock.onBoundary = (i) => crossed.push(i);
    clock.maxPlayhead = 100;
    clock.setSpeed(4);
    clock.start();

    tick(1000);
    tick(2000); // 1s → exactly 4 steps from -1 → 3: crosses 0,1,2,3
    expect(crossed).toEqual([0, 1, 2, 3]);
    expect(clock.playhead).toBeCloseTo(3, 9);
  });

  it('setSpeed(0.25) is truly one step per FOUR seconds (the slow-study end exists)', () => {
    const { clock, tick } = makeClock();
    const crossed: number[] = [];
    clock.onBoundary = (i) => crossed.push(i);
    clock.maxPlayhead = 100;
    clock.setSpeed(0.25);
    clock.start();

    tick(1000);
    tick(4999);  // 3.999s: playhead -1 → ~-0.0003, no crossing yet
    expect(crossed).toEqual([]);
    tick(5001);  // past 4s: exactly the first boundary
    expect(crossed).toEqual([0]);
    tick(9001);  // 8s in: the second
    expect(crossed).toEqual([0, 1]);
  });
});

describe('AnimationClock — sweep mode', () => {
  it('startSweep animates toward the target and onSweepComplete fires at arrival', () => {
    const { clock, tick } = makeClock();
    let completed = 0;
    clock.onSweepComplete = () => { completed += 1; };
    clock.setPlayhead(0);
    clock.startSweep(5, 100);

    tick(1000); // init frame (records sweep start time)
    tick(1050); // halfway through duration — playhead strictly between 0 and 5
    expect(clock.playhead).toBeGreaterThan(0);
    expect(clock.playhead).toBeLessThan(5);
    expect(completed).toBe(0);

    tick(1200); // past the duration — sweep completes, lands exactly on target
    expect(clock.playhead).toBe(5);
    expect(completed).toBe(1);
    expect(clock.running).toBe(false);
  });

  it('finishSweepImmediate lands exactly on the target and fires onSweepComplete once', () => {
    const { clock, tick } = makeClock();
    let completed = 0;
    clock.onSweepComplete = () => { completed += 1; };
    clock.setPlayhead(1);
    clock.startSweep(7, 600);
    tick(1000);
    tick(1100); // partway

    clock.finishSweepImmediate();
    expect(clock.playhead).toBe(7);
    expect(completed).toBe(1);
    expect(clock.running).toBe(false);

    // Idempotent: no sweep in progress → no second completion.
    clock.finishSweepImmediate();
    expect(completed).toBe(1);
  });

  it('reset stops the clock and restores the initial playhead', () => {
    const { clock, tick } = makeClock();
    clock.maxPlayhead = 10;
    clock.setSpeed(500);
    clock.start();
    tick(1000);
    tick(1004);
    expect(clock.playhead).toBeGreaterThan(-1);

    clock.reset();
    expect(clock.playhead).toBe(-1);
    expect(clock.running).toBe(false);
    expect(clock.maxPlayhead).toBe(0);
  });
});
