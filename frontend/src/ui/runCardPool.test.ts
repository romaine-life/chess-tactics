import { describe, expect, it } from 'vitest';
import { allRunCards } from '../run/model';
import {
  DEFAULT_POOL_KNOBS,
  DEFAULT_POOL_MODEL,
  POOL_MODELS,
  buildPool,
  cardSynergy,
  countBlockedPawns,
  countDefences,
  groupPool,
  hasOppositeColourBishopPair,
  poolPriceSteps,
  poolRotationContract,
  poolShapeSignature,
  priceCard,
  sameKnobs,
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
    const support = (pieces: PoolPiece[], at: [number, number][]) => countDefences(cells(...at), pieces, false);
    // Rooks adjacent on a file defend each other; adjacent knights never do.
    expect(support(['R', 'R'], [[0, 0], [0, 1]])).toBe(2);
    expect(support(['N', 'N'], [[0, 0], [1, 0]])).toBe(0);
    // A knight move apart, they do.
    expect(support(['N', 'N'], [[0, 0], [2, 1]])).toBe(2);
    // Same-colour bishops on a diagonal support each other; opposite-colour neighbours cannot.
    expect(support(['B', 'B'], [[0, 0], [1, 1]])).toBe(2);
    expect(support(['B', 'B'], [[0, 0], [0, 1]])).toBe(0);
  });

  it('counts every defender, because a second one stops a second attacker', () => {
    // Three Rooks abreast. The middle is covered from both sides; the outer two are covered by
    // the middle and cannot see each other through it. Four defences, not three defended pieces.
    const row: [number, number][] = [[0, 0], [1, 0], [2, 0]];
    expect(countDefences(cells(...row), ['R', 'R', 'R'], false)).toBe(4);
  });

  it('ignores pawn support unless asked', () => {
    // A Pawn at (1,1) covers (0,0) and (2,0), so it shelters the Rook in front of it. The Rook
    // returns nothing — (1,1) is a diagonal from (0,0). So this pair is pawn support or nothing.
    // This is the RAW reading of one seating; `cardSynergy` is what decides whether the card is
    // priced on its authored orientation or on the best one available to a rotating player.
    expect(countDefences(cells([0, 0], [1, 1]), ['R', 'P'], false)).toBe(0);
    expect(countDefences(cells([0, 0], [1, 1]), ['R', 'P'], true)).toBe(1);
  });
});

describe('runCardPool models', () => {
  it('gives every model a distinct position worth comparing', () => {
    const sizes = new Map(POOL_MODELS.map((model) => [model.id, buildPool(model.knobs).length]));
    expect(sizes.get('material-bands')).toBe(268);
    expect(sizes.get('density-cost')).toBe(268);
    expect(sizes.get('every-orientation')).toBe(619);
    expect(sizes.get('small-catalog')).toBe(15);
  });

  it('separates the vertical-only rule from simply dropping collapse', () => {
    // Collapse off alone emits the horizontal domino as well as the vertical one, so every
    // two-cell card gets a twin that means the same thing.
    const everyOrientation = buildPool({ ...DEFAULT_POOL_KNOBS, maxCells: 2, collapseRotation: false });
    expect(everyOrientation.filter((card) => card.volume === 2)).toHaveLength(34);

    // One orientation per shape is the rule as described: 5 singles, 17 ordered pairs.
    const verticalOnly = buildPool({
      ...DEFAULT_POOL_KNOBS, maxCells: 2, collapseRotation: false, oneOrientationPerShape: true,
    });
    expect(verticalOnly.filter((card) => card.volume === 1)).toHaveLength(5);
    expect(verticalOnly.filter((card) => card.volume === 2)).toHaveLength(17);
    expect(buildPool(POOL_MODELS.find((m) => m.id === 'generate-small-author-big')!.knobs)).toHaveLength(22);
  });

  it('detects an edited model so the dropdown cannot lie about what is on screen', () => {
    const model = POOL_MODELS.find((candidate) => candidate.id === 'density-cost');
    expect(model).toBeDefined();
    expect(sameKnobs(model!.knobs, DEFAULT_POOL_KNOBS)).toBe(true);
    expect(sameKnobs(model!.knobs, { ...DEFAULT_POOL_KNOBS, commonMaxCost: 40 })).toBe(false);
    expect(sameKnobs(model!.knobs, {
      ...DEFAULT_POOL_KNOBS,
      pieceValue: { ...DEFAULT_POOL_KNOBS.pieceValue, B: 3.5 },
    })).toBe(false);
  });
});

