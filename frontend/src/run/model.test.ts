import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import {
  ATARAXIA_BY_TIER,
  ATARAXIA_TIERS,
  AGMINATE_COST,
  AGMINATE_DISPLAY_NAME,
  CONCINNOUS_OFFER_DENOMINATOR,
  ADLECTED_COST,
  GOLD_SCALE,
  HIERATIC_AGMINATE_OFFER_DENOMINATOR,
  RUN_CARD_DECK,
  PIECE_VALUE,
  EUTACTIC_COST,
  CURRENT_RUN_SAVE_VERSION,
  RUN_OPENING_OFFER_COUNT,
  RUN_STARTING_GOLD,
  RUN_STARTING_GOLD_TENTHS,
  LEGATINE_ADLECTED_OFFER_DENOMINATOR,
  acquireLipsanon,
  battleVictoryGoldTenths,
  beginBattle,
  performAdlectio,
  canLeaveSectio,
  cashOutPawn,
  closeBattle,
  createRun,
  createRunCardOffer,
  deterioratePestiferousCards,
  formatGold,
  grantGold,
  hieraticAgminateAcquisitionTarget,
  leaveAftermath,
  leaveSectio,
  migrateRunSaveDocument,
  observeRunUnitDeath,
  normalizeRunDocument,
  OPENING_SECTIO_ROLL_BATTLE_INDEX,
  openingSectioOffers,
  openSectio,
  prepareDeployment,
  resetSectio,
  runAbilityDescription,
  runAbilityDisplayName,
  performAlienatio,
  sectioHasChanges,
  takeVacantiaLipsanon,
  legatineAdlectedAcquisitionTarget,
  type RunDocument,
  type RunWarSnapshot,
} from './model';

function war(battles = 4, lootAt: number[] = []): RunWarSnapshot {
  return {
    id: 'war-test',
    name: 'Test War',
    description: 'A deterministic test War.',
    battles: Array.from({ length: battles }, (_, index) => {
      const level = createBlankLevel(`battle-${index}`, `Battle ${index + 1}`, 8, 8);
      level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
      return { level, loot: lootAt.includes(index) };
    }),
  };
}

function cheapestOpeningOffer(run: RunDocument) {
  return [...run.sectio!.cardOffers].sort((left, right) => left.cost - right.cost)[0];
}

/** A Conflict that ends in loot now opens with Bona Vacantia, so a run may start there. */
function pastOpeningLipsanon(run: RunDocument): RunDocument {
  if (run.phase !== 'bona-vacantia' || !run.vacantia) return run;
  return takeVacantiaLipsanon(run, run.vacantia.offers[0], run.army[0].id);
}

function deployedRun(seed = 17, snapshot = war()): RunDocument {
  let run = pastOpeningLipsanon(createRun(snapshot, seed, '2026-01-01T00:00:00.000Z'));
  // A qualifier can price an opening offer past the starting gold, so open with the
  // cheapest card rather than whichever one landed in slot 0.
  run = performAdlectio(run, cheapestOpeningOffer(run).offerId);
  run = prepareDeployment(leaveSectio(run));
  return beginBattle(run, run.army.map((unit) => unit.id), [], []);
}

function deployedAtaraxiaRun(seed = 17, snapshot = war()): RunDocument {
  let run = pastOpeningLipsanon(createRun(snapshot, seed, 1, '2026-01-01T00:00:00.000Z'));
  run = performAdlectio(run, cheapestOpeningOffer(run).offerId);
  run = prepareDeployment(leaveSectio(run));
  return beginBattle(run, run.army.map((unit) => unit.id), [], []);
}

function openingSectioRunWithPawn(snapshot = war()): RunDocument {
  for (let seed = 1; seed <= 10_000; seed += 1) {
    const run = createRun(snapshot, seed, '2026-01-01T00:00:00.000Z');
    const offer = run.sectio!.cardOffers.find((candidate) => candidate.pieces.includes('pawn'));
    if (offer) return performAdlectio(run, offer.offerId);
  }
  throw new Error('Expected a seeded opening card containing a Pawn.');
}

function deployedRunWithPawn(snapshot = war()): RunDocument {
  const run = prepareDeployment(leaveSectio(openingSectioRunWithPawn(snapshot)));
  return beginBattle(run, run.army.map((unit) => unit.id), [], []);
}

