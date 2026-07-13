import { afterEach, describe, expect, it } from 'vitest';
import { applyLiveMediaCatalog, resetLiveMediaCatalog } from '@chess-tactics/board-render';
import { SCENE_ANIMS } from './SceneBackdrop';
import { sceneAnimationVariants } from './SceneAnimLab';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import { testGroundCoverCatalog } from '../test/liveMediaCatalog';

const activeVersionId = '00000000-0000-4000-8000-000000000001';
const candidateVersionId = '00000000-0000-4000-8000-000000000002';
const archivedVersionId = '00000000-0000-4000-8000-000000000003';
const sha = 'a'.repeat(64);
const region = SCENE_ANIMS[0];

function adminVersion(id: string, status: AdminLiveMediaVersion['status'], label: string): AdminLiveMediaVersion {
  return {
    id,
    slot: region.slot,
    sourcePath: null,
    domain: 'ui-kit',
    role: 'animation',
    label,
    status,
    productionEligible: false,
    metadata: { runtime: { frameCount: status === 'archived' ? 11 : 12 } },
    provenance: { generator: 'build-scene-anim' },
    nativeEvidence: {},
    reviewEvidence: {},
    rowRevision: 1,
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: id,
    updatedBy: null,
    media: {
      url: `/api/admin/media/${id}`,
      sha256: id.replaceAll('-', '').padEnd(64, '0').slice(0, 64),
      mediaType: 'image/png',
      width: region.w * 12,
      height: region.h,
      byteLength: 100,
    },
  };
}

afterEach(() => resetLiveMediaCatalog());

describe('scene animation live-media lifecycle', () => {
  it('derives active, candidate, and archived variants from backend snapshots', () => {
    const publicCatalog = testGroundCoverCatalog([{
        slot: region.slot,
        domain: 'ui-kit',
        role: 'animation',
        availabilityPolicy: 'critical',
        activeVersionId,
        rowRevision: 2,
        metadata: {},
        versionStatus: 'legacy-bridge',
        productionEligible: false,
        versionMetadata: { runtime: { frameCount: 12 } },
        provenance: {},
        nativeEvidence: {},
        media: {
          url: `/assets/${region.slot}`,
          immutableUrl: `/api/media/${sha}`,
          sha256: sha,
          mediaType: 'image/png',
          width: region.w * 12,
          height: region.h,
          byteLength: 100,
        },
      }]);
    publicCatalog.revision = 4;
    publicCatalog.updatedAt = null;
    applyLiveMediaCatalog(publicCatalog);
    const adminCatalog: AdminLiveMediaCatalog = {
      schemaVersion: 1,
      revision: 4,
      updatedAt: null,
      slots: [],
      versions: [
        adminVersion(activeVersionId, 'legacy-bridge', 'active'),
        adminVersion(candidateVersionId, 'candidate', 'calmer water'),
        adminVersion(archivedVersionId, 'archived', 'old AI frames'),
      ],
    };

    expect(sceneAnimationVariants(region, adminCatalog)).toEqual([
      expect.objectContaining({ id: 'active', sheet: `/api/media/${sha}`, frames: 12 }),
      expect.objectContaining({ id: archivedVersionId, label: 'Archived — old AI frames', frames: 11 }),
      expect.objectContaining({ id: candidateVersionId, label: 'Candidate — calmer water', frames: 12 }),
    ]);
  });
});
