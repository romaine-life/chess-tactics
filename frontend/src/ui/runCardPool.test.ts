import { describe, expect, it } from 'vitest';
import { allRunCards } from '../run/model';
import {
  DEFAULT_POOL_KNOBS,
  buildPool,
  countSupportPairs,
  hasOppositeColourBishopPair,
  priceCard,
  summarizePool,
  type PoolPiece,
} from './runCardPool';

const cells = (...pairs: [number, number][]) => pairs.map(([x, y]) => ({ x, y }));

describe('runCardPool generation', () => {
  it('reproduces the shipped catalog at default knobs, less the one over-cap named card', () => {
    // `rr-vertical` is 10 material and reaches the live deck only through the named-card
    // injection; this generator exempts the Queen+Pawn pair alone, so it lands one short.
    expect(buildPool(DEFAULT_POOL_KNOBS)).toHaveLength(allRunCards().length - 1);
  });

  it('shows what dropping rotation collapse costs in cards', () => {
    const collapsed = buildPool(DEFAULT_POOL_KNOBS);
    const oriented = buildPool({ ...DEFAULT_POOL_KNOBS, collapseRotation: false });
    expect(collapsed).toHaveLength(268);
    expect(oriented).toHaveLength(619);
  });

  it('caps the footprint, which is the whole small-card catalog', () => {
    const small = buildPool({ ...DEFAULT_POOL_KNOBS, maxCells: 2 });
    expect(small.filter((card) => card.volume === 1)).toHaveLength(5);
    expect(small.filter((card) => card.volume === 2)).toHaveLength(10);
  });
});

describe('runCardPool pricing', () => {
  const price = (pieces: PoolPiece[], at: [number, number][]) => priceCard(cells(...at), pieces, DEFAULT_POOL_KNOBS);

  it('prices a lone Queen far above two Rooks despite near-equal material', () => {
    expect(price(['Q'], [[0, 0]]).cost).toBe(155);
    expect(price(['R', 'R'], [[0, 0], [0, 1]]).cost).toBe(130);
  });

  it('separates two Rooks from three minors, which raw material does not', () => {
    const rooks = price(['R', 'R'], [[0, 0], [0, 1]]);
    const minors = price(['N', 'N', 'B'], [[0, 0], [1, 0], [2, 0]]);
    expect(minors.value).toBe(9);
    expect(rooks.value).toBe(10);
    expect(rooks.cost).toBeGreaterThan(minors.cost * 1.4);
  });

  it('makes a diluted card cheaper, because it eats more board for the same pieces', () => {
    expect(price(['Q', 'P'], [[0, 1], [0, 0]]).cost).toBeLessThan(price(['Q'], [[0, 0]]).cost);
  });

  it('lands the common band on the small weak cards', () => {
    expect(price(['P'], [[0, 0]]).band).toBe('common');
    expect(price(['P', 'P', 'P', 'P'], [[0, 0], [1, 0], [0, 1], [1, 1]]).band).toBe('common');
    expect(price(['N', 'N'], [[0, 0], [1, 0]]).band).toBe('uncommon');
    expect(price(['R'], [[0, 0]]).band).toBe('uncommon');
  });
});

describe('runCardPool synergy', () => {
  it('reads a Bishop pair only when the two sit on opposite colours', () => {
    expect(hasOppositeColourBishopPair(cells([0, 0], [0, 1]), ['B', 'B'])).toBe(true);
    expect(hasOppositeColourBishopPair(cells([0, 0], [1, 1]), ['B', 'B'])).toBe(false);
  });

  it('reads mutual support from the card geometry, not from a table of blessed pairs', () => {
    const support = (pieces: PoolPiece[], at: [number, number][]) => countSupportPairs(cells(...at), pieces, false);
    // Rooks adjacent on a file defend each other; adjacent knights never do.
    expect(support(['R', 'R'], [[0, 0], [0, 1]])).toBe(2);
    expect(support(['N', 'N'], [[0, 0], [1, 0]])).toBe(0);
    // A knight move apart, they do.
    expect(support(['N', 'N'], [[0, 0], [2, 1]])).toBe(2);
    // Same-colour bishops on a diagonal support each other; opposite-colour neighbours cannot.
    expect(support(['B', 'B'], [[0, 0], [1, 1]])).toBe(2);
    expect(support(['B', 'B'], [[0, 0], [0, 1]])).toBe(0);
  });

  it('ignores pawn support unless asked, because it turns with the card', () => {
    // A Pawn at (1,1) covers (0,0) and (2,0), so it shelters the Rook in front of it. The Rook
    // returns nothing — (1,1) is a diagonal from (0,0). So this pair is pawn support or nothing,
    // which is exactly the case that stops being priceable while rotation is free.
    expect(countSupportPairs(cells([0, 0], [1, 1]), ['R', 'P'], false)).toBe(0);
    expect(countSupportPairs(cells([0, 0], [1, 1]), ['R', 'P'], true)).toBe(1);
  });
});

describe('runCardPool summary', () => {
  it('reports how often one card of a band reaches a pile', () => {
    const summary = summarizePool(buildPool(DEFAULT_POOL_KNOBS));
    expect(summary.byBand.common).toBe(25);
    // The upper bands owe the illustrations, on the rule that commons are templated.
    expect(summary.artOwed).toBe(summary.byBand.uncommon + summary.byBand.rare);
    // A tier far larger than its slot count is a tier the player never learns.
    expect(summary.perPileShare.uncommon).toBeLessThan(0.05);
  });
});
