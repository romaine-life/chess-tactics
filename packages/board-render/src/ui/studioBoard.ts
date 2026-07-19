import { tileFamilies } from '../art/tileset';
import { drawableAssets } from '../art/drawableCatalog';
import {
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

const currentStudioFamilies = (): StudioFamily[] => (Object.keys(tileFamilies) as TileFamilyId[]).map((id) => {
  const record = drawableAssets('terrain-surface').find((asset) => asset.behavior.family === id);
  return {
    id,
    label: typeof record?.metadata.familyLabel === 'string' ? record.metadata.familyLabel : id,
    purpose: typeof record?.metadata.purpose === 'string' ? record.metadata.purpose : '',
    status: typeof record?.metadata.status === 'string' ? record.metadata.status : '',
    review: typeof record?.metadata.review === 'string' ? record.metadata.review : '',
    assets: tileFamilies[id].map((asset): StudioAsset => ({ ...asset })),
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
