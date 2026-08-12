import { describe, expect, it } from 'vitest';
import {
  BATTLE_LOG_MARK_BATCH_IDS,
  battleLogMarkOptions,
  battleLogSeatFromRoute,
  firstUndecidedSeat,
} from './BattleLogMarkCatalog';
import { BATTLE_LOG_MARK_SLOT } from './shared/BattleLogMark';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';

const BATCH = BATTLE_LOG_MARK_BATCH_IDS.defeat[0];

function version(overrides: Partial<AdminLiveMediaVersion> = {}): AdminLiveMediaVersion {
  return {
    id: 'v1',
    slot: BATTLE_LOG_MARK_SLOT.defeat,
    sourcePath: null,
    domain: 'ui-kit',
    role: 'icon',
    label: 'mark',
    status: 'candidate',
    productionEligible: false,
    metadata: { candidateIndex: 1 },
    provenance: { liveMediaBatch: { batchId: BATCH } },
    nativeEvidence: {},
    reviewEvidence: {},
    rowRevision: 1,
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
    updatedBy: null,
    media: { url: '/api/admin/media/a', sha256: 'a', mediaType: 'image/png', width: 48, height: 48, byteLength: 1 },
    ...overrides,
  } as AdminLiveMediaVersion;
}

function catalog(versions: AdminLiveMediaVersion[], activeVersionId: string | null = null): AdminLiveMediaCatalog {
  return {
    schemaVersion: 1,
    revision: 1,
    updatedAt: '2026-08-12T00:00:00.000Z',
    slots: [{
      slot: BATTLE_LOG_MARK_SLOT.defeat,
      domain: 'ui-kit',
      role: 'icon',
      availabilityPolicy: 'decorative',
      lifecycleState: 'active',
      activeVersionId,
      activatedAt: null,
      retiredAt: null,
      rowRevision: 1,
      metadata: {},
    }],
    versions,
    events: [],
  } as unknown as AdminLiveMediaCatalog;
}

describe('battleLogMarkOptions', () => {
  it('shows one card per candidate index when the same bytes were uploaded twice', () => {
    // This batch WAS uploaded twice — the first pass omitted the `nativeEvidence` acceptance
    // requires — so without collapsing them every option appears on the page twice.
    const options = battleLogMarkOptions(catalog([
      version({ id: 'first' }),
      version({ id: 'second', nativeEvidence: { native1x: true }, createdAt: '2026-08-12T01:00:00.000Z' }),
    ]), 'defeat');
    expect(options.map((entry) => entry.id)).toEqual(['second']);
  });

  it('keeps the version Install can actually accept, not merely the newest', () => {
    // A later upload WITHOUT evidence must not displace an earlier one that has it: the page
    // would then offer a card whose Install fails `media_native_evidence_required`.
    const options = battleLogMarkOptions(catalog([
      version({ id: 'with-evidence', nativeEvidence: { native1x: true } }),
      version({ id: 'later-bare', createdAt: '2026-08-12T02:00:00.000Z' }),
    ]), 'defeat');
    expect(options.map((entry) => entry.id)).toEqual(['with-evidence']);
  });

  it('keeps the installed version alongside the batch so the two can be compared', () => {
    const options = battleLogMarkOptions(catalog([
      version({ id: 'accepted', status: 'accepted', metadata: { candidateIndex: 9 }, provenance: {} }),
      version({ id: 'candidate', nativeEvidence: { native1x: true } }),
    ], 'accepted'), 'defeat');
    expect(options.map((entry) => entry.id).sort()).toEqual(['accepted', 'candidate']);
  });

  it('ignores a family this seat no longer offers, without touching its siblings', () => {
    const options = battleLogMarkOptions(catalog([
      version({ id: 'retired-family', provenance: { liveMediaBatch: { batchId: 'battle-log-defeat-mark-2026-08-11-v1' } } }),
    ]), 'defeat');
    expect(options).toEqual([]);
    // Per-seat, so retiring the wreaths for Victory could not take Draw and Check down with
    // them — the three were generated into one batch.
    expect(BATTLE_LOG_MARK_BATCH_IDS.draw).not.toEqual(BATTLE_LOG_MARK_BATCH_IDS.victory);
    expect(BATTLE_LOG_MARK_BATCH_IDS.check).toEqual(BATTLE_LOG_MARK_BATCH_IDS.draw);
  });
});

describe('battleLogSeatFromRoute', () => {
  it('reads a seat an address names, and only a real one', () => {
    expect(battleLogSeatFromRoute('?cat=logmarks&seat=checkmate')).toBe('checkmate');
    expect(battleLogSeatFromRoute('?cat=logmarks&seat=gold-loss')).toBe('gold-loss');
    expect(battleLogSeatFromRoute('?cat=logmarks&seat=clock')).toBeNull();
    // Stalemate is not a seat — the row wears the draw scales and says the word (ADR-0637).
    expect(battleLogSeatFromRoute('?cat=logmarks&seat=stalemate')).toBeNull();
    expect(battleLogSeatFromRoute('?cat=logmarks')).toBeNull();
  });
});

describe('firstUndecidedSeat', () => {
  it('finds the seat still needing a decision, so a bare link lands on one', () => {
    // Landing on a decided seat makes the owner go and find the undecided ones himself, which
    // is exactly the click the link was supposed to save.
    expect(firstUndecidedSeat(catalog([]))).toBe('victory');
    expect(firstUndecidedSeat(null)).toBeNull();
  });
});
