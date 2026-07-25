import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog } from '../net/liveMediaAdmin';
import type { AdminDrawableCatalog } from '../net/drawableCatalogAdmin';
import {
  SOURCE_ART_APPROVAL_STORAGE_KEY,
  SOURCE_ART_DIRECTIONS,
  isSourceArtBoardReviewed,
  readSourceArtApprovalIds,
  sourceArtApprovalListText,
  sourceArtDrawableInstallInput,
  sourceArtGroupAvailableInEditor,
  sourceArtGroupAccepted,
  sourceArtOwnerGroupProof,
  sourceArtSelectedVersions,
  sourceArtTurntableGroups,
  writeSourceArtApprovalIds,
} from './sourceArtTurntableReview';

function mediaCatalog(): AdminLiveMediaCatalog {
  const requiredSlots = SOURCE_ART_DIRECTIONS.map((direction) => `source-art/castle/${direction}.png`).sort();
  return {
    schemaVersion: 1,
    revision: 3,
    updatedAt: '2026-07-24T00:00:00.000Z',
    slots: SOURCE_ART_DIRECTIONS.map((direction) => ({
      slot: `source-art/castle/${direction}.png`,
      domain: 'prop',
      role: 'source-art',
      availabilityPolicy: 'decorative',
      lifecycleState: 'staging',
      activeVersionId: null,
      rowRevision: 0,
      metadata: {
        acceptance: { mode: 'group', groupId: 'source-art-eight-way:castle', requiredSlots },
        sourceArt: { schema: 'structure-source-art-turntable-v1', assetId: 'castle', direction },
      },
      versionStatus: null,
      productionEligible: false,
      media: null,
    })),
    versions: SOURCE_ART_DIRECTIONS.map((direction, index) => ({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      slot: `source-art/castle/${direction}.png`,
      sourcePath: null,
      domain: 'prop',
      role: 'source-art',
      label: `Castle · ${direction}`,
      status: 'candidate',
      productionEligible: false,
      metadata: {
        sourceArt: {
          schema: 'structure-source-art-turntable-v1',
          assetId: 'castle',
          structureId: 'structure-castle',
          label: 'Castle',
          sortOrder: 10,
          existing: false,
          sourceOnly: true,
          structureKind: 'landmark',
          direction,
          placementScale: 0.45,
          license: 'unspecified',
        },
      },
      provenance: {},
      nativeEvidence: {},
      reviewEvidence: {},
      rowRevision: 2,
      createdAt: '2026-07-24T00:00:00.000Z',
      updatedAt: `2026-07-24T00:00:0${index}.000Z`,
      updatedBy: null,
      media: {
        url: `/api/admin/media/${direction}`,
        sha256: direction.padEnd(64, '0').slice(0, 64),
        mediaType: 'image/png',
        byteLength: 10,
        width: 512,
        height: 512,
      },
    })),
  };
}

