import { describe, expect, it } from 'vitest';
import type {
  AdminLiveMediaCatalog,
  AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { editableSfxCandidates } from './SfxLibraryStudio';

function version(
  id: string,
  patch: Partial<AdminLiveMediaVersion> = {},
): AdminLiveMediaVersion {
  return {
    id,
    slot: `sfx/${id}/v0.wav`,
    sourcePath: null,
    domain: 'sfx',
    role: 'audio',
    label: id,
    status: 'candidate',
    productionEligible: false,
    metadata: {},
    provenance: {},
    nativeEvidence: {},
    reviewEvidence: {},
    rowRevision: 1,
    createdAt: '2026-07-29T20:00:00.000Z',
    updatedAt: '2026-07-29T20:00:00.000Z',
    updatedBy: 'owner@example.com',
    media: {
      url: `/api/admin/media/${id}`,
      sha256: id.padEnd(64, '0').slice(0, 64),
      mediaType: 'audio/wav',
      width: null,
      height: null,
      byteLength: 44,
    },
    ...patch,
  };
}

describe('editableSfxCandidates', () => {
  it('lists only editable live-backed SFX candidates and puts complete sources first', () => {
    const catalog = {
      schemaVersion: 1,
      revision: 1,
      updatedAt: null,
      slots: [],
      versions: [
        version('new-cut', { createdAt: '2026-07-29T22:00:00.000Z' }),
        version('full-source', {
          createdAt: '2026-07-29T21:00:00.000Z',
          metadata: { editorSource: { requireTrim: true } },
        }),
        version('accepted', { status: 'accepted' }),
        version('no-bytes', { media: null }),
        version('wrong-domain', {
          domain: 'run-sectio',
          slot: 'run/sectio/gold.png',
        }),
      ],
    } satisfies AdminLiveMediaCatalog;

    expect(editableSfxCandidates(catalog).map((item) => item.id)).toEqual([
      'full-source',
      'new-cut',
    ]);
  });
});
