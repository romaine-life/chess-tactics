import { drawableAssets } from '../art/drawableCatalog';
import type { TerrainType } from './types';

export type TileFamilyId = string;
export type TerrainPairId = string;
export type EdgeName = 'north' | 'east' | 'south' | 'west';
export type TileAssetKind = 'tile' | 'reference';

export interface TransitionPair {
  id: TerrainPairId;
  label: string;
  terrains: [TileFamilyId, TileFamilyId];
}

export type EdgeSockets = Record<EdgeName, TileFamilyId>;

export interface TileSocketAsset {
  id: string;
  kind: TileAssetKind;
  role: string;
  probability: number;
  edgeSockets?: EdgeSockets;
  terrains?: TileFamilyId[];
  pairId?: TerrainPairId;
  socketMask?: number;
  /** Number of frames in the database-assigned animated top descriptor. Absent = static top. */
  topAnimFrames?: number;
}

export interface TransitionSlot<TAsset extends TileSocketAsset = TileSocketAsset> {
  mask: number;
  code: string;
  label: string;
  sockets: EdgeSockets;
  assets: TAsset[];
}

export const socketEdges: EdgeName[] = ['north', 'east', 'south', 'west'];

export interface TerrainFamilyRecord {
  id: TileFamilyId;
  label: string;
  purpose: string;
  status: string;
  review: string;
  roles: string[];
  defaultGroundCoverId?: string;
  scatterDefaultShare?: number;
  gameplayTerrain: TerrainType;
  rendersGameplayTerrains: TerrainType[];
}

const GAMEPLAY_TERRAINS = new Set<TerrainType>(['grass', 'water', 'stone', 'road', 'bridge', 'cliff', 'rock', 'dirt', 'pebble', 'sand', 'void']);
const isGameplayTerrain = (value: unknown): value is TerrainType => typeof value === 'string' && GAMEPLAY_TERRAINS.has(value as TerrainType);

export function terrainFamilyRecords(): TerrainFamilyRecord[] {
  return drawableAssets('terrain-family').map((asset) => {
    const id = typeof asset.behavior.value === 'string' ? asset.behavior.value : asset.id;
    const gameplayTerrain = asset.behavior.gameplayTerrain;
    const rendersGameplayTerrains = asset.behavior.rendersGameplayTerrains;
    if (!isGameplayTerrain(gameplayTerrain) || gameplayTerrain === 'void'
      || !Array.isArray(rendersGameplayTerrains) || !rendersGameplayTerrains.length || !rendersGameplayTerrains.every(isGameplayTerrain)) {
      throw new Error(`terrain family ${asset.id} has invalid database-owned gameplay terrain behavior`);
    }
    return {
      id,
      label: asset.label,
      purpose: typeof asset.metadata.purpose === 'string' ? asset.metadata.purpose : '',
      status: typeof asset.metadata.status === 'string' ? asset.metadata.status : '',
      review: typeof asset.metadata.review === 'string' ? asset.metadata.review : '',
      roles: Array.isArray(asset.behavior.roles) ? asset.behavior.roles.filter((role): role is string => typeof role === 'string') : [],
      defaultGroundCoverId: typeof asset.behavior.defaultGroundCoverId === 'string' ? asset.behavior.defaultGroundCoverId : undefined,
      scatterDefaultShare: typeof asset.behavior.scatterDefaultShare === 'number' ? asset.behavior.scatterDefaultShare : undefined,
      gameplayTerrain,
      rendersGameplayTerrains,
    };
  });
}

export function gameplayTerrainForFamily(familyId: TileFamilyId): TerrainType {
  const family = terrainFamilyRecords().find((record) => record.id === familyId);
  if (!family) throw new Error(`drawable catalog has no terrain family ${familyId}`);
  return family.gameplayTerrain;
}

export function familyForGameplayTerrain(terrain: TerrainType): TileFamilyId | undefined {
  if (terrain === 'void') return undefined;
  const matches = terrainFamilyRecords().filter((family) => family.rendersGameplayTerrains.includes(terrain));
  if (matches.length !== 1) throw new Error(`drawable catalog requires exactly one render family for gameplay terrain ${terrain}; found ${matches.length}`);
  return matches[0].id;
}

export function terrainFamiliesForRole(role: string): TerrainFamilyRecord[] {
  return terrainFamilyRecords().filter((family) => family.roles.includes(role));
}

export function requiredTerrainFamilyForRole(role: string): TerrainFamilyRecord {
  const matches = terrainFamiliesForRole(role);
  if (matches.length !== 1) throw new Error(`drawable catalog requires exactly one terrain family for role ${role}; found ${matches.length}`);
  return matches[0];
}

