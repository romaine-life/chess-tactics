import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLiveMediaCatalog,
  liveMediaForSlot,
  liveMediaSlotUrl,
  liveMediaSlotsWithPrefix,
  resetLiveMediaCatalog,
} from '@chess-tactics/board-render';

const sha = 'b'.repeat(64);
const validCatalog = () => ({
  schemaVersion: 1,
  revision: 1,
  updatedAt: null,
  slots: [{
    slot: 'ui/kit/panel.png',
    domain: 'ui-kit',
    role: 'panel',
    availabilityPolicy: 'critical',
    activeVersionId: '00000000-0000-4000-8000-000000000002',
    rowRevision: 1,
    metadata: { slices: [16, 16, 16, 16] },
    versionStatus: 'accepted',
    productionEligible: true,
    versionMetadata: {},
    provenance: { generator: 'synthetic-test' },
    nativeEvidence: { reviewedAt1x: true },
    media: {
      url: '/assets/ui/kit/panel.png',
      immutableUrl: `/api/media/${sha}`,
      sha256: sha,
      mediaType: 'image/png',
      width: 96,
      height: 96,
      byteLength: 1200,
    },
  }],
});

afterEach(() => resetLiveMediaCatalog());

describe('live media catalog', () => {
  it('hydrates stable semantic slots from an accepted backend snapshot', () => {
    expect(applyLiveMediaCatalog(validCatalog())).toBe(true);
    expect(liveMediaForSlot('ui/kit/panel.png').media.immutableUrl).toBe(`/api/media/${sha}`);
    expect(liveMediaSlotUrl('ui/kit/panel.png')).toBe('/assets/ui/kit/panel.png');
    expect(liveMediaSlotsWithPrefix('ui/kit/').map((entry) => entry.slot)).toEqual(['ui/kit/panel.png']);
  });

  it('rejects an immutable URL whose hash does not match', () => {
    const catalog = validCatalog();
    catalog.slots[0].media.immutableUrl = `/api/media/${'c'.repeat(64)}`;
    expect(() => applyLiveMediaCatalog(catalog)).toThrow(/immutable URL/);
  });

  it('has no filesystem or generic fallback before hydration', () => {
    expect(() => liveMediaForSlot('ui/kit/panel.png')).toThrow(/not hydrated/);
  });

  it('keeps a legacy bridge explicitly non-production-eligible', () => {
    const catalog = validCatalog();
    catalog.slots[0].versionStatus = 'legacy-bridge';
    catalog.slots[0].productionEligible = false;
    expect(applyLiveMediaCatalog(catalog)).toBe(true);
    expect(liveMediaForSlot('ui/kit/panel.png').versionStatus).toBe('legacy-bridge');
  });

  it('rejects a legacy bridge mislabeled as production eligible', () => {
    const catalog = validCatalog();
    catalog.slots[0].versionStatus = 'legacy-bridge';
    expect(() => applyLiveMediaCatalog(catalog)).toThrow(/falsely production eligible/);
  });
});
