import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyLiveMediaCatalog,
  liveMediaSlotUrl,
  resetLiveMediaCatalog,
  type LiveMediaCatalog,
} from '@chess-tactics/board-render';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import { testGroundCoverCatalog } from '../test/liveMediaCatalog';
import {
  CHROME_LIVE_SLOTS,
  assertInstalledChromeSlots,
  chromeSourceById,
  chromeSourcesFor,
  clearChromeAdminCatalog,
  dividerJointSources,
  installChromeAdminCatalog,
} from './chromeCandidateSources';

const slots = Object.values(CHROME_LIVE_SLOTS);

function publicCatalog(): LiveMediaCatalog {
  const catalog = testGroundCoverCatalog(slots.map((slot, index) => {
      const sha = String(index + 1).repeat(64);
      return {
        slot,
        domain: 'ui-kit',
        role: 'runtime',
        availabilityPolicy: 'critical',
        activeVersionId: `active-${index}`,
        rowRevision: 1,
        metadata: {},
        versionStatus: 'accepted',
        productionEligible: true,
        versionMetadata: {},
        provenance: { source: 'backend' },
        nativeEvidence: {},
        media: {
          url: liveMediaSlotUrl(slot),
          immutableUrl: `/api/media/${sha}`,
          sha256: sha,
          mediaType: 'image/png',
          width: 32,
          height: 32,
          byteLength: 100,
        },
      };
    }));
  catalog.revision = 12;
  catalog.updatedAt = null;
  return catalog;
}

function adminVersion(id: string, enriched = true): AdminLiveMediaVersion {
  return {
    id,
    slot: null,
    sourcePath: 'retired/chrome-candidate.png',
    domain: 'ui-kit',
    role: 'review',
    label: 'Archived candidate',
    status: 'candidate',
    productionEligible: false,
    metadata: enriched ? {
      chromeCandidate: {
        id: 'historical-generator-id',
        label: 'Backend outer atom candidate',
        role: 'outer',
        kind: 'atom',
        width: 17,
        height: 17,
        sourceSheetId: 'sheet-id',
        sourceSheetLabel: 'Sheet label',
        sourceSheetPath: 'archived/sheet.png',
        componentIndex: 2,
        componentCount: 8,
        crop: { x: 1, y: 2, w: 17, h: 17 },
        recommended: false,
      },
    } : {},
    provenance: { migration: { originalRepositoryPath: 'legacy.png' } },
    nativeEvidence: {},
    reviewEvidence: {},
    rowRevision: 1,
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    updatedBy: null,
    media: {
      url: `/api/admin/media-versions/${id}/content`,
      sha256: 'a'.repeat(64),
      mediaType: 'image/png',
      width: 17,
      height: 17,
      byteLength: 50,
    },
  };
}

function adminCatalog(versions: AdminLiveMediaVersion[]): AdminLiveMediaCatalog {
  return { schemaVersion: 1, revision: 4, updatedAt: null, slots: [], versions };
}

describe('live Chrome sources', () => {
  beforeEach(() => applyLiveMediaCatalog(publicCatalog()));
  afterEach(() => {
    clearChromeAdminCatalog();
    resetLiveMediaCatalog();
  });

  it('resolves installed Chrome exclusively through the five canonical semantic slots', () => {
    expect(() => assertInstalledChromeSlots()).not.toThrow();
    for (const slot of slots) {
      expect(chromeSourceById(slot)).toMatchObject({
        id: slot,
        authority: 'installed-slot',
        sourceSheetPath: slot,
      });
      expect(chromeSourceById(slot).src).toMatch(/^\/api\/media\/[0-9]{64}$/);
    }
    expect(chromeSourcesFor('outer', 'atom')[0].id).toBe(CHROME_LIVE_SLOTS.outerAtom);
    expect(chromeSourcesFor('outer', 'rail')[0]).toMatchObject({ id: CHROME_LIVE_SLOTS.outerRail, kind: 'rail-sheet' });
    expect(chromeSourcesFor('inner', 'rail')[0]).toMatchObject({ id: CHROME_LIVE_SLOTS.innerRail, kind: 'rail-repeat' });
    expect(dividerJointSources()[0].id).toBe(CHROME_LIVE_SLOTS.dividerJoint);
  });

  it('fails closed when any installed Chrome slot is absent', () => {
    const missing = publicCatalog();
    missing.slots = missing.slots.filter((entry) => entry.slot !== CHROME_LIVE_SLOTS.dividerJoint);
    applyLiveMediaCatalog(missing);
    expect(() => assertInstalledChromeSlots()).toThrow(CHROME_LIVE_SLOTS.dividerJoint);
  });

  it('hydrates private choices from importer metadata and uses the authenticated content URL', () => {
    expect(installChromeAdminCatalog(adminCatalog([adminVersion('version-1')]))).toBe(1);
    expect(chromeSourcesFor('outer', 'atom')[1]).toMatchObject({
      id: 'version-1',
      authority: 'admin-version',
      src: '/api/admin/media-versions/version-1/content',
      sourceSheetId: 'sheet-id',
      versionStatus: 'candidate',
    });
  });

  it('excludes archived and accepted historical rows from audition choices', () => {
    const archived = adminVersion('archived-version');
    archived.status = 'archived';
    const accepted = adminVersion('accepted-version');
    accepted.status = 'accepted';
    expect(installChromeAdminCatalog(adminCatalog([archived, accepted]))).toBe(0);
    expect(chromeSourcesFor('outer', 'atom')).toHaveLength(1);
  });

  it('never reconstructs a browser source from a candidate filename without enrichment', () => {
    expect(installChromeAdminCatalog(adminCatalog([adminVersion('version-1', false)]))).toBe(0);
    expect(chromeSourcesFor('outer', 'atom')).toHaveLength(1);
    expect(() => chromeSourceById('historical-generator-id')).toThrow(/absent from the live backend catalog/);
  });
});
