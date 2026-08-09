import { create } from 'zustand';
import type { Level, War } from '../core/level';
import { CAMPAIGN_FORMAT_VERSION, LEVEL_BATTLE_CARDS_DEALT_DEFAULT, createBlankLevel } from '../core/level';
import { useCampaigns } from '../campaign/store';

type WarWorkspaceSlice = {
  wars?: War[];
  levels: Record<string, Level>;
};

export interface WarState {
  wars: War[];
  selectedWarId: string | null;
  selectedBattleId: string | null;
  mergeOfficial: (workspace: WarWorkspaceSlice) => void;
  mergeUser: (workspace: WarWorkspaceSlice) => void;
  selectWar: (id: string) => void;
  selectBattle: (levelId: string) => void;
  newWar: (official?: boolean) => string;
  deleteWar: (id: string) => void;
  renameWar: (id: string, name: string) => void;
  setWarDescription: (id: string, description: string) => void;
  setWarEligible: (id: string, eligible: boolean) => void;
  toggleWarFavorite: (id: string) => void;
  addBattle: (warId: string) => string | null;
  deleteBattle: (warId: string, levelId: string) => void;
  moveBattle: (warId: string, levelId: string, direction: -1 | 1) => void;
  setBattleLoot: (levelId: string, loot: boolean) => void;
}

const OFFICIAL_PREFIX = 'off-';
const official = (id: string): boolean => id.startsWith(OFFICIAL_PREFIX);
const slugify = (value: string): string => value.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') || 'war';
const letters = (input: number): string => {
  let value = Math.max(1, Math.floor(input));
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(97 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
};

function uniqueOfficialId(prefix: 'w' | 'l', label: string, taken: Set<string>): string {
  const base = `${OFFICIAL_PREFIX}${prefix}-${slugify(label)}`;
  if (!taken.has(base)) return base;
  let index = 1;
  while (taken.has(`${base}-${letters(index)}`)) index += 1;
  return `${base}-${letters(index)}`;
}

function randomPrivateId(prefix: 'w' | 'l'): string {
  const random = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID().replace(/-/g, '')
    : `${Date.now().toString(36)}${Math.floor(Math.random() * 0x100000).toString(36)}`;
  return `${prefix}-${random}`;
}

function ordered(war: War): War['battles'] {
  return [...(war.battles ?? [])]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((battle, ordinal) => ({ ...battle, ordinal }));
}

function taggedWar(war: War, origin: 'official' | 'mine'): War {
  return {
    ...war,
    description: war.description ?? '',
    battles: ordered(war),
    origin,
    readOnly: origin === 'official',
  };
}

function starterBattle(id: string, ordinal: number): Level {
  const base = createBlankLevel(id, `Battle ${ordinal + 1}`, 8, 8);
  const deployTiles: Array<[number, number]> = [];
  const playerPromotion: Array<[number, number]> = [];
  const enemyPromotion: Array<[number, number]> = [];
  for (let x = 0; x < base.board.cols; x += 1) {
    deployTiles.push([x, 6], [x, 7]);
    playerPromotion.push([x, 0]);
    enemyPromotion.push([x, 7]);
  }
  return {
    ...base,
    objective: 'rival-kings',
    economy: { startingFunds: 0, incomePerTurn: 0 },
    battle: { loot: false, cardsDealt: LEVEL_BATTLE_CARDS_DEALT_DEFAULT },
    layers: {
      ...base.layers,
      units: [
        { x: 4, y: 0, type: 'king', side: 'enemy' },
        { x: 0, y: 0, type: 'rook', side: 'enemy' },
        { x: 2, y: 1, type: 'knight', side: 'enemy' },
      ],
      zones: [
        { id: 'run-player-deploy', name: 'Run army deployment', type: 'player-spawn', color: 'blue', tiles: deployTiles },
        { id: 'run-player-promotion', name: 'Player promotion', type: 'pawn-promotion', color: 'gold', tiles: playerPromotion },
        { id: 'run-enemy-promotion', name: 'Enemy promotion', type: 'pawn-promotion', color: 'red', tiles: enemyPromotion },
      ],
    },
    events: [
      {
        id: 'run-player-promotion-event',
        name: 'Player pawn promotion',
        trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side: 'player' }, zoneId: 'run-player-promotion' },
        do: [{ kind: 'promote', target: { kind: 'triggering-unit' } }],
      },
      {
        id: 'run-enemy-promotion-event',
        name: 'Enemy pawn promotion',
        trigger: { kind: 'unit-enters-zone', unit: { type: 'pawn', side: 'enemy' }, zoneId: 'run-enemy-promotion' },
        do: [{ kind: 'promote', target: { kind: 'triggering-unit' } }],
      },
    ],
  };
}

function allReferencedBattleIds(wars: readonly War[], exceptWarId?: string): Set<string> {
  return new Set(
    wars
      .filter((war) => war.id !== exceptWarId)
      .flatMap((war) => war.battles.map((battle) => battle.levelId)),
  );
}

