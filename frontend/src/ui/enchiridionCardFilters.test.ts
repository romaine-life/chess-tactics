import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RUN_CARD_CATALOG, RUN_OFFER_CARD_COUNT, RUN_STARTER_CARDS } from '../run/model';
import { CardGalleryFilters, cardMatchesFilters, cardsByTier } from './Enchiridion';
import { runCardTierLabel } from './shared/RunCardGoldTierDivider';

describe('Enchiridion card bands', () => {
  it('bands the starter card on its own, ahead of every priced band', () => {
    const bands = cardsByTier(RUN_CARD_CATALOG, (card) => card);
    const [firstTier, firstCards] = bands[0];
    expect(firstTier).toBe('starter');
    expect(firstCards.map((card) => card.id)).toEqual(RUN_STARTER_CARDS.map((king) => king.id));
    expect(runCardTierLabel(firstTier)).toBe('Starter cards');
    // His Grace is worth 20 gold, and that band must no longer contain it.
    const twoGold = bands.find(([tier]) => tier === 2);
    expect(twoGold?.[1].some((card) => card.id === 'his-grace')).toBe(false);
    expect(runCardTierLabel(2)).toBe('20 gold cards');
    // Every remaining band is a price, ascending, and holds only cards worth it.
    const priced = bands.slice(1).map(([tier]) => tier);
    expect(priced).toEqual([...priced].sort((left, right) => Number(left) - Number(right)));
    for (const [tier, cards] of bands.slice(1)) {
      expect(cards.every((card) => card.value === tier)).toBe(true);
    }
    expect(bands.flatMap(([, cards]) => cards)).toHaveLength(RUN_OFFER_CARD_COUNT + RUN_STARTER_CARDS.length);
  });
});

describe('Enchiridion card filters', () => {
  it('shows the combined starter and complete formation deck when both filters are All', () => {
    const visible = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, 'all', 'all', 'all'));
    expect(visible).toHaveLength(RUN_OFFER_CARD_COUNT + RUN_STARTER_CARDS.length);
    expect(RUN_STARTER_CARDS.some((king) => king.id === visible[0].id)).toBe(true);
  });

  it('matches exact gold and contained unit type independently', () => {
    const threeGold = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, '30', 'all', 'all'));
    const rooks = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, 'all', 'rook', 'all'));
    expect(threeGold.length).toBeGreaterThan(0);
    expect(threeGold.every((card) => card.value === 3)).toBe(true);
    expect(rooks.length).toBeGreaterThan(0);
    expect(rooks.every((card) => card.pieces.includes('rook'))).toBe(true);
  });

  it('intersects active filters and can produce an honest empty result', () => {
    const sixGoldPawns = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, '60', 'pawn', 'all'));
    const oneGoldQueens = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, '10', 'queen', 'all'));
    expect(sixGoldPawns.length).toBeGreaterThan(0);
    expect(sixGoldPawns.every((card) => card.value === 6 && card.pieces.includes('pawn'))).toBe(true);
    expect(oneGoldQueens).toEqual([]);
  });

  it('filters the two-gold combined starter normally', () => {
    expect(RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, '20', 'king', 'all')).map((card) => card.id))
      .toEqual(RUN_STARTER_CARDS.filter((king) => king.value === 2).map((king) => king.id));
    expect(RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, '20', 'pawn', 'all')).map((card) => card.id))
      .toEqual(expect.arrayContaining(['his-grace', 'pp']));
  });

  it('matches rarity independently and intersects it with gold and unit filters', () => {
    const rares = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, 'all', 'all', 'rare'));
    const rareQueenCards = RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, '90', 'queen', 'rare'));
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
