import { tileFamilies, type TileAsset } from '../art/tileset';
import {
  terrainLabels,
  type TileAssetKind,
  type TileFamilyId,
} from '../core/tileSockets';

export type StudioFamilyId = TileFamilyId;
export type StudioAssetKind = TileAssetKind;

export type StudioAsset = TileAsset;

export interface StudioFamily {
  id: StudioFamilyId;
  label: string;
  purpose: string;
  status: string;
  review: string;
  assets: StudioAsset[];
}

const STUDIO_FAMILY_META: Record<TileFamilyId, { purpose: string; status: string; review: string }> = {
  grass: { purpose: 'High-volume base terrain for most playable cells.', status: 'Production', review: 'Variation + same-footprint repetition.' },
  dirt: { purpose: 'Bare-earth ground.', status: 'Production', review: 'Variation across the patch.' },
  stone: { purpose: 'Stone / cobble footing.', status: 'Production', review: 'Variation + readability.' },
  pebble: { purpose: 'Loose pebble ground.', status: 'Production', review: 'Variation.' },
  sand: { purpose: 'Sandy ground.', status: 'Production', review: 'Variation.' },
  water: { purpose: 'Open water (impassable to land units).', status: 'Production', review: 'Variation + surface read.' },
};

export const studioFamilies: StudioFamily[] = (Object.keys(tileFamilies) as TileFamilyId[]).map((id) => ({
  id,
  label: terrainLabels[id],
  ...STUDIO_FAMILY_META[id],
  assets: tileFamilies[id].map((asset): StudioAsset => ({ ...asset })),
}));
