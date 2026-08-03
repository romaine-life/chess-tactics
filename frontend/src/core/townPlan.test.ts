import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOWN_SECTION,
  TOWN_PLAN_DEFAULTS,
  TOWN_PLAN_KINDS,
  facingTowards,
  isTownMember,
  planTown,
  townBoundsCentre,
  townIdPrefix,
  townFootprint,
  footprintsOverlap,
  townStreets,
  type TownPlanKind,
  type TownPlanParams,
  type TownSection,
} from './townPlan';
import { floatingArtworkGroundPoint, type ForestSpeciesGeometry } from './forestScatter';
import { projectBoardPoint, unprojectBoardPoint } from '@chess-tactics/board-render';
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
// The area an author would drag, in GRID CELLS: a wide-ish rect well clear of the playable board.
const AREA = { minX: 14, minY: 10, maxX: 30, maxY: 22 };
const CENTER = (() => {
  const c = townBoundsCentre(AREA);
  const seat = projectBoardPoint(c);
  return { x: seat.left, y: seat.top };
})();
/** Grid cell a scene-pixel ground point stands on. */
const cellOf = (g: { x: number; y: number }) => unprojectBoardPoint({ left: g.x, top: g.y });

let sectionSerial = 0;
/** Building ids as evenly weighted entries, which is what the panel builds when you add them. */
const entries = (ids: string[]) => ids.map((sourceArtId, index) => ({
  id: `b${(sectionSerial += 1)}-${index}`, sourceArtId, weight: 1,
}));
const section = (over: Partial<TownSection> & { buildingIds?: string[] } = {}): TownSection => {
  const { buildingIds, ...rest } = over;
  return {
    id: `s${(sectionSerial += 1)}`,
    ...DEFAULT_TOWN_SECTION,
    buildings: buildingIds ? entries(buildingIds) : entries(['cottage']),
    ...rest,
  };
};

const params = (overrides: Partial<TownPlanParams> = {}): TownPlanParams => ({
  ...TOWN_PLAN_DEFAULTS,
  sections: [section({ buildingIds: ['cottage', 'cabin', 'lodge'] })],
  avoidPlayableBoard: false,
  ...overrides,
});

const run = (
  overrides: Partial<TownPlanParams> = {},
  existing: FloatingArtworkPlacement[] = [],
  bounds = AREA,
): FloatingArtworkPlacement[] => planTown({
  townId: 'a1', bounds, params: params(overrides), geometry, board, existing,
}).placements;

/** Full result, for the assertions that care WHY plots were dropped. */
const runFull = (
  overrides: Partial<TownPlanParams> = {},
  bounds = AREA,
) => planTown({ townId: 'a1', bounds, params: params(overrides), geometry, board, existing: [] });

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
      const streets = townStreets(plan, AREA, TOWN_PLAN_DEFAULTS.setback, 1);
      expect(streets.length).toBeGreaterThan(0);
      for (const street of streets) {
        expect(Math.hypot(street.x1 - street.x0, street.y1 - street.y0)).toBeGreaterThan(1);
        expect(street.sides.length).toBeGreaterThan(0);
      }
    }
  });

  it('fronts the village green from outside the ring only', () => {
    const streets = townStreets('green', AREA, TOWN_PLAN_DEFAULTS.setback, 1);
    for (const street of streets) expect(street.sides).toEqual([-1]);
  });
});