describe('Run piece economy', () => {
  it('stores every ability under the exact word the game says (ADR-0374)', () => {
    expect(AGMINATE_DISPLAY_NAME).toBe('Agminate');
    expect(runAbilityDisplayName('agminate')).toBe('Agminate');
    expect(runAbilityDisplayName('eutactic')).toBe('Eutactic');
    expect(runAbilityDisplayName('adlected')).toBe('Adlected');
    // The cutover's invariant: a stored value and its name are one word, so a document,
    // a media locator and a card face can no longer drift into separate vocabularies.
    for (const ability of ['adlected', 'eutactic', 'agminate'] as const) {
      expect(runAbilityDisplayName(ability).toLowerCase()).toBe(ability);
    }
  });

  it('defines an Agminate Pawn by its same-type formation affinity', () => {
    expect(runAbilityDescription('agminate', 'pawn'))
      .toBe('Prefers a square alongside another Pawn when possible.');
  });

  it('enumerates every unique multiset worth 1–9 points exactly once', () => {
    expect(RUN_CARD_DECK).toHaveLength(49);
    expect(new Set(RUN_CARD_DECK.map((card) => card.id)).size).toBe(49);
    for (const card of RUN_CARD_DECK) {
      expect(card.value).toBeGreaterThanOrEqual(1);
      expect(card.value).toBeLessThanOrEqual(9);
      expect(card.pieces.reduce((sum, piece) => sum + PIECE_VALUE[piece], 0)).toBe(card.value);
    }
  });

  it('starts with the permanent King, two Pawns, eight gold, and an optional three-card deal', () => {
    const run = createRun(war(), 91);
    expect(run.army.map((unit) => unit.type)).toEqual(['king', 'pawn', 'pawn']);
    expect(run.army.every((unit) => unit.name.length > 0)).toBe(true);
    expect(new Set(run.army.map((unit) => unit.name)).size).toBe(run.army.length);
    expect(run.army.every((unit) => Number.isSafeInteger(unit.inspectionSeed))).toBe(true);
    expect(createRun(war(), 91).army.map((unit) => unit.inspectionSeed))
      .toEqual(run.army.map((unit) => unit.inspectionSeed));
    expect(run.army.map((unit) => [unit.type, unit.number])).toEqual([['king', 1], ['pawn', 1], ['pawn', 2]]);
    expect(run.nextArmyUnitNumberByType.pawn).toBe(3);
    expect(run.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS);
    expect(run.phase).toBe('sectio');
    expect(run.sectio?.kind).toBe('opening');
    expect(run.sectio?.cardOffers).toHaveLength(RUN_OPENING_OFFER_COUNT);
    expect(new Set(run.sectio?.cardOffers.map((offer) => offer.offerId)).size).toBe(RUN_OPENING_OFFER_COUNT);
    expect(new Set(run.sectio?.cardOffers.map((offer) => offer.value)).size).toBe(RUN_OPENING_OFFER_COUNT);
    expect(run.sectio?.cardOffers.every((offer) => offer.value >= 1 && offer.value <= 8)).toBe(true);
    expect(run.sectio?.cardOffers.some((offer) => offer.cost <= RUN_STARTING_GOLD)).toBe(true);
    expect(openingSectioOffers(91)).toEqual(run.sectio?.cardOffers);
    expect(createRun(war(), 91).sectio?.cardOffers).toEqual(run.sectio?.cardOffers);
    expect(canLeaveSectio(run)).toBe(true);
    const continued = leaveSectio(run);
    expect(continued.phase).toBe('deployment');
    expect(continued.battleIndex).toBe(0);
    expect(continued.cards).toEqual([]);
    expect(continued.army.map((unit) => unit.type)).toEqual(['king', 'pawn', 'pawn']);
    expect(continued.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS);
  });

  it('buys the opening card in place and waits for explicit Continue before deployment', () => {
    const fresh = createRun(war(), 91);
    const offer = cheapestOpeningOffer(fresh);
    const adlected = performAdlectio(fresh, offer.offerId);
    const card = adlected.cards[0];

    expect(adlected.phase).toBe('sectio');
    expect(adlected.sectio?.kind).toBe('opening');
    expect(adlected.sectio?.adlectedCardOfferIds).toEqual([offer.offerId]);
    expect(adlected.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS - offer.cost * GOLD_SCALE);
    expect(card).toMatchObject({ coreId: offer.id, cardType: offer.cardType, acquiredAfterBattleIndex: 0 });
    expect(card.unitIds).toHaveLength(offer.pieces.length);
    expect(adlected.army.filter((unit) => card.unitIds.includes(unit.id)).map((unit) => unit.type)).toEqual(offer.pieces);
    expect(adlected.nextCardSequence).toBe(2);
    expect(canLeaveSectio(adlected)).toBe(true);
    const reset = resetSectio(adlected);
    expect(reset.phase).toBe('sectio');
    expect(reset.sectio?.kind).toBe('opening');
    expect(reset.sectio?.adlectedCardOfferIds).toEqual([]);
    expect(reset.sectio?.cardOffers).toEqual(fresh.sectio?.cardOffers);
    expect(reset.army.map((unit) => unit.type)).toEqual(['king', 'pawn', 'pawn']);
    expect(reset.cards).toEqual([]);
    expect(reset.goldTenths).toBe(RUN_STARTING_GOLD_TENTHS);
    expect(canLeaveSectio(reset)).toBe(true);
    const continued = leaveSectio(adlected);
    expect(continued.phase).toBe('deployment');
    expect(continued.battleIndex).toBe(0);
  });

  it('rolls opening qualifiers at every core value, out of reach included', () => {
    const offers = openingSectioOffers(91);
    expect(offers.map((offer) => offer.cardType)).toEqual(['legatine', 'concinnous', null]);
    expect(offers.map((offer) => offer.cost)).toEqual([
      offers[0].value + ADLECTED_COST,
      offers[1].value + EUTACTIC_COST,
      offers[2].value,
    ]);
    expect(offers[1].effectTargetIndex).not.toBeNull();

    const qualifiedByValue = new Map<number, number>();
    let outOfReach = 0;
    for (let seed = 1; seed <= 5_000; seed += 1) {
      const opening = openingSectioOffers(seed);
      // ADR-0323 requires an opening Adlectio, so at least one offer always stays adlectable.
      expect(opening.some((offer) => offer.cost <= RUN_STARTING_GOLD)).toBe(true);
      for (const offer of opening) {
        expect(offer.cost).toBe(
          offer.cardType === 'legatine'
            ? offer.value + ADLECTED_COST
            : offer.cardType === 'hieratic'
              ? offer.value + AGMINATE_COST
              : offer.cardType === 'concinnous'
                ? offer.value + EUTACTIC_COST
                : offer.value,
        );
        if (offer.cost > RUN_STARTING_GOLD) outOfReach += 1;
        if (offer.cardType !== null) {
          qualifiedByValue.set(offer.value, (qualifiedByValue.get(offer.value) ?? 0) + 1);
        }
      }
    }
    // No core value is excluded from qualifying: a Tactical card at value 6 or above
    // costs more than the opening budget and is offered anyway.
    expect([...qualifiedByValue.keys()].sort((left, right) => left - right))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(outOfReach).toBeGreaterThan(0);
  });

  it('drops the qualifier on the cheapest opening offer only when the deal has nothing affordable', () => {
    // Values 6, 7 and 8 all rolling a surcharge is the one deal the starting gold cannot
    // adlect; that opening repairs its cheapest card rather than blocking Continue.
    const rolledOpening = (seed: number) => openingSectioOffers(seed).map((offer, slotIndex) => ({
      emitted: offer,
      rolled: createRunCardOffer(
        { seed, ataraxiaTier: 0 },
        RUN_CARD_DECK.find((card) => card.id === offer.id)!,
        OPENING_SECTIO_ROLL_BATTLE_INDEX,
        slotIndex,
      ),
    }));
    const degenerate = Array.from({ length: 40_000 }, (_, index) => index + 1).find((seed) => (
      rolledOpening(seed).some((slot) => slot.emitted.cardType !== slot.rolled.cardType)
    ));
    expect(degenerate).toBeDefined();

    const slots = rolledOpening(degenerate!);
    const repaired = slots.filter((slot) => slot.emitted.cardType !== slot.rolled.cardType);
    expect(repaired).toHaveLength(1);
    expect(repaired[0].rolled.cardType).not.toBeNull();
    expect(repaired[0].emitted.cardType).toBeNull();
    expect(repaired[0].emitted.cost).toBe(repaired[0].emitted.value);
    expect(repaired[0].emitted.cost).toBe(
      Math.min(...slots.map((slot) => slot.emitted.cost)),
    );
    // It is the only affordable card, and it was repaired because nothing else was.
    expect(slots.filter((slot) => slot.emitted.cost <= RUN_STARTING_GOLD)).toHaveLength(1);
    expect(slots.every((slot) => slot.rolled.cost > RUN_STARTING_GOLD)).toBe(true);
  });

  it('keeps opening Pestiferous draws to Ataraxia I', () => {
    const baseline = new Set<string | null>();
    const ataraxia = new Set<string | null>();
    for (let seed = 1; seed <= 3_000; seed += 1) {
      for (const offer of openingSectioOffers(seed)) baseline.add(offer.cardType);
      for (const offer of openingSectioOffers(seed, 1)) ataraxia.add(offer.cardType);
    }
    expect(baseline.has('pestiferous')).toBe(false);
    expect(ataraxia.has('pestiferous')).toBe(true);
    expect(createRun(war(), 91, 1).sectio?.cardOffers).toEqual(openingSectioOffers(91, 1));
  });

  it('rolls the opening independently of the Sectio after Battle 1, which shares battleIndex 0', () => {
    // Both draws would otherwise seed from (seed, battleIndex 0, slot, coreId) and mirror
    // each other whenever the same core identity is offered twice.
    const differing = Array.from({ length: 200 }, (_, index) => index + 1).filter((seed) => (
      openingSectioOffers(seed).some((offer, slotIndex) => {
        const core = RUN_CARD_DECK.find((card) => card.id === offer.id)!;
        const postBattle = createRunCardOffer({ seed, ataraxiaTier: 0 }, core, 0, slotIndex);
        return offer.effectSeed !== postBattle.effectSeed;
      })
    ));
    expect(differing).toHaveLength(200);
  });

  it('keeps every affordable core Units card reachable from seeded openings', () => {
    const observed = new Set<string>();
    for (let seed = 1; seed <= 10_000; seed += 1) {
      for (const offer of openingSectioOffers(seed)) observed.add(offer.id);
    }
    expect(observed).toEqual(new Set(RUN_CARD_DECK.filter((card) => card.value <= 8).map((card) => card.id)));
  });

  it('names opening and later Sectio units in the same transaction that adds them to the army', () => {
    const fresh = createRun(war(), 91);
    const openingPurchase = performAdlectio(fresh, cheapestOpeningOffer(fresh).offerId);
    expect(openingPurchase.army.filter((unit) => unit.source === 'adlectio').every((unit) => unit.name.length > 0)).toBe(true);
    expect(openingPurchase.army.filter((unit) => unit.source === 'adlectio').every((unit) => Number.isSafeInteger(unit.inspectionSeed))).toBe(true);

    const sectio = openSectio({ ...deployedRun(91), goldTenths: 100 * GOLD_SCALE }, []);
    const adlected = performAdlectio(sectio, sectio.sectio!.cardOffers[0].offerId);
    expect(adlected.army.filter((unit) => unit.source === 'adlectio').every((unit) => unit.name.length > 0)).toBe(true);
    expect(adlected.army.filter((unit) => unit.source === 'adlectio').every((unit) => Number.isSafeInteger(unit.inspectionSeed))).toBe(true);
    expect(new Set(adlected.army.map((unit) => unit.name)).size).toBe(adlected.army.length);
  });

  it('allows multiple distinct card adlectiones in the same sectio while gold remains', () => {
    const sectio = openSectio({ ...deployedRun(), goldTenths: 100 * GOLD_SCALE }, []);
    const [first, second] = sectio.sectio!.cardOffers;
    const boughtFirst = performAdlectio(sectio, first.offerId);
    const boughtSecond = performAdlectio(boughtFirst, second.offerId);
    expect(boughtSecond.sectio?.adlectedCardOfferIds).toEqual([first.offerId, second.offerId]);
    expect(boughtSecond.cards).toHaveLength(sectio.cards.length + 2);
    expect(performAdlectio(boughtSecond, first.offerId)).toBe(boughtSecond);
  });

  it('leaves each unadlected card available independently when another card is adlected', () => {
    const seed = Array.from({ length: 100 }, (_, index) => index + 1).find((candidate) => {
      const cheapest = [...openingSectioOffers(candidate)]
        .sort((left, right) => left.cost - right.cost)
        .slice(0, 2);
      return cheapest.reduce((total, offer) => total + offer.cost * GOLD_SCALE, 0) <= RUN_STARTING_GOLD_TENTHS;
    });
    expect(seed).toBeDefined();
    const opening = createRun(war(), seed!);
    const affordable = [...opening.sectio!.cardOffers]
      .sort((left, right) => left.cost - right.cost)
      .slice(0, 2);

    const boughtFirst = performAdlectio(opening, affordable[0].offerId);
    const boughtSecond = performAdlectio(boughtFirst, affordable[1].offerId);
    expect(boughtSecond.sectio?.adlectedCardOfferIds).toEqual(affordable.map((offer) => offer.offerId));
  });

  it('assigns stable per-type numbers to acquired units', () => {
    const run = openingSectioRunWithPawn();
    const pawnNumbers = run.army.filter((unit) => unit.type === 'pawn').map((unit) => unit.number);
    expect(new Set(pawnNumbers).size).toBe(pawnNumbers.length);
    expect(pawnNumbers).toEqual(Array.from({ length: pawnNumbers.length }, (_, index) => index + 1));
  });

  it('sells every non-King and formats Fair Scales quarter-gold exactly', () => {
    let sectio = openSectio(deployedRunWithPawn(), []);
    sectio = acquireLipsanon(sectio, 'fair-scales');
    const pawn = sectio.army.find((unit) => unit.type === 'pawn')!;
    const alienated = performAlienatio(sectio, pawn.id);
    expect(alienated.goldTenths - sectio.goldTenths).toBe(7.5);
    expect(formatGold(7.5)).toBe('0.75');
    expect(alienated.sectio?.alienatedUnits).toEqual([{ unit: pawn, proceedsTenths: 7.5 }]);
    expect(performAlienatio(alienated, 'run-king')).toBe(alienated);
  });

  it('resets the complete sectio transaction without rerolling its offers', () => {
    let sectio = openSectio({ ...deployedRun(29), goldTenths: 100 * GOLD_SCALE }, []);
    const originalOffers = structuredClone(sectio.sectio!.cardOffers);
    const originalArmy = structuredClone(sectio.army);
    const originalGold = sectio.goldTenths;
    const adlected = sectio.sectio!.cardOffers[0].offerId;
    sectio = performAdlectio(sectio, adlected);
    sectio = performAlienatio(sectio, sectio.army.find((unit) => unit.type !== 'king')!.id);
    expect(sectioHasChanges(sectio)).toBe(true);

    const reset = resetSectio(sectio);
    expect(reset.sectio?.cardOffers).toEqual(originalOffers);
    expect(reset.sectio?.adlectedCardOfferIds).toEqual([]);
    expect(reset.sectio?.alienatedUnits).toEqual([]);
    expect(reset.army).toEqual(originalArmy);
    expect(reset.goldTenths).toBe(originalGold);
    expect(sectioHasChanges(reset)).toBe(false);
  });
});

