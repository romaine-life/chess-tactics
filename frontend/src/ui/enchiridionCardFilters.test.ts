import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RUN_CARD_CATALOG, RUN_OFFER_CARD_COUNT } from '../run/model';
import { CardGalleryFilters, cardMatchesFilters } from './Enchiridion';

describe('Enchiridion card filters', () => {
  it('shows the combined starter and complete formation deck when both filters are All', () => {
    const visible = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, 'all', 'all', 'all'));
    expect(visible).toHaveLength(RUN_OFFER_CARD_COUNT + 1);
    expect(visible[0].id).toBe('his-grace');
  });

  it('matches exact gold and contained unit type independently', () => {
    const threeGold = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, '3', 'all', 'all'));
    const rooks = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, 'all', 'rook', 'all'));
    expect(threeGold.length).toBeGreaterThan(0);
    expect(threeGold.every((card) => card.value === 3)).toBe(true);
    expect(rooks.length).toBeGreaterThan(0);
    expect(rooks.every((card) => card.pieces.includes('rook'))).toBe(true);
  });

  it('intersects active filters and can produce an honest empty result', () => {
    const sixGoldPawns = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, '6', 'pawn', 'all'));
    const oneGoldQueens = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, '1', 'queen', 'all'));
    expect(sixGoldPawns.length).toBeGreaterThan(0);
    expect(sixGoldPawns.every((card) => card.value === 6 && card.pieces.includes('pawn'))).toBe(true);
    expect(oneGoldQueens).toEqual([]);
  });

  it('filters the two-gold combined starter normally', () => {
    expect(RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, '2', 'king', 'all')).map((card) => card.id))
      .toEqual(['his-grace']);
    expect(RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, '2', 'pawn', 'all')).map((card) => card.id))
      .toEqual(expect.arrayContaining(['his-grace', 'pp']));
  });

  it('matches rarity independently and intersects it with gold and unit filters', () => {
    const rares = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, 'all', 'all', 'rare'));
    const rareQueenCards = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, '9', 'queen', 'rare'));
    expect(rares.length).toBeGreaterThan(0);
    expect(rares.every((card) => card.rarity === 'rare')).toBe(true);
    expect(rareQueenCards.length).toBeGreaterThan(0);
    expect(rareQueenCards.every((card) => (
      card.value === 9 && card.pieces.includes('queen') && card.rarity === 'rare'
    ))).toBe(true);
  });

  it('renders rarity beside the two existing filters on teal structure with oak triggers', () => {
    const markup = renderToStaticMarkup(createElement(CardGalleryFilters, {
      goldFilter: 'all',
      unitFilter: 'all',
      rarityFilter: 'all',
      onGoldFilterChange: () => undefined,
      onUnitFilterChange: () => undefined,
      onRarityFilterChange: () => undefined,
      count: RUN_CARD_CATALOG.length,
      testIdPrefix: 'test-card',
    }));
    expect(markup).toContain('data-chrome-fill-role="outer"');
    expect(markup).toContain('data-testid="test-card-rarity-filter"');
    expect(markup).toContain('aria-label="Filter cards by rarity"');
    expect(markup.match(/data-chrome-fill-surface="hybrid-wood-oak"/g)).toHaveLength(3);
  });
});
