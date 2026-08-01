import { describe, expect, it } from 'vitest';
import { RUN_CARD_DECK } from '../run/model';
import { cardMatchesFilters } from './Enchiridion';

describe('Enchiridion card filters', () => {
  it('shows the complete core deck when both filters are All', () => {
    expect(RUN_CARD_DECK.filter((card) => cardMatchesFilters(card, 'all', 'all')))
      .toHaveLength(RUN_CARD_DECK.length);
  });

  it('matches exact gold and contained unit type independently', () => {
    const threeGold = RUN_CARD_DECK.filter((card) => cardMatchesFilters(card, '3', 'all'));
    const rooks = RUN_CARD_DECK.filter((card) => cardMatchesFilters(card, 'all', 'rook'));
    expect(threeGold.length).toBeGreaterThan(0);
    expect(threeGold.every((card) => card.value === 3)).toBe(true);
    expect(rooks.length).toBeGreaterThan(0);
    expect(rooks.every((card) => card.pieces.includes('rook'))).toBe(true);
  });

  it('intersects active filters and can produce an honest empty result', () => {
    const sixGoldPawns = RUN_CARD_DECK.filter((card) => cardMatchesFilters(card, '6', 'pawn'));
    const oneGoldQueens = RUN_CARD_DECK.filter((card) => cardMatchesFilters(card, '1', 'queen'));
    expect(sixGoldPawns.length).toBeGreaterThan(0);
    expect(sixGoldPawns.every((card) => card.value === 6 && card.pieces.includes('pawn'))).toBe(true);
    expect(oneGoldQueens).toEqual([]);
  });
});