describe('the aftermath report that closes a Battle', () => {
  it('stops on its own screen and banks nothing until the player leaves it', () => {
    const battle = deployedRun(12, war(2));
    const closed = closeBattle(battle, { survivingUnitIds: [], turns: 9 });

    expect(closed.phase).toBe('aftermath');
    expect(closed.sectio).toBeNull();
    // The gold is reported here and paid on Continue, so the screen cannot promise
    // a number the Run then fails to hand over.
    expect(closed.goldTenths).toBe(battle.goldTenths);
    expect(closed.aftermath?.goldTenths).toBe(GOLD_SCALE);

    const sectio = leaveAftermath(closed);
    expect(sectio.phase).toBe('sectio');
    expect(sectio.goldTenths).toBe(battle.goldTenths + GOLD_SCALE);
    expect(sectio.sectio?.victoryGoldTenths).toBe(GOLD_SCALE);
    expect(sectio.aftermath).toBeNull();
  });

  it('reports the turns, the clock and the units that fell', () => {
    const battle = deployedRun(12, war(2));
    const fallen = battle.army.find((unit) => unit.type !== 'king')!;
    const withLoss = observeRunUnitDeath(battle, fallen.id).run;
    const closed = closeBattle(withLoss, { survivingUnitIds: [], turns: 23 });

    expect(closed.aftermath?.turns).toBe(23);
    expect(closed.aftermath?.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(closed.aftermath?.fallenUnits).toEqual([
      { id: fallen.id, name: fallen.name, type: fallen.type },
    ]);
    // The runtime that knows who fell is torn down when the Sectio opens, so the list
    // has to survive on the report rather than be recomputed from it.
    expect(leaveAftermath(closed).battleRuntime).toBeNull();
  });

  it('carries the survivors it was given into the Sectio it opens', () => {
    const battle = acquireLipsanon(deployedRun(12, war(2)), 'mercenarys-rifle');
    const survivors = battle.army.map((unit) => unit.id);
    const closed = closeBattle(battle, { survivingUnitIds: survivors, turns: 4 });
    const bonus = battle.army.reduce((total, unit) => total + PIECE_VALUE[unit.type], 0);

    expect(closed.aftermath?.bonusGoldTenths).toBe(bonus);
    expect(closed.aftermath?.goldTenths).toBe(GOLD_SCALE + bonus);
    expect(leaveAftermath(closed).goldTenths).toBe(battle.goldTenths + GOLD_SCALE + bonus);
  });

  it('gives the final Battle straight to the War victory screen, which is its own report', () => {
    const first = leaveAftermath(closeBattle(deployedRun(12, war(2)), { survivingUnitIds: [], turns: 3 }));
    const finalBattle = beginBattle(prepareDeployment(leaveSectio(first)), [], [], []);

    const won = closeBattle(finalBattle, { survivingUnitIds: [], turns: 3 });
    expect(won.phase).toBe('victory');
    expect(won.aftermath).toBeNull();
  });

  it('refuses to report a Battle that is not over, and a report that has already been left', () => {
    const battle = deployedRun(12, war(2));
    const closed = closeBattle(battle, { survivingUnitIds: [], turns: 3 });
    expect(closeBattle(closed, { survivingUnitIds: [], turns: 99 })).toBe(closed);
    expect(leaveAftermath(battle)).toBe(battle);
    expect(leaveAftermath(leaveAftermath(closed)).phase).toBe('sectio');
  });
});

describe('Run progression and lipsanon offers', () => {
  it('grants an exact administrator-entered gold amount through the Run model', () => {
    const run = deployedRun();
    const granted = grantGold(run, 27);
    expect(granted.goldTenths).toBe(run.goldTenths + 27);
    expect(grantGold(granted, 0)).toBe(granted);
  });

  it('opens a Sectio with strength-scaled gold after non-final victories and skips it after the final boss', () => {
    const firstBattle = deployedRun(12, war(2));
    const afterFirst = openSectio(firstBattle, []);
    expect(afterFirst.phase).toBe('sectio');
    expect(afterFirst.goldTenths).toBe(firstBattle.goldTenths + GOLD_SCALE);
    expect(afterFirst.sectio?.victoryGoldTenths).toBe(GOLD_SCALE);

    const finalBattle = beginBattle(prepareDeployment(leaveSectio(afterFirst)), [], [], []);
    const won = openSectio(finalBattle, []);
    expect(won.phase).toBe('victory');
    expect(won.sectio).toBeNull();
  });

  it('values each enemy King at one gold and every other enemy force at half standard value', () => {
    const snapshot = war(2);
    const level = snapshot.battles[0].level;
    level.layers.units.push(
      { x: 0, y: 0, type: 'pawn', side: 'enemy' },
      { x: 1, y: 0, type: 'knight', side: 'enemy' },
      { x: 2, y: 0, type: 'bishop', side: 'enemy' },
      { x: 3, y: 0, type: 'rook', side: 'enemy' },
      { x: 5, y: 0, type: 'queen', side: 'enemy' },
      { x: 6, y: 0, type: 'rock', side: 'neutral' },
      { x: 7, y: 7, type: 'queen', side: 'player' },
    );
    level.events = [{
      name: 'Enemy reserves',
      trigger: { kind: 'setup' },
      do: [{
        kind: 'spawn',
        side: 'enemy',
        roster: { pawn: 2, rook: 1, king: 1 },
        zoneIds: ['enemy-spawn'],
      }],
    }];

    expect(battleVictoryGoldTenths(level)).toBe(160);
    const battle = deployedRun(12, snapshot);
    const sectio = openSectio(battle, []);
    expect(sectio.goldTenths).toBe(battle.goldTenths + 160);
    expect(sectio.sectio?.victoryGoldTenths).toBe(160);
  });

  it('repairs an incomplete current Sectio reward exactly once', () => {
    const snapshot = war(2);
    snapshot.battles[0].level.layers.units.push({ x: 0, y: 0, type: 'queen', side: 'enemy' });
    const currentReward = battleVictoryGoldTenths(snapshot.battles[0].level);
    const current = openSectio(deployedRun(12, snapshot), []);
    const incomplete = {
      ...current,
      goldTenths: GOLD_SCALE,
      sectio: { ...current.sectio!, victoryGoldTenths: undefined as never },
    };
    const repaired = normalizeRunDocument(incomplete);

    expect(repaired.goldTenths).toBe(currentReward);
    expect(repaired.sectio?.victoryGoldTenths).toBe(currentReward);
    expect(normalizeRunDocument(repaired)).toBe(repaired);
  });

  it('accepts only the current RunSaveVersion and rejects the retired field name', () => {
    const opening = createRun(war(), 73);
    const current = leaveSectio(performAdlectio(opening, cheapestOpeningOffer(opening).offerId));
    expect(current.runSaveVersion).toBe(CURRENT_RUN_SAVE_VERSION);
    for (const runSaveVersion of [1, 8, 14, 15, 16, 17]) {
      expect(() => normalizeRunDocument({
        ...current,
        runSaveVersion,
      } as unknown as RunDocument)).toThrow('unsupported version');
    }
    expect(() => normalizeRunDocument({
      ...current,
      formatVersion: 16,
    } as unknown as RunDocument)).toThrow('unsupported version');
    expect(() => normalizeRunDocument({
      ...current,
      shop: null,
    } as unknown as RunDocument)).toThrow('retired Shop data');
    expect(() => normalizeRunDocument({
      ...current,
      army: current.army.map((unit, index) => index === 0 ? { ...unit, source: 'shop' } : unit),
    } as unknown as RunDocument)).toThrow('retired unit-source data');
    expect(() => normalizeRunDocument({
      ...current,
      army: current.army.map((unit, index) => index === 0 ? { ...unit, source: 'sectio' } : unit),
    } as unknown as RunDocument)).toThrow('retired unit-source data');
    expect(() => normalizeRunDocument({
      ...current,
      sectio: { ...current.sectio!, purchasedCardOfferIds: [] },
    } as unknown as RunDocument)).toThrow('retired Sectio operation data');
  });

  it('losslessly migrates version 17 Shop operations to Sectio, Adlectio, and Alienatio', () => {
    let current = openSectio({ ...deployedRun(73, war(2)), goldTenths: 100 * GOLD_SCALE }, []);
    current = performAdlectio(current, current.sectio!.cardOffers[0].offerId);
    current = performAlienatio(current, current.army.find((unit) => unit.type !== 'king')!.id);
    const acquired = current.army.find((unit) => unit.source === 'adlectio')!;
    current = {
      ...current,
      pestiferousLosses: [{ battleIndex: 0, cardId: current.cards[0].id, unit: acquired }],
    };
    const oldUnit = (unit: RunDocument['army'][number]) => ({
      ...unit,
      source: unit.source === 'adlectio' ? 'shop' : unit.source,
    });
    const oldOfferId = (offerId: string) => offerId.replace(/^sectio-/, 'shop-');
    const { sectio, ...version18WithoutSectio } = current;
    const version17 = {
      ...version18WithoutSectio,
      runSaveVersion: 17,
      phase: 'shop',
      army: current.army.map(oldUnit),
      pestiferousLosses: current.pestiferousLosses.map((loss) => ({
        ...loss,
        unit: oldUnit(loss.unit),
      })),
      shop: {
        ...sectio!,
        cardOffers: sectio!.cardOffers.map((offer) => ({
          ...offer,
          offerId: oldOfferId(offer.offerId),
        })),
        purchasedCardOfferIds: sectio!.adlectedCardOfferIds.map(oldOfferId),
        soldUnits: sectio!.alienatedUnits.map((alienated) => ({ ...alienated, unit: oldUnit(alienated.unit) })),
        entrySnapshot: {
          ...sectio!.entrySnapshot,
          army: sectio!.entrySnapshot.army.map(oldUnit),
        },
      },
    };

    expect(migrateRunSaveDocument(version17)).toEqual(current);
    const { runSaveVersion: _runSaveVersion, ...version16 } = version17;
    const migratedFrom16 = migrateRunSaveDocument({ ...version16, formatVersion: 16 });
    expect(migratedFrom16).toEqual(current);
    expect(migratedFrom16).not.toHaveProperty('formatVersion');
    expect(migratedFrom16).not.toHaveProperty('shop');
    expect(() => normalizeRunDocument({
      ...current,
      sectio: {
        ...current.sectio!,
        cardOffers: current.sectio!.cardOffers.map((offer, index) => index === 0
          ? { ...offer, offerId: offer.offerId.replace(/^sectio-/, 'shop-') }
          : offer),
      },
    })).toThrow('retired Shop offer ids');
    expect(() => migrateRunSaveDocument({ ...version16, formatVersion: 15 }))
      .toThrow('unsupported version');
  });

  it('repairs incomplete current unit identities and Sectio reset state once', () => {
    const current = openSectio(deployedRun(12, war(2)), []);
    const incomplete = {
      ...current,
      army: current.army.map(({ number: _number, ...unit }) => unit),
      nextArmyUnitNumberByType: undefined,
      sectio: {
        ...current.sectio!,
        alienatedUnits: undefined,
        entrySnapshot: undefined,
      },
    } as unknown as RunDocument;
    const repaired = normalizeRunDocument(incomplete);

    for (const type of new Set(repaired.army.map((unit) => unit.type))) {
      const numbers = repaired.army.filter((unit) => unit.type === type).map((unit) => unit.number);
      expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, index) => index + 1));
    }
    expect(repaired.sectio?.alienatedUnits).toEqual([]);
    expect(repaired.sectio?.entrySnapshot.army).toEqual(repaired.army);
    expect(normalizeRunDocument(repaired)).toBe(repaired);
  });

  it('rejects the retired draft phase and fields', () => {
    const current = createRun(war(), 73);
    expect(() => normalizeRunDocument({
      ...current,
      phase: 'draft',
      draftOffers: [],
      chosenDraftId: null,
    } as unknown as RunDocument)).toThrow('retired draft data');

    const committed = leaveSectio(performAdlectio(current, cheapestOpeningOffer(current).offerId));
    const polluted = {
      ...committed,
      draftOffers: [{ id: 'retired', draftId: 'retired', pieces: ['pawn'], value: 1 }],
      chosenDraftId: 'retired',
    } as unknown as RunDocument;
    expect(() => normalizeRunDocument(polluted)).toThrow('retired draft data');
  });

  it('burns all three seen Conflict offers, including the two not chosen', () => {
    // Battles 0 and 1 both close a Conflict, so beating each opens Bona Vacantia.
    const first = openSectio(deployedRun(44, war(5, [0, 1, 3])), []);
    expect(first.phase).toBe('bona-vacantia');
    const firstOffers = first.vacantia!.offers;
    expect(firstOffers).toHaveLength(3);
    const chosen = takeVacantiaLipsanon(first, firstOffers[0], first.army[0].id);
    expect(chosen.phase).toBe('sectio');
    const secondBattle = beginBattle(prepareDeployment(leaveSectio(chosen)), [], [], []);
    const second = openSectio(secondBattle, []);
    expect(second.phase).toBe('bona-vacantia');
    expect(second.vacantia!.offers).toHaveLength(3);
    expect(second.vacantia!.offers.some((lipsanon) => firstOffers.includes(lipsanon))).toBe(false);
  });

  it('keeps one Shopkey offer for the whole Conflict', () => {
    const withKey = acquireLipsanon(deployedRun(57, war(4)), 'merchants-shopkey');
    const firstSectio = openSectio(withKey, []);
    expect(firstSectio.sectio!.paidLipsanonOffer).not.toBeNull();
    const offer = firstSectio.sectio!.paidLipsanonOffer;
    const secondBattle = beginBattle(prepareDeployment(leaveSectio(firstSectio)), [], [], []);
    const secondSectio = openSectio(secondBattle, []);
    expect(secondSectio.conflictIndex).toBe(0);
    expect(secondSectio.sectio!.paidLipsanonOffer).toBe(offer);
  });

  it('permanently removes a cashed-out Pawn and grants two gold', () => {
    let run = acquireLipsanon(deployedRunWithPawn(), 'mercenary-boat');
    const pawn = run.army.find((unit) => unit.type === 'pawn')!;
    const cashed = cashOutPawn(run, pawn.id);
    expect(cashed.army.some((unit) => unit.id === pawn.id)).toBe(false);
    expect(cashed.goldTenths - run.goldTenths).toBe(2 * GOLD_SCALE);
  });
});

