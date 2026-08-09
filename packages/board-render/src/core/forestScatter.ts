// Parametric scenic forest scatter for the level editor.
//
// A generated forest is ordinary Scene Art (`FloatingArtworkPlacement`): gameplay-inert,
// free-pixel, 8-way source artwork. The saved Forest recipe lives on EditorBoard; this module
// deterministically materializes that recipe into the same placements a hand-placed tree uses.
//
// Four properties the scatter is built around, each of which the naive version gets wrong:
//
//  1. ACTUAL BOARD GRID. The selected ground is a rect of logical board cells, including scenic
//     apron cells. Each cell owns deterministic candidate slots, so overlapping selections
//     re-derive identical trees with identical ids instead of piling up a second forest. Trees may
//     vary freely inside their owning cell; the selection and identity model do not drift into a
//     second scene-pixel lattice.
//
//  2. GROUND SEATING, NOT IMAGE-BOX SEATING. `pixelX/pixelY` address the CENTRE of the image box
//     (renderPlan draws at `pixelY - height / 2`), so scattering those directly would leave
//     tall trees hovering and short ones sunk. The scatter works in ground-contact space and
//     converts through the source's own anchor at the end, which is what makes a mixed-size
//     species list share one ground plane.
//
//  3. STABLE SERIAL ORDER. The renderer derives continuous scene depth from the ground contact,
//     so correctness does not depend on array order. Generated batches are still sorted by ground
//     Y for deterministic board codes and stable tie-breaking when contacts are exactly equal.
//
//  4. BASE FOOTPRINTS, NOT POINT OR SPRITE BOUNDS. A contact point alone lets roots leak across
//     the selected edge; a complete image-box test incorrectly rejects overhanging canopy. Only
//     the projected root/base ellipse is required to remain on the selected ground.

import { projectBoardPoint } from '../render/boardProjection';
import type { Direction } from '../ui/unitCatalog';
import type { BoardForestTree, FloatingArtworkPlacement } from '../ui/boardCode';
import {
  clipGeneratorAreas,
  generatorAreasBounds,
  generatorAreasContainCell,
} from './generatorAreas';
import {
  projectedGroundFootprintWithinGridRect,
  projectedGroundFootprintWithinGridRects,
  type ProjectedGroundFootprint,
} from './projectedGroundFootprint';

export interface ForestScatterParams {
  /** Explicit weighted source-art recipe. Duplicate sources are allowed as separate entries. */
  trees: readonly Pick<BoardForestTree, 'sourceArtId' | 'weight'>[];
  /** Trees per tile of ground area, before clumping and edge falloff thin it out. */
  density: number;
  /** 0 keeps every tree on the clean per-cell slot pattern; 1 lets it land anywhere in its cell. */
  jitter: number;
  /** Per-instance scale multiplier range, applied on top of the source's own scale. */
  scaleMin: number;
  scaleMax: number;
  /** Draw each tree's facing from its installed turntable instead of using `facing`. */
  randomFacing: boolean;
  facing: Direction;
  /** Minimum ground separation in scene pixels. A crowded candidate is dropped, not moved. */
  spacing: number;
  /** 0 spreads evenly; 1 carves strong thickets and clearings out of the same density. */
  clumping: number;
  /** Share of the selection's half-depth over which density fades to nothing. 0 is a hard edge. */
  falloff: number;
  seed: number;
}

/** Shipped baseline. The Forest panel renders from this and its Reset restores from it (ADR-0057). */
export const FOREST_SCATTER_DEFAULTS: ForestScatterParams = {
  trees: [],
  density: 1.6,
  jitter: 0.85,
  scaleMin: 0.8,
  scaleMax: 1.3,
  randomFacing: true,
  facing: 'south',
  spacing: 26,
  clumping: 0.45,
  falloff: 0.35,
  seed: 1,
};

