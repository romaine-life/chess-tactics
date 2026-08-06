import { type TownFitPolicy, type TownPlanKind } from '../core/townPlan';
import { type GeneratorSectionRelationship } from '../core/generatorComposition';

export type TownPresetId = 'village-hamlet' | 'mill-village' | 'castle-borough';

export interface TownPresetChoice {
  id: TownPresetId;
  label: string;
  description: string;
}

export interface TownPresetAsset {
  id: string;
  label: string;
  kind: string;
}

export interface TownPresetBuilding {
  sourceArtId: string;
  weight: number;
}

/** Every editable field in one concrete Town Section produced by a container preset. */
export interface TownApproachConfiguration {
  plan: TownPlanKind;
  size: number;
  buildings: TownPresetBuilding[];
  scaleMean: number;
  scaleMin: number;
  scaleMax: number;
  plotWidth: number;
  landmarkIds: string[];
  setback: number;
  looseness: number;
  facingWobble: number;
  spacing: number;
  fit: TownFitPolicy;
}

export interface TownPresetSectionConfiguration extends TownApproachConfiguration {
  relationship: GeneratorSectionRelationship;
}

/** A container-level preset expands into a complete editable Section collection. */
export interface TownPresetConfiguration {
  sections: TownPresetSectionConfiguration[];
}

export const TOWN_PRESETS: readonly TownPresetChoice[] = [
  {
    id: 'village-hamlet',
    label: 'Village Hamlet',
    description: 'A village-green core mixed with a looser ring of homes.',
  },
  {
    id: 'mill-village',
    label: 'Mill Village',
    description: 'A roadside settlement with mills mixed into its residential strip.',
  },
  {
    id: 'castle-borough',
    label: 'Castle Borough',
    description: 'A fortified core mixed with a larger borough of homes.',
  },
];

function assetSearchText(asset: TownPresetAsset): string {
  return `${asset.id} ${asset.label}`.toLowerCase();
}

function isHome(asset: TownPresetAsset): boolean {
  const text = assetSearchText(asset);
  return ['cottage', 'cabin', 'lodge', 'house', 'hut', 'home', 'barn', 'farm']
    .some((word) => text.includes(word));
}

function isMill(asset: TownPresetAsset): boolean {
  return assetSearchText(asset).includes('mill');
}

function isCastle(asset: TownPresetAsset): boolean {
  const text = assetSearchText(asset);
  return ['castle', 'tower', 'keep'].some((word) => text.includes(word));
}

const APPROACH_SETTINGS: Record<TownPresetId, Omit<TownApproachConfiguration, 'buildings'>> = {
  'village-hamlet': {
    plan: 'green',
    size: 12,
    scaleMean: 0.9,
    scaleMin: 0.7,
    scaleMax: 1.2,
    plotWidth: 96,
    landmarkIds: [],
    setback: 70,
    looseness: 0.3,
    facingWobble: 0.1,
    spacing: 10,
    fit: 'shrink',
  },
  'mill-village': {
    plan: 'linear',
    size: 14,
    scaleMean: 1.1,
    scaleMin: 0.85,
    scaleMax: 1.5,
    plotWidth: 132,
    landmarkIds: [],
    setback: 82,
    looseness: 0.4,
    facingWobble: 0.15,
    spacing: 14,
    fit: 'shrink',
  },
  'castle-borough': {
    plan: 'cluster',
    size: 14,
    scaleMean: 1.3,
    scaleMin: 0.95,
    scaleMax: 1.8,
    plotWidth: 176,
    landmarkIds: [],
    setback: 88,
    looseness: 0.25,
    facingWobble: 0.1,
    spacing: 18,
    fit: 'shrink',
  },
};

function buildingsMatching(
  assets: readonly TownPresetAsset[],
  predicate: (asset: TownPresetAsset) => boolean,
  weight: number,
): TownPresetBuilding[] {
  const seen = new Set<string>();
  return assets.flatMap((asset) => {
    if (seen.has(asset.id) || !predicate(asset)) return [];
    seen.add(asset.id);
    return [{ sourceArtId: asset.id, weight }];
  });
}

/** Expand a preset into the complete Section collection for one Town container. */
export function townPresetConfiguration(
  presetId: TownPresetId,
  assets: readonly TownPresetAsset[],
): TownPresetConfiguration | null {
  const homes = buildingsMatching(assets, isHome, 1);
  if (!homes.length) return null;

  if (presetId === 'village-hamlet') {
    const base = APPROACH_SETTINGS[presetId];
    return { sections: [
      { relationship: 'distinct', ...base, size: 8, buildings: homes },
      {
        relationship: 'mixed',
        ...base,
        plan: 'cluster',
        size: 5,
        buildings: homes,
        scaleMean: 0.8,
        scaleMin: 0.6,
        scaleMax: 1.05,
        plotWidth: 82,
        setback: 62,
        looseness: 0.6,
        facingWobble: 0.3,
        spacing: 8,
      },
    ] };
  }

  if (presetId === 'mill-village') {
    const mills = buildingsMatching(assets, isMill, 4);
    if (!mills.length) return null;
    const base = APPROACH_SETTINGS[presetId];
    return { sections: [
      { relationship: 'distinct', ...base, size: 10, buildings: homes },
      {
        relationship: 'mixed',
        ...base,
        size: 3,
        buildings: mills,
        scaleMean: 1.35,
        scaleMin: 1.05,
        scaleMax: 1.7,
        plotWidth: 168,
        landmarkIds: mills.map((building) => building.sourceArtId),
        spacing: 20,
      },
    ] };
  }

  const fortifications = buildingsMatching(assets, isCastle, 4);
  if (!fortifications.length) return null;
  const base = APPROACH_SETTINGS[presetId];
  return { sections: [
    {
      relationship: 'distinct',
      ...base,
      size: 2,
      buildings: fortifications,
      scaleMean: 1.7,
      scaleMin: 1.25,
      scaleMax: 2.1,
      plotWidth: 220,
      landmarkIds: fortifications.map((building) => building.sourceArtId),
      spacing: 24,
    },
    { relationship: 'mixed', ...base, size: 14, buildings: homes },
  ] };
}