describe('Ataraxia ladder identities', () => {
  it('gives the baseline tier the same identity and literal-impact fields as later tiers', () => {
    expect(ATARAXIA_BY_TIER[0]).toEqual({
      tier: 0,
      numeral: '0',
      label: 'Ataraxia 0',
      title: 'The Untroubled Mind',
      effect: 'Standard rules.',
    });
  });

  // Every rung carries a numeral, and the label is that numeral qualified by the ladder
  // name — so renumbering a rung is one edit rather than two strings that can disagree.
  it('numbers every installed rung and qualifies each with the ladder name', () => {
    for (const tier of ATARAXIA_TIERS) {
      const definition = ATARAXIA_BY_TIER[tier];
      expect(definition.numeral).toMatch(/^(?:0|[IVX]+)$/);
      expect(definition.label).toBe(`Ataraxia ${definition.numeral}`);
    }
  });
});

describe('Ataraxia I — The Great Mortality', () => {
  it('never marks baseline offers Pestiferous and deterministically realizes both affected rolls', () => {
    const baseline = createRun(war(), 4217, 0);
    const ataraxia = createRun(war(), 4217, 1);
    const baselineOffers = RUN_CARD_DECK.map((card, index) => (
      createRunCardOffer(baseline, card, Math.floor(index / 4), index % 4)
    ));
    const first = RUN_CARD_DECK.map((card, index) => (
      createRunCardOffer(ataraxia, card, Math.floor(index / 4), index % 4)
    ));
    const second = RUN_CARD_DECK.map((card, index) => (
      createRunCardOffer(ataraxia, card, Math.floor(index / 4), index % 4)
    ));

    expect(baselineOffers.every((offer) => offer.cardType !== 'pestiferous')).toBe(true);
    expect(baselineOffers.some((offer) => offer.cardType === 'concinnous')).toBe(true);
    expect(first).toEqual(second);
    expect(first.some((offer) => offer.cardType === 'pestiferous')).toBe(true);
    expect(first.filter((offer) => offer.cardType === 'pestiferous').length).toBeLessThan(RUN_CARD_DECK.length / 2);
  });

  it('persists complete affected offers through Reset Sectio and promotes the adlected instance into the deck', () => {
    let sectio: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !sectio; seed += 1) {
      const candidate = openSectio({ ...deployedAtaraxiaRun(seed), goldTenths: 100 * GOLD_SCALE }, []);
      if (candidate.sectio?.cardOffers.some((offer) => offer.cardType === 'pestiferous')) sectio = candidate;
    }
    expect(sectio).not.toBeNull();
    const pestiferous = sectio!.sectio!.cardOffers.find((offer) => offer.cardType === 'pestiferous')!;
    const originalOffers = structuredClone(sectio!.sectio!.cardOffers);
    const adlected = performAdlectio(sectio!, pestiferous.offerId);
    const owned = adlected.cards.find((card) => (
      card.coreId === pestiferous.id && card.effectSeed === pestiferous.effectSeed
    ))!;
    const cacochymicPieceIndex = pestiferous.cacochymicPieceIndex!;
    const plaguedPiece = pestiferous.pieces[cacochymicPieceIndex];
    const discount = { pawn: 0, knight: 1, bishop: 1, rook: 2, queen: 3 }[plaguedPiece];
    const acquiredUnits = adlected.army.filter((unit) => owned.unitIds.includes(unit.id));

    expect(cacochymicPieceIndex).toBeGreaterThanOrEqual(0);
    expect(pestiferous.cost).toBe(pestiferous.value - discount);
    expect(owned).toMatchObject({ coreId: pestiferous.id, cardType: 'pestiferous', effectSeed: pestiferous.effectSeed });
    expect(owned.unitIds).toHaveLength(pestiferous.pieces.length);
    expect(owned.cacochymicUnitId).toBe(acquiredUnits[cacochymicPieceIndex].id);
    expect(acquiredUnits.filter((unit) => unit.modifiers.includes('cacochymic')).map((unit) => unit.id))
      .toEqual([owned.cacochymicUnitId]);
    expect(resetSectio(adlected).sectio?.cardOffers).toEqual(originalOffers);
    expect(resetSectio(adlected).cards).toEqual(sectio!.cards);
  });

  it('fills missing current-save offer targets and target-only pricing', () => {
    let current: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !current; seed += 1) {
      const candidate = openSectio(deployedAtaraxiaRun(seed), []);
      if (candidate.sectio?.cardOffers.some((offer) => offer.cardType === 'pestiferous')) current = candidate;
    }
    expect(current).not.toBeNull();
    const incomplete = {
      ...current!,
      sectio: {
        ...current!.sectio!,
        cardOffers: current!.sectio!.cardOffers.map(({ cacochymicPieceIndex: _target, ...offer }) => ({
          ...offer,
          cost: offer.cardType === 'pestiferous' ? 1 : offer.cost,
        })),
      },
    } as unknown as RunDocument;
    const repaired = normalizeRunDocument(incomplete);

    for (const offer of repaired.sectio!.cardOffers) {
      const original = current!.sectio!.cardOffers.find((candidate) => candidate.offerId === offer.offerId)!;
      expect(offer.cacochymicPieceIndex).toBe(original.cacochymicPieceIndex);
      expect(offer.cost).toBe(original.cost);
    }
    expect(normalizeRunDocument(repaired)).toBe(repaired);
  });

  it('removes the revealed target, reveals one successor, and retains empty Pestiferous cards', () => {
    const base = deployedAtaraxiaRun(77, war(5));
    const units = base.army.filter((unit) => unit.type !== 'king').slice(0, 2).map((unit, index) => ({
      ...unit,
      modifiers: index === 0
        ? ['cacochymic'] as RunDocument['army'][number]['modifiers']
        : [],
    }));
    const run: RunDocument = {
      ...base,
      army: [base.army.find((unit) => unit.type === 'king')!, ...units],
      cards: [{
        id: 'run-card-1',
        coreId: 'pp',
        cardType: 'pestiferous',
        effectSeed: 991,
        effectTargetUnitId: null,
        unitIds: units.map((unit) => unit.id),
        lostUnitIds: [],
        cacochymicUnitId: units[0].id,
        acquiredAfterBattleIndex: 0,
      }],
      nextCardSequence: 2,
    };
    const first = deterioratePestiferousCards(run, 1);
    const retry = deterioratePestiferousCards(run, 1);
    const second = deterioratePestiferousCards(first, 2);
    const empty = deterioratePestiferousCards(second, 3);

    expect(first.army).toHaveLength(run.army.length - 1);
    expect(first.pestiferousLosses).toHaveLength(1);
    expect(first.pestiferousLosses[0].unit.id).toBe(units[0].id);
    expect(first.cards[0].cacochymicUnitId).toBe(units[1].id);
    expect(first.army.find((unit) => unit.id === units[1].id)?.modifiers).toEqual(['cacochymic']);
    expect(retry.pestiferousLosses[0].unit.id).toBe(first.pestiferousLosses[0].unit.id);
    expect(deterioratePestiferousCards(first, 1)).toBe(first);
    expect(second.cards[0].unitIds).toEqual([]);
    expect(second.cards[0].lostUnitIds).toHaveLength(2);
    expect(second.cards[0].cacochymicUnitId).toBeNull();
    expect(empty).toBe(second);
  });

  it('immediately reveals a new target when the Cacochymic unit is alienated', () => {
    const base = deployedAtaraxiaRun(79, war(3));
    const units = base.army.filter((unit) => unit.type !== 'king').slice(0, 2).map((unit, index) => ({
      ...unit,
      modifiers: index === 0
        ? ['cacochymic'] as RunDocument['army'][number]['modifiers']
        : [],
    }));
    const run: RunDocument = {
      ...base,
      phase: 'sectio',
      army: [base.army.find((unit) => unit.type === 'king')!, ...units],
      cards: [{
        id: 'run-card-1',
        coreId: 'pp',
        cardType: 'pestiferous',
        effectSeed: 992,
        effectTargetUnitId: null,
        unitIds: units.map((unit) => unit.id),
        lostUnitIds: [],
        cacochymicUnitId: units[0].id,
        acquiredAfterBattleIndex: 0,
      }],
      sectio: null,
      nextCardSequence: 2,
    };
    const alienated = performAlienatio(run, units[0].id);

    expect(alienated.cards[0].unitIds).toEqual([units[1].id]);
    expect(alienated.cards[0].cacochymicUnitId).toBe(units[1].id);
    expect(alienated.army.find((unit) => unit.id === units[1].id)?.modifiers).toEqual(['cacochymic']);
  });

  it('repairs a Pestiferous card that has lost its deterministic Cacochymic target', () => {
    const base = deployedAtaraxiaRun(81, war(3));
    const units = base.army.filter((unit) => unit.type !== 'king').slice(0, 2).map((unit) => ({
      ...unit,
      modifiers: ['cacochymic'] as RunDocument['army'][number]['modifiers'],
    }));
    const repaired = normalizeRunDocument({
      ...base,
      army: [base.army.find((unit) => unit.type === 'king')!, ...units],
      cards: [{
        id: 'run-card-1',
        coreId: 'pp',
        cardType: 'pestiferous',
        effectSeed: 993,
        unitIds: units.map((unit) => unit.id),
        lostUnitIds: [],
        acquiredAfterBattleIndex: 0,
      }],
      nextCardSequence: 2,
    } as unknown as RunDocument);

    expect(repaired.runSaveVersion).toBe(CURRENT_RUN_SAVE_VERSION);
    expect(repaired.cards[0].cacochymicUnitId).not.toBeNull();
    expect(repaired.army.filter((unit) => unit.modifiers.includes('cacochymic')).map((unit) => unit.id))
      .toEqual([repaired.cards[0].cacochymicUnitId]);

    const missingCurrentTarget = {
      ...repaired,
      cards: repaired.cards.map((card) => ({ ...card, cacochymicUnitId: null })),
    };
    const repairedAgain = normalizeRunDocument(missingCurrentTarget);
    expect(repairedAgain.cards[0].cacochymicUnitId).not.toBeNull();
    expect(repairedAgain.army.filter((unit) => unit.modifiers.includes('cacochymic')).map((unit) => unit.id))
      .toEqual([repairedAgain.cards[0].cacochymicUnitId]);
  });
});