/** Tile-aligned ground selected by the Forest tool. Coordinates may include scenic apron cells. */
export interface ForestGridArea {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ForestSpriteGeometry {
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
  /** The source's own base scale. Multiplied by the per-instance scale. */
  scale: number;
  /** Measured root/base extent in source pixels. The image frame and canopy are excluded. */
  groundFootprint?: { w: number; h: number };
}

/** Source-art geometry, injected so the scatter stays pure and testable without the live catalog. */
export interface ForestSpeciesGeometry {
  directions(sourceArtId: string): readonly Direction[];
  sprite(sourceArtId: string, direction: Direction): ForestSpriteGeometry | undefined;
}

export interface ForestGroundPoint {
  x: number;
  y: number;
}

/** Legacy fallback only; current Forest art carries measured base contact geometry. */
export const FOREST_UNCALIBRATED_CONTACT_WIDTH_RATIO = 0.8;

/** Ground occupied by a Forest item. This is deliberately much smaller than its sprite frame. */
export function forestGroundFootprint(
  ground: ForestGroundPoint,
  sprite: ForestSpriteGeometry,
  instanceScale: number,
): ProjectedGroundFootprint {
  const scale = sprite.scale * instanceScale;
  const sourceWidth = sprite.groundFootprint?.w ?? sprite.w * FOREST_UNCALIBRATED_CONTACT_WIDTH_RATIO;
  const sourceDepth = sprite.groundFootprint?.h ?? sourceWidth * 0.5;
  const width = sourceWidth * scale;
  const depth = sourceDepth * scale;
  return { x: ground.x, y: ground.y, rx: width / 2, ry: depth / 2 };
}

/** A grid area stated in cell EDGES rather than cell centres. */
const gridAreaEdges = (area: ForestGridArea): ForestGridArea => {
  const bounds = normalizedGridArea(area);
  return {
    minX: bounds.minX - 0.5,
    minY: bounds.minY - 0.5,
    maxX: bounds.maxX + 0.5,
    maxY: bounds.maxY + 0.5,
  };
};

/** True when the whole root/base footprint remains on the selected cells. */
export function forestGroundFootprintWithinArea(
  footprint: ProjectedGroundFootprint,
  area: ForestGridArea,
): boolean {
  return projectedGroundFootprintWithinGridRect(footprint, gridAreaEdges(area));
}

/**
 * True when the whole root/base footprint remains on the union of several selected patches.
 *
 * Tested against the union rather than each patch in turn, so a tree standing where two patches
 * meet is kept: the ground is continuous there, and rejecting it would carve a bare seam through
 * a Forest the author extended by dragging a second area onto it.
 */
export function forestGroundFootprintWithinAreas(
  footprint: ProjectedGroundFootprint,
  areas: readonly ForestGridArea[],
): boolean {
  if (areas.length === 1) return forestGroundFootprintWithinArea(footprint, areas[0]);
  return projectedGroundFootprintWithinGridRects(footprint, areas.map(gridAreaEdges));
}

export interface ForestScatterInput {
  /** Saved generator-instance identity; every produced placement belongs to this Forest only. */
  forestId: string;
  /** Optional section identity, keeping independently generated approaches collision-free. */
  scopeId?: string;
  area: ForestGridArea;
  /**
   * The Forest's complete ground, when it is more than one rectangle. `area` still states the
   * territory this run may use; the scatter fills `area` INTERSECTED with this union, so an
   * author who shift-dragged a second patch on gets one Forest across both instead of a Forest
   * that spills over the rectangle it was never given.
   */
  areas?: readonly ForestGridArea[];
  params: ForestScatterParams;
  geometry: ForestSpeciesGeometry;
  /** Everything already in the scene. Used for id de-duplication and spacing rejection. */
  existing: readonly FloatingArtworkPlacement[];
}

const HASH_X = 0x1f1f1f1f;
const HASH_Y = 0x27d4eb2d;
const HASH_S = 0x165667b1;

/** Stable per-cell hash. Same (cell, seed, salt) always yields the same float in [0, 1). */
export function hashUnit(cellX: number, cellY: number, seed: number, salt: number): number {
  let h = Math.imul(cellX | 0, HASH_X) ^ Math.imul(cellY | 0, HASH_Y) ^ Math.imul(seed | 0, HASH_S) ^ Math.imul(salt | 0, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  h = Math.imul(h, 0x3d73af5f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smoothstep = (t: number): number => t * t * (3 - 2 * t);
/** Leaves room for integer pixel seating without rounding a ground point into a neighbouring cell. */
const FOREST_CELL_INSET = 0.01;

/**
 * Smooth value noise over the logical grid, sampled at `cells` per octave so clumping reads as
 * groves and glades rather than per-tree speckle.
 */
function clumpNoise(cellX: number, cellY: number, seed: number, period: number): number {
  const fx = cellX / period;
  const fy = cellY / period;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smoothstep(fx - x0);
  const ty = smoothstep(fy - y0);
  const c00 = hashUnit(x0, y0, seed, 991);
  const c10 = hashUnit(x0 + 1, y0, seed, 991);
  const c01 = hashUnit(x0, y0 + 1, seed, 991);
  const c11 = hashUnit(x0 + 1, y0 + 1, seed, 991);
  const top = c00 + (c10 - c00) * tx;
  const bottom = c01 + (c11 - c01) * tx;
  return top + (bottom - top) * ty;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/**
 * The ground-contact point a placement stands on. The stored pixel pair is the image-box
 * centre, so the source's anchor has to be walked back out of it.
 */
export function floatingArtworkGroundPoint(
  placement: FloatingArtworkPlacement,
  geometry: ForestSpeciesGeometry,
): ForestGroundPoint | undefined {
  const sprite = geometry.sprite(placement.sourceArtId, placement.direction);
  if (!sprite) return undefined;
  const scale = sprite.scale * placement.scale;
  return {
    x: placement.pixelX - (sprite.w * scale) / 2 + sprite.anchorX * scale,
    y: placement.pixelY - (sprite.h * scale) / 2 + sprite.anchorY * scale,
  };
}

/** Inverse of {@link floatingArtworkGroundPoint}: seat a ground point as an image-box centre. */
export function groundPointToPixel(
  ground: ForestGroundPoint,
  sprite: ForestSpriteGeometry,
  instanceScale: number,
): { pixelX: number; pixelY: number } {
  const scale = sprite.scale * instanceScale;
  return {
    pixelX: Math.round(ground.x + (sprite.w * scale) / 2 - sprite.anchorX * scale),
    pixelY: Math.round(ground.y + (sprite.h * scale) / 2 - sprite.anchorY * scale),
  };
}

/** Stable placement prefix for one saved Forest instance. */
export function forestIdPrefix(forestId: string): string {
  return `fr${forestId}.`;
}

/** The Forest, seed, board cell, and candidate slot together own generated-art identity. */
export function forestPlacementId(
  forestId: string,
  seed: number,
  cellX: number,
  cellY: number,
  slot: number,
  scopeId?: string,
): string {
  const scope = scopeId ? `${scopeId}.` : '';
  return `${forestIdPrefix(forestId)}${scope}${(seed >>> 0).toString(36)}.${cellX}.${cellY}.${slot}`;
}

/** True when a placement belongs to one saved Forest instance. */
export function isForestMember(placement: FloatingArtworkPlacement, forestId: string): boolean {
  return placement.id.startsWith(forestIdPrefix(forestId));
}

const normalizedGridArea = (area: ForestGridArea): ForestGridArea => ({
  minX: Math.min(area.minX, area.maxX),
  minY: Math.min(area.minY, area.maxY),
  maxX: Math.max(area.minX, area.maxX),
  maxY: Math.max(area.minY, area.maxY),
});

/**
 * How far a grid point is from the ground's edge, measured along the four grid axes.
 *
 * For ONE rectangle this is exactly `min(x - (minX - 0.5), (maxX + 0.5) - x, …)` — the same edge
 * ramp the falloff has always used, so a Forest on a single patch is unchanged. For several
 * rectangles it walks out cell by cell, which is what makes two patches that meet feather as one
 * piece of ground: measuring each rectangle separately would fade the Forest out along the join
 * and leave a bare stripe where the author expected it to continue.
 *
 * Runs are precomputed once per scatter so a candidate point costs four array reads.
 */
interface ForestGroundEdgeField {
  distance(cellX: number, cellY: number, x: number, y: number): number;
}

function forestGroundEdgeField(areas: readonly ForestGridArea[]): ForestGroundEdgeField {
  if (areas.length === 1) {
    const bounds = normalizedGridArea(areas[0]);
    return {
      distance: (_cellX, _cellY, x, y) => Math.min(
        x - (bounds.minX - 0.5),
        bounds.maxX + 0.5 - x,
        y - (bounds.minY - 0.5),
        bounds.maxY + 0.5 - y,
      ),
    };
  }
  const bounds = generatorAreasBounds(areas);
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const member = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      member[y * width + x] = generatorAreasContainCell(areas, bounds.minX + x, bounds.minY + y) ? 1 : 0;
    }
  }
  // Consecutive member cells STRICTLY beyond each cell, per axis. The ground therefore ends at
  // `cell + run + 0.5` on that side.
  const left = new Int32Array(width * height);
  const right = new Int32Array(width * height);
  const up = new Int32Array(width * height);
  const down = new Int32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      left[index] = x > 0 && member[index - 1] ? left[index - 1] + 1 : 0;
    }
    for (let x = width - 1; x >= 0; x -= 1) {
      const index = y * width + x;
      right[index] = x < width - 1 && member[index + 1] ? right[index + 1] + 1 : 0;
    }
  }
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      const index = y * width + x;
      up[index] = y > 0 && member[index - width] ? up[index - width] + 1 : 0;
    }
    for (let y = height - 1; y >= 0; y -= 1) {
      const index = y * width + x;
      down[index] = y < height - 1 && member[index + width] ? down[index + width] + 1 : 0;
    }
  }
  return {
    distance: (cellX, cellY, x, y) => {
      const localX = cellX - bounds.minX;
      const localY = cellY - bounds.minY;
      if (localX < 0 || localY < 0 || localX >= width || localY >= height) return 0;
      const index = localY * width + localX;
      if (!member[index]) return 0;
      return Math.min(
        x - (cellX - left[index] - 0.5),
        cellX + right[index] + 0.5 - x,
        y - (cellY - up[index] - 0.5),
        cellY + down[index] + 0.5 - y,
      );
    },
  };
}

