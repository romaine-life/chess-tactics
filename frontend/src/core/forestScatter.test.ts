import { describe, expect, it } from 'vitest';
import {
  FOREST_SCATTER_DEFAULTS,
  floatingArtworkGroundPoint,
  forestGroundFootprint,
  forestGroundFootprintWithinArea,
  forestPlacementId,
  isForestMember,
  scatterForest,
  sortFloatingArtworkByDepth,
  type ForestScatterParams,
  type ForestSpeciesGeometry,
} from './forestScatter';
import { unprojectBoardPoint } from '../render/boardProjection';
import type { Direction } from '../ui/unitCatalog';
import type { FloatingArtworkPlacement } from '../ui/boardCode';

const ALL_DIRECTIONS: Direction[] = [
  'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west',
];

// Two deliberately different-sized sources: a mixed-size forest is where ground-plane seating
// either works or visibly fails.
const SPRITES: Record<string, {
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
  scale: number;
  groundFootprint: { w: number; h: number };
}> = {
  'tall-tree': {
    w: 200, h: 400, anchorX: 100, anchorY: 380, scale: 0.4, groundFootprint: { w: 40, h: 20 },
  },
  'short-tree': {
    w: 100, h: 120, anchorX: 50, anchorY: 110, scale: 0.3, groundFootprint: { w: 30, h: 16 },
  },
  'one-view': {
    w: 64, h: 64, anchorX: 32, anchorY: 60, scale: 1, groundFootprint: { w: 12, h: 8 },
  },
};

const geometry: ForestSpeciesGeometry = {
  directions: (id) => (id === 'one-view' ? ['south'] : id in SPRITES ? ALL_DIRECTIONS : []),
  sprite: (id, direction) => (geometry.directions(id).includes(direction) ? SPRITES[id] : undefined),
};

const params = (overrides: Partial<ForestScatterParams> = {}): ForestScatterParams => ({
  ...FOREST_SCATTER_DEFAULTS,
  trees: [{ sourceArtId: 'tall-tree', weight: 1 }],
  spacing: 0,
  clumping: 0,
  falloff: 0,
  ...overrides,
});

const area = { minX: 2, minY: 3, maxX: 13, maxY: 14 };

const run = (
  overrides: Partial<ForestScatterParams> = {},
  existing: FloatingArtworkPlacement[] = [],
  selection = area,
): FloatingArtworkPlacement[] => scatterForest({
  forestId: 'forest-a', area: selection, params: params(overrides), geometry, existing,
});

