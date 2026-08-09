import { describe, expect, it } from 'vitest';
import {
  createBlankLevel,
  LEVEL_BATTLE_CARDS_DEALT_DEFAULT,
  LEVEL_BATTLE_CARDS_DEALT_MAX,
  LEVEL_BATTLE_CARDS_DEALT_MIN,
  validateLevel,
  type Level,
  type War,
} from '../core/level';
import { validateWarBattlePlayability } from '../core/playability';
import { levelEditorLevelSignature } from '../ui/levelEditorSignature';
import {
  createRun,
  createRunCardOffer,
  CURRENT_RUN_SAVE_VERSION,
  leaveSectio,
  migrateRunSaveDocument,
  openSectio,
  performAdlectio,
  prepareDeployment,
  RUN_CARD_BY_ID,
  runDeploymentDealCount,
  snapshotWar,
  type RunDocument,
  type RunWarSnapshot,
} from './model';

function battleLevel(id: string, cardsDealt?: number): Level {
  const level = createBlankLevel(id, id, 8, 8);
  level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
  if (cardsDealt !== undefined) level.battle = { cardsDealt };
  return level;
}

/** A three-Battle War whose Battles author different deals, so one Run reads each of them. */
function war(...counts: readonly number[]): RunWarSnapshot {
  return {
    id: 'deal-war',
    name: 'Deal War',
    description: 'Authored-deal fixture.',
    battles: counts.map((count, index) => ({ level: battleLevel(`battle-${index}`, count), loot: false })),
  };
}

function at(run: RunDocument, battleIndex: number): RunDocument {
  return { ...run, battleIndex };
}

/** A Run holding more than His Grace, adlected through the real Sectio so the cards are the ones
 * a Deployment would actually deal. */
function holding(run: RunDocument, cardIds: readonly string[]): RunDocument {
  let assembled = openSectio({ ...run, phase: 'battle' }, run.army.map((unit) => unit.id));
  cardIds.forEach((cardId, index) => {
    const offer = createRunCardOffer(assembled, RUN_CARD_BY_ID[cardId], 0, 200 + index);
    assembled = {
      ...assembled,
      goldTenths: 10_000,
      sectio: { ...assembled.sectio!, cardOffers: [...assembled.sectio!.cardOffers, offer] },
    };
    assembled = performAdlectio(assembled, offer.offerId);
  });
  return leaveSectio(assembled);
}

describe('a Battle deals the count its own Level authors', () => {
  it('reads each Battle’s own count, with nothing else feeding it', () => {
    const run = createRun(war(3, 6, 1), 11);
    expect(runDeploymentDealCount(at(run, 0))).toBe(3);
    expect(runDeploymentDealCount(at(run, 1))).toBe(6);
    expect(runDeploymentDealCount(at(run, 2))).toBe(1);
  });

  it('holds a stored count to the schema bounds rather than dealing an impossible hand', () => {
    expect(runDeploymentDealCount(at(createRun(war(0, 3), 11), 0))).toBe(LEVEL_BATTLE_CARDS_DEALT_MIN);
    expect(runDeploymentDealCount(at(createRun(war(-4, 3), 11), 0))).toBe(LEVEL_BATTLE_CARDS_DEALT_MIN);
    expect(runDeploymentDealCount(at(createRun(war(99, 3), 11), 0))).toBe(LEVEL_BATTLE_CARDS_DEALT_MAX);
    expect(runDeploymentDealCount(at(createRun(war(3.7, 3), 11), 0))).toBe(3);
  });

  it('refuses a Battle with no authored count instead of inventing one', () => {
    const unauthored: RunWarSnapshot = {
      ...war(3, 3),
      battles: [{ level: battleLevel('battle-0'), loot: false }, { level: battleLevel('battle-1', 3), loot: false }],
    };
    const run = createRun(war(3, 3), 11);
    expect(() => runDeploymentDealCount({ ...run, war: unauthored, battleIndex: 0 }))
      .toThrow(/does not author how many cards it deals/);
  });

  it('deals exactly the authored count, His Grace first', () => {
    const held = holding(createRun(war(3, 1), 11), ['p', 'pp', 'q']);
    expect(held.cards.length).toBe(4);

    // The Battle authored at 1 sends the King in alone, however much the player is carrying.
    const narrow = prepareDeployment({ ...at(held, 1), phase: 'deployment', deployment: null });
    expect(narrow.deployment?.dealtCardIds).toEqual(['run-card-his-grace']);

    const wide = prepareDeployment({ ...at(held, 0), phase: 'deployment', deployment: null });
    expect(wide.deployment?.dealtCardIds.length).toBe(3);
    expect(wide.deployment?.dealtCardIds[0]).toBe('run-card-his-grace');
  });

  it('leads the deal with whichever King the Run opened on, not with His Grace', () => {
    // Fifteen Kings can open a Run and each mints its own card (#850). Finding that card by
    // naming His Grace left the other fourteen to be shuffled in like any other card -- so a
    // Battle dealing fewer cards than the player holds could leave the King undealt entirely,
    // with no way to deploy him.
    for (const kingId of ['homage-withheld', 'muster-incomplete', 'sole-surviving-issue'] as const) {
      const run = createRun(war(3, 1), 11, { kingId });
      const held = holding(run, ['p', 'pp', 'q']);
      expect(held.cards[0].coreId).toBe(kingId);

      // The Battle authored at 1 sends the King in alone, whichever King that is.
      const narrow = prepareDeployment({ ...at(held, 1), phase: 'deployment', deployment: null });
      expect(narrow.deployment?.dealtCardIds).toEqual([`run-card-${kingId}`]);

      const wide = prepareDeployment({ ...at(held, 0), phase: 'deployment', deployment: null });
      expect(wide.deployment?.dealtCardIds[0]).toBe(`run-card-${kingId}`);
      // And the King himself is deployable, which is the whole point of dealing his card.
      expect(wide.deployment?.deployingUnitIds).toContain('run-king');
    }
  });
});

