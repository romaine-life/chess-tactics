import { describe, expect, it } from 'vitest';
import {
  SKIRMISH_TAB_MARK_BATCH_IDS,
  skirmishTabMarkCandidates,
} from './SkirmishTabMarkCatalog';
import {
  SKIRMISH_TAB_MARKS,
  SKIRMISH_TAB_MARK_MEDIA_ROLE,
  SKIRMISH_TAB_MARK_SLOT,
} from './shared/SkirmishTabIcon';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';

function version(overrides: Partial<AdminLiveMediaVersion> = {}): AdminLiveMediaVersion {
  return {
    id: 'v1',
    slot: SKIRMISH_TAB_MARK_SLOT.unit,
    sourcePath: null,
    domain: 'ui-kit',
    role: 'media',
    label: 'mark',
    status: 'candidate',
    productionEligible: false,
    metadata: { candidateIndex: 1, canvas: 64, inkHeight: 52, evenInkDimensions: true },
    provenance: { liveMediaBatch: { batchId: SKIRMISH_TAB_MARK_BATCH_IDS.unit[0] } },
    nativeEvidence: {},
    reviewEvidence: {},
    rowRevision: 1,
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    updatedBy: null,
    media: { url: '/api/admin/media/a', sha256: 'a', mediaType: 'image/png', width: 64, height: 64, byteLength: 1 },
    ...overrides,
  } as AdminLiveMediaVersion;
}

function catalog(versions: AdminLiveMediaVersion[]): AdminLiveMediaCatalog {
  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: '2026-08-12T00:00:00.000Z',
    slots: SKIRMISH_TAB_MARKS.map((seat) => ({
      slot: SKIRMISH_TAB_MARK_SLOT[seat],
      domain: 'ui-kit',
      role: 'media',
      availabilityPolicy: 'critical',
      lifecycleState: 'active',
      activeVersionId: null,
      rowRevision: 1,
      metadata: {},
    })),
    versions,
  } as unknown as AdminLiveMediaCatalog;
}

describe('the Battle HUD tab strip', () => {
  it('decides four marks and deliberately not the gear', () => {
    // The gear is ADR-0560's settled cog, drawn by the Settings section and `.icon-gear` too, so
    // re-deciding it here would move three unrelated surfaces on this page's Install.
    expect([...SKIRMISH_TAB_MARKS]).toEqual(['unit', 'roster', 'log', 'view']);
    expect(SKIRMISH_TAB_MARKS).not.toContain('controls');
    // Its seat still resolves, because the strip draws it beside the four being judged.
    expect(SKIRMISH_TAB_MARK_SLOT.controls).toBe('ui/kit/icons/gear.png');
    expect(SKIRMISH_TAB_MARK_MEDIA_ROLE.controls).toBe('ui-kit-icons-gear-png');
  });

  it('groups a candidate by the seat whose slot AND batch it belongs to', () => {
    const grouped = skirmishTabMarkCandidates(catalog([
      version({ id: 'unit-1' }),
      version({
        id: 'log-1',
        slot: SKIRMISH_TAB_MARK_SLOT.log,
        provenance: { liveMediaBatch: { batchId: SKIRMISH_TAB_MARK_BATCH_IDS.log[0] } },
      }),
    ]));
    expect(grouped.get('unit')?.map((entry) => entry.id)).toEqual(['unit-1']);
    expect(grouped.get('log')?.map((entry) => entry.id)).toEqual(['log-1']);
  });

  it('ignores a version in the right slot from an unrelated batch', () => {
    // These are long-lived kit slots with their own history. Filtering on the slot alone would put
    // every candidate any surface ever uploaded for `info.png` on this page.
    const grouped = skirmishTabMarkCandidates(catalog([
      version({ id: 'stranger', provenance: { liveMediaBatch: { batchId: 'some-older-batch' } } }),
      version({ id: 'unbatched', provenance: {} }),
    ]));
    expect(grouped.get('unit')).toBeUndefined();
  });

  it('ignores anything already accepted, so an installed mark is not offered as its own candidate', () => {
    const grouped = skirmishTabMarkCandidates(catalog([version({ id: 'accepted', status: 'accepted' })]));
    expect(grouped.get('unit')).toBeUndefined();
  });

  it('orders a seat with two concepts by concept first, then by generation order', () => {
    const [spyglass, plate] = SKIRMISH_TAB_MARK_BATCH_IDS.view;
    const viewVersion = (id: string, batchId: string, candidateIndex: number) => version({
      id,
      slot: SKIRMISH_TAB_MARK_SLOT.view,
      metadata: { candidateIndex },
      provenance: { liveMediaBatch: { batchId } },
    });
    const grouped = skirmishTabMarkCandidates(catalog([
      viewVersion('plate-2', plate, 2),
      viewVersion('spyglass-2', spyglass, 2),
      viewVersion('plate-1', plate, 1),
      viewVersion('spyglass-1', spyglass, 1),
    ]));
    expect(grouped.get('view')?.map((entry) => entry.id))
      .toEqual(['spyglass-1', 'spyglass-2', 'plate-1', 'plate-2']);
  });

  it('gives every seat at least one declared batch', () => {
    for (const seat of SKIRMISH_TAB_MARKS) {
      expect(SKIRMISH_TAB_MARK_BATCH_IDS[seat].length).toBeGreaterThan(0);
    }
  });
});
