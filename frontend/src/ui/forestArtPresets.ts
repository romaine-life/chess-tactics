import { type GeneratorSectionRelationship } from '../core/generatorComposition';
import type { Direction } from './unitCatalog';

export type ForestArtPresetId = 'all-trees' | 'lush-woodland' | 'rocky-grove';

export interface ForestArtPreset {
  id: ForestArtPresetId;
  label: string;
  description: string;
}

export interface ForestArtPresetAsset {
  id: string;
  label: string;
  kind: string;
  propKind?: string;
}

export interface ForestArtPresetEntry {
  sourceArtId: string;
  weight: number;
}

/** Every editable field in one concrete Forest Section produced by a container preset. */
export interface ForestApproachConfiguration {
  trees: ForestArtPresetEntry[];
  density: number;
  jitter: number;
  scaleMin: number;
  scaleMax: number;
  randomFacing: boolean;
  facing: Direction;
  spacing: number;
  clumping: number;
  falloff: number;
}

export interface ForestPresetSectionConfiguration extends ForestApproachConfiguration {
  relationship: GeneratorSectionRelationship;
}

/** A container-level preset expands into a complete editable Section collection. */
export interface ForestPresetConfiguration {
  sections: ForestPresetSectionConfiguration[];
}

/**
 * Presets seed the ordinary explicit Forest recipe. They are not durable modes: after choosing
 * one, the author still sees and can edit every concrete entry and its relative weight.
 */
export const FOREST_ART_PRESETS: readonly ForestArtPreset[] = [
  {
    id: 'all-trees',
    label: 'All Trees',
    description: 'One Section containing every available tree with equal weight.',
  },
  {
    id: 'lush-woodland',
    label: 'Lush Woodland',
    description: 'Dense canopy with mixed understory and a distinct lighter grove.',
  },
  {
    id: 'rocky-grove',
    label: 'Rocky Grove',
    description: 'A tree grove mixed with stone plus a distinct rocky clearing.',
  },
];

function assetSearchText(asset: ForestArtPresetAsset): string {
  return `${asset.id} ${asset.label}`.toLowerCase();
}

function isTree(asset: ForestArtPresetAsset): boolean {
  return asset.kind === 'tree'
    || /(^|[^a-z])trees?([^a-z]|$)/.test(assetSearchText(asset));
}

function isUnderstory(asset: ForestArtPresetAsset): boolean {
  const text = assetSearchText(asset);
  return ['fern', 'flower', 'mushroom', 'shrub', 'bush', 'stump', 'log']
    .some((word) => text.includes(word));
}

function isStone(asset: ForestArtPresetAsset): boolean {
  const text = assetSearchText(asset);
  return asset.kind === 'rock' || asset.propKind === 'rock'
    || ['rock', 'boulder', 'stone'].some((word) => text.includes(word));
}

function presetWeight(presetId: ForestArtPresetId, asset: ForestArtPresetAsset): number | null {
  const tree = isTree(asset);
  if (presetId === 'all-trees') return tree ? 1 : null;
  if (presetId === 'lush-woodland') {
    if (tree) return 4;
    return isUnderstory(asset) ? 1 : null;
  }
  if (tree) return 5;
  return isStone(asset) ? 1 : null;
}

/** Expand one starter into the concrete, catalog-ordered weighted entries saved on the Forest. */
export function forestArtPresetEntries(
  presetId: ForestArtPresetId,
  assets: readonly ForestArtPresetAsset[],
): ForestArtPresetEntry[] {
  const seen = new Set<string>();
  const entries: ForestArtPresetEntry[] = [];
  for (const asset of assets) {
    if (seen.has(asset.id)) continue;
    const weight = presetWeight(presetId, asset);
    if (weight === null) continue;
    seen.add(asset.id);
    entries.push({ sourceArtId: asset.id, weight });
  }
  return entries;
}

const FOREST_APPROACH_SETTINGS: Record<ForestArtPresetId, Omit<ForestApproachConfiguration, 'trees'>> = {
  'all-trees': {
    density: 1.6,
    jitter: 0.85,
    scaleMin: 0.8,
    scaleMax: 1.3,
    randomFacing: true,
    facing: 'south',
    spacing: 26,
    clumping: 0.45,
    falloff: 0.35,
  },
  'lush-woodland': {
    density: 2.2,
    jitter: 0.9,
    scaleMin: 0.65,
    scaleMax: 1.35,
    randomFacing: true,
    facing: 'south',
    spacing: 20,
    clumping: 0.65,
    falloff: 0.25,
  },
  'rocky-grove': {
    density: 1,
    jitter: 0.75,
    scaleMin: 0.75,
    scaleMax: 1.4,
    randomFacing: true,
    facing: 'south',
    spacing: 34,
    clumping: 0.35,
    falloff: 0.5,
  },
};

function entriesMatching(
  assets: readonly ForestArtPresetAsset[],
  predicate: (asset: ForestArtPresetAsset) => boolean,
  weight: number,
): ForestArtPresetEntry[] {
  const seen = new Set<string>();
  return assets.flatMap((asset) => {
    if (seen.has(asset.id) || !predicate(asset)) return [];
    seen.add(asset.id);
    return [{ sourceArtId: asset.id, weight }];
  });
}

/** Expand one preset into the complete Section collection for one Forest container. */
export function forestPresetConfiguration(
  presetId: ForestArtPresetId,
  assets: readonly ForestArtPresetAsset[],
): ForestPresetConfiguration | null {
  const trees = forestArtPresetEntries('all-trees', assets);
  if (!trees.length) return null;

  if (presetId === 'all-trees') {
    return { sections: [{
      relationship: 'distinct',
      ...FOREST_APPROACH_SETTINGS[presetId],
      trees,
    }] };
  }

  if (presetId === 'lush-woodland') {
    const understory = entriesMatching(assets, isUnderstory, 1);
    if (!understory.length) return null;
    const base = FOREST_APPROACH_SETTINGS[presetId];
    return { sections: [
      { relationship: 'distinct', ...base, trees },
      {
        relationship: 'mixed',
        ...base,
        trees: understory,
        density: 1.1,
        jitter: 0.95,
        scaleMin: 0.5,
        scaleMax: 0.9,
        spacing: 16,
        clumping: 0.7,
        falloff: 0.2,
      },
      {
        relationship: 'distinct',
        ...base,
        trees,
        density: 1.1,
        jitter: 0.8,
        scaleMin: 0.7,
        scaleMax: 1.2,
        spacing: 32,
        clumping: 0.35,
        falloff: 0.5,
      },
    ] };
  }

  const stones = entriesMatching(assets, isStone, 1);
  if (!stones.length) return null;
  const base = FOREST_APPROACH_SETTINGS[presetId];
  const rockyMix = forestArtPresetEntries('rocky-grove', assets);
  return { sections: [
    { relationship: 'distinct', ...base, trees, density: 1.2 },
    {
      relationship: 'mixed',
      ...base,
      trees: stones,
      density: 0.55,
      scaleMin: 0.7,
      scaleMax: 1.15,
      spacing: 38,
      clumping: 0.5,
      falloff: 0.4,
    },
    {
      relationship: 'distinct',
      ...base,
      trees: rockyMix,
      density: 0.75,
      scaleMin: 0.65,
      scaleMax: 1.25,
      spacing: 40,
      clumping: 0.25,
      falloff: 0.6,
    },
  ] };
}
