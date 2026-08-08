import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaVersion } from '../../net/liveMediaAdmin';
import {
  RUN_CARD_COST_CROWN_SLOT,
  runCardCostCrownCandidates,
} from './runCardCostCrown';

function version(overrides: Partial<AdminLiveMediaVersion> = {}): AdminLiveMediaVersion {
  return {
    id: 'v1',
    slot: RUN_CARD_COST_CROWN_SLOT,
    status: 'candidate',
    label: 'Cost crown',
    rowRevision: 1,
    media: { sha256: 'a'.repeat(64), mediaType: 'image/png', width: 64, height: 64, url: '/u', immutableUrl: '/i' },
    ...overrides,
  } as AdminLiveMediaVersion;
}

describe('the priceless coin mark candidates', () => {
  it('offers only live marks of this slot at its native size', () => {
    const offered = runCardCostCrownCandidates([
      version({ id: 'installed', status: 'accepted', label: 'bold-five' }),
      version({ id: 'waiting', label: 'royal-purple' }),
      // A withdrawn mark must not be put back in front of the owner.
      version({ id: 'withdrawn', status: 'archived' as AdminLiveMediaVersion['status'] }),
      // Another slot's media, and a raster that is not the mark's native size.
      version({ id: 'other-slot', slot: 'ui/run/card-prototypes/cost-coin-v1.png' }),
      version({ id: 'wrong-size', media: { sha256: 'b'.repeat(64), mediaType: 'image/png', width: 112, height: 112, url: '/u', immutableUrl: '/i' } }),
    ], 'installed');

    expect(offered.map((candidate) => candidate.versionId)).toEqual(['installed', 'waiting']);
    expect(offered[0].installed).toBe(true);
    expect(offered[1].installed).toBe(false);
    expect(offered[0].label).toBe('bold-five');
  });

  it('drops a mark with no readable media rather than offering an empty seat', () => {
    expect(runCardCostCrownCandidates([version({ media: undefined })], null)).toEqual([]);
  });
});
