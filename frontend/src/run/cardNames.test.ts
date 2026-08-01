import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_FLAVOR_BY_ID,
  RUN_CARD_NAME_BY_ID,
  canonicalCardId,
  runCardArtSlot,
  runCardFlavor,
  runCardName,
} from './cardNames';
import { RUN_CARD_DECK, cardContentsLabel, type RunCoreCard } from './model';

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

  it('keeps every authored name unique', () => {
    const names = Object.values(RUN_CARD_NAME_BY_ID);
    expect(new Set(names).size).toBe(names.length);
  });

  it('names the lone queen Regal Serenity', () => {
    expect(runCardName({ pieces: ['queen'] })).toBe('Regal Serenity');
    expect(runCardArtSlot({ pieces: ['queen'] })).toBe('ui/run/card-art/q/illustration.png');
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

  it('resolves card identity from the composition, not the carrier id or piece order', () => {
    expect(canonicalCardId({ pieces: ['bishop', 'knight'] as RunCoreCard['pieces'] })).toBe('kb');
    for (const card of RUN_CARD_DECK) {
      expect(canonicalCardId(card)).toBe(card.id);
    }
    // A shop offer and an art-review fixture with deck compositions read as their card.
    expect(runCardName({ pieces: ['knight', 'bishop'] as RunCoreCard['pieces'] })).toBe(RUN_CARD_NAME_BY_ID.kb);
    expect(runCardName({ pieces: ['pawn', 'rook'] as RunCoreCard['pieces'] })).toBe(RUN_CARD_NAME_BY_ID.pr);
  });

  it('reads a composition outside the deck as its contents', () => {
    const foreign = { pieces: ['queen', 'queen'] as RunCoreCard['pieces'] };
    expect(runCardName(foreign)).toBe(cardContentsLabel(foreign));
  });
});
