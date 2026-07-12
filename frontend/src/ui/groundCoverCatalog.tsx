import type { CSSProperties, ReactElement } from 'react';
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

// Modules load before main.tsx applies the backend catalog. Keep only semantic
// UI identity eager; resolve each live set through a getter after startup.
export const GROUND_COVER_ASSETS: readonly GroundCoverCatalogAsset[] = GROUND_COVER_IDS.map((id) => ({
  id,
  terrainLabel: terrainLabels[id],
  get set(): CoverSet {
    const set = groundCoverSet(id);
    if (!set) throw new Error(`Missing live ground-cover set: ${id}`);
    return set;
  },
  ...GROUND_COVER_META[id],
}));

export const groundCoverAsset = (id: string | undefined): GroundCoverCatalogAsset =>
  GROUND_COVER_ASSETS.find((asset) => asset.id === id) ?? GROUND_COVER_ASSETS[0];

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
      <img className="ground-cover-preview-tile" src={`/assets/tiles/surface/${asset.id}-0-top.png`} alt="" draggable={false} />
      {variants.map((meta, index) => {
        const [x, y] = positions[index] ?? [50, 54];
        return <span key={meta.id} className="ground-cover-preview-tuft gc-tuft" style={tuftStyle(asset, meta, x, y)} />;
      })}
    </span>
  );
}
