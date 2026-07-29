import { beforeEach, describe, expect, it } from 'vitest';
import { useCampaigns } from '../campaign/store';
import { validateLevel } from '../core/level';
import { useWars } from './store';

beforeEach(() => {
  useCampaigns.setState({
    campaigns: [],
    levels: {},
    selectedCampaignId: null,
    selectedLevelId: null,
    counter: 1,
    userWorkspaceRevision: 0,
    officialWorkspaceRevision: 0,
  });
  useWars.setState({ wars: [], selectedWarId: null, selectedBattleId: null });
});

describe('War authoring store', () => {
  it('creates an ordered War whose Battles are canonical valid Levels', () => {
    const warId = useWars.getState().newWar();
    const first = useWars.getState().addBattle(warId)!;
    const second = useWars.getState().addBattle(warId)!;
    const war = useWars.getState().wars[0];
    expect(war.battles.map((battle) => battle.ordinal)).toEqual([0, 1]);
    expect(war.battles.map((battle) => battle.levelId)).toEqual([first, second]);
    for (const battle of war.battles) {
      const level = useCampaigns.getState().levels[battle.levelId];
      expect(validateLevel(level).ok).toBe(true);
      expect(level.layers.units.some((unit) => unit.side === 'player')).toBe(false);
      expect(level.layers.units.some((unit) => unit.side === 'enemy')).toBe(true);
      expect(level.layers.zones.some((zone) => zone.type === 'player-spawn')).toBe(true);
    }
  });

  it('reorders Battles and stores Loot on the Level Battle metadata', () => {
    const warId = useWars.getState().newWar();
    const first = useWars.getState().addBattle(warId)!;
    const second = useWars.getState().addBattle(warId)!;
    useWars.getState().moveBattle(warId, first, 1);
    expect(useWars.getState().wars[0].battles.map((battle) => battle.levelId)).toEqual([second, first]);
    useWars.getState().setBattleLoot(second, true);
    expect(useCampaigns.getState().levels[second].battle?.loot).toBe(true);
  });

  it('deletes exclusive Battle documents with their War', () => {
    const warId = useWars.getState().newWar();
    const levelId = useWars.getState().addBattle(warId)!;
    useWars.getState().deleteWar(warId);
    expect(useWars.getState().wars).toHaveLength(0);
    expect(useCampaigns.getState().levels[levelId]).toBeUndefined();
  });

  it('mints digit-free official ids and only eligible official Wars enter the pool', async () => {
    const { runEligibleOfficialWars } = await import('./store');
    const warId = useWars.getState().newWar(true);
    useWars.getState().addBattle(warId);
    useWars.getState().setWarEligible(warId, true);
    expect(warId).toMatch(/^off-[a-z-]+$/);
    expect(runEligibleOfficialWars(useWars.getState().wars).map((war) => war.id)).toEqual([warId]);
  });
});
