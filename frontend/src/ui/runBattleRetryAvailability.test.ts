import { describe, expect, it } from 'vitest';
import { canRetryRunBattle } from './Skirmish';

describe('Run Battle retry availability', () => {
  it('disables an affordable active restart until the first complete turn', () => {
    expect(canRetryRunBattle(true, 0, false)).toBe(false);
    expect(canRetryRunBattle(true, 1, false)).toBe(true);
  });

  it('keeps terminal Retry available after a first-turn result', () => {
    expect(canRetryRunBattle(true, 0, true)).toBe(true);
  });

  it('never bypasses the gold requirement', () => {
    expect(canRetryRunBattle(false, 1, false)).toBe(false);
    expect(canRetryRunBattle(false, 0, true)).toBe(false);
  });
});
