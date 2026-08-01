import { describe, expect, it } from 'vitest';
import { PIECE_BUNDLE_DECK } from '../run/model';
import { cardMatchesFilters } from './Enchiridion';

describe('Enchiridion card filters', () => {
  it('shows the complete core deck when both filters are All', () => {
    expect(PIECE_BUNDLE_DECK.filter((bundle) => cardMatchesFilters(bundle, 'all', 'all')))
      .toHaveLength(PIECE_BUNDLE_DECK.length);
  });

  it('matches exact gold and contained unit type independently', () => {
    const threeGold = PIECE_BUNDLE_DECK.filter((bundle) => cardMatchesFilters(bundle, '3', 'all'));
    const rooks = PIECE_BUNDLE_DECK.filter((bundle) => cardMatchesFilters(bundle, 'all', 'rook'));
    expect(threeGold.length).toBeGreaterThan(0);
    expect(threeGold.every((bundle) => bundle.value === 3)).toBe(true);
    expect(rooks.length).toBeGreaterThan(0);
    expect(rooks.every((bundle) => bundle.pieces.includes('rook'))).toBe(true);
  });

  it('intersects active filters and can produce an honest empty result', () => {
    const sixGoldPawns = PIECE_BUNDLE_DECK.filter((bundle) => cardMatchesFilters(bundle, '6', 'pawn'));
    const oneGoldQueens = PIECE_BUNDLE_DECK.filter((bundle) => cardMatchesFilters(bundle, '1', 'queen'));
    expect(sixGoldPawns.length).toBeGreaterThan(0);
    expect(sixGoldPawns.every((bundle) => bundle.value === 6 && bundle.pieces.includes('pawn'))).toBe(true);
    expect(oneGoldQueens).toEqual([]);
  });
});
