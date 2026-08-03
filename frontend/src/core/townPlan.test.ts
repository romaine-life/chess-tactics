import { describe, expect, it } from 'vitest';
import {
  TOWN_PLAN_DEFAULTS,
  TOWN_PLAN_KINDS,
  facingTowards,
  isTownMember,
  planTown,
  townIdPrefix,
  townStreets,
  type TownPlanKind,
  type TownPlanParams,
} from './townPlan';
import { floatingArtworkGroundPoint, type ForestSpeciesGeometry } from './forestScatter';
import { projectBoardPoint } from '@chess-tactics/board-render';
import type { Direction } from '../ui/unitCatalog';
import type { FloatingArtworkPlacement } from '../ui/boardCode';

const ALL_DIRECTIONS: Direction[] = [
  'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west',
];

const SPRITES: Record<string, { w: number; h: number; anchorX: number; anchorY: number; scale: number }> = {
  cottage: { w: 512, h: 512, anchorX: 256, anchorY: 256, scale: 0.6 },
  cabin: { w: 400, h: 300, anchorX: 200, anchorY: 280, scale: 0.5 },
  lodge: { w: 512, h: 512, anchorX: 256, anchorY: 256, scale: 0.7 },
  windmill: { w: 512, h: 512, anchorX: 256, anchorY: 256, scale: 0.45 },
};

const geometry: ForestSpeciesGeometry = {
  directions: (id) => (id in SPRITES ? ALL_DIRECTIONS : []),
  sprite: (id, direction) => (id in SPRITES && ALL_DIRECTIONS.includes(direction) ? SPRITES[id] : undefined),
};

const board = { cols: 8, rows: 8 };
const CENTER = { x: 1400, y: 1400 };

const params = (overrides: Partial<TownPlanParams> = {}): TownPlanParams => ({
  ...TOWN_PLAN_DEFAULTS,
  buildingIds: ['cottage', 'cabin', 'lodge'],
  avoidPlayableBoard: false,
  ...overrides,
});

const run = (
  overrides: Partial<TownPlanParams> = {},
  existing: FloatingArtworkPlacement[] = [],
  center = CENTER,
): FloatingArtworkPlacement[] => planTown({
  centerX: center.x, centerY: center.y, params: params(overrides), geometry, board, existing,
});

const groundOf = (placement: FloatingArtworkPlacement) => floatingArtworkGroundPoint(placement, geometry)!;

/** Screen-space unit vector a facing points along, derived the same way the planner does. */
const facingVector = (direction: Direction): { x: number; y: number } => {
  const deltas: Record<Direction, { x: number; y: number }> = {
    north: { x: 0, y: -1 }, 'north-east': { x: 1, y: -1 }, east: { x: 1, y: 0 },
    'south-east': { x: 1, y: 1 }, south: { x: 0, y: 1 }, 'south-west': { x: -1, y: 1 },
    west: { x: -1, y: 0 }, 'north-west': { x: -1, y: -1 },
  };
  const seat = projectBoardPoint(deltas[direction]);
  const length = Math.hypot(seat.left, seat.top) || 1;
  return { x: seat.left / length, y: seat.top / length };
};

describe('facingTowards', () => {
  it('matches the compass layout: south points down-left, east down-right', () => {
    // directionCompassCells puts 'south' bottom-left and 'east' bottom-right of the 3x3 grid.
    expect(facingTowards(-1, 1, ALL_DIRECTIONS)).toBe('south');
    expect(facingTowards(1, 1, ALL_DIRECTIONS)).toBe('east');
    expect(facingTowards(1, -1, ALL_DIRECTIONS)).toBe('north');
    expect(facingTowards(-1, -1, ALL_DIRECTIONS)).toBe('west');
    expect(facingTowards(0, 1, ALL_DIRECTIONS)).toBe('south-east');
    expect(facingTowards(0, -1, ALL_DIRECTIONS)).toBe('north-west');
    expect(facingTowards(1, 0, ALL_DIRECTIONS)).toBe('north-east');
    expect(facingTowards(-1, 0, ALL_DIRECTIONS)).toBe('south-west');
  });

  it('never returns a facing the source does not have installed', () => {
    const installed: Direction[] = ['south', 'north'];
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) {
      expect(installed).toContain(facingTowards(x, y, installed));
    }
    expect(facingTowards(1, 1, [])).toBeUndefined();
  });
});

