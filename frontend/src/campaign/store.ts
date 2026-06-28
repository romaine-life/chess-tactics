// Campaign-editor store (Zustand). Manages Campaign documents and their member
// Level documents in memory (Phase 4 persists these to the backend). Same JSON
// schema the game reads — campaigns reference levels by id.

import { create } from 'zustand';
import type { Campaign, CampaignLevelRef, Level, ObjectiveType } from '../core/level';
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
  // When true, authoring acts on the OFFICIAL tier: newCampaign/addLevel mint `off-`
  // ids and the editor's Save targets the official endpoint. Admin-only.
  officialMode: boolean;
  hydrate: (ws: { campaigns: Campaign[]; levels: Record<string, Level> }) => void;
  // Tier-scoped replace: swap just the official slice (id-preserving, tagged
  // readOnly), keeping the user slice — and vice versa. Used by the always-load-then-
  // merge hydration so officials show for everyone and the user's own merge on top.
  mergeOfficial: (ws: { campaigns: Campaign[]; levels: Record<string, Level> }) => void;
  mergeUser: (ws: { campaigns: Campaign[]; levels: Record<string, Level> }) => void;
  // Replace the whole store with the official set as EDITABLE (admin authoring); enters officialMode.
  hydrateOfficialForEditing: (ws: { campaigns: Campaign[]; levels: Record<string, Level> }) => void;
  setOfficialMode: (on: boolean) => void;
  importWorkspace: (ws: { campaigns: Campaign[]; levels: Record<string, Level> }) => void;
  newCampaign: () => void;
  duplicateCampaign: (id: string) => void;
  deleteCampaign: (id: string) => void;
  renameCampaign: (id: string, name: string) => void;
  toggleCampaignFavorite: (id: string) => void;
  selectCampaign: (id: string) => void;
  addLevel: () => void;
  deleteLevel: (levelId: string) => void;
  moveLevel: (levelId: string, dir: -1 | 1) => void;
  selectLevel: (levelId: string) => void;
  replaceLevel: (level: Level) => void;
  renameLevel: (levelId: string, name: string) => void;
  setLevelNotes: (levelId: string, notes: string) => void;
  setLevelObjective: (levelId: string, objective: ObjectiveType) => void;
  setLevelDifficulty: (levelId: string, difficulty: string) => void;
  setLevelEconomy: (levelId: string, startingFunds: number, incomePerTurn: number) => void;
  setLevelStars: (levelId: string, stars: number) => void;
}

const selected = (s: CampaignState): Campaign | undefined => s.campaigns.find((c) => c.id === s.selectedCampaignId);

const withLevelDefaults = (level: Level): Level => ({ ...level, notes: level.notes ?? '' });

const withCampaignDefaults = (campaign: Campaign): Campaign => ({
  favorite: false,
  locked: false,
  ...campaign,
  levels: reindexed(campaign.levels ?? []),
});

const createStarterCampaignLevel = (id: string, name: string): Level => {
  const level = createBlankLevel(id, name);
  const lastCol = Math.max(0, level.board.cols - 1);
  const lastRow = Math.max(0, level.board.rows - 1);
  return {
    ...level,
    layers: {
      ...level.layers,
      units: [
        { x: 1, y: lastRow - 1, type: 'king', side: 'player' },
        { x: 2, y: lastRow - 2, type: 'rook', side: 'player' },
        { x: lastCol - 1, y: 1, type: 'king', side: 'enemy' },
        { x: lastCol - 2, y: 2, type: 'knight', side: 'enemy' },
      ],
    },
  };
};

// Official (global) tier ids are namespaced `off-` and DIGIT-FREE on purpose: the
// per-user counter below derives from the numeric part of c/l ids, so a digit in an
// official id would inflate/collide the user space. We belt-and-suspenders it by
// also excluding `off-` ids from the counter scan.
const OFFICIAL_PREFIX = 'off-';
const isOfficialId = (id: string): boolean => String(id).startsWith(OFFICIAL_PREFIX);

const slugify = (name: string): string => String(name || '').toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') || 'item';
// Counter → digit-free letters (1→a, 2→b, … 27→aa) so minted official ids stay unique without digits.
const letters = (n: number): string => {
  let x = Math.max(1, Math.floor(n));
  let s = '';
  while (x > 0) { x -= 1; s = String.fromCharCode(97 + (x % 26)) + s; x = Math.floor(x / 26); }
  return s;
};
const officialId = (kind: 'c' | 'l', name: string, counter: number): string => `${OFFICIAL_PREFIX}${kind}-${slugify(name)}-${letters(counter)}`;

const taggedOfficial = (campaign: Campaign): Campaign => ({ ...withCampaignDefaults(campaign), origin: 'official', readOnly: true, locked: true });
const taggedMine = (campaign: Campaign): Campaign => ({ ...withCampaignDefaults(campaign), origin: 'mine', readOnly: false });