describe('planTown', () => {
  it('never exceeds the requested count, and reaches it when the drag has room', () => {
    expect(run({ size: 6 })).toHaveLength(6);
    // Size is a ceiling, not a quota: a drag only holds as many plots as its frontage allows.
    expect(run({ size: 14 }).length).toBeLessThanOrEqual(14);
    const roomy = { minX: 0, minY: 0, maxX: 40, maxY: 34 };
    expect(run({ size: 14 }, [], roomy)).toHaveLength(14);
  });

  // The author drags the ground the town is to occupy; the town must honour it exactly.
  // Buildings occupy real ground, so these use an area with room for several of them — the old
  // 16x12 numbers were only reachable by letting houses overlap.
  it('keeps every building inside the dragged area', () => {
    for (const plan of TOWN_PLAN_KINDS) {
      const town = run({ plan, size: 40, looseness: 1, sections: [section({ buildingIds: ['cabin'] })] },
        [], { minX: 0, minY: 0, maxX: 40, maxY: 34 });
      expect(town.length).toBeGreaterThan(4);
      for (const placement of town) {
        const cell = cellOf(groundOf(placement));
        expect(cell.x).toBeGreaterThanOrEqual(0);
        expect(cell.x).toBeLessThanOrEqual(40);
        expect(cell.y).toBeGreaterThanOrEqual(0);
        expect(cell.y).toBeLessThanOrEqual(34);
      }
    }
  });

  it('fills a bigger drag with more town and a smaller drag with less', () => {
    const small = { minX: 14, minY: 10, maxX: 20, maxY: 15 };
    const big = { minX: 4, minY: 2, maxX: 40, maxY: 32 };
    expect(run({ size: 60 }, [], big).length).toBeGreaterThan(run({ size: 60 }, [], small).length);
  });

  it('runs the main street along the longer axis of the drag', () => {
    const wide = { minX: 0, minY: 0, maxX: 24, maxY: 6 };
    const tall = { minX: 0, minY: 0, maxX: 6, maxY: 24 };
    // Streets are returned in scene pixels; unproject them so the axes compared are the BOARD's.
    // A 24x6 and a 6x24 selection project to mirror-image diamonds with identical screen bounding
    // boxes, so a screen-space comparison cannot tell them apart at all.
    const span = (bounds: typeof wide): { x: number; y: number } => {
      const streets = townStreets('linear', bounds, TOWN_PLAN_DEFAULTS.setback, 1);
      const cells = streets.flatMap((s) => [
        unprojectBoardPoint({ left: s.x0, top: s.y0 }),
        unprojectBoardPoint({ left: s.x1, top: s.y1 }),
      ]);
      const xs = cells.map((c) => c.x);
      const ys = cells.map((c) => c.y);
      return { x: Math.max(...xs) - Math.min(...xs), y: Math.max(...ys) - Math.min(...ys) };
    };
    expect(span(wide).x).toBeGreaterThan(span(wide).y);
    expect(span(tall).y).toBeGreaterThan(span(tall).x);
  });

  it('produces nothing for a drag too small to hold a town', () => {
    expect(run({}, [], { minX: 5, minY: 5, maxX: 5.5, maxY: 5.5 })).toEqual([]);
  });

  it('is deterministic, and re-rolls the whole town on a new seed', () => {
    expect(run({ seed: 3 })).toEqual(run({ seed: 3 }));
    expect(run({ seed: 3 })).not.toEqual(run({ seed: 4 }));
  });

  // The load-bearing property: this is what separates a town from a scatter.
  it('turns every building to face the street it stands on', () => {
    for (const plan of TOWN_PLAN_KINDS) {
      const town = run({ plan, looseness: 0, facingWobble: 0, size: 20,
        sections: [section({ buildingIds: ['cabin'] })] });
      expect(town.length).toBeGreaterThan(3);
      const streets = townStreets(plan, AREA, TOWN_PLAN_DEFAULTS.setback, TOWN_PLAN_DEFAULTS.seed);
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
    // Streets are inset by the setback, so the skeleton must be derived with the same value.
    const streets = townStreets('linear', AREA, setback, TOWN_PLAN_DEFAULTS.seed);
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
      const streets = townStreets('linear', AREA, TOWN_PLAN_DEFAULTS.setback, TOWN_PLAN_DEFAULTS.seed);
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
      const streets = townStreets('cluster', AREA, TOWN_PLAN_DEFAULTS.setback, 5);
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
    // fit 'drop' so sizes come purely from the section: 'shrink' deliberately builds smaller
    // where the ground is tight, which would pull the average down.
    const town = run({
      sections: [section({ buildingIds: ['cottage', 'cabin'], scaleMean: 1, scaleMin: 0.6, scaleMax: 1.6 })],
      size: 24, landmarkIds: [], fit: 'drop',
    }, [], { minX: 0, minY: 0, maxX: 44, maxY: 38 });
    const scales = town.map((placement) => placement.scale);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.6);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.6);
    expect(new Set(scales).size).toBeGreaterThan(1);
    const mean = scales.reduce((sum, value) => sum + value, 0) / scales.length;
    expect(Math.abs(mean - 1)).toBeLessThan(0.12);
    // A mean pinned against a boundary must not push any building past it.
    const skewed = run({
      sections: [section({ buildingIds: ['cottage', 'cabin'], scaleMean: 0.65, scaleMin: 0.6, scaleMax: 1.6 })],
      size: 24, landmarkIds: [], fit: 'drop',
    }, [], { minX: 0, minY: 0, maxX: 44, maxY: 38 });
    expect(Math.min(...skewed.map((p) => p.scale))).toBeGreaterThanOrEqual(0.6);
  });

  // Sections: one town, several bands, each with its own buildings and its own size range.
  describe('sections', () => {
    const big = () => section({ buildingIds: ['lodge'], scaleMean: 1.6, scaleMin: 1.5, scaleMax: 1.7 });
    const small = () => section({ buildingIds: ['cabin'], scaleMean: 0.6, scaleMin: 0.5, scaleMax: 0.7 });
    const roomy = { minX: 0, minY: 0, maxX: 40, maxY: 34 };
    const twoBands = (blend: number) => run(
      { sections: [big(), small()], blend, size: 40, landmarkIds: [] }, [], roomy,
    );

    it('draws each building from its own section, at that section\'s size', () => {
      for (const placement of twoBands(0)) {
        if (placement.sourceArtId === 'lodge') {
          expect(placement.scale).toBeGreaterThanOrEqual(1.5);
          expect(placement.scale).toBeLessThanOrEqual(1.7);
        } else {
          expect(placement.sourceArtId).toBe('cabin');
          expect(placement.scale).toBeGreaterThanOrEqual(0.5);
          expect(placement.scale).toBeLessThanOrEqual(0.7);
        }
      }
    });

    it('splits the town by share', () => {
      const lopsided = run({
        sections: [section({ buildingIds: ['lodge'], share: 3 }), section({ buildingIds: ['cabin'], share: 1 })],
        blend: 0, size: 40, landmarkIds: [],
      }, [], roomy);
      const lodges = lopsided.filter((p) => p.sourceArtId === 'lodge').length;
      expect(lodges).toBeGreaterThan(lopsided.length - lodges);
    });

    /** Neighbouring pairs that belong to different sections — how mixed the town is. */
    const interleaving = (town: ReturnType<typeof run>): number => {
      const along = town
        .map((p) => ({ at: cellOf(groundOf(p)).x, id: p.sourceArtId }))
        .sort((a, b) => a.at - b.at);
      let swaps = 0;
      for (let i = 1; i < along.length; i += 1) if (along[i].id !== along[i - 1].id) swaps += 1;
      return swaps;
    };

    // The property Nelson asked for: keep them apart, mix them fully, or meet across a band.
    it('keeps sections apart at blend 0 and mixes them at blend 1', () => {
      const split = interleaving(twoBands(0));
      const mixed = interleaving(twoBands(1));
      // Two contiguous stretches cross over about once; a full interleave crosses constantly.
      expect(split).toBeLessThanOrEqual(2);
      expect(mixed).toBeGreaterThan(split * 3);
    });

    it('widens the band as blend rises', () => {
      expect(interleaving(twoBands(0.5))).toBeGreaterThan(interleaving(twoBands(0)));
      expect(interleaving(twoBands(1))).toBeGreaterThanOrEqual(interleaving(twoBands(0.5)));
    });

    it('lays the sections out along the town, not at random', () => {
      // At blend 0 every building of one section sits to one side of every building of the other.
      const town = twoBands(0);
      const lodgeAt = town.filter((p) => p.sourceArtId === 'lodge').map((p) => cellOf(groundOf(p)).x);
      const cabinAt = town.filter((p) => p.sourceArtId === 'cabin').map((p) => cellOf(groundOf(p)).x);
      expect(lodgeAt.length).toBeGreaterThan(0);
      expect(cabinAt.length).toBeGreaterThan(0);
      const lodgeMax = Math.max(...lodgeAt);
      const cabinMin = Math.min(...cabinAt);
      expect(lodgeMax).toBeLessThanOrEqual(cabinMin + 1e-6);
    });

    it('weights building kinds within a section', () => {
      const town = run({
        size: 60,
        sections: [{
          ...section(),
          buildings: [
            { id: 'b1', sourceArtId: 'cottage', weight: 5 },
            { id: 'b2', sourceArtId: 'cabin', weight: 1 },
          ],
        }],
      }, [], roomy);
      const cottages = town.filter((p) => p.sourceArtId === 'cottage').length;
      const cabins = town.filter((p) => p.sourceArtId === 'cabin').length;
      expect(cottages).toBeGreaterThan(cabins);
      expect(cabins).toBeGreaterThan(0);
    });

    it('never places a building kind whose weight is zero', () => {
      const town = run({
        size: 40,
        sections: [{
          ...section(),
          buildings: [
            { id: 'b1', sourceArtId: 'cottage', weight: 1 },
            { id: 'b2', sourceArtId: 'cabin', weight: 0 },
          ],
        }],
      }, [], roomy);
      expect(town.length).toBeGreaterThan(0);
      expect(new Set(town.map((p) => p.sourceArtId))).toEqual(new Set(['cottage']));
    });

    // The point of sections: a stretch of small buildings has to be able to pack tighter than a
    // stretch of large ones. A town-wide frontage left small buildings adrift in big ones' plots.
    it('gives each section its own frontage, so small buildings pack tighter', () => {
      const packed = section({
        buildingIds: ['cabin'], scaleMean: 0.5, scaleMin: 0.45, scaleMax: 0.55, plotWidth: 55,
      });
      const roomy2 = { minX: 0, minY: 0, maxX: 44, maxY: 38 };
      const tight = run({ size: 60, sections: [packed], blend: 0 }, [], roomy2);
      const wide = run({
        size: 60, blend: 0,
        sections: [{ ...packed, plotWidth: 220 }],
      }, [], roomy2);
      // Same buildings, same ground: the section with narrower frontage fits more of them.
      expect(tight.length).toBeGreaterThan(wide.length);
    });

    it('spaces two sections by their own frontages within one town', () => {
      const roomy2 = { minX: 0, minY: 0, maxX: 44, maxY: 38 };
      const town = run({
        size: 60, blend: 0,
        sections: [
          section({ buildingIds: ['lodge'], scaleMean: 1, scaleMin: 0.9, scaleMax: 1.1, plotWidth: 240 }),
          section({ buildingIds: ['cabin'], scaleMean: 0.5, scaleMin: 0.45, scaleMax: 0.55, plotWidth: 55 }),
        ],
      }, [], roomy2);
      const lodges = town.filter((p) => p.sourceArtId === 'lodge').length;
      const cabins = town.filter((p) => p.sourceArtId === 'cabin').length;
      expect(lodges).toBeGreaterThan(0);
      // Equal shares, but the tighter frontage fits far more buildings into its stretch.
      expect(cabins).toBeGreaterThan(lodges);
    });

    it('ignores a section with no buildings rather than leaving a gap', () => {
      const town = run({
        sections: [big(), section({ buildingIds: [] })], blend: 0, size: 20, landmarkIds: [],
      }, [], roomy);
      expect(town.length).toBeGreaterThan(0);
      expect(new Set(town.map((p) => p.sourceArtId))).toEqual(new Set(['lodge']));
    });
  });

  // Houses occupy real ground: they cannot intersect, and they cannot hang over the edge of the
  // area. Treating them as points let both happen.
  describe('fitting real buildings', () => {
    const roomy = { minX: 0, minY: 0, maxX: 40, maxY: 34 };
    const boxes = (town: FloatingArtworkPlacement[]) => town.map((placement) => townFootprint(
      groundOf(placement),
      geometry.sprite(placement.sourceArtId, placement.direction)!,
      placement.scale,
      0,
    ));

    for (const fit of ['drop', 'shrink'] as const) {
      it(`never overlaps two buildings (${fit})`, () => {
        const town = run({ fit, size: 60, sections: [section({ buildingIds: ['lodge', 'cottage'] })] }, [], roomy);
        expect(town.length).toBeGreaterThan(5);
        const all = boxes(town);
        for (let i = 0; i < all.length; i += 1) {
          for (let j = i + 1; j < all.length; j += 1) {
            expect(footprintsOverlap(all[i], all[j])).toBe(false);
          }
        }
      });

      it(`never lets a building overhang the area (${fit})`, () => {
        const town = run({ fit, size: 60, sections: [section({ buildingIds: ['lodge'] })] }, [], roomy);
        expect(town.length).toBeGreaterThan(3);
        for (const box of boxes(town)) {
          // Exact grid half-extent of the footprint, derived independently of the planner.
          const radius = Math.sqrt((box.rx / 48) ** 2 + (box.ry / 27) ** 2) / 2;
          const centre = cellOf({ x: box.x, y: box.y });
          expect(centre.x - radius).toBeGreaterThanOrEqual(roomy.minX - 1e-6);
          expect(centre.x + radius).toBeLessThanOrEqual(roomy.maxX + 1e-6);
          expect(centre.y - radius).toBeGreaterThanOrEqual(roomy.minY - 1e-6);
          expect(centre.y + radius).toBeLessThanOrEqual(roomy.maxY + 1e-6);
        }
      });
    }

    it('honours the gap between footprints, not between centres', () => {
      const gap = 40;
      const town = run({ spacing: gap, size: 40, sections: [section({ buildingIds: ['lodge'] })] }, [], roomy);
      const all = boxes(town);
      for (let i = 0; i < all.length; i += 1) {
        for (let j = i + 1; j < all.length; j += 1) {
          // Padding each footprint by half the gap must still leave them clear of one another.
          const a = { ...all[i], rx: all[i].rx + gap / 2, ry: all[i].ry + gap / 4 };
          const b = { ...all[j], rx: all[j].rx + gap / 2, ry: all[j].ry + gap / 4 };
          expect(footprintsOverlap(a, b)).toBe(false);
        }
      }
    });

    // The choice Nelson asked for, and the difference has to be real.
    it('keeps buildings at full size when dropping, and builds smaller when shrinking', () => {
      const tight = { minX: 0, minY: 0, maxX: 14, maxY: 12 };
      const big = section({ buildingIds: ['lodge'], scaleMean: 1.4, scaleMin: 0.5, scaleMax: 1.5 });
      const dropped = run({ fit: 'drop', size: 40, sections: [big] }, [], tight);
      const shrunk = run({ fit: 'shrink', size: 40, sections: [big] }, [], tight);
      // Dropping never goes below the section's own spread; shrinking may.
      expect(Math.min(...dropped.map((p) => p.scale))).toBeGreaterThan(Math.min(...shrunk.map((p) => p.scale)));
      // And shrinking fits more of them in.
      expect(shrunk.length).toBeGreaterThan(dropped.length);
    });

    it('never shrinks a building below its section minimum', () => {
      const tight = { minX: 0, minY: 0, maxX: 12, maxY: 10 };
      const town = run({
        fit: 'shrink', size: 40,
        sections: [section({ buildingIds: ['lodge'], scaleMean: 1.2, scaleMin: 0.9, scaleMax: 1.3 })],
      }, [], tight);
      for (const placement of town) expect(placement.scale).toBeGreaterThanOrEqual(0.9);
    });

    it('will not build through scene art that is already there', () => {
      const town = run({ size: 20, sections: [section({ buildingIds: ['lodge'] })] }, [], roomy);
      const again = run({ size: 20, sections: [section({ buildingIds: ['lodge'] })] }, town, roomy);
      const before = boxes(town);
      for (const box of boxes(again)) {
        for (const other of before) expect(footprintsOverlap(box, other)).toBe(false);
      }
    });
  });

  it('builds a dense core that frays at the edge', () => {
    // Central plots are taken first, so a small town sits tighter around the middle than a large
    // one on the same ground. Stated as a comparison between two sizes rather than as a spread
    // within one: plot spacing now varies per section, which makes a within-town bin metric noisy.
    const roomy = { minX: 0, minY: 0, maxX: 40, maxY: 34 };
    const meanRadius = (size: number): number => {
      const town = run({ size, sections: [section({ buildingIds: ['cabin'] })] }, [], roomy);
      expect(town.length).toBeGreaterThan(2);
      const radii = town.map((placement) => {
        const ground = groundOf(placement);
        return Math.hypot(ground.x - CENTER.x, ground.y - CENTER.y);
      });
      return radii.reduce((sum, value) => sum + value, 0) / radii.length;
    };
    expect(meanRadius(6)).toBeLessThan(meanRadius(40));
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
    const town = run({ spacing: 70, size: 30, sections: [section({ plotWidth: 60 })] });
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

  it('reports why plots were dropped, so the editor can name the real cause', () => {
    const overBoard = { minX: 0, minY: 0, maxX: 7, maxY: 7 };
    const blocked = runFull({ avoidPlayableBoard: true, size: 30 }, overBoard);
    expect(blocked.plotsOffered).toBeGreaterThan(0);
    expect(blocked.rejectedOnBoard).toBeGreaterThan(0);
    expect(blocked.placements.length).toBeLessThan(30);
    // Same drag with the filter off attributes nothing to the board.
    expect(runFull({ avoidPlayableBoard: false, size: 30 }, overBoard).rejectedOnBoard).toBe(0);
    // A crowded plan blames spacing instead.
    expect(runFull({ spacing: 200, size: 30 }).rejectedSpacing).toBeGreaterThan(0);
  });

  it('keeps the town off the playable board when asked', () => {
    // Small buildings over a generous area, so the board filter is what thins it, not the fit.
    const overBoard = { minX: -6, minY: -6, maxX: 16, maxY: 16 };
    const small = [section({ buildingIds: ['cabin'] })];
    const free = run({ avoidPlayableBoard: false, size: 30, sections: small }, [], overBoard);
    const kept = run({ avoidPlayableBoard: true, size: 30, sections: small }, [], overBoard);
    expect(free.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThanOrEqual(free.length);
    for (const placement of kept) {
      const ground = groundOf(placement);
      const grid = cellOf(ground);
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
    expect(run({ sections: [] })).toEqual([]);
    expect(run({ sections: [{ ...section(), buildings: [] }] })).toEqual([]);
    expect(run({ sections: [section({ buildingIds: ['missing'] })] })).toEqual([]);
    expect(run({ size: 0 })).toEqual([]);
    expect(run({ sections: [{ ...section(), buildings: [] }] })).toEqual([]);
  });
});

describe('townIdPrefix', () => {
  it('tags a town with its instance id, through a re-roll and a re-drag', () => {
    for (const placement of run({ seed: 9 })) expect(isTownMember(placement, 'a1')).toBe(true);
    // Same town, different seed and different ground: still the same town.
    const elsewhere = { minX: AREA.minX + 60, minY: AREA.minY - 40,
      maxX: AREA.maxX + 60, maxY: AREA.maxY - 40 };
    for (const placement of run({ seed: 10 }, [], elsewhere)) {
      expect(isTownMember(placement, 'a1')).toBe(true);
    }
  });

  it('keeps separate towns separate, so a board can carry many', () => {
    const first = planTown({ townId: 'a1', bounds: AREA, params: params(), geometry, board, existing: [] });
    const second = planTown({ townId: 'b2', bounds: AREA, params: params(), geometry, board, existing: [] });
    expect(first.placements.length).toBeGreaterThan(0);
    for (const placement of first.placements) {
      expect(isTownMember(placement, 'a1')).toBe(true);
      expect(isTownMember(placement, 'b2')).toBe(false);
    }
    for (const placement of second.placements) expect(isTownMember(placement, 'b2')).toBe(true);
  });

  it('produces a prefix the sanitizer accepts', () => {
    expect(`${townIdPrefix('a1')}0`).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/);
  });
});