describe('townStreets', () => {
  it('gives every plan a street skeleton with real length', () => {
    for (const plan of TOWN_PLAN_KINDS) {
      const streets = townStreets(plan, 0, 0, 500, 1);
      expect(streets.length).toBeGreaterThan(0);
      for (const street of streets) {
        expect(Math.hypot(street.x1 - street.x0, street.y1 - street.y0)).toBeGreaterThan(1);
        expect(street.sides.length).toBeGreaterThan(0);
      }
    }
  });

  it('fronts the village green from outside the ring only', () => {
    const streets = townStreets('green', 0, 0, 500, 1);
    for (const street of streets) expect(street.sides).toEqual([-1]);
  });
});

describe('planTown', () => {
  it('sites the requested number of buildings', () => {
    expect(run({ size: 14 })).toHaveLength(14);
    expect(run({ size: 6 })).toHaveLength(6);
  });

  it('is deterministic, and re-rolls the whole town on a new seed', () => {
    expect(run({ seed: 3 })).toEqual(run({ seed: 3 }));
    expect(run({ seed: 3 })).not.toEqual(run({ seed: 4 }));
  });

  // The load-bearing property: this is what separates a town from a scatter.
  it('turns every building to face the street it stands on', () => {
    for (const plan of TOWN_PLAN_KINDS) {
      const town = run({ plan, looseness: 0, facingWobble: 0, size: 20 });
      expect(town.length).toBeGreaterThan(6);
      const streets = townStreets(plan, CENTER.x, CENTER.y, TOWN_PLAN_DEFAULTS.spread, TOWN_PLAN_DEFAULTS.seed);
      for (const placement of town) {
        const ground = groundOf(placement);
        const facing = facingVector(placement.direction);
        // Streets converge at a junction, so the NEAREST street is not always the one a building
        // fronts. The real property is that it faces SOME street it actually stands on.
        const fronts = streets.some((street) => {
          const dx = street.x1 - street.x0;
          const dy = street.y1 - street.y0;
          const len2 = dx * dx + dy * dy;
          const t = Math.max(0, Math.min(1, ((ground.x - street.x0) * dx + (ground.y - street.y0) * dy) / len2));
          const toStreet = { x: street.x0 + dx * t - ground.x, y: street.y0 + dy * t - ground.y };
          const distance = Math.hypot(toStreet.x, toStreet.y);
          if (distance > TOWN_PLAN_DEFAULTS.setback * 1.2 || distance < 1) return false;
          const alignment = (toStreet.x / distance) * facing.x + (toStreet.y / distance) * facing.y;
          // Only 8 facings exist and the iso projection spaces them unevenly on screen, so the
          // worst achievable error against an exact perpendicular is about 30 degrees.
          return alignment > 0.85;
        });
        expect(fronts).toBe(true);
      }
    }
  });

  it('turns every village-green building toward the green', () => {
    const town = run({ plan: 'green', looseness: 0, facingWobble: 0, size: 18 });
    for (const placement of town) {
      const ground = groundOf(placement);
      const toCentre = { x: CENTER.x - ground.x, y: CENTER.y - ground.y };
      const length = Math.hypot(toCentre.x, toCentre.y) || 1;
      const facing = facingVector(placement.direction);
      expect((toCentre.x / length) * facing.x + (toCentre.y / length) * facing.y).toBeGreaterThan(0);
    }
  });

  it('lines buildings up on their frontage at the setback distance', () => {
    const setback = 90;
    const town = run({ looseness: 0, facingWobble: 0, setback, plan: 'linear', size: 16 });
    const streets = townStreets('linear', CENTER.x, CENTER.y, TOWN_PLAN_DEFAULTS.spread, TOWN_PLAN_DEFAULTS.seed);
    for (const placement of town) {
      const ground = groundOf(placement);
      let best = Infinity;
      for (const street of streets) {
        const dx = street.x1 - street.x0;
        const dy = street.y1 - street.y0;
        const len2 = dx * dx + dy * dy;
        const t = Math.max(0, Math.min(1, ((ground.x - street.x0) * dx + (ground.y - street.y0) * dy) / len2));
        best = Math.min(best, Math.hypot(street.x0 + dx * t - ground.x, street.y0 + dy * t - ground.y));
      }
      expect(Math.abs(best - setback)).toBeLessThan(2);
    }
  });

  it('holds the plot exactly at zero looseness and lets it drift as looseness rises', () => {
    const offsets = (looseness: number): number[] => {
      const town = run({ looseness, facingWobble: 0, plan: 'linear', size: 16 });
      const streets = townStreets('linear', CENTER.x, CENTER.y, TOWN_PLAN_DEFAULTS.spread, TOWN_PLAN_DEFAULTS.seed);
      return town.map((placement) => {
        const ground = groundOf(placement);
        let best = Infinity;
        for (const street of streets) {
          const dx = street.x1 - street.x0;
          const dy = street.y1 - street.y0;
          const len2 = dx * dx + dy * dy;
          const t = Math.max(0, Math.min(1, ((ground.x - street.x0) * dx + (ground.y - street.y0) * dy) / len2));
          best = Math.min(best, Math.hypot(street.x0 + dx * t - ground.x, street.y0 + dy * t - ground.y));
        }
        return Math.abs(best - TOWN_PLAN_DEFAULTS.setback);
      });
    };
    const rigid = offsets(0);
    const loose = offsets(1);
    expect(Math.max(...rigid)).toBeLessThan(2);
    expect(Math.max(...loose)).toBeGreaterThan(Math.max(...rigid));
  });

  it('keeps facings on-axis at zero wobble and lets them turn as wobble rises', () => {
    const offAxis = (facingWobble: number): number => {
      const town = run({ plan: 'cluster', looseness: 0, facingWobble, size: 24, seed: 5 });
      const streets = townStreets('cluster', CENTER.x, CENTER.y, TOWN_PLAN_DEFAULTS.spread, 5);
      let count = 0;
      for (const placement of town) {
        const ground = groundOf(placement);
        let best = Infinity;
        let toStreet = { x: 0, y: 0 };
        for (const street of streets) {
          const dx = street.x1 - street.x0;
          const dy = street.y1 - street.y0;
          const len2 = dx * dx + dy * dy;
          const t = Math.max(0, Math.min(1, ((ground.x - street.x0) * dx + (ground.y - street.y0) * dy) / len2));
          const distance = Math.hypot(street.x0 + dx * t - ground.x, street.y0 + dy * t - ground.y);
          if (distance < best) { best = distance; toStreet = { x: street.x0 + dx * t - ground.x, y: street.y0 + dy * t - ground.y }; }
        }
        const length = Math.hypot(toStreet.x, toStreet.y) || 1;
        const facing = facingVector(placement.direction);
        if ((toStreet.x / length) * facing.x + (toStreet.y / length) * facing.y < 0.99) count += 1;
      }
      return count;
    };
    expect(offAxis(1)).toBeGreaterThan(offAxis(0));
  });

  it('centres building size on the average and never leaves the boundaries', () => {
    const town = run({ scaleMean: 1, scaleMin: 0.6, scaleMax: 1.6, size: 24, landmarkIds: [] });
    const scales = town.map((placement) => placement.scale);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.6);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.6);
    expect(new Set(scales).size).toBeGreaterThan(1);
    const mean = scales.reduce((sum, value) => sum + value, 0) / scales.length;
    expect(Math.abs(mean - 1)).toBeLessThan(0.12);
    // A mean pinned against a boundary must not push any building past it.
    const skewed = run({ scaleMean: 0.65, scaleMin: 0.6, scaleMax: 1.6, size: 24, landmarkIds: [] });
    expect(Math.min(...skewed.map((p) => p.scale))).toBeGreaterThanOrEqual(0.6);
  });

  it('builds a dense core that frays at the edge', () => {
    const town = run({ size: 24 });
    const radii = town.map((placement) => {
      const ground = groundOf(placement);
      return Math.hypot(ground.x - CENTER.x, ground.y - CENTER.y);
    }).sort((a, b) => a - b);
    const inner = radii.slice(0, Math.floor(radii.length / 2));
    const outer = radii.slice(Math.floor(radii.length / 2));
    const gaps = (list: number[]): number => (list[list.length - 1] - list[0]) / Math.max(1, list.length);
    expect(gaps(inner)).toBeLessThan(gaps(outer));
  });

  it('sites at most one focal landmark, and puts it in the middle', () => {
    const town = run({ landmarkIds: ['windmill'], size: 16 });
    const marks = town.filter((placement) => placement.sourceArtId === 'windmill');
    expect(marks).toHaveLength(1);
    const radiusOf = (placement: FloatingArtworkPlacement): number => {
      const ground = groundOf(placement);
      return Math.hypot(ground.x - CENTER.x, ground.y - CENTER.y);
    };
    const others = town.filter((placement) => placement.sourceArtId !== 'windmill').map(radiusOf);
    expect(radiusOf(marks[0])).toBeLessThan(Math.max(...others));
  });

  it('gives different plans different layouts', () => {
    const shapes = new Set(TOWN_PLAN_KINDS.map((plan: TownPlanKind) => JSON.stringify(
      run({ plan, size: 12 }).map((placement) => [placement.pixelX, placement.pixelY]),
    )));
    expect(shapes.size).toBe(TOWN_PLAN_KINDS.length);
  });

  it('honours minimum spacing between buildings', () => {
    const town = run({ spacing: 70, size: 30, plotWidth: 60 });
    const grounds = town.map(groundOf);
    for (let i = 0; i < grounds.length; i += 1) {
      for (let j = i + 1; j < grounds.length; j += 1) {
        expect(Math.hypot(grounds[i].x - grounds[j].x, grounds[i].y - grounds[j].y)).toBeGreaterThanOrEqual(70);
      }
    }
  });

  it('respects existing scene art when spacing', () => {
    const town = run({ size: 10 });
    const again = run({ size: 10 }, town);
    for (const placement of again) {
      for (const existing of town) {
        const a = groundOf(placement);
        const b = groundOf(existing);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(TOWN_PLAN_DEFAULTS.spacing);
      }
    }
  });

  it('keeps the town off the playable board when asked', () => {
    const overBoard = { x: 0, y: 0 };
    const free = run({ avoidPlayableBoard: false, size: 20 }, [], overBoard);
    const kept = run({ avoidPlayableBoard: true, size: 20 }, [], overBoard);
    expect(free.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThanOrEqual(free.length);
    for (const placement of kept) {
      const ground = groundOf(placement);
      const grid = { x: (ground.y / 27 + ground.x / 48) / 2, y: (ground.y / 27 - ground.x / 48) / 2 };
      const inside = grid.x >= -0.5 && grid.y >= -0.5 && grid.x < board.cols - 0.5 && grid.y < board.rows - 0.5;
      expect(inside).toBe(false);
    }
  });

  it('returns the town already in back-to-front paint order', () => {
    const depths = run({ size: 20 }).map((placement) => groundOf(placement).y);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
  });

  it('emits ids and coordinates the board-code sanitizer accepts', () => {
    for (const placement of run({ size: 12 })) {
      expect(placement.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/);
      expect(Number.isSafeInteger(placement.pixelX)).toBe(true);
      expect(Number.isSafeInteger(placement.pixelY)).toBe(true);
      expect(placement.scale).toBeGreaterThanOrEqual(0.1);
      expect(placement.scale).toBeLessThanOrEqual(8);
    }
  });

  it('produces nothing without buildings, size, or plot width', () => {
    expect(run({ buildingIds: [] })).toEqual([]);
    expect(run({ buildingIds: ['missing'] })).toEqual([]);
    expect(run({ size: 0 })).toEqual([]);
    expect(run({ plotWidth: 0 })).toEqual([]);
  });
});

