import { describe, expect, it } from 'vitest';
import {
  clearCraftedBattleResult,
  craftedBattleResultFor,
  registerCraftedBattleResult,
} from './craftedRunLanding';

const battle = (id: string, battleIndex = 2) => ({ id, phase: 'battle' as const, battleIndex });

describe('crafted Run landing presentation', () => {
  it('carries a terminal result only to the exact Battle the server crafted', () => {
    const target = battle('run-target');
    registerCraftedBattleResult(target, 'player');

    expect(craftedBattleResultFor(target)).toBe('player');
    expect(craftedBattleResultFor(battle('run-other'))).toBeNull();
    expect(craftedBattleResultFor(battle('run-target', 3))).toBeNull();
  });

  it('is cleared by an ordinary craft and after the target applies it', () => {
    const target = battle('run-target');
    registerCraftedBattleResult(target, 'player');
    clearCraftedBattleResult(target);
    expect(craftedBattleResultFor(target)).toBeNull();

    registerCraftedBattleResult(target, 'player');
    registerCraftedBattleResult(battle('run-next'), null);
    expect(craftedBattleResultFor(target)).toBeNull();
  });
});
