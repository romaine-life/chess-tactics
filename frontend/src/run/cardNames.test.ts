import { describe, expect, it } from 'vitest';
import {
  RUN_CARD_FLAVOR_BY_ID,
  RUN_CARD_NAME_BY_ID,
  canonicalCardId,
  runCardArtSlot,
  runCardFlavor,
  runCardName,
} from './cardNames';
import { PIECE_BUNDLE_DECK, bundleLabel, type PieceBundle } from './model';

describe('Run card names', () => {
  it('authors one name for every card in the generated deck', () => {
    for (const bundle of PIECE_BUNDLE_DECK) {
      expect(RUN_CARD_NAME_BY_ID[bundle.id], `deck bundle ${bundle.id} has no authored name`).toBeTruthy();
    }
  });

  it('authors no orphan names outside the deck', () => {
    const deckIds = new Set(PIECE_BUNDLE_DECK.map((bundle) => bundle.id));
    for (const id of Object.keys(RUN_CARD_NAME_BY_ID)) {
      expect(deckIds.has(id), `authored name for unknown bundle id ${id}`).toBe(true);
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
    const deckIds = new Set(PIECE_BUNDLE_DECK.map((bundle) => bundle.id));
    for (const bundle of PIECE_BUNDLE_DECK) {
      expect(RUN_CARD_FLAVOR_BY_ID[bundle.id], `deck bundle ${bundle.id} has no authored flavor`).toBeTruthy();
      expect(runCardFlavor(bundle)).toBe(RUN_CARD_FLAVOR_BY_ID[bundle.id]);
    }
    for (const id of Object.keys(RUN_CARD_FLAVOR_BY_ID)) {
      expect(deckIds.has(id), `authored flavor for unknown bundle id ${id}`).toBe(true);
    }
  });

  it('resolves card identity from the composition, not the carrier id or piece order', () => {
    expect(canonicalCardId({ pieces: ['bishop', 'knight'] as PieceBundle['pieces'] })).toBe('kb');
    for (const bundle of PIECE_BUNDLE_DECK) {
      expect(canonicalCardId(bundle)).toBe(bundle.id);
    }
    // A draft offer and an art-review fixture with deck compositions read as their card.
    expect(runCardName({ pieces: ['knight', 'bishop'] as PieceBundle['pieces'] })).toBe(RUN_CARD_NAME_BY_ID.kb);
    expect(runCardName({ pieces: ['pawn', 'rook'] as PieceBundle['pieces'] })).toBe(RUN_CARD_NAME_BY_ID.pr);
  });

  it('reads a composition outside the deck as its contents', () => {
    const foreign = { pieces: ['queen', 'queen'] as PieceBundle['pieces'] };
    expect(runCardName(foreign)).toBe(bundleLabel(foreign));
  });
});
