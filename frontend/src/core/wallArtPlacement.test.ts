import { describe, expect, it } from 'vitest';
import { roadEdgeKey } from './featureAutotile';
import { wallArtIdOrDefault, wallArtPlacementSpanAtEdge } from './wallArt';

describe('wall art placement spans', () => {
  const bounds = { cols: 6, rows: 6 };

  it('normalizes every clicked segment of an exact west-wall run to one anchor', () => {
    const run = Array.from({ length: 3 }, (_, y) => roadEdgeKey(0, y, -1, y));
    const walls = new Set(run);

    for (const clicked of run) {
      expect(wallArtPlacementSpanAtEdge(
        clicked,
        'mirror-grand-gallery-wall',
        bounds,
        (edge) => walls.has(edge),
      )).toEqual({ anchorEdge: run[0], edges: run });
    }
  });

  it('normalizes every clicked segment of an exact north-wall run to one anchor', () => {
    const run = Array.from({ length: 3 }, (_, x) => roadEdgeKey(x, 0, x, -1));
    const walls = new Set(run);

    for (const clicked of run) {
      expect(wallArtPlacementSpanAtEdge(
        clicked,
        'mirror-grand-gallery-wall',
        bounds,
        (edge) => walls.has(edge),
      )).toEqual({ anchorEdge: run[0], edges: run });
    }
  });

  it('prefers the clicked edge as the anchor when more than one complete span fits', () => {
    const walls = new Set(Array.from({ length: 5 }, (_, x) => roadEdgeKey(x, 0, x, -1)));
    const clicked = roadEdgeKey(1, 0, 1, -1);

    expect(wallArtPlacementSpanAtEdge(
      clicked,
      'mirror-grand-gallery-wall',
      bounds,
      (edge) => walls.has(edge),
    )).toEqual({
      anchorEdge: clicked,
      edges: [clicked, roadEdgeKey(2, 0, 2, -1), roadEdgeKey(3, 0, 3, -1)],
    });
  });

  it('rejects a run with any missing supporting wall', () => {
    const first = roadEdgeKey(0, 0, 0, -1);
    const third = roadEdgeKey(2, 0, 2, -1);
    const walls = new Set([first, third]);

    expect(wallArtPlacementSpanAtEdge(
      first,
      'mirror-grand-gallery-wall',
      bounds,
      (edge) => walls.has(edge),
    )).toBeNull();
  });

  it('uses the same catalog fallback for a missing or invalid routed brush', () => {
    expect(wallArtIdOrDefault(undefined)).toBe('banner-stone-wall');
    expect(wallArtIdOrDefault('not-real-wall-art')).toBe('banner-stone-wall');
    expect(wallArtIdOrDefault('mirror-grand-gallery-wall')).toBe('mirror-grand-gallery-wall');
  });
});
