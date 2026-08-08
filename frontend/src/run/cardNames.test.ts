import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_FLAVOR_BY_ID,
  RUN_CARD_ID_BY_SLUG,
  RUN_CARD_NAME_BY_ID,
  canonicalCardId,
  runCardArtSlot,
  runCardFlavor,
  runCardName,
  runCardSlug,
} from './cardNames';
import { RUN_CARD_CATALOG, RUN_CARD_DECK, cardContentsLabel, type RunCoreCard } from './model';

describe('Run card names', () => {
  it('authors one name for every card in the generated deck', () => {
    for (const card of RUN_CARD_DECK) {
      expect(RUN_CARD_NAME_BY_ID[card.id], `deck card ${card.id} has no authored name`).toBeTruthy();
    }
  });

  it('authors no orphan names outside the deck', () => {
    const deckIds = new Set(RUN_CARD_DECK.map((card) => card.id));
    for (const id of Object.keys(RUN_CARD_NAME_BY_ID)) {
      expect(deckIds.has(id), `authored name for unknown card id ${id}`).toBe(true);
    }
  });

  it('reuses the authored scene names while generated formation ids remain distinct', () => {
    const names = Object.values(RUN_CARD_NAME_BY_ID);
    expect(new Set(names).size).toBeLessThan(names.length);
    expect(new Set(RUN_CARD_DECK.map((card) => card.id)).size).toBe(RUN_CARD_DECK.length);
  });

  it('names the lone queen Regal Serenity', () => {
    expect(runCardName({ pieces: ['queen'] })).toBe('Regal Serenity');
    expect(runCardArtSlot({ pieces: ['queen'] })).toBe('ui/run/card-art/q/illustration.png');
  });

  it('gives the rotational Queen and Pawn identity one shared prototype identity', () => {
    const queenPawnCards = RUN_CARD_DECK.filter((card) => (
      card.pieces.length === 2
      && card.pieces.includes('queen')
      && card.pieces.includes('pawn')
    ));
    expect(queenPawnCards).toHaveLength(1);
    expect(queenPawnCards.every((card) => runCardName(card) === 'The Last Attendant')).toBe(true);
    expect(queenPawnCards.every((card) => (
      runCardArtSlot(card) === 'ui/run/card-art/q/illustration.png'
    ))).toBe(true);
  });

  it('gives the starter formation a dedicated illustration slot', () => {
    expect(runCardArtSlot({ id: 'his-grace', pieces: ['king', 'pawn', 'pawn'] }))
      .toBe('ui/run/card-art/his-grace/illustration.png');
  });

  it('authors one nonempty flavor fragment for every core card and no orphan flavor', () => {
    const deckIds = new Set(RUN_CARD_DECK.map((card) => card.id));
    for (const card of RUN_CARD_DECK) {
      expect(RUN_CARD_FLAVOR_BY_ID[card.id], `deck card ${card.id} has no authored flavor`).toBeTruthy();
      expect(runCardFlavor(card)).toBe(RUN_CARD_FLAVOR_BY_ID[card.id]);
    }
    for (const id of Object.keys(RUN_CARD_FLAVOR_BY_ID)) {
      expect(deckIds.has(id), `authored flavor for unknown card id ${id}`).toBe(true);
    }
  });

  it('uses authored formation identity when present and composition only as a legacy fallback', () => {
    expect(canonicalCardId({ pieces: ['bishop', 'knight'] as RunCoreCard['pieces'] })).toBe('kb');
    for (const card of RUN_CARD_DECK) {
      expect(canonicalCardId(card)).toBe(card.id);
    }
    expect(runCardName({ id: 'bb-diagonal', pieces: ['bishop', 'bishop'] })).toBe('Crooked Diocese');
    expect(runCardName({ id: 'bb-vertical', pieces: ['bishop', 'bishop'] })).toBe('Matins and Vespers');
    expect(runCardName({ pieces: ['knight', 'bishop'] as RunCoreCard['pieces'] }))
      .toBe(cardContentsLabel({ pieces: ['knight', 'bishop'] }));
  });

  it('addresses every card by its printed name, hyphenated, with no collision', () => {
    expect(runCardSlug('ppb-protected')).toBe('country-parish');
    // Apostrophes are dropped rather than hyphenated, so a possessive reads as one word.
    expect(runCardSlug('pb-front')).toBe('pilgrims-shelter');
    expect(runCardSlug('rr-vertical')).toBe('the-twin-keeps');
    expect(runCardSlug('his-grace')).toBe('his-grace');
    const slugs = RUN_CARD_CATALOG.map((card) => runCardSlug(card.id));
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    // Every address resolves back to the card it names.
    for (const card of RUN_CARD_CATALOG) expect(RUN_CARD_ID_BY_SLUG[runCardSlug(card.id)]).toBe(card.id);
    // A card with no authored name addresses as its own id rather than an empty segment.
    expect(runCardSlug('qq')).toBe('qq');
  });

  it('reads a composition outside the deck as its contents', () => {
    const foreign = { pieces: ['queen', 'queen'] as RunCoreCard['pieces'] };
    expect(runCardName(foreign)).toBe(cardContentsLabel(foreign));
  });
});