describe('Concinnous cards', () => {
  it('persist a concealed eligible target, charge two extra gold, and Position that exact unit on Adlectio', () => {
    let sectio: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !sectio; seed += 1) {
      const candidate = openSectio({ ...deployedRun(seed), goldTenths: 100 * GOLD_SCALE }, []);
      if (candidate.sectio?.cardOffers.some((offer) => offer.cardType === 'concinnous')) sectio = candidate;
    }
    expect(sectio).not.toBeNull();
    const concinnous = sectio!.sectio!.cardOffers.find((offer) => offer.cardType === 'concinnous')!;
    const originalOffers = structuredClone(sectio!.sectio!.cardOffers);
    const adlected = performAdlectio(sectio!, concinnous.offerId);
    const owned = adlected.cards.find((card) => (
      card.coreId === concinnous.id && card.effectSeed === concinnous.effectSeed
    ))!;
    const positioned = adlected.army.filter((unit) => (
      owned.unitIds.includes(unit.id) && unit.abilities.includes('eutactic')
    ));

    expect(concinnous.cost).toBe(concinnous.value + EUTACTIC_COST);
    expect(concinnous.effectTargetIndex).toBeGreaterThanOrEqual(0);
    expect(concinnous.effectTargetIndex).toBeLessThan(concinnous.pieces.length);
    expect(owned).toMatchObject({
      coreId: concinnous.id,
      cardType: 'concinnous',
      effectSeed: concinnous.effectSeed,
      effectTargetUnitId: positioned[0].id,
    });
    expect(positioned).toHaveLength(1);
    expect(owned.unitIds[concinnous.effectTargetIndex!]).toBe(positioned[0].id);
    expect(resetSectio(adlected).sectio?.cardOffers).toEqual(originalOffers);
  });

  it('fills missing current-save Pestiferous fields without rerolling Concinnous targets', () => {
    let sectio: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !sectio; seed += 1) {
      const candidate = openSectio({ ...deployedRun(seed), goldTenths: 100 * GOLD_SCALE }, []);
      if (candidate.sectio?.cardOffers.some((offer) => offer.cardType === 'concinnous')) sectio = candidate;
    }
    const concinnous = sectio!.sectio!.cardOffers.find((offer) => offer.cardType === 'concinnous')!;
    const adlected = performAdlectio(sectio!, concinnous.offerId);
    const incomplete = {
      ...adlected,
      cards: adlected.cards.map(({ cacochymicUnitId: _cacochymicUnitId, ...card }) => card),
      sectio: adlected.sectio && {
        ...adlected.sectio,
        cardOffers: adlected.sectio.cardOffers.map(({ cacochymicPieceIndex: _cacochymicPieceIndex, ...offer }) => offer),
        entrySnapshot: {
          ...adlected.sectio.entrySnapshot,
          cards: adlected.sectio.entrySnapshot.cards.map(({ cacochymicUnitId: _cacochymicUnitId, ...card }) => card),
        },
      },
    } as unknown as RunDocument;
    const repaired = normalizeRunDocument(incomplete);
    const repairedCard = repaired.cards.find((card) => (
      card.coreId === concinnous.id && card.effectSeed === concinnous.effectSeed
    ))!;
    const boughtCard = adlected.cards.find((card) => (
      card.coreId === concinnous.id && card.effectSeed === concinnous.effectSeed
    ))!;
    const repairedOffer = repaired.sectio!.cardOffers.find((offer) => offer.offerId === concinnous.offerId)!;

    expect(repaired.runSaveVersion).toBe(CURRENT_RUN_SAVE_VERSION);
    expect(repairedCard.effectTargetUnitId).toBe(boughtCard.effectTargetUnitId);
    expect(repairedCard.cacochymicUnitId).toBeNull();
    expect(repairedOffer.effectTargetIndex).toBe(concinnous.effectTargetIndex);
    expect(repairedOffer.cacochymicPieceIndex).toBeNull();
    expect(normalizeRunDocument(repaired)).toBe(repaired);
  });

  it('qualifies cards whose Eutactic premium produces a two-digit cost', () => {
    const baseline = createRun(war(), 4217, 0);
    const expensive = RUN_CARD_DECK.filter((card) => card.value >= 8);
    const offers = expensive.map((card, index) => (
      createRunCardOffer(baseline, card, 0, index, 8, 1, 0)
    ));

    expect(CONCINNOUS_OFFER_DENOMINATOR).toBe(8);
    expect(offers.every((offer) => offer.cardType === 'concinnous')).toBe(true);
    expect(offers.every((offer) => offer.cost === offer.value + EUTACTIC_COST)).toBe(true);
    expect(offers.every((offer) => offer.effectTargetIndex !== null)).toBe(true);
    expect(new Set(offers.map((offer) => offer.cost))).toEqual(new Set([10, 11]));
  });
});

