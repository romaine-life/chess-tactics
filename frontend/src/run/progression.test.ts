import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  EMPTY_RUN_PROGRESSION,
  highestUnlockedAtaraxiaTier,
  mergeRunProgression,
  readRunProgression,
  recordAtaraxiaCompletion,
} from './progression';

describe('Run Ataraxia progression', () => {
  beforeAll(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });
  beforeEach(() => localStorage.clear());

  it('allows only Ataraxia 0 before the first completed Run', () => {
    expect(readRunProgression()).toEqual(EMPTY_RUN_PROGRESSION);
    expect(highestUnlockedAtaraxiaTier(readRunProgression())).toBe(0);
  });

  it('unlocks Ataraxia I after completing the baseline and never regresses', () => {
    expect(recordAtaraxiaCompletion(0).highestCompletedAtaraxiaTier).toBe(0);
    expect(highestUnlockedAtaraxiaTier(readRunProgression())).toBe(1);
    expect(mergeRunProgression(
      readRunProgression(),
      { formatVersion: 1, highestCompletedAtaraxiaTier: -1 },
    ).highestCompletedAtaraxiaTier).toBe(0);
  });
});
