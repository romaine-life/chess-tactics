import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import {
  RUN_CARD_ICON_PAIRS,
  RUN_ICON_PAIR_BATCH_ID,
  defaultRunCardIconFittingDraft,
  normalizeRunCardIconFittingDraft,
  runIconPairReviewFrameVersion,
  runIconPairReviewVersions,
} from './RunIconPairReview';
import {
  RUN_CARD_COMMITTED_PROPERTY_PLACEMENTS,
  RUN_CARD_COMMITTED_UNIT_STATE_PLACEMENT,
} from './RunCardFace';

function version(overrides: Partial<AdminLiveMediaVersion>): AdminLiveMediaVersion {
  return {
    id: 'candidate',
    slot: 'ui/kit/icons/game/positioned.png',
    sourcePath: null,
    domain: 'ui-kit',
    role: 'icon',
    label: 'Eutactic option',
    status: 'candidate',
    productionEligible: false,
    metadata: { candidateIndex: 1 },
    provenance: { liveMediaBatch: { batchId: RUN_ICON_PAIR_BATCH_ID } },
    nativeEvidence: {},
    reviewEvidence: {},
    rowRevision: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    updatedBy: null,
    media: {
      url: '/api/admin/media/positioned',
      sha256: 'a'.repeat(64),
      mediaType: 'image/png',
      width: 64,
      height: 64,
      byteLength: 1,
    },
    ...overrides,
  };
}

describe('Run icon pair review', () => {
  it('is embedded as a click-reachable Studio category and canonicalizes the old review alias', () => {
    const studio = readFileSync(new URL('./TilePreview.tsx', import.meta.url), 'utf8');
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
    expect(studio).toContain("id: 'cardicons', label: 'Card Icon Fitting'");
    expect(studio).toContain("openViewer('cardicons')");
    expect(studio).toContain("viewerKind === 'cardicons'");
    expect(studio).toContain("params.get('runIconPairReview') === '1'");
    expect(app).not.toContain('return <RunIconPairReview />');
  });

  it('shows only current-batch private candidates for the exact typed slot, ordered by option', () => {
    const catalog = {
      schemaVersion: 1,
      revision: 1,
      updatedAt: '2026-08-01T00:00:00.000Z',
      slots: [],
      versions: [
        version({ id: 'second', metadata: { candidateIndex: 2 } }),
        version({ id: 'accepted', status: 'accepted' }),
        version({ id: 'other-slot', slot: 'ui/kit/icons/game/marshalled.png' }),
        version({ id: 'other-batch', provenance: { liveMediaBatch: { batchId: 'other' } } }),
        version({ id: 'missing-media', media: null }),
        version({ id: 'first', metadata: { candidateIndex: 1 } }),
      ],
    } satisfies AdminLiveMediaCatalog;

    expect(runIconPairReviewVersions(catalog, 'ui/kit/icons/game/positioned.png').map(({ id }) => id))
      .toEqual(['first', 'second']);
  });

  it('uses a media-backed staging frame until that exact semantic slot is accepted', () => {
    const slot = 'ui/run/card-prototypes/hieratic-frame-v1.png';
    const candidate = version({ id: 'steel-frame', slot, status: 'candidate' });
    const catalog = {
      schemaVersion: 1,
      revision: 1,
      updatedAt: '2026-08-01T00:00:00.000Z',
      slots: [{
        slot,
        domain: 'ui',
        role: 'card-frame',
        availabilityPolicy: 'critical',
        lifecycleState: 'staging',
        activeVersionId: null,
        rowRevision: 0,
        metadata: {},
        versionStatus: null,
        productionEligible: false,
        media: null,
      }],
      versions: [candidate],
    } satisfies AdminLiveMediaCatalog;

    expect(runIconPairReviewFrameVersion(catalog, slot)).toBe(candidate);
  });

  it('restores exact saved choices while clamping per-property and shared fitting geometry', () => {
    const versions = RUN_CARD_ICON_PAIRS.flatMap((pair) => [
      version({ id: `${pair.property}-property`, slot: pair.propertySlot }),
      version({ id: `${pair.property}-state`, slot: pair.stateSlot }),
    ]);
    const catalog = {
      schemaVersion: 1,
      revision: 1,
      updatedAt: '2026-08-01T00:00:00.000Z',
      slots: [],
      versions,
    } satisfies AdminLiveMediaCatalog;
    // Reset restores the committed fit the live cards ship, not a zeroed placement.
    const baseline = defaultRunCardIconFittingDraft(catalog);
    expect(baseline.propertyPlacements.hieratic).toEqual(RUN_CARD_COMMITTED_PROPERTY_PLACEMENTS.hieratic);
    expect(baseline.unitStatePlacement).toEqual(RUN_CARD_COMMITTED_UNIT_STATE_PLACEMENT);
    expect(baseline.unitStatePlacement).not.toEqual({ x: 0, y: 0, scale: 1 });

    const normalized = normalizeRunCardIconFittingDraft({
      active_property: 'hieratic',
      selections: {
        hieratic: {
          propertyVersionId: 'hieratic-property',
          stateVersionId: 'hieratic-state',
        },
      },
      property_placements: {
        hieratic: { x: 99, y: -99, scale: 9 },
      },
      unit_state_placement: { x: 5.25, y: -5.5, scale: .65 },
    }, catalog);

    expect(normalized.activeProperty).toBe('hieratic');
    expect(normalized.selections.hieratic).toEqual({
      propertyVersionId: 'hieratic-property',
      stateVersionId: 'hieratic-state',
    });
    expect(normalized.propertyPlacements.hieratic).toEqual({ x: 4, y: -4, scale: 5 });
    expect(normalized.unitStatePlacement).toEqual({ x: 5.25, y: -5.5, scale: .65 });
  });
});
