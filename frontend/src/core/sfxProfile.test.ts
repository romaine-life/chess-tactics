import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLiveSfxProfile,
  assertSfxProfile,
  currentLiveSfxProfile,
  resetLiveSfxProfile,
  type SfxProfile,
} from './sfxProfile';

const data = (): SfxProfile => ({
  schemaVersion: 2,
  soundSets: {
    stone: { label: 'Stone', character: 'Hard step', build: 'Recorded foley', gain: 0.5 },
    arrival: { label: 'Arrival', character: 'Deploy thump', build: 'Recorded foley', gain: 0.55 },
  },
  terrainAssignments: {
    grass: 'stone', water: null, sand: null, stone: 'stone',
    road: 'stone', bridge: 'stone', dirt: 'stone', pebble: 'stone',
  },
  interfaceAssignments: { activate: 'stone', card: null, gold: null },
  arrival: { sample: 'arrival', gain: 0.55, firing: 'per-unit' },
});

afterEach(resetLiveSfxProfile);

describe('live SFX profile', () => {
  it('installs one complete typed document without a compiled default', () => {
    expect(currentLiveSfxProfile()).toBeNull();
    expect(applyLiveSfxProfile({
      id: 'default', data: data(), clientSchemaVersion: 2, revision: 2,
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

  it('owns which sound every interface cue makes, including silence', () => {
    // The document decides what a card sounds like, so the owner can change it in the
    // running app instead of asking for a commit (ADR-0071 rule 2/3, ADR-0089).
    const missing = data() as unknown as Record<string, unknown>;
    delete missing.interfaceAssignments;
    expect(() => assertSfxProfile(missing)).toThrow(/must contain exactly/);

    const partial = data() as unknown as Record<string, unknown>;
    partial.interfaceAssignments = { activate: 'stone' };
    expect(() => assertSfxProfile(partial)).toThrow(/every interface cue/);

    const undeclared = data();
    undeclared.interfaceAssignments.card = 'missing';
    expect(() => assertSfxProfile(undeclared)).toThrow(/interface cue card/);

    // Silence is an assignment the owner can make, not an absent key.
    const silent = data();
    silent.interfaceAssignments.activate = null;
    expect(() => assertSfxProfile(silent)).not.toThrow();
  });
});
