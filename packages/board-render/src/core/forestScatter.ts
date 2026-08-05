// Parametric scenic forest scatter for the level editor.
//
// A forest is nothing but ordinary Scene Art (`FloatingArtworkPlacement`): gameplay-inert,
// free-pixel, 8-way source artwork. This module adds no persisted channel and no new wire
// field — it only DERIVES many placements from a few knobs, so a forest saves, loads,
// undoes and renders through the exact path a hand-placed tree already uses.
//
// Three properties the scatter is built around, each of which the naive version gets wrong:
//
//  1. STABLE GLOBAL LATTICE. Candidates are hashed from a lattice anchored at the scene
//     origin — never from the stroke. Dragging back over ground you already painted
//     re-derives the identical trees with the identical ids, so a stroke is idempotent
//     instead of piling a second forest on top of the first. Re-rolling the seed reshuffles
//     the whole lattice at once.
//
//  2. GROUND POINTS, NOT IMAGE BOXES. `pixelX/pixelY` address the CENTRE of the image box
//     (renderPlan draws at `pixelY - height / 2`), so scattering those directly would leave
//     tall trees hovering and short ones sunk. The scatter works in ground-contact space and
//     converts through the source's own anchor at the end, which is what makes a mixed-size
//     species list share one ground plane.
//
//  3. STABLE SERIAL ORDER. The renderer derives continuous scene depth from the ground contact,
//     so correctness does not depend on array order. Generated batches are still sorted by ground
//     Y for deterministic board codes and stable tie-breaking when contacts are exactly equal.

import { TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import { unprojectBoardPoint } from '../render/boardProjection';
import type { Direction } from '../ui/unitCatalog';
import type { FloatingArtworkPlacement } from '../ui/boardCode';

/** Ground area of one projected tile diamond, in scene pixels. Density is quoted against it. */
export const FOREST_TILE_GROUND_AREA = 2 * TILE_STEP_X * TILE_STEP_Y;

export interface ForestScatterParams {
  /** Source-art ids the scatter draws from. A cell picks one uniformly. */
  speciesIds: readonly string[];
  /** Trees per tile of ground area, before clumping and edge falloff thin it out. */
  density: number;
  /** 0 keeps every tree on the bare lattice; 1 lets it land anywhere inside its own cell. */
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
  /** Share of the brush radius over which density fades to nothing. 0 is a hard edge. */
  falloff: number;
  seed: number;
}

/** Shipped baseline. The Forest panel renders from this and its Reset restores from it (ADR-0057). */
export const FOREST_SCATTER_DEFAULTS: ForestScatterParams = {
  speciesIds: [],
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

export interface ForestBrushArea {
  /** Brush centre in scene pixels — the same space `FloatingArtworkPlacement` stores. */
  centerX: number;
  centerY: number;
  radius: number;
}

export interface ForestSpriteGeometry {
  w: number;
  h: number;
  anchorX: number;
  anchorY: number;
  /** The source's own base scale. Multiplied by the per-instance scale. */
  scale: number;
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

export interface ForestScatterInput {
  area: ForestBrushArea;
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

/**
 * Smooth value noise over the same lattice, sampled at `cells` per octave so clumping reads as
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

/** Lattice pitch in scene pixels for a density quoted in trees per tile. */
export function forestLatticeStep(density: number): number {
  return Math.sqrt(FOREST_TILE_GROUND_AREA / Math.max(0.01, density));
}

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

/** The lattice cell identity doubles as the placement id, which is what makes a stroke idempotent. */
export function forestPlacementId(seed: number, cellX: number, cellY: number): string {
  return `f${(seed >>> 0).toString(36)}.${cellX}.${cellY}`;
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
 * Derive the trees one brush stroke adds. Returns only NEW placements: anything whose lattice
 * cell is already in `existing` is left alone, so repainting the same ground is a no-op.
 */
export function scatterForest(input: ForestScatterInput): FloatingArtworkPlacement[] {
  const { area, params, geometry, existing } = input;
  const species = params.speciesIds.filter((id) => geometry.directions(id).length > 0);
  if (!species.length || area.radius <= 0 || params.density <= 0) return [];

  const step = forestLatticeStep(params.density);
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

  const minCellX = Math.floor((area.centerX - area.radius) / step);
  const maxCellX = Math.floor((area.centerX + area.radius) / step);
  const minCellY = Math.floor((area.centerY - area.radius) / step);
  const maxCellY = Math.floor((area.centerY + area.radius) / step);

  const produced: Array<{ placement: FloatingArtworkPlacement; ground: ForestGroundPoint }> = [];

  for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const id = forestPlacementId(seed, cellX, cellY);
      if (taken.has(id)) continue;

      // Jitter is measured from the cell centre so a zero-jitter forest sits on a clean lattice.
      const offsetX = jitter * (hashUnit(cellX, cellY, seed, 1) - 0.5) * step;
      const offsetY = jitter * (hashUnit(cellX, cellY, seed, 2) - 0.5) * step;
      const ground: ForestGroundPoint = {
        x: (cellX + 0.5) * step + offsetX,
        y: (cellY + 0.5) * step + offsetY,
      };

      const distance = Math.hypot(ground.x - area.centerX, ground.y - area.centerY);
      if (distance > area.radius) continue;

      // Edge falloff feathers the boundary so a painted forest does not end on a disc.
      let keep = 1;
      if (falloff > 0) {
        const inner = area.radius * (1 - falloff);
        if (distance > inner) {
          keep = area.radius > inner ? 1 - (distance - inner) / (area.radius - inner) : 0;
        }
      }
      // Clumping biases the same density into groves and glades instead of thinning uniformly.
      if (clumping > 0) {
        const noise = clumpNoise(cellX, cellY, seed, 4);
        keep *= clamp(1 - clumping + 2 * clumping * noise, 0, 1);
      }
      if (hashUnit(cellX, cellY, seed, 3) >= keep) continue;

      const sourceArtId = species[Math.floor(hashUnit(cellX, cellY, seed, 4) * species.length) % species.length];
      const directions = geometry.directions(sourceArtId);
      const direction = params.randomFacing
        ? directions[Math.floor(hashUnit(cellX, cellY, seed, 5) * directions.length) % directions.length]
        : directions.includes(params.facing)
          ? params.facing
          : directions.includes('south') ? 'south' : directions[0];
      const sprite = geometry.sprite(sourceArtId, direction);
      if (!sprite) continue;

      const instanceScale = clamp(Math.round(
        (scaleLow + (scaleHigh - scaleLow) * hashUnit(cellX, cellY, seed, 6)) * 1000,
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
      if (spacing > 0 && occupied.some((point) => Math.hypot(point.x - seated.x, point.y - seated.y) < spacing)) {
        continue;
      }

      taken.add(id);
      occupied.push(seated);
      produced.push({ placement, ground: seated });
    }
  }

  // Keep generated board content deterministic even though the renderer owns visible depth.
  return produced
    .sort((a, b) => (a.ground.y === b.ground.y ? a.ground.x - b.ground.x : a.ground.y - b.ground.y))
    .map((entry) => entry.placement);
}

/** Remove every tree the forest brush produced inside the area, for the erase tool. */
export function eraseForestArea(
  placements: readonly FloatingArtworkPlacement[],
  area: ForestBrushArea,
  geometry: ForestSpeciesGeometry,
): FloatingArtworkPlacement[] {
  return placements.filter((placement) => {
    const ground = floatingArtworkGroundPoint(placement, geometry);
    if (!ground) return true;
    return Math.hypot(ground.x - area.centerX, ground.y - area.centerY) > area.radius;
  });
}
