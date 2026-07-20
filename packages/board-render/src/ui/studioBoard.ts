import { tileFamilies } from '../art/tileset';
import {
  terrainFamilyRecords,
  type TileAssetKind,
  type TileFamilyId,
  type TileSocketAsset,
} from '../core/tileSockets';

export type StudioFamilyId = TileFamilyId;
export type StudioAssetKind = TileAssetKind;

export interface StudioAsset extends TileSocketAsset {
  id: string;
  label: string;
  src: string;
  animation?: {
    label: string;
    frames: string[];
    frameMs: number;
    status: 'prototype' | 'raw candidate' | 'approved';
  };
  role: string;
  kind: StudioAssetKind;
  source: string;
  probability: number;
  notes: string;
  speculative?: boolean;
  method?: string;
}

export interface StudioFamily {
  id: StudioFamilyId;
  label: string;
  purpose: string;
  status: string;
  review: string;
  assets: StudioAsset[];
}

export const assetFrameSrc = (asset: StudioAsset, animationFrame: number): string =>
  asset.animation ? asset.animation.frames[animationFrame % asset.animation.frames.length] ?? asset.src : asset.src;

const currentStudioFamilies = (): StudioFamily[] => terrainFamilyRecords().map((record) => {
  const id = record.id;
  const assets = tileFamilies[id];
  if (!assets?.length) throw new Error(`terrain family ${id} has no installed surfaces`);
  return {
    id,
    label: record.label,
    purpose: record.purpose,
    status: record.status,
    review: record.review,
    assets: assets.map((asset): StudioAsset => ({ ...asset })),
  };
});

export const studioFamilies: StudioFamily[] = new Proxy([] as StudioFamily[], {
  get: (_target, property) => {
    const current = currentStudioFamilies();
    const value = Reflect.get(current, property);
    return typeof value === 'function' ? value.bind(current) : value;
  },
  ownKeys: () => Reflect.ownKeys(currentStudioFamilies()),
  getOwnPropertyDescriptor: (_target, property) => Object.getOwnPropertyDescriptor(currentStudioFamilies(), property),
});
