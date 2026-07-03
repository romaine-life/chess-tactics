import { describe, it, expect } from 'vitest';
import { CLOCK_INCREMENT_SECONDS, CLOCK_INITIAL_SECONDS, formatClockMs, formatClockSeconds, stepLadder } from './clock';

describe('formatClockMs (live readout)', () => {
  it('renders m:ss above ten seconds, rounding a started second up', () => {
    expect(formatClockMs(300_000)).toBe('5:00');
    expect(formatClockMs(61_000)).toBe('1:01');
    expect(formatClockMs(59_200)).toBe('1:00'); // started second still shows
    expect(formatClockMs(10_000)).toBe('0:10');
    expect(formatClockMs(3_600_000)).toBe('60:00');
  });

  it('gains tenths under ten seconds and meets the m:ss format at the boundary', () => {
    expect(formatClockMs(9_999)).toBe('0:10.0'); // continuous with 0:10
    expect(formatClockMs(9_400)).toBe('0:09.4');
    expect(formatClockMs(500)).toBe('0:00.5');
  });

  it('clamps the flag fall to 0:00', () => {
    expect(formatClockMs(0)).toBe('0:00');
    expect(formatClockMs(-50)).toBe('0:00');
  });
});

describe('formatClockSeconds (authored values)', () => {
  it('renders whole-second m:ss', () => {
    expect(formatClockSeconds(300)).toBe('5:00');
    expect(formatClockSeconds(30)).toBe('0:30');
    expect(formatClockSeconds(3_600)).toBe('60:00');
  });
});

describe('stepLadder (editor steppers)', () => {
  it('moves one rung and clamps at both ends', () => {
    expect(stepLadder(CLOCK_INITIAL_SECONDS, 300, 1)).toBe(600);
    expect(stepLadder(CLOCK_INITIAL_SECONDS, 300, -1)).toBe(180);
    expect(stepLadder(CLOCK_INITIAL_SECONDS, 30, -1)).toBe(30); // floor
    expect(stepLadder(CLOCK_INITIAL_SECONDS, 3_600, 1)).toBe(3_600); // ceiling
    expect(stepLadder(CLOCK_INCREMENT_SECONDS, 0, -1)).toBe(0);
    expect(stepLadder(CLOCK_INCREMENT_SECONDS, 0, 1)).toBe(1);
  });

  it('snaps an off-ladder value (hand-edited level) to its nearest rung first', () => {
    expect(stepLadder(CLOCK_INITIAL_SECONDS, 290, 1)).toBe(600); // 290 ≈ 300 → up to 600
    expect(stepLadder(CLOCK_INITIAL_SECONDS, 4_000, -1)).toBe(2_700); // ≈ 3600 → down
  });
});