describe('source art turntable review', () => {
  it('keeps a browser approval checklist and copies selected sources in viewer order', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    expect(writeSourceArtApprovalIds(['mill', 'castle', 'castle'], storage)).toBe(true);
    expect(values.get(SOURCE_ART_APPROVAL_STORAGE_KEY)).toBe('["castle","mill"]');
    expect(readSourceArtApprovalIds(storage)).toEqual(['castle', 'mill']);

    const castle = sourceArtTurntableGroups(mediaCatalog())[0];
    const mill = {
      ...castle,
      groupId: 'source-art-eight-way:mill',
      assetId: 'mill',
      label: 'River Mill',
      sortOrder: 20,
    };
    expect(sourceArtApprovalListText([castle, mill], ['mill', 'missing'])).toBe([
      'Source artwork approval list',
      '- mill — River Mill',
    ].join('\n'));

    values.set(SOURCE_ART_APPROVAL_STORAGE_KEY, '{"not":"a list"}');
    expect(readSourceArtApprovalIds(storage)).toEqual([]);
  });

  it('derives only the complete canonical eight-way group and emits the backend owner proof', () => {
    const catalog = mediaCatalog();
    const group = sourceArtTurntableGroups(catalog)[0];
    expect(group).toMatchObject({ assetId: 'castle', structureId: 'structure-castle', sourceOnly: true });
    const batch = sourceArtSelectedVersions(catalog, group, {});
    expect(batch.missingSlots).toEqual([]);
    expect(batch.versions).toHaveLength(8);
    expect(sourceArtOwnerGroupProof(group, batch.versions, batch.slots, {
      pixelX: 24,
      pixelY: 156,
      scale: 1.25,
      direction: 'east',
    }, SOURCE_ART_DIRECTIONS)).toMatchObject({
      schema: 'live-media-owner-group-proof-v1',
      canonicalScale: 1,
      surfaceKind: 'Studio Source Art interactive board placement',
      renderer: 'BoardLabBoard/SourceArtCandidateOverlay',
      mountedDirections: SOURCE_ART_DIRECTIONS,
      placement: {
        pixelX: 24,
        pixelY: 156,
        scale: 1.25,
        direction: 'east',
        installedSourceScale: 0.45,
      },
      acceptanceGroup: { groupId: 'source-art-eight-way:castle', requiredSlots: group.requiredSlots },
    });
  });

  it('does not expose a retired source-art group', () => {
    const catalog = mediaCatalog();
    catalog.slots = catalog.slots.map((slot) => ({ ...slot, lifecycleState: 'retired' }));
    expect(sourceArtTurntableGroups(catalog)).toEqual([]);
  });

  it('does not treat the old isolated-frame evidence as board placement review', () => {
    const catalog = mediaCatalog();
    const group = sourceArtTurntableGroups(catalog)[0];
    const batch = sourceArtSelectedVersions(catalog, group, {});
    const proof = sourceArtOwnerGroupProof(group, batch.versions, batch.slots, {
      pixelX: 0,
      pixelY: 0,
      scale: 1,
      direction: 'south',
    }, SOURCE_ART_DIRECTIONS);
    const slot = batch.slots[0];
    const version = {
      ...batch.versions[0],
      reviewEvidence: {
        approved: true,
        contentSha256: batch.versions[0].media?.sha256,
        notes: 'Reviewed all eight directions on the board.',
        surfaceUrl: 'http://localhost/studio',
        evidence: proof,
      },
    };
    expect(isSourceArtBoardReviewed(version, slot)).toBe(true);
    expect(isSourceArtBoardReviewed({
      ...version,
      reviewEvidence: {
        ...version.reviewEvidence,
        evidence: {
          ...proof,
          surfaceKind: 'Studio Source Art native eight-way turntable',
        },
      },
    }, slot)).toBe(false);
  });

  it('cannot manufacture board proof before every direction has mounted', () => {
    const catalog = mediaCatalog();
    const group = sourceArtTurntableGroups(catalog)[0];
    const batch = sourceArtSelectedVersions(catalog, group, {});
    expect(() => sourceArtOwnerGroupProof(group, batch.versions, batch.slots, {
      pixelX: 0,
      pixelY: 0,
      scale: 1,
      direction: 'south',
    }, ['south'])).toThrow(/all eight directions mounted/);
  });

  it('builds a source-only landmark without gameplay placement policy', () => {
    const group = sourceArtTurntableGroups(mediaCatalog())[0];
    const drawables: AdminDrawableCatalog = {
      schemaVersion: 1,
      revision: 1,
      updatedAt: null,
      assets: [],
    };
    const input = sourceArtDrawableInstallInput(drawables, group);
    expect(input.behavior).toMatchObject({
      value: 'castle',
      structureKind: 'landmark',
      sourceOnly: true,
      splitMode: 'flat-contact',
    });
    expect(input.behavior).not.toHaveProperty('terrains');
    expect(input.behavior).not.toHaveProperty('blocking');
    expect(input.behavior).not.toHaveProperty('footprint');
    expect(input.media['south-back']).toBe('source-art/castle/south.png');
    expect(input.media['south-front']).toBe('source-art/castle/south.png');
  });

  it('requires every active direction to be accepted before categorizing a group as accepted', () => {
    const catalog = mediaCatalog();
    const group = sourceArtTurntableGroups(catalog)[0];
    expect(sourceArtGroupAccepted(catalog, group)).toBe(false);

    const acceptedCatalog: AdminLiveMediaCatalog = {
      ...catalog,
      slots: catalog.slots.map((slot, index) => ({
        ...slot,
        lifecycleState: 'active',
        activeVersionId: catalog.versions[index].id,
      })),
      versions: catalog.versions.map((version) => ({ ...version, status: 'accepted' })),
    };
    expect(sourceArtGroupAccepted(acceptedCatalog, group)).toBe(true);
    expect(sourceArtGroupAccepted({
      ...acceptedCatalog,
      slots: acceptedCatalog.slots.map((slot, index) => index === 0 ? { ...slot, activeVersionId: null } : slot),
    }, group)).toBe(false);
  });

  it('requires every installed eight-way role before calling source artwork available in the Level Editor', () => {
    const group = sourceArtTurntableGroups(mediaCatalog())[0];
    const sha256 = 'a'.repeat(64);
    const media = {
      url: '/api/media/source',
      immutableUrl: `/api/media/${sha256}`,
      sha256,
      mediaType: 'image/png',
      byteLength: 10,
      width: 512,
      height: 512,
    };
    const drawables: AdminDrawableCatalog = {
      schemaVersion: 1,
      revision: 2,
      updatedAt: '2026-07-24T00:00:00.000Z',
      assets: [{
        id: group.structureId,
        kind: 'structure',
        label: group.label,
        sortOrder: group.sortOrder,
        lifecycleState: 'active',
        behavior: {},
        metadata: {},
        rowRevision: 1,
        media: {
          back: { slot: 'props/castle/back.png', media },
          front: { slot: 'props/castle/front.png', media },
        },
      }],
    };
    expect(sourceArtGroupAvailableInEditor(drawables, group)).toBe(false);
    drawables.assets[0].media = Object.fromEntries(SOURCE_ART_DIRECTIONS.flatMap((direction) => [
      [`${direction}-back`, { slot: `source-art/castle/${direction}.png`, media }],
      [`${direction}-front`, { slot: `source-art/castle/${direction}.png`, media }],
    ]));
    expect(sourceArtGroupAvailableInEditor(drawables, group)).toBe(true);
  });
});
