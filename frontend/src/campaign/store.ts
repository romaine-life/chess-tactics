// Campaign-editor store (Zustand). Manages Campaign documents and their member
// Level documents in memory (Phase 4 persists these to the backend). Same JSON
// schema the game reads — campaigns reference levels by id.

import { create } from 'zustand';
import type { Campaign, Level, ObjectiveType } from '../core/level';
import { CAMPAIGN_FORMAT_VERSION, createBlankLevel } from '../core/level';

type LevelRefs = Campaign['levels'];

function reindexed(refs: LevelRefs): LevelRefs {
  return refs.slice().sort((a, b) => a.ordinal - b.ordinal).map((r, i) => ({ ...r, ordinal: i }));
}

export interface CampaignState {
  campaigns: Campaign[];
  levels: Record<string, Level>;
  selectedCampaignId: string | null;
  selectedLevelId: string | null;
  counter: number;
  newCampaign: () => void;
  deleteCampaign: (id: string) => void;
  renameCampaign: (id: string, name: string) => void;
  selectCampaign: (id: string) => void;
  addLevel: () => void;
  deleteLevel: (levelId: string) => void;
  moveLevel: (levelId: string, dir: -1 | 1) => void;
  selectLevel: (levelId: string) => void;
  setLevelObjective: (levelId: string, objective: ObjectiveType) => void;
  setLevelDifficulty: (levelId: string, difficulty: string) => void;
  setLevelEconomy: (levelId: string, startingFunds: number, incomePerTurn: number) => void;
}

const selected = (s: CampaignState): Campaign | undefined => s.campaigns.find((c) => c.id === s.selectedCampaignId);

export const useCampaigns = create<CampaignState>((set) => ({
  campaigns: [],
  levels: {},
  selectedCampaignId: null,
  selectedLevelId: null,
  counter: 1,

  newCampaign: () => set((s) => {
    const n = s.counter;
    const campaign: Campaign = { formatVersion: CAMPAIGN_FORMAT_VERSION, id: `c${n}`, name: `Campaign ${n}`, difficulty: 'normal', chapters: 1, levels: [] };
    return { campaigns: [...s.campaigns, campaign], selectedCampaignId: campaign.id, selectedLevelId: null, counter: n + 1 };
  }),

  deleteCampaign: (id) => set((s) => {
    const campaigns = s.campaigns.filter((c) => c.id !== id);
    return { campaigns, selectedCampaignId: campaigns[0]?.id ?? null, selectedLevelId: null };
  }),

  renameCampaign: (id, name) => set((s) => ({ campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, name } : c)) })),

  selectCampaign: (id) => set({ selectedCampaignId: id, selectedLevelId: null }),

  addLevel: () => set((s) => {
    const camp = selected(s);
    if (!camp) return {};
    const n = s.counter;
    const levelId = `l${n}`;
    const level = createBlankLevel(levelId, `Level ${camp.levels.length + 1}`);
    const ref = { levelId, ordinal: camp.levels.length, objective: 'capture-all' as ObjectiveType };
    return {
      campaigns: s.campaigns.map((c) => (c.id === camp.id ? { ...c, levels: [...c.levels, ref] } : c)),
      levels: { ...s.levels, [levelId]: level },
      selectedLevelId: levelId,
      counter: n + 1,
    };
  }),

  deleteLevel: (levelId) => set((s) => {
    const camp = selected(s);
    if (!camp) return {};
    const levels = { ...s.levels };
    delete levels[levelId];
    return {
      campaigns: s.campaigns.map((c) => (c.id === camp.id ? { ...c, levels: reindexed(c.levels.filter((r) => r.levelId !== levelId)) } : c)),
      levels,
      selectedLevelId: s.selectedLevelId === levelId ? null : s.selectedLevelId,
    };
  }),

  moveLevel: (levelId, dir) => set((s) => {
    const camp = selected(s);
    if (!camp) return {};
    const ordered = reindexed(camp.levels).map((r) => ({ ...r }));
    const i = ordered.findIndex((r) => r.levelId === levelId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ordered.length) return {};
    const tmp = ordered[i].ordinal;
    ordered[i].ordinal = ordered[j].ordinal;
    ordered[j].ordinal = tmp;
    return { campaigns: s.campaigns.map((c) => (c.id === camp.id ? { ...c, levels: reindexed(ordered) } : c)) };
  }),

  selectLevel: (levelId) => set({ selectedLevelId: levelId }),

  setLevelObjective: (levelId, objective) => set((s) => {
    const camp = selected(s);
    const lvl = s.levels[levelId];
    return {
      campaigns: camp ? s.campaigns.map((c) => (c.id === camp.id ? { ...c, levels: c.levels.map((r) => (r.levelId === levelId ? { ...r, objective } : r)) } : c)) : s.campaigns,
      levels: lvl ? { ...s.levels, [levelId]: { ...lvl, objective } } : s.levels,
    };
  }),

  setLevelDifficulty: (levelId, difficulty) => set((s) => {
    const lvl = s.levels[levelId];
    return lvl ? { levels: { ...s.levels, [levelId]: { ...lvl, difficulty } } } : {};
  }),

  setLevelEconomy: (levelId, startingFunds, incomePerTurn) => set((s) => {
    const lvl = s.levels[levelId];
    return lvl ? { levels: { ...s.levels, [levelId]: { ...lvl, economy: { startingFunds, incomePerTurn } } } } : {};
  }),
}));
