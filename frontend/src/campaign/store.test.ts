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

  it('adds levels with valid blank docs and increasing ordinals', () => {
    useCampaigns.getState().newCampaign();
    useCampaigns.getState().addLevel();
    useCampaigns.getState().addLevel();
    const s = useCampaigns.getState();
    const camp = s.campaigns[0];
    expect(camp.levels.map((r) => r.ordinal)).toEqual([0, 1]);
    for (const ref of camp.levels) expect(validateLevel(s.levels[ref.levelId]).ok).toBe(true);
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
    const lvl = useCampaigns.getState().levels[id];
    expect(lvl.objective).toBe('survive');
    expect(lvl.economy).toEqual({ startingFunds: 2000, incomePerTurn: 250 });
  });
});
