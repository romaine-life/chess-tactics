import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentLiveSfxProfileDocument, resetLiveSfxProfile, type SfxProfile } from '../core/sfxProfile';
import { loadLiveSfxProfile, saveLiveSfxProfile } from './sfxProfile';

const data = (): SfxProfile => ({
  schemaVersion: 1,
  soundSets: {
    click: { label: 'Click', character: 'Interface tap', build: 'Recorded foley', gain: 0.5 },
  },
  terrainAssignments: {
    grass: null, water: null, sand: null, stone: null,
    road: null, bridge: null, dirt: null, pebble: null,
  },
  arrival: { sample: null, gain: 0, firing: 'once' },
});

const responseBody = (revision: number) => ({
  profile: {
    id: 'default', data: data(), clientSchemaVersion: 1, revision,
    createdAt: null, updatedAt: null, updatedBy: null,
  },
});

afterEach(() => {
  resetLiveSfxProfile();
  vi.unstubAllGlobals();
});

describe('SFX profile network client', () => {
  it('treats a missing row as decorative silence', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'sfx_profile_not_found' }), { status: 404 })));
    expect(await loadLiveSfxProfile()).toBe(false);
    expect(currentLiveSfxProfileDocument()).toBeNull();
  });

  it('saves with the expected revision and installs the returned live document', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('PUT');
      expect(JSON.parse(String(init?.body))).toMatchObject({ expectedRevision: 4, clientSchemaVersion: 1 });
      return new Response(JSON.stringify(responseBody(5)), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const saved = await saveLiveSfxProfile(data(), 4);
    expect(saved.revision).toBe(5);
    expect(currentLiveSfxProfileDocument()?.revision).toBe(5);
  });
});
