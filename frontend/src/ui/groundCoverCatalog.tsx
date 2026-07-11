import type { CSSProperties, ReactElement } from 'react';
import { tileFamilies } from '../art/tileset';
import { groundCoverSet, type CoverSet, type CoverVariantMeta } from '../core/groundCover';
import { terrainLabels, type TileFamilyId } from '../core/tileSockets';

export type GroundCoverId = Extract<TileFamilyId, 'grass' | 'water' | 'sand'>;

export interface GroundCoverCatalogAsset {
  id: GroundCoverId;
  label: string;
  terrainLabel: string;
  badge: string;
  notes: string;
  set: CoverSet;
  topSrc: string;
}

const GROUND_COVER_META: Record<GroundCoverId, { label: string; badge: string; notes: string }> = {
  grass: {
    label: 'Grass tufts',
    badge: 'field cover',
    notes: 'Ambient animated grass blades scattered across ground-cover cells.',
  },
  water: {
    label: 'Reeds',
    badge: 'shoreline cover',
    notes: 'Animated reed clusters. The default water set only grows on shoreline water when generated.',
  },
  sand: {
    label: 'Sand',
    badge: 'dry cover',
    notes: 'Animated dry dune-grass cover for sandy or hand-overridden cover cells.',
  },
};

export const GROUND_COVER_IDS: readonly GroundCoverId[] = ['grass', 'water', 'sand'];

export const GROUND_COVER_ASSETS: readonly GroundCoverCatalogAsset[] = GROUND_COVER_IDS.map((id) => {
  const set = groundCoverSet(id);
  if (!set) throw new Error(`Missing ground-cover set: ${id}`);
  const topSrc = tileFamilies[id][0]?.topSrc;
  if (!topSrc) throw new Error(`Missing registered ground-cover top layer: ${id}`);
  return {
    id,
    terrainLabel: terrainLabels[id],
    set,
    topSrc,
    ...GROUND_COVER_META[id],
  };
});

export const groundCoverAsset = (id: string | undefined): GroundCoverCatalogAsset =>
  GROUND_COVER_ASSETS.find((asset) => asset.id === id) ?? GROUND_COVER_ASSETS[0];

function tuftStyle(asset: GroundCoverCatalogAsset, meta: CoverVariantMeta, x: number, y: number): CSSProperties {
  const sheetW = meta.frameW * asset.set.frameCount;
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: meta.frameW,
    height: meta.frameH,
    marginLeft: -meta.baseX,
    marginTop: -meta.baseY,
    backgroundImage: `url(${asset.set.basePath}/v${meta.id}.png)`,
    backgroundSize: `${sheetW}px ${meta.frameH}px`,
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
      <img className="ground-cover-preview-tile" src={asset.topSrc} alt="" draggable={false} />
      {variants.map((meta, index) => {
        const [x, y] = positions[index] ?? [50, 54];
        return <span key={meta.id} className="ground-cover-preview-tuft gc-tuft" style={tuftStyle(asset, meta, x, y)} />;
      })}
    </span>
  );
}
