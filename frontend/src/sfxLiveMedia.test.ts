import { afterEach, describe, expect, it } from 'vitest';
import { applyLiveMediaCatalog, resetLiveMediaCatalog, type LiveMediaSlot } from '@chess-tactics/board-render';
import { applyLiveSfxProfile, resetLiveSfxProfile } from './core/sfxProfile';
import { authoredSampleKeyFor, authoredSampleKeys, authoredSampleUrls } from './sfx';
import { testGroundCoverCatalog } from './test/liveMediaCatalog';

const mediaSlot = (slot: string, sha: string, mediaType = 'audio/mpeg'): LiveMediaSlot => ({
  slot,
  domain: 'audio',
  role: 'sfx',
  availabilityPolicy: 'decorative',
  activeVersionId: crypto.randomUUID(),
  rowRevision: 1,
  metadata: {},
  versionStatus: 'legacy-bridge',
  productionEligible: false,
  versionMetadata: {},
  provenance: {},
  nativeEvidence: {},
  media: {
    url: `/assets/${slot}`,
    immutableUrl: `/api/media/${sha}`,
    sha256: sha,
    mediaType,
    width: null,
    height: null,
    byteLength: 12,
  },
});

const profile = () => ({
  id: 'default' as const,
  clientSchemaVersion: 1 as const,
  revision: 3,
  createdAt: null,
  updatedAt: null,
  updatedBy: null,
  data: {
    schemaVersion: 1 as const,
    soundSets: {
      grass: { label: 'Grass', character: 'Dry grass', build: 'Recorded foley', gain: 0.5 },
      water: { label: 'Water', character: 'Wet step', build: 'Recorded foley', gain: 0.6 },
      arrival: { label: 'Arrival', character: 'Deploy thump', build: 'Recorded foley', gain: 0.55 },
    },
    terrainAssignments: {
      grass: 'grass', water: 'water', sand: null, stone: null,
      road: null, bridge: null, dirt: null, pebble: null,
    },
    arrival: { sample: 'arrival', gain: 0.55, firing: 'per-unit' as const },
  },
});

afterEach(() => {
  resetLiveMediaCatalog();
  resetLiveSfxProfile();
});

describe('authored SFX live media', () => {
  it('derives numerically ordered takes from backend slots without a Git manifest', () => {
    applyLiveSfxProfile(profile());
    applyLiveMediaCatalog(testGroundCoverCatalog([
        mediaSlot('sfx/grass/v10.mp3', 'a'.repeat(64)),
        mediaSlot('sfx/grass/source.mp3', 'b'.repeat(64)),
        mediaSlot('sfx/grass/v2.wav', 'c'.repeat(64), 'audio/wav'),
        mediaSlot('sfx/water/v0.mp3', 'd'.repeat(64)),
    ]));

    expect(authoredSampleUrls('grass')).toEqual([
      `/api/media/${'c'.repeat(64)}`,
      `/api/media/${'a'.repeat(64)}`,
    ]);
    expect(authoredSampleKeys()).toEqual(['arrival', 'grass', 'water']);
    expect(authoredSampleKeyFor('grass')).toBe('grass');
    expect(authoredSampleKeyFor('stone')).toBeNull();
  });

  it('has no production assignment defaults before the live profile hydrates', () => {
    expect(authoredSampleKeys()).toEqual([]);
    expect(authoredSampleKeyFor('grass')).toBeNull();
  });
});