describe('Legatine Adlected cards', () => {
  it('rolls every core card at one in eight and permits the Adlected premium through twelve gold', () => {
    const baseline = createRun(war(), 4217, 0);
    const forced = RUN_CARD_DECK.map((card, index) => (
      createRunCardOffer(baseline, card, Math.floor(index / 4), index % 4, 8, 8, 1)
    ));

    expect(LEGATINE_ADLECTED_OFFER_DENOMINATOR).toBe(8);
    expect(forced.every((offer) => offer.cardType === 'legatine')).toBe(true);
    expect(forced.every((offer) => offer.cost === offer.value + ADLECTED_COST)).toBe(true);
    expect(forced.every((offer) => offer.effectTargetIndex === null)).toBe(true);
    expect(Math.max(...forced.map((offer) => offer.cost))).toBe(12);
  });

  it('chooses and persists exactly one Adlected unit only when the card is acquired', () => {
    let sectio: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !sectio; seed += 1) {
      const candidate = openSectio({ ...deployedRun(seed), goldTenths: 100 * GOLD_SCALE }, []);
      if (candidate.sectio?.cardOffers.some((offer) => offer.cardType === 'legatine')) sectio = candidate;
    }
    expect(sectio).not.toBeNull();
    const tactical = sectio!.sectio!.cardOffers.find((offer) => offer.cardType === 'legatine')!;
    expect(tactical.effectTargetIndex).toBeNull();

    const adlected = performAdlectio(sectio!, tactical.offerId);
    const owned = adlected.cards.find((card) => (
      card.coreId === tactical.id && card.effectSeed === tactical.effectSeed
    ))!;
    const disciplined = adlected.army.filter((unit) => (
      owned.unitIds.includes(unit.id) && unit.abilities.includes('adlected')
    ));

    expect(owned.cardType).toBe('legatine');
    expect(disciplined).toHaveLength(1);
    expect(owned.effectTargetUnitId).toBe(disciplined[0].id);
    expect(owned.unitIds.indexOf(disciplined[0].id)).toBe(
      legatineAdlectedAcquisitionTarget(tactical.effectSeed, tactical.pieces.length),
    );
  });
});

