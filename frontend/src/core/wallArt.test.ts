import { describe, expect, it } from 'vitest';
import { roadEdgeKey } from './featureAutotile';
import { applyLiveWallArt, currentWallArt, resolveWallArtFaces, wallArt, wallArtAtEdge, wallArtSpanEdges } from './wallArt';

describe('wall art', () => {
  it('expands placeable wall art across its configured span', () => {
    const bounds = { cols: 4, rows: 4 };
    const anchor = roadEdgeKey(0, 0, -1, 0);

    expect(wallArt('banner-stone-wall')?.span).toBe(2);
    expect(wallArtSpanEdges(anchor, 'banner-stone-wall', bounds)).toEqual([
      roadEdgeKey(0, 0, -1, 0),
      roadEdgeKey(0, 1, -1, 1),
    ]);
  });

  it('renders mounted artwork once from the anchor edge', () => {
    const bounds = { cols: 4, rows: 4 };
    const placements = {
      [roadEdgeKey(0, 0, -1, 0)]: 'banner-stone-wall',
    };

    const faces = resolveWallArtFaces(placements, bounds);

    expect(faces.get('0,0')?.west).toBe('banner-stone-wall');
    expect(faces.get('0,1')?.west).toBeUndefined();
  });

  it('finds a spanned wall art anchor from any covered edge', () => {
    const bounds = { cols: 4, rows: 4 };
    const anchor = roadEdgeKey(0, 0, -1, 0);
    const second = roadEdgeKey(0, 1, -1, 1);
    const placements = { [anchor]: 'banner-stone-wall' };

    expect(wallArtAtEdge(second, placements, bounds)).toEqual({
      anchorEdge: anchor,
      artId: 'banner-stone-wall',
      edges: [anchor, second],
    });
  });

  it('registers every mirror treatment with both faces and mandatory live optics', () => {
    for (const [id, span] of [
      ['mirror-keep-wall', 1],
      ['mirror-court-oval-wall', 1],
      ['mirror-chapel-glass-wall', 1],
      ['mirror-witch-eye-wall', 1],
      ['mirror-grand-gallery-wall', 3],
    ] as const) {
      const art = wallArt(id);
      expect(art?.span).toBe(span);
      expect(art?.slots.map((slot) => slot.face)).toEqual(['west', 'north']);
      expect(art?.slots.every((slot) => slot.sourceId.startsWith(id.replace(/-wall$/, '')))).toBe(true);
      expect(art?.reflection?.opacity).toBeGreaterThan(0);
      expect(Object.keys(art?.reflection ?? {})).toEqual(['opacity']);
    }
  });

  it('retires persisted lens, FOV, and reflected-scale keys when live wall art is normalized', () => {
    const before = structuredClone(currentWallArt());
    const keep = before['mirror-keep-wall'];
    try {
      expect(applyLiveWallArt({
        'mirror-keep-wall': {
          ...keep,
          reflection: {
            opacity: 0.61,
            mode: 'convex',
            fieldOfView: 9,
            subjectScale: 0.2,
          },
        } as unknown as typeof keep,
      })).toBe(true);
      expect(currentWallArt()['mirror-keep-wall'].reflection).toEqual({ opacity: 0.61 });
    } finally {
      applyLiveWallArt(before);
    }
  });
});
