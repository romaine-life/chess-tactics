import { describe, it, expect, beforeEach } from 'vitest';
import { useCampaigns } from './store';
import { validateLevel } from '../core/level';

function reset() {
  useCampaigns.setState({ campaigns: [], levels: {}, selectedCampaignId: null, selectedLevelId: null, counter: 1 });
}

describe('campaign store', () => {
  beforeEach(reset);

  it('creates and selects a campaign', () => {
    useCampaigns.getState().newCampaign();
    const s = useCampaigns.getState();
    expect(s.campaigns).toHaveLength(1);
    expect(s.selectedCampaignId).toBe(s.campaigns[0].id);
  });

  it('adds levels with valid starter docs and increasing ordinals', () => {
    useCampaigns.getState().newCampaign();
    useCampaigns.getState().addLevel();
    useCampaigns.getState().addLevel();
    const s = useCampaigns.getState();
    const camp = s.campaigns[0];
    expect(camp.levels.map((r) => r.ordinal)).toEqual([0, 1]);
    for (const ref of camp.levels) {
      const level = s.levels[ref.levelId];
      expect(validateLevel(level).ok).toBe(true);
      expect(level.layers.units.some((unit) => unit.side === 'player')).toBe(true);
      expect(level.layers.units.some((unit) => unit.side === 'enemy')).toBe(true);
    }
  });

  it('reorders levels with moveLevel', () => {
    useCampaigns.getState().newCampaign();
    useCampaigns.getState().addLevel();
    useCampaigns.getState().addLevel();
    const first = useCampaigns.getState().campaigns[0].levels.find((r) => r.ordinal === 0)!.levelId;
    useCampaigns.getState().moveLevel(first, 1);
    const refs = useCampaigns.getState().campaigns[0].levels;
    expect(refs.find((r) => r.levelId === first)!.ordinal).toBe(1);
  });

  it('deletes a level and drops its doc', () => {
    useCampaigns.getState().newCampaign();
    useCampaigns.getState().addLevel();
    const id = useCampaigns.getState().selectedLevelId!;
    useCampaigns.getState().deleteLevel(id);
    expect(useCampaigns.getState().campaigns[0].levels).toHaveLength(0);
    expect(useCampaigns.getState().levels[id]).toBeUndefined();
  });

  it('edits level objective + economy', () => {
    useCampaigns.getState().newCampaign();
    useCampaigns.getState().addLevel();
    const id = useCampaigns.getState().selectedLevelId!;
    useCampaigns.getState().setLevelObjective(id, 'survive');
    useCampaigns.getState().setLevelEconomy(id, 2000, 250);
    useCampaigns.getState().setLevelNotes(id, 'Hold until dawn.');
    const lvl = useCampaigns.getState().levels[id];
    expect(lvl.objective).toBe('survive');
    expect(lvl.economy).toEqual({ startingFunds: 2000, incomePerTurn: 250 });
    expect(lvl.notes).toBe('Hold until dawn.');
  });

  it('tracks favorites and level stars as real state', () => {
    useCampaigns.getState().newCampaign();
    const campaignId = useCampaigns.getState().selectedCampaignId!;
    useCampaigns.getState().toggleCampaignFavorite(campaignId);
    useCampaigns.getState().addLevel();
    const levelId = useCampaigns.getState().selectedLevelId!;
    useCampaigns.getState().setLevelStars(levelId, 2);
    const campaign = useCampaigns.getState().campaigns[0];
    expect(campaign.favorite).toBe(true);
    expect(campaign.levels[0]).toMatchObject({ stars: 2, completed: true });
  });

  it('duplicates campaigns with copied level documents and new ids', () => {
    useCampaigns.getState().newCampaign();
    useCampaigns.getState().addLevel();
    const originalCampaignId = useCampaigns.getState().selectedCampaignId!;
    const originalLevelId = useCampaigns.getState().selectedLevelId!;
    useCampaigns.getState().setLevelNotes(originalLevelId, 'Original note');
    useCampaigns.getState().setLevelStars(originalLevelId, 3);
    useCampaigns.getState().duplicateCampaign(originalCampaignId);
    const state = useCampaigns.getState();
    expect(state.campaigns).toHaveLength(2);
    const duplicate = state.campaigns[1];
    expect(duplicate.id).not.toBe(originalCampaignId);
    expect(duplicate.levels[0].levelId).not.toBe(originalLevelId);
    expect(duplicate.levels[0].stars).toBeUndefined();
    expect(duplicate.levels[0].completed).toBeUndefined();
    expect(state.levels[duplicate.levels[0].levelId].notes).toBe('Original note');
  });

  it('deletes unreferenced level docs when deleting a campaign', () => {
    useCampaigns.getState().newCampaign();
    useCampaigns.getState().addLevel();
    const campaignId = useCampaigns.getState().selectedCampaignId!;
    const levelId = useCampaigns.getState().selectedLevelId!;
    useCampaigns.getState().deleteCampaign(campaignId);
    expect(useCampaigns.getState().campaigns).toHaveLength(0);
    expect(useCampaigns.getState().levels[levelId]).toBeUndefined();
  });

  it('imports workspaces by remapping ids instead of overwriting existing levels', () => {
    useCampaigns.getState().newCampaign();
    useCampaigns.getState().addLevel();
    const existingLevelId = useCampaigns.getState().selectedLevelId!;
    const importedLevel = { ...useCampaigns.getState().levels[existingLevelId], name: 'Imported Level' };
    useCampaigns.getState().importWorkspace({
      campaigns: [{ formatVersion: 1, id: 'c1', name: 'Imported', difficulty: 'normal', chapters: 1, levels: [{ levelId: existingLevelId, ordinal: 0 }] }],
      levels: { [existingLevelId]: importedLevel },
    });
    const state = useCampaigns.getState();
    expect(state.campaigns).toHaveLength(2);
    expect(state.campaigns[1].levels[0].levelId).not.toBe(existingLevelId);
    expect(state.levels[existingLevelId].name).not.toBe('Imported Level');
  });
});