/** Deterministic low-discrepancy coordinate in [0, 1), used for clean per-cell candidate slots. */
function halton(index: number, base: number): number {
  let fraction = 1;
  let result = 0;
  for (let value = index; value > 0; value = Math.floor(value / base)) {
    fraction /= base;
    result += fraction * (value % base);
  }
  return result;
}

/** Stable, non-random starting point for a slot inside its logical cell. */
function cleanSlotOffset(slot: number): { x: number; y: number } {
  if (slot === 0) return { x: 0, y: 0 };
  return { x: halton(slot, 2) - 0.5, y: halton(slot, 3) - 0.5 };
}


/**
 * Sort scene art into a deterministic back-to-front storage order by ground contact. Rendering
 * derives depth independently; placements whose geometry cannot be resolved keep their relative
 * order at the front of the list.
 */
export function sortFloatingArtworkByDepth(
  placements: readonly FloatingArtworkPlacement[],
  geometry: ForestSpeciesGeometry,
): FloatingArtworkPlacement[] {
  return placements
    .map((placement, index) => ({
      placement,
      index,
      depth: floatingArtworkGroundPoint(placement, geometry)?.y,
    }))
    .sort((a, b) => {
      if (a.depth === undefined || b.depth === undefined) {
        if (a.depth === b.depth) return a.index - b.index;
        return a.depth === undefined ? -1 : 1;
      }
      return a.depth === b.depth ? a.index - b.index : a.depth - b.depth;
    })
    .map((entry) => entry.placement);
}

