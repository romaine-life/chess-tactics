import { describe, expect, it } from 'vitest';
import { PROP_DEFS, RETIRED_ROCK_PROP_IDS, resolvePlacedPropId } from './props';
import { applyTestPropSeats } from '../test/livePropSeats';

applyTestPropSeats();

const successors = (): string[] => PROP_DEFS
  .filter((def) => def.kind === 'rock' && !RETIRED_ROCK_PROP_IDS.includes(def.id))
  .map((def) => def.id);

describe('retired rock placements', () => {
  it('leaves every other prop alone', () => {
    expect(resolvePlacedPropId('oak', 3, 4)).toBe('oak');
    expect(resolvePlacedPropId('cottage', 0, 0)).toBe('cottage');
    expect(resolvePlacedPropId('unknown-prop', 1, 1)).toBe('unknown-prop');
  });

  // A board whose rocks reshuffle on every load cannot be authored against, and a level that
  // looks different each time it opens is not the same level.
  it('picks the same successor for a cell every time', () => {
    const first = resolvePlacedPropId('rock', 4, 7);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(resolvePlacedPropId('rock', 4, 7)).toBe(first);
    }
  });

  it('spreads placements across the successors rather than collapsing to one', () => {
    const available = successors();
    if (available.length < 2) return;
    const picked = new Set<string>();
    for (let x = 0; x < 12; x += 1) for (let y = 0; y < 12; y += 1) picked.add(resolvePlacedPropId('rock', x, y));

    expect(picked.size).toBeGreaterThan(1);
    for (const id of picked) expect(available).toContain(id);
  });

  it('gives the two retired ids different successors on the same cell', () => {
    if (successors().length < 2) return;
    const rock = resolvePlacedPropId('rock', 2, 2);
    const fieldstone = resolvePlacedPropId('fieldstone', 2, 2);

    expect(RETIRED_ROCK_PROP_IDS).toContain('rock');
    expect(RETIRED_ROCK_PROP_IDS).toContain('fieldstone');
    expect(successors()).toContain(rock);
    expect(successors()).toContain(fieldstone);
  });
});
