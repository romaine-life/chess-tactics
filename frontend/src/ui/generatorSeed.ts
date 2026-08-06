export const MAX_GENERATOR_SEED = 9999;

/** Pick a seed from the author-facing generator range. */
export function randomGeneratorSeed(random: () => number = Math.random): number {
  return Math.floor(random() * MAX_GENERATOR_SEED) + 1;
}

/**
 * Resolve the seed for one explicit Generate action.
 *
 * Automatic mode always advances to a different seed, even when the random source happens to
 * repeat the current value. Fixed mode never samples randomness: reproducibility is opt-in.
 */
export function generatorSeedForRun(
  currentSeed: number,
  fixedSeed: boolean,
  random: () => number = Math.random,
): number {
  if (fixedSeed) return currentSeed;
  const sampled = randomGeneratorSeed(random);
  return sampled === currentSeed ? (sampled % MAX_GENERATOR_SEED) + 1 : sampled;
}
