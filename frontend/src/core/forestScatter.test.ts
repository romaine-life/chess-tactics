import { describe, expect, it } from 'vitest';
import {
  FOREST_SCATTER_DEFAULTS,
  eraseForestArea,
  floatingArtworkGroundPoint,
  forestLatticeStep,
  forestPlacementId,
  scatterForest,
  sortFloatingArtworkByDepth,
  type ForestScatterParams,
  type ForestSpeciesGeometry,
} from './forestScatter';
import type { Direction } from '../ui/unitCatalog';
import type { FloatingArtworkPlacement } from '../ui/boardCode';

const ALL_DIRECTIONS: Direction[] = [
  'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west',
];

// Two deliberately different-sized sources: a mixed-size forest is where ground-plane seating
// either works or visibly fails.
const SPRITES: Record<string, { w: number; h: number; anchorX: number; anchorY: number; scale: number }> = {
  'tall-tree': { w: 200, h: 400, anchorX: 100, anchorY: 380, scale: 0.4 },
  'short-tree': { w: 100, h: 120, anchorX: 50, anchorY: 110, scale: 0.3 },
  'one-view': { w: 64, h: 64, anchorX: 32, anchorY: 60, scale: 1 },
};

const geometry: ForestSpeciesGeometry = {
  directions: (id) => (id === 'one-view' ? ['south'] : id in SPRITES ? ALL_DIRECTIONS : []),
  sprite: (id, direction) => (geometry.directions(id).includes(direction) ? SPRITES[id] : undefined),
};

const params = (overrides: Partial<ForestScatterParams> = {}): ForestScatterParams => ({
  ...FOREST_SCATTER_DEFAULTS,
  speciesIds: ['tall-tree'],
  avoidPlayableBoard: false,
  spacing: 0,
  clumping: 0,
  falloff: 0,
  ...overrides,
});

const board = { cols: 8, rows: 8 };
const area = { centerX: 900, centerY: 900, radius: 220 };

const run = (
  overrides: Partial<ForestScatterParams> = {},
  existing: FloatingArtworkPlacement[] = [],
  brush = area,
): FloatingArtworkPlacement[] => scatterForest({
  area: brush, params: params(overrides), geometry, board, existing,
});

describe('scatterForest', () => {
  it('produces trees inside the brush and none outside it', () => {
    const placements = run();
    expect(placements.length).toBeGreaterThan(5);
    for (const placement of placements) {
      const ground = floatingArtworkGroundPoint(placement, geometry);
      expect(ground).toBeDefined();
      expect(Math.hypot(ground!.x - area.centerX, ground!.y - area.centerY)).toBeLessThanOrEqual(area.radius);
    }
  });

  it('is deterministic for the same seed and stroke', () => {
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

  it('adds only the new cells when a second stroke overlaps the first', () => {
    const first = run();
    const second = run({}, first, { centerX: area.centerX + 200, centerY: area.centerY, radius: area.radius });
    const firstIds = new Set(first.map((placement) => placement.id));
    expect(second.length).toBeGreaterThan(0);
    expect(second.some((placement) => firstIds.has(placement.id))).toBe(false);
  });

  it('raises the tree count with density', () => {
    expect(run({ density: 3 }).length).toBeGreaterThan(run({ density: 0.5 }).length);
    expect(forestLatticeStep(3)).toBeLessThan(forestLatticeStep(0.5));
  });

  it('seats every tree on the lattice at zero jitter and scatters it off-lattice above zero', () => {
    const step = forestLatticeStep(FOREST_SCATTER_DEFAULTS.density);
    const offLattice = (placements: FloatingArtworkPlacement[]): number => placements.filter((placement) => {
      const ground = floatingArtworkGroundPoint(placement, geometry)!;
      const dx = Math.abs(((ground.x / step) % 1) - 0.5);
      return dx > 0.02;
    }).length;
    expect(offLattice(run({ jitter: 0 }))).toBe(0);
    expect(offLattice(run({ jitter: 1 }))).toBeGreaterThan(0);
  });

  it('keeps a mixed-size species list on one ground plane', () => {
    const placements = run({ speciesIds: ['tall-tree', 'short-tree'], jitter: 0, scaleMin: 1, scaleMax: 1 });
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
    const placements = run({ speciesIds: ['one-view'], randomFacing: false, facing: 'west' });
    expect(placements.length).toBeGreaterThan(0);
    expect(new Set(placements.map((placement) => placement.direction))).toEqual(new Set(['south']));
  });

  it('drops species with no installed artwork instead of emitting broken placements', () => {
    expect(run({ speciesIds: ['missing'] })).toEqual([]);
    const mixed = run({ speciesIds: ['missing', 'tall-tree'] });
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

  it('thins the brush edge when falloff is on', () => {
    const edgeShare = (placements: FloatingArtworkPlacement[]): number => {
      if (!placements.length) return 0;
      const outer = placements.filter((placement) => {
        const ground = floatingArtworkGroundPoint(placement, geometry)!;
        return Math.hypot(ground.x - area.centerX, ground.y - area.centerY) > area.radius * 0.75;
      });
      return outer.length / placements.length;
    };
    expect(edgeShare(run({ falloff: 0.9, density: 4 }))).toBeLessThan(edgeShare(run({ falloff: 0, density: 4 })));
  });

  it('keeps trees off the playable board when asked', () => {
    // A brush centred on the board origin covers playable cells.
    const overBoard = { centerX: 0, centerY: 0, radius: 200 };
    expect(run({ avoidPlayableBoard: false }, [], overBoard).length).toBeGreaterThan(0);
    expect(run({ avoidPlayableBoard: true }, [], overBoard).length)
      .toBeLessThan(run({ avoidPlayableBoard: false }, [], overBoard).length);
  });

  it('emits ids and coordinates the board-code sanitizer accepts', () => {
    for (const placement of run()) {
      expect(placement.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/);
      expect(Number.isSafeInteger(placement.pixelX)).toBe(true);
      expect(Number.isSafeInteger(placement.pixelY)).toBe(true);
      expect(placement.scale).toBeGreaterThanOrEqual(0.1);
      expect(placement.scale).toBeLessThanOrEqual(8);
    }
    expect(forestPlacementId(1, -3, 7)).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/);
  });

  it('returns a batch already in back-to-front paint order', () => {
    const grounds = run().map((placement) => floatingArtworkGroundPoint(placement, geometry)!.y);
    expect([...grounds].sort((a, b) => a - b)).toEqual(grounds);
  });

  it('produces nothing without a species, a radius, or density', () => {
    expect(run({ speciesIds: [] })).toEqual([]);
    expect(run({}, [], { ...area, radius: 0 })).toEqual([]);
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

describe('eraseForestArea', () => {
  it('removes only the art standing inside the brush', () => {
    const placements = run();
    const kept = eraseForestArea(placements, { centerX: area.centerX, centerY: area.centerY, radius: 60 }, geometry);
    expect(kept.length).toBeLessThan(placements.length);
    for (const placement of kept) {
      const ground = floatingArtworkGroundPoint(placement, geometry)!;
      expect(Math.hypot(ground.x - area.centerX, ground.y - area.centerY)).toBeGreaterThan(60);
    }
  });

  it('never drops art whose source geometry is unresolvable', () => {
    const unknown: FloatingArtworkPlacement = {
      id: 'x', sourceArtId: 'missing', pixelX: area.centerX, pixelY: area.centerY, direction: 'south', scale: 1,
    };
    expect(eraseForestArea([unknown], area, geometry)).toEqual([unknown]);
  });
});
