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
import { RUN_CARD_CATALOG, RUN_CARD_DECK, cardContentsLabel, runCardDefinition, type RunCoreCard } from './model';

describe('Run card names', () => {
  it('authors one name for every card in the generated deck', () => {
    for (const card of RUN_CARD_DECK) {
      expect(RUN_CARD_NAME_BY_ID[card.id], `deck card ${card.id} has no authored name`).toBeTruthy();
    }
  });

  /**
   * A name must belong to a card that exists — but "exists" is wider than "is dealt". A formation
   * retired from the offer deck stays in Runs that already hold one and keeps its banner, so the
   * guard here is resolvability, and the separate direction (every dealt card is named) is what
   * catches a card shipping with no name at all.
   */
  it('authors no orphan names, and leaves no dealt card unnamed', () => {
    for (const id of Object.keys(RUN_CARD_NAME_BY_ID)) {
      expect(runCardDefinition(id), `authored name for unknown card id ${id}`).toBeTruthy();
    }
    for (const card of RUN_CARD_DECK) {
      expect(RUN_CARD_NAME_BY_ID[card.id], `dealt card ${card.id} has no name`).toBeTruthy();
    }
  });

  it('gives every card its own banner name, shared with no other card', () => {
    const names = Object.values(RUN_CARD_NAME_BY_ID);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(RUN_CARD_DECK.map((card) => card.id)).size).toBe(RUN_CARD_DECK.length);
    // A card sharing another's illustration still reads as itself: same picture, own title.
    const byArtSlot = new Map<string, string[]>();
    for (const card of RUN_CARD_DECK) {
      const slot = runCardArtSlot(card);
      byArtSlot.set(slot, [...(byArtSlot.get(slot) ?? []), runCardName(card)]);
    }
    const shared = [...byArtSlot.values()].filter((siblings) => siblings.length > 1);
    expect(shared.length).toBeGreaterThan(0);
    for (const siblings of shared) expect(new Set(siblings).size).toBe(siblings.length);
  });

  it('addresses every card by its own name, with no id-disambiguated address left over', () => {
    for (const card of RUN_CARD_DECK) {
      expect(runCardSlug(card.id), `address for ${card.id} still carries its raw id`)
        .not.toMatch(new RegExp(`-${card.id}$`));
    }
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
    // One illustration per (footprint, roster): Queen behind a Pawn is its own scene.
    expect(queenPawnCards.every((card) => (
      runCardArtSlot(card) === 'ui/run/card-art/0001-pq/illustration.png'
    ))).toBe(true);
  });

  it('gives the starter formation a dedicated illustration slot', () => {
    expect(runCardArtSlot({ id: 'his-grace', pieces: ['king', 'pawn', 'pawn'] }))
      .toBe('ui/run/card-art/his-grace/illustration.png');
  });

  it('authors one nonempty flavor fragment for every core card and no orphan flavor', () => {
    for (const card of RUN_CARD_DECK) {
      expect(RUN_CARD_FLAVOR_BY_ID[card.id], `deck card ${card.id} has no authored flavor`).toBeTruthy();
      expect(runCardFlavor(card)).toBe(RUN_CARD_FLAVOR_BY_ID[card.id]);
    }
    // Resolvable, not dealt: a retired formation keeps its fragment for Runs that still hold it.
    for (const id of Object.keys(RUN_CARD_FLAVOR_BY_ID)) {
      expect(runCardDefinition(id), `authored flavor for unknown card id ${id}`).toBeTruthy();
    }
  });

  /** A retired formation keeps its whole printed face — banner, fragment, and address. */
  it('keeps the full face of a formation retired from the offer deck', () => {
    for (const id of ['ppb-protected', 'ppk-protected', 'bb-diagonal']) {
      const card = runCardDefinition(id)!;
      expect(RUN_CARD_DECK.some((dealt) => dealt.id === id), `${id} is still dealt`).toBe(false);
      expect(runCardName(card)).not.toBe(cardContentsLabel(card));
      expect(runCardFlavor(card)).not.toBe('No account survives.');
      expect(RUN_CARD_ID_BY_SLUG[runCardSlug(id)]).toBe(id);
    }
    // Flavor is per card, like the name it sits under: two cards sharing an illustration
    // still read as two records, never one printed twice.
    const flavors = Object.values(RUN_CARD_FLAVOR_BY_ID);
    expect(new Set(flavors).size).toBe(flavors.length);
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
