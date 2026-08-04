import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import {
  AGMINATE_COST,
  ADLECTED_COST,
  GOLD_SCALE,
  PIECE_VALUE,
  EUTACTIC_COST,
  normalizeRunDocument,
  type RunWarSnapshot,
} from './model';
import {
  RunCraftError,
  craftRunDocument,
  hasRunCraftRequest,
  isRunCraftLinkPath,
  parseRunCraftSpec,
  runCraftAddress,
  runCraftLinkForId,
  runCraftLinkId,
  runCraftSpecFingerprint,
  runCraftSpecFromJson,
  runCraftSpecToJson,
  runLinkForRun,
  runLinkTargetMismatch,
  searchWithoutCraftParams,
} from './craft';

function war(battles = 4, lootAt: number[] = []): RunWarSnapshot {
  return {
    id: 'off-w-craft',
    name: 'Crafted War',
    description: 'A deterministic test War.',
    battles: Array.from({ length: battles }, (_, index) => {
      const level = createBlankLevel(`battle-${index}`, `Battle ${index + 1}`, 8, 8);
      level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
      level.layers.zones = [{
        id: 'player-zone',
        type: 'player-spawn',
        tiles: Array.from({ length: 16 }, (_cell, offset) => [offset % 8, 6 + Math.floor(offset / 8)] as [number, number]),
      }];
      return { level, loot: lootAt.includes(index) };
    }),
  };
}

function spec(search: string) {
  const parsed = parseRunCraftSpec(search);
  if (!parsed) throw new Error(`${search} carried no craft request`);
  return parsed;
}

function craft(search: string, snapshot = war()) {
  return craftRunDocument(spec(search), snapshot);
}

describe('run craft spec parsing', () => {
  it('reads nothing from an address without a craft request', () => {
    expect(parseRunCraftSpec('?view=army')).toBeNull();
    expect(parseRunCraftSpec('')).toBeNull();
  });

  it('rejects a phase the Run does not have', () => {
    expect(() => parseRunCraftSpec('?craft=inventory')).toThrow(RunCraftError);
  });

  it('accepts piece names, chess letters and bare deck ids alike', () => {
    const units = [
      { type: 'pawn', abilities: [] },
      { type: 'pawn', abilities: [] },
      { type: 'knight', abilities: [] },
    ];
    expect(spec('?craft=battle&army=pawn,pawn,knight').army).toEqual(units);
    expect(spec('?craft=battle&army=p,p,n').army).toEqual(units);
    expect(spec('?craft=battle&army=ppk').army).toEqual(units);
  });

  it('names the bad token when a piece is not a piece', () => {
    expect(() => parseRunCraftSpec('?craft=battle&army=horse')).toThrow(/"horse" is not a piece/);
  });

  it('refuses a Shop card worth more than a card can be worth', () => {
    expect(() => parseRunCraftSpec('?craft=shop&offers=queen+queen')).toThrow(/worth 18 gold/);
  });

  it('reads a card type off an offer', () => {
    expect(spec('?craft=shop&offers=rook:tactical').offers).toEqual([
      { pieces: ['rook'], cardType: 'legatine' },
    ]);
  });

  it('rejects a relic id that does not exist', () => {
    expect(() => parseRunCraftSpec('?craft=shop&relics=lucky-rabbit')).toThrow(/not a relic id/);
  });

  it('keeps the Run screen own parameters when the craft request is spent', () => {
    expect(searchWithoutCraftParams('?craft=shop&battle=3&gold=25&view=sell')).toBe('?view=sell');
    expect(searchWithoutCraftParams('?craft=shop')).toBe('');
  });
});