export const useWars = create<WarState>((set, get) => ({
  wars: [],
  selectedWarId: null,
  selectedBattleId: null,

  mergeOfficial: (workspace) => set((state) => {
    const incoming = (workspace.wars ?? []).filter((war) => official(war.id)).map((war) => taggedWar(war, 'official'));
    const wars = [...incoming, ...state.wars.filter((war) => war.origin !== 'official')];
    return {
      wars,
      selectedWarId: wars.some((war) => war.id === state.selectedWarId) ? state.selectedWarId : null,
      selectedBattleId: workspace.levels[state.selectedBattleId ?? ''] ? state.selectedBattleId : null,
    };
  }),

  mergeUser: (workspace) => set((state) => {
    const incoming = (workspace.wars ?? []).filter((war) => !official(war.id)).map((war) => taggedWar(war, 'mine'));
    const wars = [...state.wars.filter((war) => war.origin === 'official'), ...incoming];
    return {
      wars,
      selectedWarId: wars.some((war) => war.id === state.selectedWarId) ? state.selectedWarId : null,
      selectedBattleId: workspace.levels[state.selectedBattleId ?? ''] ? state.selectedBattleId : null,
    };
  }),

  selectWar: (id) => set({ selectedWarId: id, selectedBattleId: null }),
  selectBattle: (levelId) => set({ selectedBattleId: levelId }),

  newWar: (isOfficial = false) => {
    const state = get();
    const name = `War ${state.wars.length + 1}`;
    const id = isOfficial
      ? uniqueOfficialId('w', name, new Set(state.wars.map((war) => war.id)))
      : randomPrivateId('w');
    const war: War = {
      formatVersion: CAMPAIGN_FORMAT_VERSION,
      id,
      name,
      description: '',
      eligibleForRun: false,
      battles: [],
      origin: isOfficial ? 'official' : 'mine',
      readOnly: false,
    };
    set({ wars: [...state.wars, war], selectedWarId: id, selectedBattleId: null });
    return id;
  },

  deleteWar: (id) => {
    const state = get();
    const removed = state.wars.find((war) => war.id === id);
    if (!removed) return;
    const wars = state.wars.filter((war) => war.id !== id);
    const retainedRefs = allReferencedBattleIds(wars);
    const campaignRefs = new Set(useCampaigns.getState().campaigns.flatMap((campaign) => campaign.levels.map((ref) => ref.levelId)));
    const levels = { ...useCampaigns.getState().levels };
    for (const battle of removed.battles) {
      if (!retainedRefs.has(battle.levelId) && !campaignRefs.has(battle.levelId)) delete levels[battle.levelId];
    }
    useCampaigns.setState({ levels });
    set({
      wars,
      selectedWarId: state.selectedWarId === id ? wars[0]?.id ?? null : state.selectedWarId,
      selectedBattleId: removed.battles.some((battle) => battle.levelId === state.selectedBattleId)
        ? null
        : state.selectedBattleId,
    });
  },

  renameWar: (id, name) => set((state) => ({
    wars: state.wars.map((war) => (war.id === id ? { ...war, name } : war)),
  })),
  setWarDescription: (id, description) => set((state) => ({
    wars: state.wars.map((war) => (war.id === id ? { ...war, description } : war)),
  })),
  setWarEligible: (id, eligibleForRun) => set((state) => ({
    wars: state.wars.map((war) => (war.id === id ? { ...war, eligibleForRun } : war)),
  })),
  toggleWarFavorite: (id) => set((state) => ({
    wars: state.wars.map((war) => (war.id === id ? { ...war, favorite: !war.favorite } : war)),
  })),

  addBattle: (warId) => {
    const state = get();
    const war = state.wars.find((candidate) => candidate.id === warId);
    if (!war) return null;
    const levelName = `${war.name} Battle ${war.battles.length + 1}`;
    const levelId = war.origin === 'official' || official(war.id)
      ? uniqueOfficialId('l', levelName, new Set(Object.keys(useCampaigns.getState().levels)))
      : randomPrivateId('l');
    const level = starterBattle(levelId, war.battles.length);
    useCampaigns.setState((campaignState) => ({
      levels: { ...campaignState.levels, [levelId]: level },
    }));
    set({
      wars: state.wars.map((candidate) => (
        candidate.id === war.id
          ? { ...candidate, battles: [...ordered(candidate), { levelId, ordinal: candidate.battles.length }] }
          : candidate
      )),
      selectedWarId: war.id,
      selectedBattleId: levelId,
    });
    return levelId;
  },

  deleteBattle: (warId, levelId) => {
    const state = get();
    const wars = state.wars.map((war) => (
      war.id === warId
        ? { ...war, battles: ordered({ ...war, battles: war.battles.filter((battle) => battle.levelId !== levelId) }) }
        : war
    ));
    const stillReferenced = allReferencedBattleIds(wars);
    const campaignReferenced = useCampaigns.getState().campaigns.some((campaign) => campaign.levels.some((ref) => ref.levelId === levelId));
    if (!stillReferenced.has(levelId) && !campaignReferenced) {
      const levels = { ...useCampaigns.getState().levels };
      delete levels[levelId];
      useCampaigns.setState({ levels });
    }
    set({ wars, selectedBattleId: state.selectedBattleId === levelId ? null : state.selectedBattleId });
  },

  moveBattle: (warId, levelId, direction) => set((state) => ({
    wars: state.wars.map((war) => {
      if (war.id !== warId) return war;
      const battles = ordered(war);
      const from = battles.findIndex((battle) => battle.levelId === levelId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= battles.length) return war;
      [battles[from], battles[to]] = [battles[to], battles[from]];
      return { ...war, battles: battles.map((battle, ordinal) => ({ ...battle, ordinal })) };
    }),
  })),

  setBattleLoot: (levelId, loot) => {
    const level = useCampaigns.getState().levels[levelId];
    if (!level) return;
    useCampaigns.getState().replaceLevel({ ...level, battle: { ...level.battle, loot } });
  },
}));

export function runEligibleOfficialWars(wars: readonly War[]): War[] {
  return wars.filter((war) => war.origin === 'official' && war.eligibleForRun === true && war.battles.length > 0);
}
