import type { CSSProperties, ReactElement } from 'react';
import { groundCoverSet, type CoverSet, type CoverVariantMeta } from '../core/groundCover';
import { defaultTerrainFamily, terrainLabels, type TileFamilyId } from '../core/tileSockets';
import { drawableAssets } from '@chess-tactics/board-render';
import { tileFamilies } from '../art/tileset';

export type GroundCoverId = TileFamilyId;

export interface GroundCoverCatalogAsset {
  id: GroundCoverId;
  label: string;
  terrainLabel: string;
  badge: string;
  notes: string;
  set: CoverSet;
}

const currentGroundCoverAssets = (): GroundCoverCatalogAsset[] => drawableAssets('ground-cover').map((record) => {
  const id = record.behavior.terrain;
  if (typeof id !== 'string' || !id) throw new Error(`Ground-cover ${record.id} has no terrain identity`);
  const set = groundCoverSet(id);
  if (!set) throw new Error(`Missing live ground-cover set: ${id}`);
  return { id, label: record.label, terrainLabel: terrainLabels[id],
    badge: typeof record.metadata.badge === 'string' ? record.metadata.badge : '',
    notes: typeof record.metadata.notes === 'string' ? record.metadata.notes : '', set };
});

export const GROUND_COVER_ASSETS: readonly GroundCoverCatalogAsset[] = new Proxy([] as GroundCoverCatalogAsset[], {
  get: (_target, property) => {
    const current = currentGroundCoverAssets();
    const value = Reflect.get(current, property);
    return typeof value === 'function' ? value.bind(current) : value;
  },
});

export const groundCoverAsset = (id: string | undefined): GroundCoverCatalogAsset => {
  const asset = GROUND_COVER_ASSETS.find((candidate) => candidate.id === id);
  if (!asset) throw new Error(`Ground-cover ${id ?? '(missing)'} is unavailable`);
  return asset;
};
export const defaultGroundCoverAsset = (): GroundCoverCatalogAsset => {
  const id = defaultTerrainFamily().defaultGroundCoverId;
  if (!id) throw new Error('Default terrain family has no DB-owned ground-cover default');
  return groundCoverAsset(id);
};

function tuftStyle(asset: GroundCoverCatalogAsset, meta: CoverVariantMeta, x: number, y: number): CSSProperties {
  const sheetW = meta.frameWidth * asset.set.frameCount;
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: meta.frameWidth,
    height: meta.frameHeight,
    marginLeft: -meta.baseX,
    marginTop: -meta.baseY,
    backgroundImage: `url(${meta.src})`,
    backgroundSize: `${sheetW}px ${meta.frameHeight}px`,
    ['--gc-travel' as string]: `${-sheetW}px`,
  } as CSSProperties;
}

export function GroundCoverPreview({ asset, zoom = 1 }: { asset: GroundCoverCatalogAsset; zoom?: number }): ReactElement {
  const variants = asset.set.variants.slice(0, 5);
  const positions = [
    [28, 56],
    [45, 44],
    [62, 58],
    [38, 68],
    [70, 47],
  ];
  return (
    <span className="ground-cover-preview" style={{ '--tile-zoom': zoom } as CSSProperties} aria-hidden="true">
      <img className="ground-cover-preview-tile" src={tileFamilies[asset.id]?.[0]?.src ?? (() => { throw new Error(`Terrain ${asset.id} has no preview surface`); })()} alt="" draggable={false} />
      {variants.map((meta, index) => {
        const [x, y] = positions[index] ?? [50, 54];
        return <span key={meta.id} className="ground-cover-preview-tuft gc-tuft" style={tuftStyle(asset, meta, x, y)} />;
      })}
    </span>
  );
}
