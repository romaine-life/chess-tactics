import { describe, it, expect } from 'vitest';
import { isLevelUnlocked, nextLevelRef, orderedLevels } from './progress';
import type { Campaign, CampaignLevelRef } from '../core/level';

const refs: CampaignLevelRef[] = [
  { levelId: 'l1', ordinal: 0 },
  { levelId: 'l2', ordinal: 1 },
  { levelId: 'l3', ordinal: 2 },
];

describe('isLevelUnlocked', () => {
  it('allows every campaign level to be played directly', () => {
    expect(isLevelUnlocked(refs, 0, {})).toBe(true);
    expect(isLevelUnlocked(refs, 1, {})).toBe(true);
    expect(isLevelUnlocked(refs, 1, { l1: { completed: true } })).toBe(true);
    expect(isLevelUnlocked(refs, 2, { l1: { completed: true } })).toBe(true);
  });
});

describe('nextLevelRef', () => {
  it('returns the following level, or null at the end / for an unknown id', () => {
    expect(nextLevelRef(refs, 'l1')?.levelId).toBe('l2');
    expect(nextLevelRef(refs, 'l3')).toBeNull();
    expect(nextLevelRef(refs, 'missing')).toBeNull();
  });
});

describe('orderedLevels', () => {
  it('sorts a campaign\'s levels by ordinal', () => {
    const campaign = { levels: [{ levelId: 'b', ordinal: 1 }, { levelId: 'a', ordinal: 0 }] } as unknown as Campaign;
    expect(orderedLevels(campaign).map((r) => r.levelId)).toEqual(['a', 'b']);
  });
});