describe('Hieratic Agminate cards', () => {
  const baseline = { seed: 4217, ataraxiaTier: 0 } as const;

  it('rolls one in eight after the other qualifiers and adds the Agminate price', () => {
    const forced = RUN_CARD_DECK.map((card, index) => (
      // Denominators: Pestiferous, Concinnous, Tactical, Hieratic. Only Hieratic can roll.
      createRunCardOffer(baseline, card, Math.floor(index / 4), index % 4, 8, 0, 0, 1)
    ));

    expect(HIERATIC_AGMINATE_OFFER_DENOMINATOR).toBe(8);
    expect(AGMINATE_COST).toBe(ADLECTED_COST);
    expect(forced.every((offer) => offer.cardType === 'hieratic')).toBe(true);
    expect(forced.every((offer) => offer.cost === offer.value + AGMINATE_COST)).toBe(true);
    // The target is drawn at acquisition, so the offer carries no seeded index.
    expect(forced.every((offer) => offer.effectTargetIndex === null)).toBe(true);
    expect(forced.every((offer) => offer.cacochymicPieceIndex === null)).toBe(true);

    // Tactical, Pestiferous and Concinnous all resolve first: a card carries one qualifier.
    const outranked = RUN_CARD_DECK.map((card, index) => (
      createRunCardOffer({ seed: 4217, ataraxiaTier: 1 }, card, Math.floor(index / 4), index % 4, 1, 1, 1, 1)
    ));
    expect(outranked.every((offer) => offer.cardType === 'legatine')).toBe(true);
  });

  it('chooses and persists exactly one Agminate unit only when the card is acquired', () => {
    let sectio: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !sectio; seed += 1) {
      const candidate = openSectio({ ...deployedRun(seed), goldTenths: 100 * GOLD_SCALE }, []);
      if (candidate.sectio?.cardOffers.some((offer) => offer.cardType === 'hieratic')) sectio = candidate;
    }
    expect(sectio).not.toBeNull();
    const hieratic = sectio!.sectio!.cardOffers.find((offer) => offer.cardType === 'hieratic')!;
    expect(hieratic.effectTargetIndex).toBeNull();

    const adlected = performAdlectio(sectio!, hieratic.offerId);
    const owned = adlected.cards.find((card) => (
      card.coreId === hieratic.id && card.effectSeed === hieratic.effectSeed
    ))!;
    const agminate = adlected.army.filter((unit) => (
      owned.unitIds.includes(unit.id) && unit.abilities.includes('agminate')
    ));

    expect(owned.cardType).toBe('hieratic');
    expect(agminate).toHaveLength(1);
    expect(owned.effectTargetUnitId).toBe(agminate[0].id);
    expect(owned.unitIds.indexOf(agminate[0].id)).toBe(
      hieraticAgminateAcquisitionTarget(hieratic.effectSeed, hieratic.pieces.length),
    );
    expect(adlected.goldTenths).toBe(sectio!.goldTenths - (hieratic.value + AGMINATE_COST) * GOLD_SCALE);
    // The Agminate draw is its own; it does not mirror the Tactical one.
    expect(hieraticAgminateAcquisitionTarget(hieratic.effectSeed, 8))
      .not.toBe(legatineAdlectedAcquisitionTarget(hieratic.effectSeed, 8));
  });

  it('survives a document round trip with its acquisition target intact', () => {
    let sectio: RunDocument | null = null;
    for (let seed = 1; seed < 500 && !sectio; seed += 1) {
      const candidate = openSectio({ ...deployedRun(seed), goldTenths: 100 * GOLD_SCALE }, []);
      if (candidate.sectio?.cardOffers.some((offer) => offer.cardType === 'hieratic')) sectio = candidate;
    }
    const hieratic = sectio!.sectio!.cardOffers.find((offer) => offer.cardType === 'hieratic')!;
    const adlected = performAdlectio(sectio!, hieratic.offerId);
    const normalized = normalizeRunDocument(structuredClone(adlected));

    expect(normalized.runSaveVersion).toBe(CURRENT_RUN_SAVE_VERSION);
    expect(normalized.cards.map((card) => card.cardType)).toEqual(adlected.cards.map((card) => card.cardType));
    expect(normalized.cards.map((card) => card.effectTargetUnitId))
      .toEqual(adlected.cards.map((card) => card.effectTargetUnitId));
    expect(normalized.sectio?.cardOffers).toEqual(adlected.sectio?.cardOffers);
  });
});
