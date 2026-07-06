import { describe, expect, it } from 'vitest';
import { roadEdgeKey } from './featureAutotile';
import { resolveWallArtFaces, wallArt, wallArtAtEdge, wallArtSpanEdges } from './wallArt';

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
});
