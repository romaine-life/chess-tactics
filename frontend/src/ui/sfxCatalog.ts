// Read-only projection of the DB-owned SFX profile for Studio catalog cards.
// Recorded bytes come from live semantic media slots; labels, descriptions,
// per-set gains, terrain assignments, and arrival behavior come from the live
// profile. This module owns no production defaults.

import {
  ASSIGNABLE_SFX_TERRAINS,
  currentLiveSfxProfile,
  type AssignableSfxTerrain,
  type SfxProfile,
} from '../core/sfxProfile';
import type { SampleKey } from '../sfx';

export interface SfxAsset {
  name: string;
  sampleKey: SampleKey;
  label: string;
  character: string;
  build: string;
  gain: number;
  terrains: AssignableSfxTerrain[];
  arrival: boolean;
}

export const ASSIGNABLE_TERRAINS = [...ASSIGNABLE_SFX_TERRAINS];

export function sfxAssets(profile: SfxProfile | null = currentLiveSfxProfile()): SfxAsset[] {
  if (!profile) return [];
  return Object.entries(profile.soundSets)
    .map(([key, sound]) => ({
      name: key,
      sampleKey: key,
      label: sound.label,
      character: sound.character,
      build: sound.build,
      gain: sound.gain,
      terrains: ASSIGNABLE_SFX_TERRAINS.filter((terrain) => profile.terrainAssignments[terrain] === key),
      arrival: profile.arrival.sample === key,
    }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.name.localeCompare(right.name));
}
