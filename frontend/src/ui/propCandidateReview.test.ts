import { describe, expect, it } from 'vitest';
import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';
import {
  propCandidateGroups,
  propCandidateSlots,
  propsWithCandidates,
  seatFromAlpha,
} from './propCandidateReview';

const version = (over: Partial<AdminLiveMediaVersion>): AdminLiveMediaVersion => ({
  id: 'v', slot: 'props/rock/front.png', sourcePath: null, domain: 'prop', role: 'media',
  label: 'candidate', status: 'candidate', productionEligible: false, metadata: {},
  provenance: {}, nativeEvidence: {}, reviewEvidence: {}, rowRevision: 1,
  createdAt: '', updatedAt: '', updatedBy: null,
  media: { url: '/api/media/aa', sha256: 'aa', mediaType: 'image/png', byteLength: 1, width: 56, height: 56 },
  ...over,
});

const catalog = (versions: AdminLiveMediaVersion[]): AdminLiveMediaCatalog => ({
  revision: 1, schemaVersion: 1, updatedAt: '', slots: [], versions, events: [], eventsPage: {},
} as unknown as AdminLiveMediaCatalog);

describe('prop candidate grouping', () => {
  it('names both depth-half slots one prop draws through', () => {
    expect(propCandidateSlots('rock')).toEqual(['props/rock/back.png', 'props/rock/front.png']);
  });

  // A flat-contact prop is one picture shown through two slots. Reviewing the halves separately
  // would let a front from one candidate be installed against a back from another.
  it('groups the halves that share content into one reviewable candidate', () => {
    const groups = propCandidateGroups(catalog([
      version({ id: 'front-a', slot: 'props/rock/front.png' }),
      version({ id: 'back-a', slot: 'props/rock/back.png' }),
    ]), 'rock');

    expect(groups).toHaveLength(1);
    expect(groups[0].versions.map((entry) => entry.id).sort()).toEqual(['back-a', 'front-a']);
  });

  it('withholds a candidate that only reached one half', () => {
    const groups = propCandidateGroups(catalog([
      version({ id: 'front-only', slot: 'props/rock/front.png' }),
    ]), 'rock');

    expect(groups).toEqual([]);
  });

  it('treats a candidate as approved only when every half covers the reviewed bytes', () => {
    const approved = { approved: true, contentSha256: 'aa' };
    const partly = propCandidateGroups(catalog([
      version({ id: 'front-a', slot: 'props/rock/front.png', reviewEvidence: approved }),
      version({ id: 'back-a', slot: 'props/rock/back.png' }),
    ]), 'rock');
    const fully = propCandidateGroups(catalog([
      version({ id: 'front-a', slot: 'props/rock/front.png', reviewEvidence: approved }),
      version({ id: 'back-a', slot: 'props/rock/back.png', reviewEvidence: approved }),
    ]), 'rock');

    expect(partly[0].reviewed).toBe(false);
    expect(fully[0].reviewed).toBe(true);
  });

  it('ignores accepted versions and other props', () => {
    expect(propsWithCandidates(catalog([
      version({ slot: 'props/rock/front.png' }),
      version({ slot: 'props/oak/front.png' }),
      version({ slot: 'props/cabin/front.png', status: 'accepted' }),
    ]))).toEqual(['oak', 'rock']);
  });
});

describe('candidate seating', () => {
  // 8x8: a 6px-wide block with its bottom row at y=5, offset to the right of frame centre. The
  // contact point must follow the drawing, not the frame — a sprite drawn off-centre is common.
  const alpha = (rows: Array<[number, number, number]>): Uint8ClampedArray => {
    const data = new Uint8ClampedArray(8 * 8 * 4);
    for (const [y, first, last] of rows) {
      for (let x = first; x <= last; x += 1) data[(y * 8 + x) * 4 + 3] = 255;
    }
    return data;
  };

  it('seats the contact at the centre of the lowest painted rows', () => {
    const seat = seatFromAlpha('k', alpha([[3, 2, 7], [4, 2, 7], [5, 3, 6]]), 8, 8, 6);

    expect(seat.anchorY).toBe(5);
    expect(seat.anchorX).toBe(4);
  });

  it('normalizes the widest row to the installed art width so shape is compared, not size', () => {
    const wide = seatFromAlpha('k', alpha([[5, 0, 7]]), 8, 8, 4);
    const narrow = seatFromAlpha('k', alpha([[5, 3, 6]]), 8, 8, 4);

    expect(wide.scale).toBeCloseTo(0.5, 3);
    expect(narrow.scale).toBeCloseTo(1, 3);
  });

  it('never returns a zero scale for an empty frame', () => {
    expect(seatFromAlpha('k', alpha([]), 8, 8, 6).scale).toBe(1);
  });
});
