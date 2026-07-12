import type { TerrainType } from './types';

export const SFX_PROFILE_ID = 'default';
export const SFX_PROFILE_SCHEMA_VERSION = 1;

export const ASSIGNABLE_SFX_TERRAINS = [
  'grass', 'water', 'sand', 'stone', 'road', 'bridge', 'dirt', 'pebble',
] as const satisfies readonly TerrainType[];

export type AssignableSfxTerrain = (typeof ASSIGNABLE_SFX_TERRAINS)[number];
export type SfxArrivalFiring = 'per-unit' | 'once';

export interface SfxSoundSetProfile {
  label: string;
  character: string;
  build: string;
  gain: number;
}

export interface SfxProfile {
  schemaVersion: typeof SFX_PROFILE_SCHEMA_VERSION;
  soundSets: Record<string, SfxSoundSetProfile>;
  terrainAssignments: Record<AssignableSfxTerrain, string | null>;
  arrival: {
    sample: string | null;
    gain: number;
    firing: SfxArrivalFiring;
  };
}

export interface SfxProfileDocument {
  id: typeof SFX_PROFILE_ID;
  data: SfxProfile;
  clientSchemaVersion: typeof SFX_PROFILE_SCHEMA_VERSION;
  revision: number;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

const SOUND_SET_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function requiredText(value: unknown, label: string, max: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`${label} must be non-empty text up to ${max} characters`);
  }
}

function gainValue(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 2) {
    throw new Error(`${label} must be a finite number from 0 to 2`);
  }
}

/** Validate the complete DB-owned SFX profile. Partial overlays are not accepted. */
export function assertSfxProfile(value: unknown): asserts value is SfxProfile {
  if (!isRecord(value) || !exactKeys(value, ['schemaVersion', 'soundSets', 'terrainAssignments', 'arrival'])) {
    throw new Error('SFX profile must contain exactly schemaVersion, soundSets, terrainAssignments, and arrival');
  }
  if (value.schemaVersion !== SFX_PROFILE_SCHEMA_VERSION) {
    throw new Error(`SFX profile schemaVersion must be ${SFX_PROFILE_SCHEMA_VERSION}`);
  }
  if (!isRecord(value.soundSets)) throw new Error('SFX profile soundSets must be an object');
  const soundKeys = Object.keys(value.soundSets).sort();
  if (soundKeys.length < 1 || soundKeys.length > 64) throw new Error('SFX profile requires 1-64 sound sets');
  for (const key of soundKeys) {
    if (!SOUND_SET_KEY.test(key)) throw new Error(`Invalid SFX sound-set key: ${key}`);
    const row = value.soundSets[key];
    if (!isRecord(row) || !exactKeys(row, ['label', 'character', 'build', 'gain'])) {
      throw new Error(`SFX sound set ${key} must contain exactly label, character, build, and gain`);
    }
    requiredText(row.label, `SFX sound set ${key} label`, 100);
    requiredText(row.character, `SFX sound set ${key} character`, 400);
    requiredText(row.build, `SFX sound set ${key} build`, 400);
    gainValue(row.gain, `SFX sound set ${key} gain`);
  }

  if (!isRecord(value.terrainAssignments)
    || !exactKeys(value.terrainAssignments, ASSIGNABLE_SFX_TERRAINS)) {
    throw new Error('SFX terrainAssignments must contain every assignable terrain exactly once');
  }
  for (const terrain of ASSIGNABLE_SFX_TERRAINS) {
    const sample = value.terrainAssignments[terrain];
    if (sample !== null && (typeof sample !== 'string' || !Object.hasOwn(value.soundSets, sample))) {
      throw new Error(`SFX terrain ${terrain} must reference a declared sound set or null`);
    }
  }

  if (!isRecord(value.arrival) || !exactKeys(value.arrival, ['sample', 'gain', 'firing'])) {
    throw new Error('SFX arrival must contain exactly sample, gain, and firing');
  }
  if (value.arrival.sample !== null
    && (typeof value.arrival.sample !== 'string' || !Object.hasOwn(value.soundSets, value.arrival.sample))) {
    throw new Error('SFX arrival sample must reference a declared sound set or null');
  }
  gainValue(value.arrival.gain, 'SFX arrival gain');
  if (value.arrival.firing !== 'per-unit' && value.arrival.firing !== 'once') {
    throw new Error('SFX arrival firing must be per-unit or once');
  }
}

export function cloneSfxProfile(profile: SfxProfile): SfxProfile {
  return JSON.parse(JSON.stringify(profile)) as SfxProfile;
}

let activeDocument: SfxProfileDocument | null = null;

export function applyLiveSfxProfile(document: SfxProfileDocument): boolean {
  if (document.id !== SFX_PROFILE_ID || document.clientSchemaVersion !== SFX_PROFILE_SCHEMA_VERSION
    || !Number.isSafeInteger(document.revision) || document.revision < 0) {
    throw new Error('Live SFX profile document metadata is invalid');
  }
  assertSfxProfile(document.data);
  const changed = !activeDocument
    || activeDocument.revision !== document.revision
    || JSON.stringify(activeDocument.data) !== JSON.stringify(document.data);
  activeDocument = { ...document, data: cloneSfxProfile(document.data) };
  return changed;
}

export function currentLiveSfxProfileDocument(): SfxProfileDocument | null {
  return activeDocument;
}

export function currentLiveSfxProfile(): SfxProfile | null {
  return activeDocument?.data ?? null;
}

export function resetLiveSfxProfile(): void {
  activeDocument = null;
}