describe('townIdPrefix', () => {
  it('keeps one identity per site so a re-roll replaces the town instead of stacking it', () => {
    expect(townIdPrefix(CENTER.x, CENTER.y)).toBe(townIdPrefix(CENTER.x, CENTER.y));
    for (const placement of run({ seed: 9 })) {
      expect(isTownMember(placement, CENTER.x, CENTER.y)).toBe(true);
    }
    // A different seed is the same town re-rolled: same site, same identity.
    for (const placement of run({ seed: 10 })) {
      expect(isTownMember(placement, CENTER.x, CENTER.y)).toBe(true);
    }
  });

  it('gives a town sited elsewhere its own identity', () => {
    const elsewhere = { x: CENTER.x + 3000, y: CENTER.y - 2000 };
    expect(townIdPrefix(elsewhere.x, elsewhere.y)).not.toBe(townIdPrefix(CENTER.x, CENTER.y));
    for (const placement of run({}, [], elsewhere)) {
      expect(isTownMember(placement, CENTER.x, CENTER.y)).toBe(false);
      expect(isTownMember(placement, elsewhere.x, elsewhere.y)).toBe(true);
    }
  });

  it('produces a prefix the sanitizer accepts', () => {
    expect(`${townIdPrefix(-5000, -5000)}0`).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/);
  });
});