describe('run craft specs from a request body', () => {
  it('reads the same spec the address grammar reads', () => {
    expect(runCraftSpecFromJson({ phase: 'shop', battle: 3, gold: 25, army: 'knight,rook' }))
      .toEqual(spec('?craft=shop&battle=3&gold=25&army=knight,rook'));
  });

  it('takes structured units, abilities and card objects the address cannot carry', () => {
    const parsed = runCraftSpecFromJson({
      phase: 'shop',
      battle: 2,
      army: [{ type: 'rook', abilities: ['agminate'] }, 'pawn'],
      offers: [{ pieces: ['pawn', 'pawn'], type: 'concinnous' }],
      relics: ['fair-scales'],
    });
    expect(parsed.army).toEqual([
      { type: 'rook', abilities: ['agminate'] },
      { type: 'pawn', abilities: [] },
    ]);
    expect(parsed.offers).toEqual([{ pieces: ['pawn', 'pawn'], cardType: 'concinnous' }]);
    expect(parsed.relics).toEqual(['fair-scales']);
  });

  it('refuses a field it does not understand rather than crafting the wrong Run', () => {
    expect(() => runCraftSpecFromJson({ phase: 'shop', goldd: 40 })).toThrow(/unknown field "goldd"/);
  });

  it('refuses an ability that is not an ability', () => {
    expect(() => runCraftSpecFromJson({ phase: 'shop', army: [{ type: 'rook', abilities: ['flying'] }] }))
      .toThrow(/"flying" is not an ability/);
  });

  it('grants crafted abilities to the units it adds', () => {
    const run = craftRunDocument(
      runCraftSpecFromJson({ phase: 'shop', battle: 2, army: [{ type: 'rook', abilities: ['agminate'] }, 'pawn'] }),
      war(),
    );
    expect(run.army.map((unit) => `${unit.type}:${unit.abilities.join('+') || 'none'}`))
      .toEqual(['king:none', 'rook:agminate', 'pawn:none']);
  });
});

