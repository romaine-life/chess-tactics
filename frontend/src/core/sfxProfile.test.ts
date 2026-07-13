import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLiveSfxProfile,
  assertSfxProfile,
  currentLiveSfxProfile,
  resetLiveSfxProfile,
  type SfxProfile,
} from './sfxProfile';

const data = (): SfxProfile => ({
  schemaVersion: 1,
  soundSets: {
    stone: { label: 'Stone', character: 'Hard step', build: 'Recorded foley', gain: 0.5 },
    arrival: { label: 'Arrival', character: 'Deploy thump', build: 'Recorded foley', gain: 0.55 },
  },
  terrainAssignments: {
    grass: 'stone', water: null, sand: null, stone: 'stone',
    road: 'stone', bridge: 'stone', dirt: 'stone', pebble: 'stone',
  },
  arrival: { sample: 'arrival', gain: 0.55, firing: 'per-unit' },
});

afterEach(resetLiveSfxProfile);

describe('live SFX profile', () => {
  it('installs one complete typed document without a compiled default', () => {
    expect(currentLiveSfxProfile()).toBeNull();
    expect(applyLiveSfxProfile({
      id: 'default', data: data(), clientSchemaVersion: 1, revision: 2,
      createdAt: null, updatedAt: null, updatedBy: null,
    })).toBe(true);
    expect(currentLiveSfxProfile()?.terrainAssignments.road).toBe('stone');
  });

  it('rejects incomplete assignments and undeclared samples', () => {
    const incomplete = data() as unknown as Record<string, unknown>;
    incomplete.terrainAssignments = { grass: 'stone' };
    expect(() => assertSfxProfile(incomplete)).toThrow(/every assignable terrain/);

    const unknown = data();
    unknown.arrival.sample = 'missing';
    expect(() => assertSfxProfile(unknown)).toThrow(/declared sound set/);
  });
});
