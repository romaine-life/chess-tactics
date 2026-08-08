import { describe, expect, it } from 'vitest';
import {
  createBlankLevel,
  LEVEL_BATTLE_CARDS_DEALT_MAX,
  LEVEL_BATTLE_CARDS_DEALT_MIN,
  validateLevel,
  type Level,
} from '../core/level';
import { levelEditorLevelSignature } from '../ui/levelEditorSignature';
import {
  createRun,
  createRunCardOffer,
  leaveSectio,
  openSectio,
  performAdlectio,
  prepareDeployment,
  RUN_CARD_BY_ID,
  RUN_DEPLOYMENT_BASE_DEAL,
  runDeploymentDealCount,
  type RunDocument,
  type RunWarSnapshot,
} from './model';

function battleLevel(id: string, cardsDealt?: number): Level {
  const level = createBlankLevel(id, id, 8, 8);
  level.layers.units.push({ x: 4, y: 0, type: 'king', side: 'enemy' });
  if (cardsDealt !== undefined) level.battle = { cardsDealt };
  return level;
}

/** A three-Battle War whose middle Battle authors its own deal, so a single Run reads both the
 * authored count and the progression it falls back to. */
function war(cardsDealt?: number): RunWarSnapshot {
  return {
    id: 'deal-war',
    name: 'Deal War',
    description: 'Authored-deal fixture.',
    battles: [
      { level: battleLevel('battle-one'), loot: false },
      { level: battleLevel('battle-two', cardsDealt), loot: false },
      { level: battleLevel('battle-three'), loot: false },
    ],
  };
}

function at(run: RunDocument, battleIndex: number, conflictIndex: number): RunDocument {
  return { ...run, battleIndex, conflictIndex };
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

describe('a Level authoring its own Deployment deal', () => {
  it('falls back to the Run progression when the Battle authors nothing', () => {
    const run = createRun(war(), 11);
    expect(runDeploymentDealCount(at(run, 1, 0))).toBe(RUN_DEPLOYMENT_BASE_DEAL);
    expect(runDeploymentDealCount(at(run, 1, 2))).toBe(RUN_DEPLOYMENT_BASE_DEAL + 2);
  });

  it('takes the authored count on that Battle, and only that Battle', () => {
    const run = createRun(war(6), 11);
    // Deep into a War the progression would deal far more; the authored Battle still deals 6.
    expect(runDeploymentDealCount(at(run, 1, 0))).toBe(6);
    expect(runDeploymentDealCount(at(run, 1, 5))).toBe(6);
    expect(runDeploymentDealCount(at(run, 0, 5))).toBe(RUN_DEPLOYMENT_BASE_DEAL + 5);
    expect(runDeploymentDealCount(at(run, 2, 5))).toBe(RUN_DEPLOYMENT_BASE_DEAL + 5);
  });

  it('holds a stored count to the schema bounds rather than dealing an impossible hand', () => {
    expect(runDeploymentDealCount(at(createRun(war(0), 11), 1, 0))).toBe(LEVEL_BATTLE_CARDS_DEALT_MIN);
    expect(runDeploymentDealCount(at(createRun(war(-4), 11), 1, 0))).toBe(LEVEL_BATTLE_CARDS_DEALT_MIN);
    expect(runDeploymentDealCount(at(createRun(war(99), 11), 1, 0))).toBe(LEVEL_BATTLE_CARDS_DEALT_MAX);
    expect(runDeploymentDealCount(at(createRun(war(3.7), 11), 1, 0))).toBe(3);
  });

  it('deals exactly the authored count, His Grace first', () => {
    const held = holding(createRun(war(1), 11), ['p', 'pp', 'q']);
    expect(held.cards.length).toBe(4);

    // The authored Battle sends the King in alone, however much the player is carrying.
    const narrow = prepareDeployment({ ...at(held, 1, 0), phase: 'deployment', deployment: null });
    expect(narrow.deployment?.dealtCardIds).toEqual(['run-card-his-grace']);

    // The Battle either side of it keeps the progression's wider hand.
    const wide = prepareDeployment({ ...at(held, 0, 0), phase: 'deployment', deployment: null });
    expect(wide.deployment?.dealtCardIds.length).toBe(RUN_DEPLOYMENT_BASE_DEAL);
    expect(wide.deployment?.dealtCardIds[0]).toBe('run-card-his-grace');
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
    // The Battle block itself stays optional, and Loot alone is still a valid one.
    expect(validateLevel(battleLevel('stored')).ok).toBe(true);
    expect(validateLevel({ ...battleLevel('stored'), battle: { loot: true } }).ok).toBe(true);
  });

  it('changes the editor’s dirty signature, so authoring one is a saveable edit', () => {
    const clean = battleLevel('stored');
    expect(levelEditorLevelSignature(withDeal(4))).not.toBe(levelEditorLevelSignature(clean));
    expect(levelEditorLevelSignature(withDeal(4))).not.toBe(levelEditorLevelSignature(withDeal(5)));
  });
});