describe('crafted Run documents', () => {
  it('crafts the opening Shop as itself', () => {
    const run = craft('?craft=shop');
    expect(run.phase).toBe('shop');
    expect(run.shop?.kind).toBe('opening');
    expect(run.goldTenths).toBe(8 * GOLD_SCALE);
    expect(run.army).toHaveLength(3);
  });

  it('refuses to override the opening Shop, whose contents the Run contract pins', () => {
    expect(() => craft('?craft=shop&gold=40')).toThrow(/opening Shop is fixed/);
  });

  it('crafts the Shop that precedes a later Battle', () => {
    const run = craft('?craft=shop&battle=3');
    expect(run.phase).toBe('shop');
    expect(run.shop?.kind).toBe('post-battle');
    expect(run.shop?.afterBattleIndex).toBe(1);
    expect(run.battleIndex).toBe(1);
  });

  it('sets gold exactly, and moves the Shop entry snapshot with it', () => {
    const run = craft('?craft=shop&battle=3&gold=25.5');
    expect(run.goldTenths).toBe(255);
    expect(run.shop?.entrySnapshot.goldTenths).toBe(255);
  });

  it('crafts an exact army beside the King', () => {
    const run = craft('?craft=shop&battle=2&army=knight,rook,queen');
    expect(run.army.filter((unit) => unit.type === 'king')).toHaveLength(1);
    expect(run.army.filter((unit) => unit.type !== 'king').map((unit) => unit.type))
      .toEqual(['knight', 'rook', 'queen']);
    expect(run.army.every((unit) => unit.name.trim().length > 0)).toBe(true);
  });

  it('adds to the army the Run already has', () => {
    const base = craft('?craft=shop&battle=2');
    const added = craft('?craft=shop&battle=2&add=queen');
    expect(added.army).toHaveLength(base.army.length + 1);
    expect(added.army.at(-1)?.type).toBe('queen');
  });

  it('offers exactly the cards the link asks for, priced the way the game prices them', () => {
    const run = craft('?craft=shop&battle=2&offers=rook,pawn+pawn:concinnous,knight:tactical,bishop:hieratic');
    const offers = run.shop?.cardOffers ?? [];
    expect(offers.map((offer) => offer.pieces)).toEqual([['rook'], ['pawn', 'pawn'], ['knight'], ['bishop']]);
    expect(offers[0].cost).toBe(PIECE_VALUE.rook);
    expect(offers[0].cardType).toBeNull();
    expect(offers[1].cost).toBe(2 * PIECE_VALUE.pawn + EUTACTIC_COST);
    expect(offers[1].effectTargetIndex).toBeGreaterThanOrEqual(0);
    expect(offers[2].cost).toBe(PIECE_VALUE.knight + ADLECTED_COST);
    expect(offers[3].cardType).toBe('hieratic');
    expect(offers[3].cost).toBe(PIECE_VALUE.bishop + AGMINATE_COST);
    expect(offers[3].effectTargetIndex).toBeNull();
    expect(run.shop?.purchasedCardOfferIds).toEqual([]);
  });

  it('discounts a Plagued offer by its Plagued piece', () => {
    const run = craft('?craft=shop&battle=2&offers=rook:pestiferous');
    const offer = run.shop!.cardOffers[0];
    expect(offer.cardType).toBe('pestiferous');
    expect(offer.cacochymicPieceIndex).toBe(0);
    expect(offer.cost).toBe(PIECE_VALUE.rook - 2);
  });

  it('keeps the Shop card count consistent with its entry snapshot', () => {
    const run = craft('?craft=shop&battle=3&army=knight,knight&offers=rook');
    expect(run.cards.length).toBe(
      (run.shop?.entrySnapshot.cards.length ?? 0) + (run.shop?.purchasedCardOfferIds.length ?? 0),
    );
  });

  it('crafts the cards the Run already holds by buying them for real', () => {
    const run = craft('?craft=shop&battle=3&cards=rook,pawn+pawn:concinnous&gold=20');
    expect(run.cards).toHaveLength(3); // the opening purchase plus the two named cards
    const held = run.cards.slice(1);
    expect(held.map((card) => card.coreId)).toEqual(['r', 'pp']);
    // Real purchases: every held unit id is an army unit, and the Concinnous target got its
    // ability from buyCard rather than from the spec.
    const armyIds = new Set(run.army.map((unit) => unit.id));
    expect(held.every((card) => card.unitIds.every((id) => armyIds.has(id)))).toBe(true);
    expect(run.army.find((unit) => unit.id === held[1].effectTargetUnitId)?.abilities)
      .toContain('eutactic');
    // The staged offers are withdrawn: the Shop reads as the one the game dealt.
    expect(run.shop?.cardOffers.some((offer) => offer.offerId.startsWith('craft-1'))).toBe(false);
    expect(run.shop?.purchasedCardOfferIds).toEqual([]);
    // And they were not paid for out of the Run's gold.
    expect(run.goldTenths).toBe(20 * GOLD_SCALE);
  });

  it('carries held cards through every Battle before the target', () => {
    const early = craft('?craft=deployment&battle=2&cards=rook');
    const late = craft('?craft=deployment&battle=4&cards=rook');
    expect(early.cards.map((card) => card.coreId)).toEqual(late.cards.map((card) => card.coreId));
    expect(late.battleIndex).toBe(3);
  });

  it('refuses held cards beside a crafted army, which would replace their units', () => {
    expect(() => craft('?craft=shop&battle=3&cards=rook&army=knight')).toThrow(/cards and army/);
  });

  it('round-trips held cards through the spec fingerprint and the address', () => {
    const parsed = spec('?craft=shop&battle=3&cards=rook,pawn+pawn:concinnous');
    expect(runCraftSpecToJson(parsed).cards)
      .toEqual([{ pieces: ['rook'], type: null }, { pieces: ['pawn', 'pawn'], type: 'concinnous' }]);
    expect(runCraftAddress(parsed)).toContain('cards=rook%2Cpawn%2Bpawn%3Aconcinnous');
    expect(runCraftSpecFingerprint(spec(runCraftAddress(parsed).slice('/run'.length))))
      .toBe(runCraftSpecFingerprint(parsed));
    expect(runCraftSpecFromJson(runCraftSpecToJson(parsed)).cards).toEqual(parsed.cards);
  });

  it('offers Conflict relics that are still choosable', () => {
    const run = craft('?craft=bona-vacantia&battle=1&loot=fair-scales,mercenarys-rifle', war(4, [2]));
    expect(run.phase).toBe('bona-vacantia');
    expect(run.vacantia?.offers).toEqual(['fair-scales', 'mercenarys-rifle']);
    expect(run.seenRelics).toEqual(expect.arrayContaining(['fair-scales', 'mercenarys-rifle']));
  });

  it('will not offer a relic the crafted Run already holds', () => {
    expect(() => craft('?craft=bona-vacantia&battle=1&relics=fair-scales&loot=fair-scales', war(4, [2])))
      .toThrow(/already held/);
  });

  it('holds the relics the link names', () => {
    const run = craft('?craft=shop&battle=2&relics=quartermasters-ledger');
    expect(run.relics).toContain('quartermasters-ledger');
  });

  it('crafts a deployment screen at the named Battle', () => {
    const run = craft('?craft=deployment&battle=2');
    expect(run.phase).toBe('deployment');
    expect(run.battleIndex).toBe(1);
    expect(run.deployment?.battleIndex).toBe(1);
    expect(run.shop).toBeNull();
  });

  it('crafts a Battle already under way', () => {
    const run = craft('?craft=battle&battle=3&army=rook,rook');
    expect(run.phase).toBe('battle');
    expect(run.battleIndex).toBe(2);
    expect(run.battleRuntime?.battleIndex).toBe(2);
    expect(run.battleRuntime?.initiallyDeployedUnitIds.length).toBeGreaterThan(0);
  });

  it('makes the Surveyor\'s Compass layout choice a crafted Battle would otherwise wait on', () => {
    const run = craft('?craft=battle&battle=3&relics=surveyors-compass');
    expect(run.phase).toBe('battle');
    expect(run.deployment?.layoutChoice).toBe(0);
    expect(run.battleRuntime?.initiallyDeployedUnitIds.length).toBeGreaterThan(0);
  });

  it('crafts the won War', () => {
    const run = craft('?craft=victory&gold=99');
    expect(run.phase).toBe('victory');
    expect(run.shop).toBeNull();
    expect(run.goldTenths).toBe(990);
  });

  it('plays through loot Battles while fast-forwarding', () => {
    const run = craft('?craft=shop&battle=3', war(4, [0]));
    expect(run.phase).toBe('shop');
    expect(run.relics.length).toBeGreaterThan(0);
    expect(run.conflictIndex).toBe(1);
  });

  it('refuses a Battle the War does not have', () => {
    expect(() => craft('?craft=deployment&battle=9')).toThrow(/has 4 Battles/);
  });

  it('stops on the Battle report the aftermath phase names', () => {
    const run = craft('?craft=aftermath&battle=2');
    expect(run.phase).toBe('aftermath');
    expect(run.battleIndex).toBe(1);
    expect(run.shop).toBeNull();
    // The reward is reported and not yet banked, exactly as a played Battle leaves it.
    expect(run.aftermath?.goldTenths).toBe(GOLD_SCALE);
    expect(run.aftermath?.turns).toBe(14);
    expect(run.aftermath?.elapsedMs).toBeGreaterThanOrEqual(277_000);
  });

  it('puts the reported result a crafted Battle cannot produce on its own', () => {
    const run = craft('?craft=aftermath&battle=2&turns=31&seconds=90&fallen=2');
    expect(run.aftermath?.turns).toBe(31);
    expect(run.aftermath?.elapsedMs).toBeGreaterThanOrEqual(90_000);
    expect(run.aftermath?.elapsedMs).toBeLessThan(120_000);
    expect(run.aftermath?.fallenUnits).toHaveLength(2);
    expect(run.aftermath?.fallenUnits.every((unit) => unit.type !== 'king')).toBe(true);
    // Fallen units are not survivors, so the two lists cannot both claim them.
    const survivors = new Set(run.aftermath?.survivingUnitIds ?? []);
    expect(run.aftermath?.fallenUnits.some((unit) => survivors.has(unit.id))).toBe(false);
  });

  it('refuses a Battle report the Run has no room for', () => {
    expect(() => craft('?craft=aftermath&battle=4')).toThrow(/ends the War/);
    expect(() => craft('?craft=aftermath&battle=2&fallen=99')).toThrow(/could fall/);
    expect(() => craft('?craft=shop&battle=3&turns=12')).toThrow(/belong to craft=aftermath/);
  });

  it('crafts documents the Run loader accepts unchanged', () => {
    for (const search of [
      '?craft=shop',
      '?craft=shop&battle=3&gold=25&army=knight,rook&offers=queen,pawn+pawn:pestiferous',
      '?craft=deployment&battle=2',
      '?craft=battle&battle=2',
      '?craft=aftermath&battle=2&turns=21&seconds=402&fallen=2',
      '?craft=victory',
    ]) {
      const run = craft(search);
      const normalized = normalizeRunDocument(structuredClone(run));
      expect(normalized).toEqual(run);
    }
  });
});

