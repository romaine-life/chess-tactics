import {
  STRUCTURE_ART_ASSETS,
  structureArtAsset,
  type StructureArtDefinition,
} from '../core/structureArt';
import type { StructurePart, StructureSourceRef } from '../core/props';

export interface PropSeatSourceOption {
  key: string;
  source: StructureSourceRef;
  label: string;
}

export const propSeatSourceKey = (source: StructureSourceRef): string =>
  `${source.kind}:${source.id}`;

export function propSeatSourceIsGameplayEligible(source: StructureSourceRef): boolean {
  if (source.kind !== 'asset') return true;
  const art = structureArtAsset(source.id);
  return Boolean(art && !art.sourceOnly);
}

export function propSeatStructureArtOptions(
  assets: readonly StructureArtDefinition[] = STRUCTURE_ART_ASSETS,
): PropSeatSourceOption[] {
  return assets
    .filter((asset) => !asset.sourceOnly)
    .map((asset) => {
      const source: StructureSourceRef = { kind: 'asset', id: asset.id };
      return {
        key: propSeatSourceKey(source),
        source,
        label: `Structure art: ${asset.label}`,
      };
    });
}

export function propSeatDraftSourceIssue(parts: readonly StructurePart[]): string | null {
  for (const part of parts) {
    if (part.source.kind !== 'asset') continue;
    const art = structureArtAsset(part.source.id);
    if (!art) return `Structure artwork "${part.source.id}" is unavailable.`;
    if (art.sourceOnly) {
      return `"${art.label}" is source-only artwork and cannot become a gameplay prop or doodad.`;
    }
  }
  return null;
}
