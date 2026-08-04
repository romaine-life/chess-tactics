import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import {
  RUN_CARD_ICON_PAIRS,
  RUN_ICON_PAIR_BATCH_ID,
  STARTER_RUN_ICON_PAIR_BATCH_ID,
  defaultRunCardIconFittingDraft,
  normalizeRunCardIconFittingDraft,
  runCardIconFittingPropertyFromSearch,
  runCardIconFittingSpecimenCard,
  runCardIconFittingVersions,
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
    slot: 'ui/kit/icons/game/eutactic.png',
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
    expect(studio).toContain("if (route.viewerKind !== 'cardicons') return;");
    expect(studio).toContain("params.set('iconPair', value)");
    expect(app).not.toContain('return <RunIconPairReview />');
  });

  it('includes the His Grace property/state pair as a directly addressable fitting specimen', () => {
    const pair = RUN_CARD_ICON_PAIRS.find(({ property }) => property === 'praecipuus');
    expect(RUN_CARD_ICON_PAIRS).toHaveLength(5);
    expect(pair).toMatchObject({
      propertySlot: 'review/run-card-icons/praecipuus/property.png',
      state: 'primogeniture',
      stateSlot: 'review/run-card-icons/primogeniture/state.png',
      candidateBatchId: STARTER_RUN_ICON_PAIR_BATCH_ID,
    });
    expect(runCardIconFittingPropertyFromSearch('?mode=viewer&vk=cardicons&iconPair=praecipuus'))
      .toBe('praecipuus');
    expect(runCardIconFittingPropertyFromSearch('?iconPair=unknown')).toBeNull();

    const card = runCardIconFittingSpecimenCard(pair!);
    expect(card).toMatchObject({
      name: 'His Grace',
      cardProperty: { id: 'praecipuus', name: 'Praecipuus' },
      grants: [{ unit: 'king', count: 1, ability: { state: 'primogeniture', index: 0 } }],
    });
  });

  it('uses the current canonical slots for every accepted legacy pair', () => {
    expect(RUN_CARD_ICON_PAIRS.slice(0, 4).map(({ property, propertySlot, state, stateSlot }) => ({
      property,
      propertySlot,
      state,
      stateSlot,
    }))).toEqual([
      {
        property: 'pestiferous',
        propertySlot: 'ui/kit/icons/card-properties/pestiferous.png',
        state: 'cacochymic',
        stateSlot: 'ui/kit/icons/game/cacochymic.png',
      },
      {
        property: 'concinnous',
        propertySlot: 'ui/kit/icons/card-properties/concinnous.png',
        state: 'eutactic',
        stateSlot: 'ui/kit/icons/game/eutactic.png',
      },
      {
        property: 'legatine',
        propertySlot: 'ui/kit/icons/card-properties/legatine.png',
        state: 'adlected',
        stateSlot: 'ui/kit/icons/game/adlected.png',
      },
      {
        property: 'hieratic',
        propertySlot: 'ui/kit/icons/card-properties/hieratic.png',
        state: 'agminate',
        stateSlot: 'ui/kit/icons/game/agminate.png',
      },
    ]);
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
        version({ id: 'other-slot', slot: 'ui/kit/icons/game/agminate.png' }),
        version({ id: 'other-batch', provenance: { liveMediaBatch: { batchId: 'other' } } }),
        version({ id: 'missing-media', media: null }),
        version({ id: 'first', metadata: { candidateIndex: 1 } }),
      ],
    } satisfies AdminLiveMediaCatalog;

    expect(runIconPairReviewVersions(catalog, 'ui/kit/icons/game/eutactic.png').map(({ id }) => id))
      .toEqual(['first', 'second']);
  });

  it('reads the starter pair from its own generated review batch', () => {
    const slot = 'review/run-card-icons/praecipuus/property.png';
    const starter = version({
      id: 'starter-codex',
      slot,
      metadata: { provider: 'codex' },
      provenance: { liveMediaBatch: { batchId: STARTER_RUN_ICON_PAIR_BATCH_ID } },
    });
    const oldBatch = version({ id: 'old-batch', slot });
    const catalog = {
      schemaVersion: 1,
      revision: 1,
      updatedAt: '2026-08-04T00:00:00.000Z',
      slots: [],
      versions: [oldBatch, starter],
    } satisfies AdminLiveMediaCatalog;

    expect(runCardIconFittingVersions(catalog, slot, STARTER_RUN_ICON_PAIR_BATCH_ID))
      .toEqual([starter]);
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
      version({
        id: `${pair.property}-property`,
        slot: pair.propertySlot,
        provenance: { liveMediaBatch: { batchId: pair.candidateBatchId } },
      }),
      version({
        id: `${pair.property}-state`,
        slot: pair.stateSlot,
        provenance: { liveMediaBatch: { batchId: pair.candidateBatchId } },
      }),
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
    expect(baseline.propertyPlacements.praecipuus).toEqual(RUN_CARD_COMMITTED_PROPERTY_PLACEMENTS.praecipuus);
    expect(baseline.selections.praecipuus).toEqual({
      propertyVersionId: 'praecipuus-property',
      stateVersionId: 'praecipuus-state',
    });
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
    // A saved four-pair draft acquires the fifth pair at the committed fit, never zeroed.
    expect(normalized.propertyPlacements.praecipuus).toEqual(RUN_CARD_COMMITTED_PROPERTY_PLACEMENTS.praecipuus);
    expect(normalized.selections.praecipuus).toEqual(baseline.selections.praecipuus);
    expect(normalized.unitStatePlacement).toEqual({ x: 5.25, y: -5.5, scale: .65 });
  });
});