export function defaultTerrainFamily(): TerrainFamilyRecord {
  const records = drawableAssets('terrain-family').filter((asset) => asset.behavior.default === true);
  if (records.length !== 1) throw new Error(`drawable catalog requires exactly one default terrain family; found ${records.length}`);
  const family = terrainFamilyRecords().find((candidate) => candidate.id === (records[0].behavior.value ?? records[0].id));
  if (!family) throw new Error('drawable catalog default terrain family is unavailable');
  return family;
}

export const terrainLabels: Record<TileFamilyId, string> = new Proxy({}, {
  get: (_target, family) => {
    const record = terrainFamilyRecords().find((candidate) => candidate.id === family);
    if (!record) throw new Error(`drawable catalog has no terrain family ${String(family)}`);
    return record.label;
  },
});

// The transition socket model is retained for the tile studio, but the shipped tileset
// has no transition tiles — so on the board every boundary is a HARD EDGE (the solver
// falls back to each cell's own family base; see solveSocketBoard).
const currentTransitionPairs = (): TransitionPair[] => drawableAssets('terrain-transition').map((asset) => {
  const terrains = asset.behavior.terrains;
  if (!Array.isArray(terrains) || terrains.length !== 2 || terrains.some((family) => typeof family !== 'string')) {
    throw new Error(`terrain transition ${asset.id} must identify exactly two families`);
  }
  return { id: typeof asset.behavior.value === 'string' ? asset.behavior.value : asset.id, label: asset.label, terrains: [terrains[0], terrains[1]] };
});
export const transitionPairs: TransitionPair[] = new Proxy([], { get: (_target, property) => { const values = currentTransitionPairs(); const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; } });

export function transitionPairById(pairId: TerrainPairId): TransitionPair {
  const pair = transitionPairs.find((candidate) => candidate.id === pairId);
  if (!pair) throw new Error(`drawable catalog has no transition pair ${pairId}`);
  return pair;
}

export function transitionPairsForFamily(familyId: TileFamilyId): TransitionPair[] {
  return transitionPairs.filter((pair) => pair.terrains.includes(familyId));
}

export function transitionMaskCode(mask: number): string {
  return mask.toString(2).padStart(4, '0');
}

export function transitionSlotLabel(mask: number, pair: TransitionPair): string {
  return socketEdges
    .filter((_, index) => (mask & (1 << index)) !== 0)
    .map((edge) => edge[0].toUpperCase())
    .join(' + ');
}

export function baseSocketsForFamily(familyId: TileFamilyId): EdgeSockets {
  return {
    north: familyId,
    east: familyId,
    south: familyId,
    west: familyId,
  };
}

export function transitionSocketsForMask(mask: number, pair: TransitionPair): EdgeSockets {
  return socketEdges.reduce(
    (sockets, edge, index) => ({
      ...sockets,
      [edge]: (mask & (1 << index)) !== 0 ? pair.terrains[0] : pair.terrains[1],
    }),
    {} as EdgeSockets,
  );
}

export function familyIdForAsset<TAsset extends TileSocketAsset>(
  asset: TAsset,
  familyAssets: Record<TileFamilyId, readonly TAsset[]>,
): TileFamilyId {
  const owningFamily = Object.entries(familyAssets).find(([, assets]) => assets.some((item) => item.id === asset.id))?.[0] as TileFamilyId | undefined;
  const declaredFamily = asset.terrains?.[0];
  if (!owningFamily && !declaredFamily) throw new Error(`tile asset ${asset.id} has no family`);
  return owningFamily ?? declaredFamily!;
}

export function tileSocketsForAsset<TAsset extends TileSocketAsset>(
  asset: TAsset,
  familyAssets: Record<TileFamilyId, readonly TAsset[]>,
): EdgeSockets {
  if (asset.edgeSockets) return asset.edgeSockets;
  if (asset.pairId && typeof asset.socketMask === 'number') {
    return transitionSocketsForMask(asset.socketMask, transitionPairById(asset.pairId));
  }
  return baseSocketsForFamily(familyIdForAsset(asset, familyAssets));
}

export function transitionSlotsForPair<TAsset extends TileSocketAsset>(pair: TransitionPair, assets: readonly TAsset[]): TransitionSlot<TAsset>[] {
  return Array.from({ length: 14 }, (_, index) => {
    const mask = index + 1;
    return {
      mask,
      code: transitionMaskCode(mask),
      label: transitionSlotLabel(mask, pair),
      sockets: transitionSocketsForMask(mask, pair),
      assets: assets.filter((asset) => asset.pairId === pair.id && asset.socketMask === mask),
    };
  });
}