describe('a War is not startable until every Battle authors its deal', () => {
  const warDoc = (...levelIds: readonly string[]): War => ({
    formatVersion: 1,
    id: 'w',
    name: 'Unfinished War',
    description: '',
    battles: levelIds.map((levelId, ordinal) => ({ levelId, ordinal })),
  });

  it('snapshots a fully authored War', () => {
    const levels = { a: battleLevel('a', 3), b: battleLevel('b', 5) };
    expect(snapshotWar(warDoc('a', 'b'), levels).battles.map((b) => b.level.battle?.cardsDealt))
      .toEqual([3, 5]);
  });

  it('refuses one whose Battle never got a count, naming the level', () => {
    const levels = { a: battleLevel('a', 3), b: battleLevel('b') };
    expect(() => snapshotWar(warDoc('a', 'b'), levels))
      .toThrow(/Battle level b does not author how many cards it deals/);
  });
});

describe('the authored deal as stored level content', () => {
  const withDeal = (cardsDealt: unknown): Level => (
    { ...battleLevel('stored'), battle: { cardsDealt } } as unknown as Level
  );

  it('validates as a whole count inside the bounds', () => {
    expect(validateLevel(withDeal(LEVEL_BATTLE_CARDS_DEALT_MIN)).ok).toBe(true);
    expect(validateLevel(withDeal(LEVEL_BATTLE_CARDS_DEALT_MAX)).ok).toBe(true);
    expect(validateLevel(withDeal(LEVEL_BATTLE_CARDS_DEALT_MAX + 1)).ok).toBe(false);
    expect(validateLevel(withDeal(0)).ok).toBe(false);
    expect(validateLevel(withDeal(3.5)).ok).toBe(false);
    expect(validateLevel(withDeal('4')).ok).toBe(false);
    // Structurally the field stays optional — a Campaign level is not a Battle and never has one.
    expect(validateLevel(battleLevel('stored')).ok).toBe(true);
  });

  it('blocks Save on a War Battle that has no count, and only on a War Battle', () => {
    const missing = validateWarBattlePlayability(battleLevel('stored')).violations;
    expect(missing.map((violation) => violation.code)).toContain('W4_BATTLE_CARDS_DEALT');
    expect(missing.find((violation) => violation.code === 'W4_BATTLE_CARDS_DEALT')?.message)
      .toContain('Deployment deal');

    const authored = validateWarBattlePlayability(battleLevel('stored', 4)).violations;
    expect(authored.map((violation) => violation.code)).not.toContain('W4_BATTLE_CARDS_DEALT');

    // Out-of-bounds content that reached the workspace by some other route is caught too.
    expect(validateWarBattlePlayability(withDeal(99)).violations.map((v) => v.code))
      .toContain('W4_BATTLE_CARDS_DEALT');
  });

  it('changes the editor’s dirty signature, so authoring one is a saveable edit', () => {
    expect(levelEditorLevelSignature(withDeal(4))).not.toBe(levelEditorLevelSignature(battleLevel('stored')));
    expect(levelEditorLevelSignature(withDeal(4))).not.toBe(levelEditorLevelSignature(withDeal(5)));
  });
});

describe('save version 33', () => {
  /** A version-32 document is the current shape with the version wound back and the authored
   * counts stripped — exactly what a Run saved before the requirement looks like. */
  function storedAtVersion32(): Record<string, unknown> {
    const run = createRun(war(3, 3, 3), 11);
    return {
      ...JSON.parse(JSON.stringify(run)),
      runSaveVersion: 32,
      war: {
        ...run.war,
        battles: run.war.battles.map((battle) => ({
          ...battle,
          level: { ...battle.level, battle: { loot: battle.loot } },
        })),
      },
    };
  }

  it('gives every Battle that predates the requirement the authoring default', () => {
    const migrated = migrateRunSaveDocument(storedAtVersion32());
    expect(migrated.runSaveVersion).toBe(CURRENT_RUN_SAVE_VERSION);
    expect(migrated.war.battles.map((battle) => battle.level.battle?.cardsDealt))
      .toEqual([3, 3, 3].map(() => LEVEL_BATTLE_CARDS_DEALT_DEFAULT));
    // Loot is Battle content the migration has no business touching.
    expect(migrated.war.battles.every((battle) => battle.level.battle?.loot === false)).toBe(true);
    // And the migrated Run can be dealt a hand at every Battle it has left.
    expect(migrated.war.battles.map((_, index) => runDeploymentDealCount(at(migrated, index))))
      .toEqual([3, 3, 3]);
  });

  it('leaves a Battle that already authored a count alone', () => {
    const stored = storedAtVersion32();
    const war32 = stored.war as { battles: { level: { battle: Record<string, unknown> } }[] };
    war32.battles[1].level.battle.cardsDealt = 7;
    expect(migrateRunSaveDocument(stored).war.battles.map((battle) => battle.level.battle?.cardsDealt))
      .toEqual([LEVEL_BATTLE_CARDS_DEALT_DEFAULT, 7, LEVEL_BATTLE_CARDS_DEALT_DEFAULT]);
  });
});