describe('crafted Run links', () => {
  it('asserts the Run it was made for, and passes when that Run is the active one', () => {
    expect(runLinkForRun('run-7')).toBe('/run?run=run-7');
    expect(runLinkTargetMismatch('?run=run-7', 'run-7')).toBe(false);
  });

  it('catches the link opened against another Run, or none at all', () => {
    expect(runLinkTargetMismatch('?run=run-7', 'run-8')).toBe(true);
    expect(runLinkTargetMismatch('?run=run-7', null)).toBe(true);
  });

  it('leaves an address that asserts nothing alone', () => {
    expect(runLinkTargetMismatch('?view=army', null)).toBe(false);
    expect(runLinkTargetMismatch('', 'run-7')).toBe(false);
  });
});

describe('links that craft the Run they open', () => {
  const roundTrip = (search: string) => parseRunCraftSpec(runCraftAddress(spec(search)).split('?')[1]);

  it('is an id, not a spec spelled out in the address', () => {
    expect(runCraftLinkForId('a1b2c3d4e5f6')).toBe('/run/craft/a1b2c3d4e5f6');
    expect(runCraftLinkId('/run/craft/a1b2c3d4e5f6')).toBe('a1b2c3d4e5f6');
    expect(isRunCraftLinkPath('/run/craft/a1b2c3d4e5f6')).toBe(true);
  });

  it('leaves every other Run address alone', () => {
    expect(runCraftLinkId('/run')).toBeNull();
    expect(isRunCraftLinkPath('/run')).toBe(false);
    expect(isRunCraftLinkPath('/run/strategikon/army')).toBe(false);
  });

  it('reaches the screen with a malformed id so it can be reported, not routed elsewhere', () => {
    expect(isRunCraftLinkPath('/run/craft/not-an-id')).toBe(true);
    expect(runCraftLinkId('/run/craft/not-an-id')).toBeNull();
    expect(runCraftLinkId('/run/craft/')).toBeNull();
  });

  it('fingerprints the same requested state to the same text, whatever order it was written in', () => {
    const fromAddress = spec('?craft=shop&battle=3&gold=12.5&army=rook,pawn');
    const fromJson = runCraftSpecFromJson({ army: 'rook,pawn', gold: 12.5, battle: 3, phase: 'shop' });
    expect(runCraftSpecFingerprint(fromJson)).toBe(runCraftSpecFingerprint(fromAddress));
  });

  it('fingerprints a different state differently', () => {
    expect(runCraftSpecFingerprint(spec('?craft=shop&battle=3&gold=12.5')))
      .not.toBe(runCraftSpecFingerprint(spec('?craft=shop&battle=3&gold=25')));
  });

  it('keeps the readable grammar as a way to write a spec by hand', () => {
    expect(runCraftAddress(spec('?craft=shop&battle=4&gold=33.5&army=rook,knight')))
      .toBe('/run?craft=shop&battle=4&gold=33.5&army=rook%2Cknight');
  });

  it('carries every field of the address grammar back unchanged', () => {
    const search = '?craft=shop&battle=3&war=off-w-craft&seed=99&tier=1&gold=12.5'
      + '&army=rook,pawn&add=knight&offers=queen,pawn+pawn:concinnous&loot=fair-scales'
      + '&paid=quartermasters-ledger&relics=surveyors-compass';
    expect(roundTrip(search)).toEqual(spec(search));
  });

  it('refuses to write an address for a spec it would have to shorten', () => {
    const rich = runCraftSpecFromJson({ phase: 'shop', battle: 4, army: [{ type: 'rook', abilities: ['agminate'] }] });
    expect(() => runCraftAddress(rich)).toThrow(/cannot be written as an address/);
  });

  it('recognises a hand-written address as a craft request', () => {
    expect(hasRunCraftRequest('?craft=shop&battle=2')).toBe(true);
    expect(hasRunCraftRequest('?view=army')).toBe(false);
  });

  it('is spent once minted, so the Run screen keeps only its own parameters', () => {
    expect(searchWithoutCraftParams('?craft=shop&battle=3&gold=25&view=army')).toBe('?view=army');
  });

  it('writes the same JSON the request body grammar reads, so an id always means one spec', () => {
    const source = spec('?craft=shop&battle=3&gold=12.5&offers=pawn+pawn:pestiferous&relics=fair-scales');
    expect(runCraftSpecFromJson(runCraftSpecToJson(source))).toEqual(source);
  });
});
