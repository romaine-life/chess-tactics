import { describe, expect, it, vi } from 'vitest';
import { generatorSeedForRun, MAX_GENERATOR_SEED, randomGeneratorSeed } from './generatorSeed';

describe('generator seeds', () => {
  it('maps randomness into the author-facing seed range', () => {
    expect(randomGeneratorSeed(() => 0)).toBe(1);
    expect(randomGeneratorSeed(() => 0.9999)).toBe(MAX_GENERATOR_SEED);
  });

  it('chooses a fresh seed for the normal Generate path', () => {
    expect(generatorSeedForRun(4217, false, () => 0)).toBe(1);
  });

  it('advances when randomness repeats the current seed', () => {
    expect(generatorSeedForRun(1, false, () => 0)).toBe(2);
    expect(generatorSeedForRun(MAX_GENERATOR_SEED, false, () => 0.9999)).toBe(1);
  });

  it('reuses a seed only when fixed-seed mode is explicitly enabled', () => {
    const random = vi.fn(() => 0);
    expect(generatorSeedForRun(4217, true, random)).toBe(4217);
    expect(random).not.toHaveBeenCalled();
  });
});
