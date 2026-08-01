import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import { runCardArtPromptPlans, runCardPromptComposition } from './cardArtPrompts';

function version({
  id = 'version-1',
  slot = 'ui/run/card-art/pppkb/illustration.png',
  title = 'Parish Militia',
  createdAt = '2026-07-31T00:00:00.000Z',
  prompt = 'Exact prompt version one.',
}: {
  id?: string;
  slot?: string;
  title?: string;
  createdAt?: string;
  prompt?: string;
} = {}): AdminLiveMediaVersion {
  return {
    id,
    slot,
    sourcePath: null,
    domain: 'run-card-art',
    role: 'illustration',
    label: `${title} PixelLab card illustration`,
    status: 'candidate',
    productionEligible: false,
    metadata: {
      schema: 'run-card-art-plan-v2',
      cardId: 'pppkb',
      cardTitle: title,
      cardType: 'Units',
      pieces: ['pawn', 'pawn', 'pawn', 'knight', 'bishop'],
      baseCost: 9,
      historicalAnchor: 'dissolution-of-the-monasteries',
      generationModel: 'pixellab-pixflux',
      nativeWidth: 400,
      nativeHeight: 280,
    },
    provenance: {
      schema: 'run-card-art-prompt-v2',
      sceneDirection: 'Five people wait beside a parish wall.',
      unitIdentity: 'Three foot levies, one mounted retainer, and one field cleric.',
      prompt,
      promptSha256: 'a'.repeat(64),
      promptExactness: 'exact-tool-input',
      pixelLabJobId: '7c4faa41-e2d7-4f8d-aa55-d0fd004938d0',
      generationModel: 'pixellab-pixflux',
    },
    nativeEvidence: {},
    reviewEvidence: {},
    rowRevision: 0,
    createdAt,
    updatedAt: createdAt,
    updatedBy: null,
    media: null,
  };
}

function catalog(versions: AdminLiveMediaVersion[]): AdminLiveMediaCatalog {
  return { schemaVersion: 1, revision: 1, updatedAt: null, slots: [], versions };
}

describe('run-card art prompt plans', () => {
  it('projects typed database provenance and formats the exact unit composition', () => {
    const [plan] = runCardArtPromptPlans(catalog([version()]));
    expect(plan).toMatchObject({
      id: 'pppkb',
      title: 'Parish Militia',
      baseCost: 9,
      prompt: 'Exact prompt version one.',
    });
    expect(runCardPromptComposition(plan)).toBe('3 Pawns · 1 Knight · 1 Bishop');
  });

  it('keeps only the latest database version for a stable card-art slot', () => {
    const old = version();
    const current = version({
      id: 'version-2',
      createdAt: '2026-07-31T00:01:00.000Z',
      prompt: 'Exact prompt version two.',
    });
    expect(runCardArtPromptPlans(catalog([current, old]))).toHaveLength(1);
    expect(runCardArtPromptPlans(catalog([current, old]))[0].prompt).toBe('Exact prompt version two.');
  });

  it('fails closed when a card-art candidate claims typed provenance but is malformed', () => {
    const malformed = version();
    malformed.provenance.promptSha256 = 'not-a-sha';
    expect(() => runCardArtPromptPlans(catalog([malformed]))).toThrow(/invalid typed provenance/);
  });

  it('ignores live-media candidates outside the run-card art namespace', () => {
    expect(runCardArtPromptPlans(catalog([version({ slot: 'ui/chrome/outer-atom.png' })]))).toEqual([]);
  });
});