const nextCounterFrom = (campaigns: Campaign[], levels: Record<string, Level>): number => {
  let max = 0;
  const ids = [...campaigns.map((c) => c.id), ...Object.keys(levels)].filter((id) => !isOfficialId(id));
  for (const id of ids) {
    const n = parseInt(String(id).replace(/[^0-9]/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
};

const importableWorkspace = (ws: { campaigns: Campaign[]; levels: Record<string, Level> }) => {
  const levels = Object.fromEntries(Object.entries(ws.levels ?? {}).map(([id, level]) => [id, withLevelDefaults(level)]));
  const campaigns = (ws.campaigns ?? []).map(withCampaignDefaults);
  return { campaigns, levels, counter: nextCounterFrom(campaigns, levels) };
};

export const useCampaigns = create<CampaignState>((set) => ({
  campaigns: [],
  levels: {},
  selectedCampaignId: null,
  selectedLevelId: null,
  counter: 1,
  officialMode: false,

  hydrate: (ws) => set(() => {
    const imported = importableWorkspace(ws);
    return {
      campaigns: imported.campaigns,
      levels: imported.levels,
      counter: imported.counter,
      selectedCampaignId: imported.campaigns[0] ? imported.campaigns[0].id : null,
      selectedLevelId: null,
    };
  }),

  mergeOfficial: (ws) => set((s) => {
    const officialCampaigns = (ws.campaigns ?? []).map(taggedOfficial);
    const userCampaigns = s.campaigns.filter((c) => c.origin !== 'official');
    const officialLevels = Object.fromEntries(Object.entries(ws.levels ?? {}).map(([id, level]) => [id, withLevelDefaults(level)]));
    const userLevels = Object.fromEntries(Object.entries(s.levels).filter(([id]) => !isOfficialId(id)));
    const campaigns = [...officialCampaigns, ...userCampaigns];
    const levels = { ...officialLevels, ...userLevels };
    return { campaigns, levels, officialMode: false, counter: Math.max(s.counter, nextCounterFrom(campaigns, levels)) };
  }),

  mergeUser: (ws) => set((s) => {
    const userCampaigns = (ws.campaigns ?? []).map(taggedMine);
    const officialCampaigns = s.campaigns.filter((c) => c.origin === 'official');
    const userLevels = Object.fromEntries(Object.entries(ws.levels ?? {}).map(([id, level]) => [id, withLevelDefaults(level)]));
    const officialLevels = Object.fromEntries(Object.entries(s.levels).filter(([id]) => isOfficialId(id)));
    const campaigns = [...officialCampaigns, ...userCampaigns];
    const levels = { ...officialLevels, ...userLevels };
    return { campaigns, levels, officialMode: false, counter: Math.max(s.counter, nextCounterFrom(campaigns, levels)) };
  }),

  hydrateOfficialForEditing: (ws) => set(() => {
    const imported = importableWorkspace(ws);
    const campaigns = imported.campaigns.map((c) => ({ ...c, origin: 'official' as const, readOnly: false, locked: false }));
    return {
      campaigns,
      levels: imported.levels,
      counter: imported.counter,
      officialMode: true,
      selectedCampaignId: campaigns[0] ? campaigns[0].id : null,
      selectedLevelId: null,
    };
  }),

  setOfficialMode: (on) => set({ officialMode: on }),

  importWorkspace: (ws) => set((s) => {
    const imported = importableWorkspace(ws);
    let counter = Math.max(s.counter, imported.counter);
    const levels: Record<string, Level> = {};
    const campaigns = imported.campaigns.map((campaign) => {
      const levelIdMap = new Map<string, string>();
      const refs = reindexed(campaign.levels).map((ref) => {
        const nextLevelId = `l${counter}`;
        counter += 1;
        levelIdMap.set(ref.levelId, nextLevelId);
        const level = imported.levels[ref.levelId] ?? createBlankLevel(ref.levelId, ref.levelId);
        levels[nextLevelId] = { ...withLevelDefaults(level), id: nextLevelId };
        return { ...ref, levelId: nextLevelId };
      });
      const nextCampaignId = `c${counter}`;
      counter += 1;
      return { ...campaign, id: nextCampaignId, levels: refs };
    });
    return {
      campaigns: [...s.campaigns, ...campaigns],
      levels: { ...s.levels, ...levels },
      counter,
      selectedCampaignId: campaigns[0]?.id ?? s.selectedCampaignId,
      selectedLevelId: null,
    };
  }),

  newCampaign: () => set((s) => {
    const n = s.counter;
    const name = `Campaign ${n}`;
    const id = s.officialMode ? officialId('c', name, n) : `c${n}`;
    const campaign: Campaign = { formatVersion: CAMPAIGN_FORMAT_VERSION, id, name, difficulty: 'normal', chapters: 1, favorite: false, locked: false, levels: [], origin: s.officialMode ? 'official' : 'mine', readOnly: false };
    return { campaigns: [...s.campaigns, campaign], selectedCampaignId: campaign.id, selectedLevelId: null, counter: n + 1 };
  }),

  duplicateCampaign: (id) => set((s) => {
    const source = s.campaigns.find((c) => c.id === id);
    if (!source) return {};
    let counter = s.counter;
    const copiedLevels: Record<string, Level> = {};
    const copiedRefs: CampaignLevelRef[] = reindexed(source.levels).map((ref) => {
      const newLevelId = `l${counter}`;
      counter += 1;
      const sourceLevel = s.levels[ref.levelId] ?? createBlankLevel(ref.levelId, ref.levelId);
      copiedLevels[newLevelId] = { ...withLevelDefaults(sourceLevel), id: newLevelId, name: `${sourceLevel.name} Copy` };
      const { stars: _stars, completed: _completed, ...authoringRef } = ref;
      return { ...authoringRef, levelId: newLevelId };
    });
    const campaignId = `c${counter}`;
    counter += 1;
    const campaign: Campaign = {
      ...withCampaignDefaults(source),
      id: campaignId,
      name: `${source.name} Copy`,
      levels: copiedRefs,
      locked: false,
      origin: 'mine',
      readOnly: false,
    };
    return {
      campaigns: [...s.campaigns, campaign],
      levels: { ...s.levels, ...copiedLevels },
      counter,
      selectedCampaignId: campaignId,
      selectedLevelId: copiedRefs[0]?.levelId ?? null,
    };
  }),

  deleteCampaign: (id) => set((s) => {
    const removed = s.campaigns.find((c) => c.id === id);
    const campaigns = s.campaigns.filter((c) => c.id !== id);
    if (!removed) return { campaigns, selectedCampaignId: campaigns[0]?.id ?? null, selectedLevelId: null };
    const stillReferenced = new Set(campaigns.flatMap((campaign) => campaign.levels.map((ref) => ref.levelId)));
    const levels = { ...s.levels };
    for (const ref of removed.levels) {
      if (!stillReferenced.has(ref.levelId)) delete levels[ref.levelId];
    }
    return { campaigns, levels, selectedCampaignId: campaigns[0]?.id ?? null, selectedLevelId: null };
  }),

  renameCampaign: (id, name) => set((s) => ({ campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, name } : c)) })),

  toggleCampaignFavorite: (id) => set((s) => ({ campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, favorite: !c.favorite } : c)) })),

  selectCampaign: (id) => set({ selectedCampaignId: id, selectedLevelId: null }),

  addLevel: () => set((s) => {
    const camp = selected(s);
    if (!camp) return {};
    const n = s.counter;
    const levelName = `Level ${camp.levels.length + 1}`;
    const levelId = s.officialMode ? officialId('l', levelName, n) : `l${n}`;
    const level = createStarterCampaignLevel(levelId, levelName);
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

  replaceLevel: (level) => set((s) => ({ levels: { ...s.levels, [level.id]: withLevelDefaults(level) } })),

  renameLevel: (levelId, name) => set((s) => {
    const lvl = s.levels[levelId];
    return lvl ? { levels: { ...s.levels, [levelId]: { ...withLevelDefaults(lvl), name } } } : {};
  }),

  setLevelNotes: (levelId, notes) => set((s) => {
    const lvl = s.levels[levelId];
    return lvl ? { levels: { ...s.levels, [levelId]: { ...withLevelDefaults(lvl), notes } } } : {};
  }),

  setLevelObjective: (levelId, objective) => set((s) => {
    const camp = selected(s);
    const lvl = s.levels[levelId];
    return {
      campaigns: camp ? s.campaigns.map((c) => (c.id === camp.id ? { ...c, levels: c.levels.map((r) => (r.levelId === levelId ? { ...r, objective } : r)) } : c)) : s.campaigns,
      levels: lvl ? { ...s.levels, [levelId]: { ...withLevelDefaults(lvl), objective } } : s.levels,
    };
  }),

  setLevelDifficulty: (levelId, difficulty) => set((s) => {
    const lvl = s.levels[levelId];
    return lvl ? { levels: { ...s.levels, [levelId]: { ...withLevelDefaults(lvl), difficulty } } } : {};
  }),

  setLevelEconomy: (levelId, startingFunds, incomePerTurn) => set((s) => {
    const lvl = s.levels[levelId];
    return lvl ? { levels: { ...s.levels, [levelId]: { ...withLevelDefaults(lvl), economy: { startingFunds, incomePerTurn } } } } : {};
  }),

  setLevelStars: (levelId, stars) => set((s) => {
    const camp = selected(s);
    if (!camp) return {};
    const clamped = Math.max(0, Math.min(3, Math.round(stars)));
    return { campaigns: s.campaigns.map((c) => (c.id === camp.id ? { ...c, levels: c.levels.map((r) => (r.levelId === levelId ? { ...r, stars: clamped, completed: clamped > 0 } : r)) } : c)) };
  }),
}));
