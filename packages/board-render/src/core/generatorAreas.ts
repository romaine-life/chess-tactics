/**
 * The ground a saved placement generator (Town, Forest) occupies.
 *
 * An author drags one rectangle, and may shift-drag further rectangles onto the same instance.
 * The instance's ground is the UNION of those rectangles, which is what lets a town bend around a
 * corner, wrap a lake, or run on past the edge of one screenful of board.
 *
 * A saved instance still carries `bounds`, and `bounds` is always the union's BOUNDING BOX. Every
 * LAYOUT decision — the street skeleton, the section territories, the density gradient — is still
 * taken against a rectangle, because those are shape templates and a template needs an extent to
 * be fitted to. Only MEMBERSHIP consults the union: which plots exist, which cells are scattered
 * into, and where the ground's edge is for the falloff.
 */
export interface GeneratorArea {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Low/high ordering, which a drag started from any corner does not guarantee. */
export const normalizeGeneratorArea = (area: GeneratorArea): GeneratorArea => ({
  minX: Math.min(area.minX, area.maxX),
  minY: Math.min(area.minY, area.maxY),
  maxX: Math.max(area.minX, area.maxX),
  maxY: Math.max(area.minY, area.maxY),
});

/** The union's bounding box. Empty input answers a single degenerate cell at the origin. */
export function generatorAreasBounds(areas: readonly GeneratorArea[]): GeneratorArea {
  if (!areas.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const first = normalizeGeneratorArea(areas[0]);
  const bounds = { ...first };
  for (const raw of areas.slice(1)) {
    const area = normalizeGeneratorArea(raw);
    bounds.minX = Math.min(bounds.minX, area.minX);
    bounds.minY = Math.min(bounds.minY, area.minY);
    bounds.maxX = Math.max(bounds.maxX, area.maxX);
    bounds.maxY = Math.max(bounds.maxY, area.maxY);
  }
  return bounds;
}

/**
 * True when a point lies inside the union, measured on the rectangles' own cell-centre
 * boundaries. Integer arguments ask about a whole cell; fractional ones about a grid point.
 */
export function generatorAreasContainCell(
  areas: readonly GeneratorArea[],
  cellX: number,
  cellY: number,
): boolean {
  return areas.some((area) => (
    cellX >= Math.min(area.minX, area.maxX) && cellX <= Math.max(area.minX, area.maxX)
    && cellY >= Math.min(area.minY, area.maxY) && cellY <= Math.max(area.minY, area.maxY)
  ));
}

const areasIntersect = (a: GeneratorArea, b: GeneratorArea): boolean => (
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
);

const areaContainsArea = (outer: GeneratorArea, inner: GeneratorArea): boolean => (
  outer.minX <= inner.minX && outer.maxX >= inner.maxX
  && outer.minY <= inner.minY && outer.maxY >= inner.maxY
);

/**
 * Normalize an authored list: order every rectangle, drop the ones another rectangle already
 * covers, and keep at least one. Redundant rectangles are not merely tidy to remove — every
 * membership test walks the list, and a shift-drag over ground the instance already owns would
 * otherwise grow it forever.
 */
export function normalizeGeneratorAreas(areas: readonly GeneratorArea[]): GeneratorArea[] {
  const ordered = areas.map(normalizeGeneratorArea);
  const kept: GeneratorArea[] = [];
  for (const [index, area] of ordered.entries()) {
    const covered = ordered.some((other, otherIndex) => (
      otherIndex !== index
      && areaContainsArea(other, area)
      // Two identical rectangles cover each other; keep the first of them.
      && (!areaContainsArea(area, other) || otherIndex < index)
    ));
    if (!covered) kept.push(area);
  }
  return kept.length ? kept : ordered.slice(0, 1);
}

/** The two patches joined into one, when they share a full edge along `axis`. */
const joinedAlong = (
  a: GeneratorArea,
  b: GeneratorArea,
): GeneratorArea | null => {
  const sameRows = a.minY === b.minY && a.maxY === b.maxY;
  const sameCols = a.minX === b.minX && a.maxX === b.maxX;
  // `+ 1` because adjacent cells touch: patches ending at 12 and starting at 13 are continuous.
  const joinsAcross = sameRows && a.minX <= b.maxX + 1 && b.minX <= a.maxX + 1;
  const joinsDown = sameCols && a.minY <= b.maxY + 1 && b.minY <= a.maxY + 1;
  if (!joinsAcross && !joinsDown) return null;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
};

/**
 * The union restated as the fewest rectangles that still describe it exactly.
 *
 * Generators fit SHAPE TEMPLATES — a street skeleton, a ring, a set of lanes — and a template
 * needs a rectangle to be fitted to. Given the whole union's bounding box it would run its streets
 * through ground the town does not own; given each dragged patch it would break a town extended
 * along its own length into two disjointed halves at the join. Merging first settles both: an
 * extension collapses back into the one long rectangle it visually is, while an L keeps its two
 * arms and each arm gets a street of its own.
 *
 * Only full-edge joins merge. Patches that merely overlap stay separate, because the rectangle
 * around them would cover ground neither of them holds.
 */
export function mergeGeneratorAreas(areas: readonly GeneratorArea[]): GeneratorArea[] {
  let rects = normalizeGeneratorAreas(areas);
  for (let guard = 0; guard < rects.length * rects.length + 1; guard += 1) {
    let joined: GeneratorArea[] | null = null;
    for (let index = 0; index < rects.length && !joined; index += 1) {
      for (let other = index + 1; other < rects.length && !joined; other += 1) {
        const merged = joinedAlong(rects[index], rects[other]);
        if (!merged) continue;
        joined = [...rects.filter((_, at) => at !== index && at !== other), merged];
      }
    }
    if (!joined) break;
    rects = joined;
  }
  return rects;
}

/** The union clipped to a rectangle. Rectangles that miss it entirely are dropped. */
export function clipGeneratorAreas(
  areas: readonly GeneratorArea[],
  rect: GeneratorArea,
): GeneratorArea[] {
  const bounds = normalizeGeneratorArea(rect);
  return areas
    .map(normalizeGeneratorArea)
    .filter((area) => areasIntersect(area, bounds))
    .map((area) => ({
      minX: Math.max(area.minX, bounds.minX),
      minY: Math.max(area.minY, bounds.minY),
      maxX: Math.min(area.maxX, bounds.maxX),
      maxY: Math.min(area.maxY, bounds.maxY),
    }));
}

/**
 * Distinct cells in the union, counted without double-counting overlaps.
 *
 * Swept over the elementary grid the rectangle edges induce, so overlapping and adjacent patches
 * report the ground an author can actually see rather than the sum of what was dragged.
 */
export function generatorAreasCellCount(areas: readonly GeneratorArea[]): number {
  const rects = areas.map(normalizeGeneratorArea);
  if (!rects.length) return 0;
  if (rects.length === 1) {
    return (rects[0].maxX - rects[0].minX + 1) * (rects[0].maxY - rects[0].minY + 1);
  }
  const xs = [...new Set(rects.flatMap((rect) => [rect.minX, rect.maxX + 1]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((rect) => [rect.minY, rect.maxY + 1]))].sort((a, b) => a - b);
  let cells = 0;
  for (let xi = 0; xi < xs.length - 1; xi += 1) {
    for (let yi = 0; yi < ys.length - 1; yi += 1) {
      const x = xs[xi];
      const y = ys[yi];
      if (!generatorAreasContainCell(rects, x, y)) continue;
      cells += (xs[xi + 1] - x) * (ys[yi + 1] - y);
    }
  }
  return cells;
}

/** Every distinct cell of the union, in a stable row-major order. */
export function generatorAreaCells(areas: readonly GeneratorArea[]): Array<{ x: number; y: number }> {
  const rects = areas.map(normalizeGeneratorArea);
  const bounds = generatorAreasBounds(rects);
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (generatorAreasContainCell(rects, x, y)) cells.push({ x, y });
    }
  }
  return cells;
}
