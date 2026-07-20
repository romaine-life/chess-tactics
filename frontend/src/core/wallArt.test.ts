import { beforeAll, describe, expect, it } from 'vitest';
import { roadEdgeKey } from './featureAutotile';
import { currentWallArt, resolveWallArtFaces, wallArt, wallArtAtEdge, wallArtSpanEdges } from './wallArt';
import { applyTestDrawableCatalog } from '../test/drawableCatalog';

beforeAll(() => applyTestDrawableCatalog());

describe('wall art', () => {
  it('expands placeable wall art across its configured span', () => {
    const bounds = { cols: 4, rows: 4 };
    const anchor = roadEdgeKey(0, 0, -1, 0);

    expect(wallArt('test-banner-pair')?.span).toBe(2);
    expect(wallArtSpanEdges(anchor, 'test-banner-pair', bounds)).toEqual([
      roadEdgeKey(0, 0, -1, 0),
      roadEdgeKey(0, 1, -1, 1),
    ]);
  });

  it('renders mounted artwork once from the anchor edge', () => {
    const bounds = { cols: 4, rows: 4 };
    const placements = {
      [roadEdgeKey(0, 0, -1, 0)]: 'test-banner-pair',
    };

    const faces = resolveWallArtFaces(placements, bounds);

    expect(faces.get('0,0')?.west).toBe('test-banner-pair');
    expect(faces.get('0,1')?.west).toBeUndefined();
  });

  it('finds a spanned wall art anchor from any covered edge', () => {
    const bounds = { cols: 4, rows: 4 };
    const anchor = roadEdgeKey(0, 0, -1, 0);
    const second = roadEdgeKey(0, 1, -1, 1);
    const placements = { [anchor]: 'test-banner-pair' };

    expect(wallArtAtEdge(second, placements, bounds)).toEqual({
      anchorEdge: anchor,
      artId: 'test-banner-pair',
      edges: [anchor, second],
    });
  });

  it('registers every mirror treatment with both faces and mandatory live optics', () => {
    for (const [id, span] of [
      ['test-art-mirror-keep', 1],
      ['test-art-mirror-court-oval', 1],
      ['test-art-mirror-chapel-glass', 1],
      ['test-art-mirror-witch-eye', 1],
      ['test-art-mirror-grand-gallery', 3],
    ] as const) {
      const art = wallArt(id);
      expect(art?.span).toBe(span);
      expect(art?.slots.map((slot) => slot.face)).toEqual(['west', 'north']);
      expect(art?.slots.every((slot) => slot.sourceId === `test-${id.replace(/^test-art-/, '')}`)).toBe(true);
      expect(art?.reflection?.opacity).toBeGreaterThan(0);
      expect(Object.keys(art?.reflection ?? {})).toEqual(['opacity']);
    }
  });

  it('projects the installed database records into the current wall-art contract', () => {
    expect(currentWallArt()['test-art-mirror-keep'].reflection).toEqual({ opacity: 0.75 });
  });
});