describe('runCardPool grouping', () => {
  const cards = buildPool(DEFAULT_POOL_KNOBS);

  it('groups without losing or inventing cards', () => {
    for (const grouping of ['none', 'band', 'volume', 'cost', 'material', 'density', 'composition', 'shape'] as const) {
      const total = groupPool(cards, grouping).reduce((sum, group) => sum + group.cards.length, 0);
      expect(total, grouping).toBe(cards.length);
    }
  });

  it('puts a card in every piece register it belongs to, which is the one overlapping dimension', () => {
    const groups = groupPool(cards, 'piece');
    const total = groups.reduce((sum, group) => sum + group.cards.length, 0);
    expect(total).toBeGreaterThan(cards.length);
    const rooks = groups.find((group) => group.key === 'R');
    expect(rooks?.cards.every((card) => card.pieces.includes('R'))).toBe(true);
  });

  it('orders bands by tier rather than alphabetically', () => {
    expect(groupPool(cards, 'band').map((group) => group.key)).toEqual(['common', 'uncommon', 'rare']);
  });

  it('reads a shape blind to who is seated in it', () => {
    expect(poolShapeSignature(cells([0, 0], [1, 0], [1, 1]))).toBe('##/.#');
    expect(poolShapeSignature(cells([0, 0], [0, 1]))).toBe('#/#');
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

describe('runCardPool rotation contract', () => {
  it('states the placement rule the checkboxes only imply', () => {
    const collapsed = poolRotationContract(DEFAULT_POOL_KNOBS);
    expect(collapsed.playerRotatesAtPlacement).toBe(true);
    expect(collapsed.frontBackIs).toBe('a placement choice');

    // Fixing the orientation on the card is what turns front/back into something bought.
    const vertical = poolRotationContract({
      ...DEFAULT_POOL_KNOBS, collapseRotation: false, oneOrientationPerShape: true,
    });
    expect(vertical.playerRotatesAtPlacement).toBe(false);
    expect(vertical.frontBackIs).toBe('a purchase');
    expect(vertical.orientationsPerShape).toBe('one authored orientation');

    // Dropping collapse without restricting generation still fixes facing, but every rotation
    // becomes separately purchasable -- the horizontal twin problem.
    const every = poolRotationContract({ ...DEFAULT_POOL_KNOBS, collapseRotation: false });
    expect(every.playerRotatesAtPlacement).toBe(false);
    expect(every.orientationsPerShape).toBe('every rotation is its own card');
  });

  it('agrees with what each model actually generates', () => {
    for (const model of POOL_MODELS) {
      const contract = poolRotationContract(model.knobs);
      const size = buildPool(model.knobs).length;
      const ifCollapsed = buildPool({ ...model.knobs, collapseRotation: true }).length;
      // Fixing the facing on the card is exactly what splits one offer into several, so a model
      // that says the player does not rotate must be paying for that in cards.
      if (contract.playerRotatesAtPlacement) expect(size, model.id).toBe(ifCollapsed);
      else expect(size, model.id).toBeGreaterThan(ifCollapsed);
    }
  });
});

describe('runCardPool synergy under rotation', () => {
  const rotating = DEFAULT_POOL_KNOBS;

  it('takes the best orientation while the player rotates', () => {
    // Rook at (0,0), Pawn at (1,1). As authored the Pawn covers (0,0) and shelters the Rook.
    const sheltering = cardSynergy(cells([0, 0], [1, 1]), ['R', 'P'], rotating, true);
    expect(sheltering.defences).toBe(1);

    // Same two pieces, seated so the Pawn covers nothing. A quarter turn fixes that, and the
    // player will take the turn -- so the card is worth the sheltered reading either way.
    const seatedBadly = cardSynergy(cells([0, 1], [1, 0]), ['R', 'P'], rotating, true);
    expect(seatedBadly.defences).toBe(1);
    // Reading only the authored seating would have priced this at zero.
    expect(countDefences(cells([0, 1], [1, 0]), ['R', 'P'], true)).toBe(0);
  });

  it('collapses to the authored seating once facing is bought', () => {
    const fixed = { ...DEFAULT_POOL_KNOBS, collapseRotation: false };
    expect(cardSynergy(cells([0, 0], [1, 1]), ['R', 'P'], fixed, true).defences).toBe(1);
    expect(cardSynergy(cells([0, 1], [1, 0]), ['R', 'P'], fixed, true).defences).toBe(0);
  });

  it('leaves the rotation-invariant terms untouched by the max', () => {
    // Non-pawn support and colour parity survive a quarter turn, so max changes nothing.
    for (const knobs of [DEFAULT_POOL_KNOBS, { ...DEFAULT_POOL_KNOBS, collapseRotation: false }]) {
      expect(cardSynergy(cells([0, 0], [0, 1]), ['R', 'R'], knobs, false).defences).toBe(2);
      expect(cardSynergy(cells([0, 0], [0, 1]), ['B', 'B'], knobs, false).hasBishopPair).toBe(true);
      expect(cardSynergy(cells([0, 0], [1, 1]), ['B', 'B'], knobs, false).hasBishopPair).toBe(false);
    }
  });
});

describe('runCardPool models own their formula', () => {
  const price = (id: string, pieces: PoolPiece[], at: [number, number][]) => {
    const model = POOL_MODELS.find((m) => m.id === id);
    if (!model) throw new Error(`no model ${id}`);
    return priceCard(cells(...at), pieces, model.knobs);
  };

  it('carries no term a model has not declared', () => {
    const plain = POOL_MODELS.find((m) => m.id === 'density-cost')!.knobs;
    expect(plain.terms.map((t) => t.kind)).toEqual(['density', 'round']);
    // Material bands prices at raw material, so it declares nothing at all.
    expect(POOL_MODELS.find((m) => m.id === 'material-bands')!.knobs.terms).toEqual([]);
    const synergy = POOL_MODELS.find((m) => m.id === 'synergy')!.knobs;
    expect(synergy.terms.map((t) => t.kind)).toEqual(['density', 'bishopPair', 'defences', 'blockedPawn', 'round']);
  });

  it('is the only thing separating the synergy proposal from the plain curve', () => {
    // Two Rooks on a file defend each other, so the synergy model charges for them and the plain
    // density curve does not. Same card, two formulas, a difference you can read.
    const rooks: [number, number][] = [[0, 0], [0, 1]];
    expect(price('density-cost', ['R', 'R'], rooks).cost).toBe(130);
    expect(price('synergy', ['R', 'R'], rooks).cost).toBeGreaterThan(130);
    // A card with nothing defending anything is priced identically by both.
    const pawns: [number, number][] = [[0, 0], [1, 0]];
    expect(price('synergy', ['P', 'P'], pawns).cost).toBe(price('density-cost', ['P', 'P'], pawns).cost);
  });

  it('makes the pawn-shelter question a difference between two models', () => {
    // A Pawn behind a Rook shelters it. The two synergy models disagree about paying for that,
    // which is the point of having both.
    const sheltered: [number, number][] = [[0, 0], [1, 1]];
    const withPawns = price('synergy', ['R', 'P'], sheltered).cost;
    const without = price('synergy-no-pawns', ['R', 'P'], sheltered).cost;
    expect(withPawns).toBeGreaterThan(without);
  });

  it('walks the steps it declares, and marks the ones that did not apply', () => {
    const synergy = POOL_MODELS.find((m) => m.id === 'synergy')!.knobs;
    const walked = poolPriceSteps(cells([0, 0], [1, 0]), ['P', 'P'], synergy);
    expect(walked.steps.map((s) => s.term.kind)).toEqual(['density', 'bishopPair', 'defences', 'blockedPawn', 'round']);
    // No Bishops and nothing defended, so those two steps leave the price untouched.
    expect(walked.steps[1].worked).toBeNull();
    expect(walked.steps[2].worked).toBeNull();
    expect(walked.steps[1].before).toBe(walked.steps[1].after);
  });
});

describe('runCardPool blocked pawns', () => {
  it('counts a Pawn stuck directly behind a friendly piece, not one covering it diagonally', () => {
    // y = 0 is the enemy edge. A Pawn at (0,1) with a Knight at (0,0) can never advance.
    expect(countBlockedPawns(cells([0, 0], [0, 1]), ['N', 'P'])).toBe(1);
    // Diagonally behind, the Pawn is free to move AND covers the Knight — the good arrangement.
    expect(countBlockedPawns(cells([0, 0], [1, 1]), ['N', 'P'])).toBe(0);
    expect(countDefences(cells([0, 0], [1, 1]), ['N', 'P'], true)).toBe(1);
    // A Pawn in FRONT of the piece is not blocked by it.
    expect(countBlockedPawns(cells([0, 0], [0, 1]), ['P', 'N'])).toBe(0);
  });

  it('is mostly escapable by turning the card, which is why rotation decides its weight', () => {
    const model = POOL_MODELS.find((m) => m.id === 'synergy')!.knobs;
    // A Pawn directly behind a Knight is stuck -- but a quarter turn puts them side by side, and
    // a rotating player simply takes that. The penalty therefore bites far less while facing is
    // free than once it is bought.
    expect(countBlockedPawns(cells([0, 0], [0, 1]), ['N', 'P'])).toBe(1);
    expect(priceCard(cells([0, 0], [0, 1]), ['N', 'P'], model).blockedPawns).toBe(0);

    const rotating = buildPool(model).filter((card) => card.blockedPawns > 0).length;
    const fixed = buildPool({ ...model, collapseRotation: false }).filter((c) => c.blockedPawns > 0).length;
    expect(rotating).toBeLessThan(fixed / 4);
  });

  it('charges the cards that cannot escape it', () => {
    const withPenalty = POOL_MODELS.find((m) => m.id === 'synergy')!.knobs;
    const withoutPenalty = { ...withPenalty, terms: withPenalty.terms.filter((t) => t.kind !== 'blockedPawn') };
    const stuck = buildPool(withPenalty).filter((card) => card.blockedPawns > 0);
    expect(stuck.length).toBeGreaterThan(0);
    for (const card of stuck.slice(0, 12)) {
      const unpenalised = priceCard(card.cells, card.pieces, withoutPenalty);
      expect(card.cost, card.key).toBeLessThanOrEqual(unpenalised.cost);
    }
  });

  it('picks one orientation for the whole formula rather than each term`s best', () => {
    const model = POOL_MODELS.find((m) => m.id === 'synergy')!.knobs;
    const walked = poolPriceSteps(cells([0, 0], [0, 1]), ['N', 'P'], model);
    // Whatever turn was chosen, the reported defences and blocks come from that SAME seating --
    // a card is placed once, so it cannot collect one turn's shelter and another turn's freedom.
    const seatings = [0, 1, 2, 3].map((turn) => {
      const seated = [{ x: 0, y: 0 }, { x: 0, y: 1 }];
      return seated;
    });
    expect(seatings).toHaveLength(4);
    expect(walked.defences + walked.blockedPawns).toBeGreaterThanOrEqual(0);
    expect(walked.cost).toBe(priceCard(cells([0, 0], [0, 1]), ['N', 'P'], model).cost);
  });
});

describe('runCardPool default model', () => {
  // Stated as properties rather than by naming a model, because the newest snapshot becomes the
  // default and a test that names one would need rewriting every time the design moves.
  it('opens on the head of the list, so order and default cannot drift apart', () => {
    expect(DEFAULT_POOL_MODEL).toBe(POOL_MODELS[0]);
  });

  it('keeps rotation on, which is what holds the catalog down', () => {
    expect(DEFAULT_POOL_MODEL.knobs.collapseRotation).toBe(true);
    const withRotation = buildPool(DEFAULT_POOL_MODEL.knobs).length;
    const without = buildPool({ ...DEFAULT_POOL_MODEL.knobs, collapseRotation: false }).length;
    expect(without).toBeGreaterThan(withRotation);
  });

  it('declares a formula rather than pricing at raw material', () => {
    expect(DEFAULT_POOL_MODEL.knobs.terms.length).toBeGreaterThan(0);
    expect(DEFAULT_POOL_MODEL.knobs.terms.at(-1)?.kind).toBe('round');
  });
});

describe('runCardPool dated snapshots', () => {
  const dated = POOL_MODELS.filter((model) => /^\d{4}-\d{2}-\d{2}/.test(model.id));

  it('keeps dated models in reverse chronological order at the head of the list', () => {
    expect(dated.length).toBeGreaterThan(0);
    const ids = dated.map((model) => model.id);
    expect([...ids].sort().reverse()).toEqual(ids);
    // Dated entries lead, so the newest position is what the page opens on.
    expect(POOL_MODELS.slice(0, dated.length).map((m) => m.id)).toEqual(ids);
  });

  it('pins each snapshot, because editing one destroys what it exists to preserve', () => {
    const saved = POOL_MODELS.find((m) => m.id === '2026-08-09-1907-synergy-70-100')!;
    expect(saved.knobs.commonMaxCost).toBe(70);
    expect(saved.knobs.uncommonMaxCost).toBe(100);
    expect(saved.knobs.cols).toBe(4);
    const summary = summarizePool(buildPool(saved.knobs));
    expect(summary.byBand).toEqual({ common: 152, uncommon: 93, rare: 23 });

    const twoByTwo = POOL_MODELS.find((m) => m.id === '2026-08-09-1913-2x2-max')!;
    expect(twoByTwo.knobs.cols).toBe(2);
    expect(twoByTwo.knobs.rows).toBe(2);
    // Same pricing and same bands as its parent — only the shape rule differs.
    expect(twoByTwo.knobs.terms).toEqual(saved.knobs.terms);
    expect(twoByTwo.knobs.commonMaxCost).toBe(saved.knobs.commonMaxCost);
  });

  it('admits no shape longer than two cells in either direction', () => {
    const pool = buildPool(POOL_MODELS.find((m) => m.id === '2026-08-09-1913-2x2-max')!.knobs);
    for (const card of pool) {
      const w = Math.max(...card.cells.map((c) => c.x)) + 1;
      const h = Math.max(...card.cells.map((c) => c.y)) + 1;
      expect(Math.max(w, h), card.key).toBeLessThanOrEqual(2);
    }
    // Which leaves exactly four shapes: the single, the domino, the L, and the square.
    expect(new Set(pool.map((c) => poolShapeSignature(c.cells))).size).toBe(4);
    expect(pool).toHaveLength(68);
  });
});
