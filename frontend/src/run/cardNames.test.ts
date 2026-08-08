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
import {
  RUN_CARD_CATALOG,
  RUN_CARD_DECK,
  RUN_SECTIO_CARD_PILE_SIZE,
  cardContentsLabel,
  runCardBannerKey,
  sectioCardOffersAtCursor,
  sectioCardPile,
  type RunCoreCard,
} from './model';

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

  it('makes one banner name mean one illustration and one frame', () => {
    const byName = new Map<string, RunCoreCard[]>();
    for (const card of RUN_CARD_DECK) {
      const name = RUN_CARD_NAME_BY_ID[card.id];
      byName.set(name, [...(byName.get(name) ?? []), card]);
    }
    for (const [name, cards] of byName) {
      expect(new Set(cards.map((card) => card.artId)).size, `${name} spans two illustrations`).toBe(1);
      expect(new Set(cards.map((card) => card.rarity)).size, `${name} spans two rarities`).toBe(1);
    }
    // Cards may still share a name, but only when they share a footprint and a roster and so
    // differ solely in which piece sits in which seat -- what the formation diagram draws.
    expect(byName.size).toBe(99);
    expect(new Set(RUN_CARD_DECK.map((card) => card.id)).size).toBe(RUN_CARD_DECK.length);
  });

  it('seats each banner once per pile', () => {
    for (const seed of [7, 88, 501]) {
      for (const maxValue of [6, Number.POSITIVE_INFINITY]) {
        for (const pileIndex of [0, 1, 2]) {
          const pile = sectioCardPile(seed, pileIndex, maxValue);
          expect(new Set(pile.map(runCardBannerKey)).size).toBe(RUN_SECTIO_CARD_PILE_SIZE);
        }
      }
    }
  });

  it('never repeats a banner name inside one dealt Sectio row', () => {
    let rows = 0;
    let straddled = 0;
    const collisions: string[] = [];
    // Sweep every cursor across several pile boundaries, at both offer counts, because a row that
    // straddles two piles is the only place two piles could ever agree on a banner.
    for (const offerCount of [3, 4]) {
      for (let seed = 1; seed <= 60; seed += 1) {
        for (let cursor = 0; cursor <= RUN_SECTIO_CARD_PILE_SIZE * 2 + 5; cursor += 1) {
          const row = sectioCardOffersAtCursor(seed, Math.floor(cursor / offerCount), cursor, offerCount);
          rows += 1;
          if (Math.floor(cursor / RUN_SECTIO_CARD_PILE_SIZE)
            !== Math.floor((cursor + offerCount - 1) / RUN_SECTIO_CARD_PILE_SIZE)) straddled += 1;
          expect(row).toHaveLength(offerCount);
          const names = row.map((offer) => runCardName(offer));
          if (new Set(names).size < names.length) collisions.push(`seed ${seed} cursor ${cursor}: ${names.join(', ')}`);
        }
      }
    }
    expect(straddled, 'the sweep must actually cross pile boundaries').toBeGreaterThan(0);
    expect(collisions, `${collisions.length} of ${rows} dealt rows repeat a banner name`).toEqual([]);
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