/**
 * Derive the trees one grid selection adds. Returns only NEW placements: anything whose board
 * cell and candidate slot are already in `existing` is left alone, so selecting the same ground
 * again is a no-op.
 */
export function scatterForest(input: ForestScatterInput): FloatingArtworkPlacement[] {
  const { forestId, scopeId, area, params, geometry, existing } = input;
  const trees = params.trees.filter((tree) => tree.weight > 0 && geometry.directions(tree.sourceArtId).length > 0);
  const totalTreeWeight = trees.reduce((sum, tree) => sum + tree.weight, 0);
  if (!trees.length || totalTreeWeight <= 0 || params.density <= 0) return [];

  // The ground this run may actually use: the territory it was handed, kept to the Forest's own
  // patches. A Forest on one rectangle resolves straight back to that rectangle.
  const territory = input.areas?.length
    ? clipGeneratorAreas(input.areas, area)
    : [normalizedGridArea(area)];
  if (!territory.length) return [];
  const bounds = generatorAreasBounds(territory);
  const edgeField = forestGroundEdgeField(territory);
  const seed = params.seed >>> 0;
  const scaleLow = Math.min(params.scaleMin, params.scaleMax);
  const scaleHigh = Math.max(params.scaleMin, params.scaleMax);
  const spacing = Math.max(0, params.spacing);
  const falloff = clamp(params.falloff, 0, 1);
  const clumping = clamp(params.clumping, 0, 1);
  const jitter = clamp(params.jitter, 0, 1);

  const taken = new Set(existing.map((placement) => placement.id));
  const occupied: ForestGroundPoint[] = [];
  for (const placement of existing) {
    const ground = floatingArtworkGroundPoint(placement, geometry);
    if (ground) occupied.push(ground);
  }

  const wholeCandidates = Math.floor(params.density);
  const fractionalCandidate = params.density - wholeCandidates;
  const candidateSlots = Math.ceil(params.density);
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const featherDepth = Math.min(width, height) * 0.5 * falloff;

  const produced: Array<{ placement: FloatingArtworkPlacement; ground: ForestGroundPoint }> = [];

  for (let cellY = bounds.minY; cellY <= bounds.maxY; cellY += 1) {
    for (let cellX = bounds.minX; cellX <= bounds.maxX; cellX += 1) {
      if (!generatorAreasContainCell(territory, cellX, cellY)) continue;
      const count = wholeCandidates
        + (fractionalCandidate > 0 && hashUnit(cellX, cellY, seed, 0) < fractionalCandidate ? 1 : 0);
      for (let slot = 0; slot < Math.min(count, candidateSlots); slot += 1) {
        const id = forestPlacementId(forestId, seed, cellX, cellY, slot, scopeId);
        if (taken.has(id)) continue;

        // Zero randomness repeats one clean slot pattern in every logical tile. Randomness blends
        // each slot toward a seeded point, but never lets it escape the cell the grid assigned it.
        const clean = cleanSlotOffset(slot);
        const gridPoint = {
          x: cellX + clean.x * (1 - jitter)
            + (hashUnit(cellX, cellY, seed, 10 + slot * 2) - 0.5) * (1 - 2 * FOREST_CELL_INSET) * jitter,
          y: cellY + clean.y * (1 - jitter)
            + (hashUnit(cellX, cellY, seed, 11 + slot * 2) - 0.5) * (1 - 2 * FOREST_CELL_INSET) * jitter,
        };
        const projected = projectBoardPoint(gridPoint);
        const ground: ForestGroundPoint = { x: projected.left, y: projected.top };

        // Feather inward from the selected ground's boundary. This is grid distance, so the same
        // selected cells produce the same edge at every camera zoom and projection scale.
        let keep = 1;
        if (featherDepth > 0) {
          keep *= clamp(edgeField.distance(cellX, cellY, gridPoint.x, gridPoint.y) / featherDepth, 0, 1);
        }
        // Clumping biases the same density into groves and glades instead of thinning uniformly.
        if (clumping > 0) {
          const noise = clumpNoise(cellX, cellY, seed, 4);
          keep *= clamp(1 - clumping + 2 * clumping * noise, 0, 1);
        }
        if (hashUnit(cellX, cellY, seed, 100 + slot) >= keep) continue;

        let treeRoll = hashUnit(cellX, cellY, seed, 200 + slot) * totalTreeWeight;
        const selectedTree = trees.find((tree) => {
          treeRoll -= tree.weight;
          return treeRoll < 0;
        }) ?? trees[trees.length - 1];
        const sourceArtId = selectedTree.sourceArtId;
        const directions = geometry.directions(sourceArtId);
        const direction = params.randomFacing
          ? directions[
            Math.floor(hashUnit(cellX, cellY, seed, 300 + slot) * directions.length) % directions.length
          ]
          : directions.includes(params.facing)
            ? params.facing
            : directions.includes('south') ? 'south' : directions[0];
        const sprite = geometry.sprite(sourceArtId, direction);
        if (!sprite) continue;

        const instanceScale = clamp(Math.round(
          (scaleLow + (scaleHigh - scaleLow) * hashUnit(cellX, cellY, seed, 400 + slot)) * 1000,
        ) / 1000, 0.1, 8);
        const placement: FloatingArtworkPlacement = {
          id,
          sourceArtId,
          ...groundPointToPixel(ground, sprite, instanceScale),
          direction,
          scale: instanceScale,
        };

        // Measure spacing and depth against where the sprite ACTUALLY lands. The stored pixel
        // pair is integral, so the seated ground point differs sub-pixel from the candidate —
        // enough to let a "minimum 80px" forest ship trees 79.9px apart if the raw point is used.
        const seated = floatingArtworkGroundPoint(placement, geometry) ?? ground;
        const footprint = forestGroundFootprint(seated, sprite, instanceScale);
        if (!forestGroundFootprintWithinAreas(footprint, territory)) continue;
        if (spacing > 0 && occupied.some(
          (point) => Math.hypot(point.x - seated.x, point.y - seated.y) < spacing,
        )) continue;

        taken.add(id);
        occupied.push(seated);
        produced.push({ placement, ground: seated });
      }
    }
  }

  // Keep generated board content deterministic even though the renderer owns visible depth.
  return produced
    .sort((a, b) => (a.ground.y === b.ground.y ? a.ground.x - b.ground.x : a.ground.y - b.ground.y))
    .map((entry) => entry.placement);
}
