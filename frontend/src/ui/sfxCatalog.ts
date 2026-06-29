// The terrain landing sound effects, as catalog items. Read-only: you audition them
// (the Viewer plays them live), you don't edit them — the sounds are synthesized
// procedurally in code (see frontend/src/sfx.ts, RECIPES), so there is no asset file.
// Adding an effect = one entry here + its RECIPES recipe, like the other *Catalog
// data modules. cliff/rock are impassable (pieces never land), so they have no sound
// and aren't listed.

import type { TerrainType } from '../core/types';

export interface SfxAsset {
  /** Stable id == the terrain it sounds for; backs the catalog selection state. */
  name: string;
  terrain: TerrainType;
  label: string;
  /** One-line description of what the sound evokes (the Details "Character"). */
  character: string;
  /** How it's synthesized — the Details "Build" line. */
  build: string;
  /** Approximate one-shot length in ms (the recipe's reported duration). */
  durationMs: number;
}

export const SFX_ASSETS: SfxAsset[] = [
  { name: 'grass', terrain: 'grass', label: 'Grass', character: 'Soft dry rustle/swish of blades.', build: 'Pink-noise burst · swept bandpass · high-passed', durationMs: 180 },
  { name: 'dirt', terrain: 'dirt', label: 'Dirt', character: 'Muffled low pat of packed earth.', build: 'Low-passed brown noise + faint low sine body', durationMs: 180 },
  { name: 'stone', terrain: 'stone', label: 'Stone', character: "Crisp hard flagstone 'tok'.", build: 'Bright noise clack + resonant ping + low knock', durationMs: 165 },
  { name: 'pebble', terrain: 'pebble', label: 'Pebble', character: 'Granular gravel crunch.', build: 'Scattered noise grains over a low settle', durationMs: 185 },
  { name: 'sand', terrain: 'sand', label: 'Sand', character: "Airy 'shff' shuffle, no low end.", build: 'High-passed white noise, band-shaped', durationMs: 170 },
  { name: 'water', terrain: 'water', label: 'Water', character: "Small splash / 'ploop'.", build: 'Downward-swept noise + descending droplet sine', durationMs: 220 },
  { name: 'road', terrain: 'road', label: 'Road', character: 'Packed cobble footstep scuff.', build: 'Swept mid-bandpass grit + low body knock', durationMs: 160 },
  { name: 'bridge', terrain: 'bridge', label: 'Bridge', character: 'Hollow wooden plank knock.', build: 'Woody triangle + harmonic + contact tick', durationMs: 220 },
];