describe('scatterForest', () => {
  it('uses the measured root contact instead of the sprite rectangle', () => {
    expect(forestGroundFootprint({ x: 10, y: 20 }, SPRITES['tall-tree'], 1)).toEqual({
      x: 10,
      y: 20,
      rx: 8,
      ry: 4,
    });
    // The rendered frame is 80x160 after source scale; none of that canopy/frame extent enters
    // the 16x8 root/base footprint above.
    expect(SPRITES['tall-tree'].w * SPRITES['tall-tree'].scale).toBe(80);
    expect(SPRITES['tall-tree'].h * SPRITES['tall-tree'].scale).toBe(160);
  });

  it('keeps every tree root/base footprint inside the selected grid cells', () => {
    const placements = run();
    expect(placements.length).toBeGreaterThan(5);
    for (const placement of placements) {
      const ground = floatingArtworkGroundPoint(placement, geometry);
      expect(ground).toBeDefined();
      const sprite = geometry.sprite(placement.sourceArtId, placement.direction)!;
      const footprint = forestGroundFootprint(ground!, sprite, placement.scale);
      expect(forestGroundFootprintWithinArea(footprint, area)).toBe(true);
    }
  });

  it('allows the sprite and canopy to overhang while the root/base stays inside', () => {
    const selection = { minX: 2, minY: 3, maxX: 5, maxY: 6 };
    const placements = run({ density: 4, jitter: 1, scaleMin: 1, scaleMax: 1 }, [], selection);
    expect(placements.length).toBeGreaterThan(0);
    expect(placements.some((placement) => {
      const sprite = geometry.sprite(placement.sourceArtId, placement.direction)!;
      const scale = sprite.scale * placement.scale;
      const boxCorners = [
        { left: placement.pixelX - sprite.w * scale / 2, top: placement.pixelY - sprite.h * scale / 2 },
        { left: placement.pixelX + sprite.w * scale / 2, top: placement.pixelY - sprite.h * scale / 2 },
        { left: placement.pixelX - sprite.w * scale / 2, top: placement.pixelY + sprite.h * scale / 2 },
        { left: placement.pixelX + sprite.w * scale / 2, top: placement.pixelY + sprite.h * scale / 2 },
      ].map(unprojectBoardPoint);
      return boxCorners.some((corner) => (
        corner.x < selection.minX - 0.5 || corner.x > selection.maxX + 0.5
        || corner.y < selection.minY - 0.5 || corner.y > selection.maxY + 0.5
      ));
    })).toBe(true);
  });

  it('is deterministic for the same seed and grid selection', () => {
    expect(run()).toEqual(run());
  });

  it('reshuffles the whole forest when the seed changes', () => {
    const a = run({ seed: 1 });
    const b = run({ seed: 2 });
    expect(a).not.toEqual(b);
    expect(b.length).toBeGreaterThan(0);
  });

  it('is idempotent: repainting the same ground adds nothing', () => {
    const first = run();
    expect(first.length).toBeGreaterThan(0);
    expect(run({}, first)).toEqual([]);
  });

  it('adds only the new cells when a second selection overlaps the first', () => {
    const first = run();
    const second = run({}, first, {
      minX: area.minX + 8, minY: area.minY, maxX: area.maxX + 8, maxY: area.maxY,
    });
    const firstIds = new Set(first.map((placement) => placement.id));
    expect(second.length).toBeGreaterThan(0);
    expect(second.some((placement) => firstIds.has(placement.id))).toBe(false);
  });

  it('raises the tree count with density', () => {
    expect(run({ density: 3 }).length).toBeGreaterThan(run({ density: 0.5 }).length);
  });

  it('keeps every candidate in its actual board cell while randomness moves it off the clean grid point', () => {
    const offCentre = (placements: FloatingArtworkPlacement[]): number => placements.filter((placement) => {
      const ground = floatingArtworkGroundPoint(placement, geometry)!;
      const cell = unprojectBoardPoint({ left: ground.x, top: ground.y });
      const [, , gridX, gridY] = placement.id.split('.');
      expect(cell.x).toBeGreaterThanOrEqual(Number(gridX) - 0.5);
      expect(cell.x).toBeLessThanOrEqual(Number(gridX) + 0.5);
      expect(cell.y).toBeGreaterThanOrEqual(Number(gridY) - 0.5);
      expect(cell.y).toBeLessThanOrEqual(Number(gridY) + 0.5);
      return Math.hypot(cell.x - Number(gridX), cell.y - Number(gridY)) > 0.05;
    }).length;
    expect(offCentre(run({ density: 1, jitter: 0 }))).toBe(0);
    expect(offCentre(run({ density: 1, jitter: 1 }))).toBeGreaterThan(0);
  });

  it('keeps mixed-size Forest art on one ground plane', () => {
    const placements = run({
      trees: [{ sourceArtId: 'tall-tree', weight: 1 }, { sourceArtId: 'short-tree', weight: 1 }],
      jitter: 0,
      scaleMin: 1,
      scaleMax: 1,
    });
    const sources = new Set(placements.map((placement) => placement.sourceArtId));
    expect(sources.size).toBe(2);
    // Different sprite heights and anchors, but the derived ground rows must still line up.
    const rows = new Set(placements.map((placement) => Math.round(floatingArtworkGroundPoint(placement, geometry)!.y)));
    const perSource = new Map<string, Set<number>>();
    for (const placement of placements) {
      const row = Math.round(floatingArtworkGroundPoint(placement, geometry)!.y);
      if (!perSource.has(placement.sourceArtId)) perSource.set(placement.sourceArtId, new Set());
      perSource.get(placement.sourceArtId)!.add(row);
    }
    for (const set of perSource.values()) {
      for (const row of set) expect(rows.has(row)).toBe(true);
    }
    // The stored pixel pair must differ per source even at a shared ground row, because it is
    // an image-box centre rather than the contact point.
    const tall = placements.find((placement) => placement.sourceArtId === 'tall-tree')!;
    const short = placements.find((placement) => placement.sourceArtId === 'short-tree')!;
    const tallGround = floatingArtworkGroundPoint(tall, geometry)!;
    const shortGround = floatingArtworkGroundPoint(short, geometry)!;
    expect(tall.pixelY - tallGround.y).not.toBeCloseTo(short.pixelY - shortGround.y, 1);
  });

  it('varies scale within the requested range and pins it when the range collapses', () => {
    const varied = run({ scaleMin: 0.6, scaleMax: 1.6 });
    const scales = varied.map((placement) => placement.scale);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.6);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.6);
    expect(new Set(scales).size).toBeGreaterThan(1);
    expect(new Set(run({ scaleMin: 1, scaleMax: 1 }).map((placement) => placement.scale))).toEqual(new Set([1]));
  });

  it('draws random facings when asked and a single facing otherwise', () => {
    expect(new Set(run({ randomFacing: true }).map((placement) => placement.direction)).size).toBeGreaterThan(1);
    expect(new Set(run({ randomFacing: false, facing: 'west' }).map((placement) => placement.direction)))
      .toEqual(new Set(['west']));
  });

  it('falls back to an installed facing when the requested one is missing', () => {
    const placements = run({ trees: [{ sourceArtId: 'one-view', weight: 1 }], randomFacing: false, facing: 'west' });
    expect(placements.length).toBeGreaterThan(0);
    expect(new Set(placements.map((placement) => placement.direction))).toEqual(new Set(['south']));
  });

  it('drops recipe entries with no installed artwork instead of emitting broken placements', () => {
    expect(run({ trees: [{ sourceArtId: 'missing', weight: 1 }] })).toEqual([]);
    const mixed = run({
      trees: [{ sourceArtId: 'missing', weight: 1 }, { sourceArtId: 'tall-tree', weight: 1 }],
    });
    expect(mixed.length).toBeGreaterThan(0);
    expect(new Set(mixed.map((placement) => placement.sourceArtId))).toEqual(new Set(['tall-tree']));
  });

  it('honours minimum spacing against both the batch and existing scene art', () => {
    const spaced = run({ spacing: 80, density: 4 });
    const grounds = spaced.map((placement) => floatingArtworkGroundPoint(placement, geometry)!);
    for (let i = 0; i < grounds.length; i += 1) {
      for (let j = i + 1; j < grounds.length; j += 1) {
        expect(Math.hypot(grounds[i].x - grounds[j].x, grounds[i].y - grounds[j].y)).toBeGreaterThanOrEqual(80);
      }
    }
    expect(run({ spacing: 80, density: 4 }).length).toBeLessThan(run({ spacing: 0, density: 4 }).length);
  });

  it('thins the selected grid edge when falloff is on', () => {
    const edgeShare = (placements: FloatingArtworkPlacement[]): number => {
      if (!placements.length) return 0;
      const outer = placements.filter((placement) => {
        const [, , xText, yText] = placement.id.split('.');
        const x = Number(xText);
        const y = Number(yText);
        return x === area.minX || x === area.maxX || y === area.minY || y === area.maxY;
      });
      return outer.length / placements.length;
    };
    expect(edgeShare(run({ falloff: 0.9, density: 4 }))).toBeLessThan(edgeShare(run({ falloff: 0, density: 4 })));
  });

  it('emits ids and coordinates the board-code sanitizer accepts', () => {
    for (const placement of run()) {
      expect(placement.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/);
      expect(Number.isSafeInteger(placement.pixelX)).toBe(true);
      expect(Number.isSafeInteger(placement.pixelY)).toBe(true);
      expect(placement.scale).toBeGreaterThanOrEqual(0.1);
      expect(placement.scale).toBeLessThanOrEqual(8);
    }
    expect(forestPlacementId('forest-a', 1, -3, 7, 2)).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/);
  });

  it('scopes generated placement membership to one saved Forest instance', () => {
    const placement = (id: string): FloatingArtworkPlacement => ({
      id, sourceArtId: 'tall-tree', pixelX: 0, pixelY: 0, direction: 'south', scale: 1,
    });
    const member = placement(forestPlacementId('forest-a', 12, -3, 7, 2));
    expect(isForestMember(member, 'forest-a')).toBe(true);
    expect(isForestMember(member, 'forest-b')).toBe(false);
    expect(isForestMember(placement('art-owner-tree'), 'forest-a')).toBe(false);
  });

  it('keeps mixed Section identities unique while preserving Forest ownership', () => {
    const first = forestPlacementId('forest-a', 12, 3, 7, 0, 'section-a');
    const second = forestPlacementId('forest-a', 12, 3, 7, 0, 'section-b');
    expect(first).not.toBe(second);
    for (const id of [first, second]) {
      expect(isForestMember({ id, sourceArtId: 'tall-tree', pixelX: 0, pixelY: 0, direction: 'south', scale: 1 }, 'forest-a')).toBe(true);
    }
  });

  it('uses explicit relative weights when choosing Forest art', () => {
    const placements = run({
      density: 6,
      trees: [{ sourceArtId: 'tall-tree', weight: 9 }, { sourceArtId: 'short-tree', weight: 1 }],
    });
    const tall = placements.filter((placement) => placement.sourceArtId === 'tall-tree').length;
    const short = placements.filter((placement) => placement.sourceArtId === 'short-tree').length;
    expect(short).toBeGreaterThan(0);
    expect(tall).toBeGreaterThan(short * 4);
  });

  it('does not collide when two saved Forests reuse the same seed and cells', () => {
    const first = run();
    const second = scatterForest({
      forestId: 'forest-b', area, params: params(), geometry, existing: first,
    });
    expect(second.length).toBeGreaterThan(0);
    expect(second.some((placement) => isForestMember(placement, 'forest-b'))).toBe(true);
    expect(second.some((placement) => isForestMember(placement, 'forest-a'))).toBe(false);
  });

  // Shift-drag lets one Forest own several patches. The scatter fills their UNION, so a Forest can
  // wrap a lake or run on past the edge of one screenful of board.
  describe('several patches of ground', () => {
    const cellOf = (placement: FloatingArtworkPlacement) => {
      const ground = floatingArtworkGroundPoint(placement, geometry)!;
      const point = unprojectBoardPoint({ left: ground.x, top: ground.y });
      return { x: Math.round(point.x), y: Math.round(point.y) };
    };

    it('changes nothing when the one patch is the area itself', () => {
      const plain = run();
      const stated = scatterForest({
        forestId: 'forest-a', area, areas: [area], params: params(), geometry, existing: [],
      });
      expect(stated).toEqual(plain);
    });

    it('leaves the hole in an L-shape empty', () => {
      const arm = { minX: 2, minY: 3, maxX: 7, maxY: 14 };
      const foot = { minX: 8, minY: 10, maxX: 13, maxY: 14 };
      const placements = scatterForest({
        forestId: 'forest-a', area, areas: [arm, foot], params: params(), geometry, existing: [],
      });
      expect(placements.length).toBeGreaterThan(0);
      const inside = (cell: { x: number; y: number }) => (
        (cell.x >= arm.minX && cell.x <= arm.maxX && cell.y >= arm.minY && cell.y <= arm.maxY)
        || (cell.x >= foot.minX && cell.x <= foot.maxX && cell.y >= foot.minY && cell.y <= foot.maxY)
      );
      expect(placements.map(cellOf).every(inside)).toBe(true);
      // The missing corner of the bounding box is genuinely covered by neither patch.
      expect(placements.map(cellOf).some((cell) => cell.x > 7 && cell.y < 10)).toBe(false);
    });

    it('grows across the join instead of feathering out a bare seam', () => {
      const left = { minX: 2, minY: 3, maxX: 7, maxY: 14 };
      const right = { minX: 8, minY: 3, maxX: 13, maxY: 14 };
      const joined = scatterForest({
        forestId: 'forest-a',
        area,
        areas: [left, right],
        params: params({ falloff: 0.6 }),
        geometry,
        existing: [],
      });
      const seam = joined.map(cellOf).filter((cell) => cell.x === 7 || cell.x === 8).length;
      expect(seam).toBeGreaterThan(0);
      // Two patches that tile the same ground are ONE piece of ground: the same cells, the same
      // edge ramp, the same trees as the single rectangle they add up to.
      expect(joined).toEqual(scatterForest({
        forestId: 'forest-a', area, params: params({ falloff: 0.6 }), geometry, existing: [],
      }));
    });

    it('fills only the part of a territory the Forest actually owns', () => {
      const patch = { minX: 2, minY: 3, maxX: 6, maxY: 8 };
      const placements = scatterForest({
        forestId: 'forest-a', area, areas: [patch], params: params(), geometry, existing: [],
      });
      expect(placements.length).toBeGreaterThan(0);
      expect(placements.map(cellOf).every(
        (cell) => cell.x >= patch.minX && cell.x <= patch.maxX
          && cell.y >= patch.minY && cell.y <= patch.maxY,
      )).toBe(true);
    });

    it('produces nothing when the territory misses every patch', () => {
      expect(scatterForest({
        forestId: 'forest-a',
        area,
        areas: [{ minX: 40, minY: 40, maxX: 44, maxY: 44 }],
        params: params(),
        geometry,
        existing: [],
      })).toEqual([]);
    });
  });

  it('returns a batch already in back-to-front paint order', () => {
    const grounds = run().map((placement) => floatingArtworkGroundPoint(placement, geometry)!.y);
    expect([...grounds].sort((a, b) => a - b)).toEqual(grounds);
  });

  it('produces nothing without a positive recipe entry or density', () => {
    expect(run({ trees: [] })).toEqual([]);
    expect(run({ trees: [{ sourceArtId: 'tall-tree', weight: 0 }] })).toEqual([]);
    expect(run({ density: 0 })).toEqual([]);
  });
});

describe('sortFloatingArtworkByDepth', () => {
  it('orders scene art back to front by ground contact', () => {
    const at = (id: string, sourceArtId: string, pixelY: number): FloatingArtworkPlacement => ({
      id, sourceArtId, pixelX: 0, pixelY, direction: 'south', scale: 1,
    });
    const sorted = sortFloatingArtworkByDepth(
      [at('a', 'tall-tree', 400), at('b', 'short-tree', 100), at('c', 'tall-tree', 50)],
      geometry,
    );
    const depths = sorted.map((placement) => floatingArtworkGroundPoint(placement, geometry)!.y);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
  });

  it('keeps unresolvable art at the back rather than dropping it', () => {
    const unknown: FloatingArtworkPlacement = {
      id: 'x', sourceArtId: 'missing', pixelX: 0, pixelY: 0, direction: 'south', scale: 1,
    };
    const known: FloatingArtworkPlacement = {
      id: 'y', sourceArtId: 'tall-tree', pixelX: 0, pixelY: 0, direction: 'south', scale: 1,
    };
    expect(sortFloatingArtworkByDepth([known, unknown], geometry)).toEqual([unknown, known]);
  });
});
