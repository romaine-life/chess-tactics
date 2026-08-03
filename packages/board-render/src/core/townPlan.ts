// Procedural scenic towns for the level editor.
//
// Like the forest brush, a town is ordinary Scene Art (`FloatingArtworkPlacement`) — no new
// persisted channel, no wire field, no schema change. What differs is WHY the buildings land
// where they do.
//
// A scatter cannot make a town. Buildings dropped at random read as debris no matter how the
// density is tuned, because what the eye reads as "settlement" is not spacing — it is SHARED
// STRUCTURE. Four things carry it, and this module exists to impose all four:
//
//   1. STREETS. Every building belongs to a street segment, never to open ground.
//   2. FRONTAGE. Buildings sit at a common setback from their street's centreline, so their
//      fronts line up along it instead of wandering.
//   3. FACING. A building turns to face the street it stands on. Two rows facing each other
//      across a gap is the single strongest "this is a street" cue there is.
//   4. GRADIENT. Plots nearer the centre are taken first, so the town has a dense core and
//      frays at the edge rather than ending on a hard boundary.
//
// The town PLAN is the template: it fixes the street skeleton AND the tolerance profile — how
// far a building may slide along its frontage, how far its setback may drift, how often it may
// turn off-axis. `looseness` scales that profile from surveyed grid to organic village, which is
// the "which variations are acceptable" dial. A plan cannot be violated, only loosened.

import { TILE_TOP_HEIGHT, TILE_TOP_WIDTH } from '../art/projectionContract';
import { projectBoardPoint, unprojectBoardPoint } from '../render/boardProjection';
import { rookDirections, type Direction } from '../ui/unitCatalog';
import {
  floatingArtworkGroundPoint,
  groundPointToPixel,
  hashUnit,
  type ForestGroundPoint,
  type ForestSpeciesGeometry,
} from './forestScatter';
import type { FloatingArtworkPlacement } from '../ui/boardCode';

export type TownPlanKind = 'linear' | 'crossroads' | 'green' | 'cluster';

export const TOWN_PLAN_KINDS: readonly TownPlanKind[] = ['linear', 'crossroads', 'green', 'cluster'];

export const TOWN_PLAN_LABELS: Record<TownPlanKind, string> = {
  linear: 'Roadside row',
  crossroads: 'Crossroads',
  green: 'Village green',
  cluster: 'Lanes',
};

export const TOWN_PLAN_NOTES: Record<TownPlanKind, string> = {
  linear: 'One street through the middle, buildings facing it from both sides.',
  crossroads: 'Two streets meeting, densest at the junction.',
  green: 'Buildings ringing an open central green, all facing inward.',
  cluster: 'Short lanes off a centre, loosest of the four.',
};

export interface TownPlanParams {
  /** Building sources the town draws from. A plot picks one. */
  buildingIds: readonly string[];
  /** Optional focal structures (a mill, a castle). At most one is sited per town. */
  landmarkIds: readonly string[];
  plan: TownPlanKind;
  /** How many buildings to site, before spacing and board rejection thin it. */
  size: number;
  /** Average building scale, and the boundaries it may vary between. */
  scaleMean: number;
  scaleMin: number;
  scaleMax: number;
  /** Average frontage per building along a street, in scene pixels. */
  plotWidth: number;
  /** Distance from a street's centreline to the buildings that face it. */
  setback: number;
  // Extent is not a parameter: the author drags the area the town fills.
  /** 0 keeps every building on its surveyed plot; 1 lets the plan run to its tolerances. */
  looseness: number;
  /** 0 makes every building face its street exactly; 1 lets facings turn off-axis. */
  facingWobble: number;
  /** Minimum separation between building ground points, in scene pixels. */
  spacing: number;
  /** Skip buildings whose ground point lands on a playable board cell. */
  avoidPlayableBoard: boolean;
  seed: number;
}

/** Shipped baseline. The Town panel renders from this and its Reset restores from it (ADR-0057). */
export const TOWN_PLAN_DEFAULTS: TownPlanParams = {
  buildingIds: [],
  landmarkIds: [],
  plan: 'linear',
  size: 14,
  scaleMean: 1,
  scaleMin: 0.75,
  scaleMax: 1.35,
  plotWidth: 110,
  setback: 78,
  looseness: 0.45,
  facingWobble: 0.2,
  spacing: 62,
  avoidPlayableBoard: true,
  seed: 1,
};

/** Per-plan tolerance profile. `looseness` scales these; it cannot exceed them. */
interface TownPlanProfile {
  /** Maximum slide along the frontage, as a fraction of plot width. */
  alongSlack: number;
  /** Maximum drift toward or away from the street, as a fraction of setback. */
  setbackSlack: number;
  /** Probability a building turns one compass step off its street. */
  facingSlack: number;
}

const PLAN_PROFILES: Record<TownPlanKind, TownPlanProfile> = {
  linear: { alongSlack: 0.3, setbackSlack: 0.22, facingSlack: 0.18 },
  crossroads: { alongSlack: 0.22, setbackSlack: 0.16, facingSlack: 0.12 },
  green: { alongSlack: 0.26, setbackSlack: 0.18, facingSlack: 0.1 },
  cluster: { alongSlack: 0.55, setbackSlack: 0.45, facingSlack: 0.45 },
};

export interface TownStreet {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Which sides of this street carry frontage. */
  sides: readonly (-1 | 1)[];
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/**
 * Screen-space unit vector for each facing, DERIVED from the board projection rather than
 * hardcoded, so it cannot drift from how the renderer actually orients art. The grid deltas match
 * `directionCompassCells`: 'south' is grid +y, which projects down-left.
 */
const DIRECTION_GRID_DELTA: Record<Direction, { x: number; y: number }> = {
  north: { x: 0, y: -1 },
  'north-east': { x: 1, y: -1 },
  east: { x: 1, y: 0 },
  'south-east': { x: 1, y: 1 },
  south: { x: 0, y: 1 },
  'south-west': { x: -1, y: 1 },
  west: { x: -1, y: 0 },
  'north-west': { x: -1, y: -1 },
};

function directionScreenVector(direction: Direction): { x: number; y: number } {
  const delta = DIRECTION_GRID_DELTA[direction];
  const seat = projectBoardPoint({ x: delta.x, y: delta.y });
  const length = Math.hypot(seat.left, seat.top) || 1;
  return { x: seat.left / length, y: seat.top / length };
}

/** The installed facing that points closest to a screen-space direction. */
export function facingTowards(
  screenX: number,
  screenY: number,
  installed: readonly Direction[],
): Direction | undefined {
  const length = Math.hypot(screenX, screenY);
  if (!installed.length) return undefined;
  if (!length) return installed.includes('south') ? 'south' : installed[0];
  const target = { x: screenX / length, y: screenY / length };
  let best: Direction | undefined;
  let bestDot = -Infinity;
  for (const direction of installed) {
    const vector = directionScreenVector(direction);
    const dot = vector.x * target.x + vector.y * target.y;
    if (dot > bestDot) {
      bestDot = dot;
      best = direction;
    }
  }
  return best;
}

/** Turn a facing by `steps` eighths, staying on the installed turntable where possible. */
function turnFacing(direction: Direction, steps: number, installed: readonly Direction[]): Direction {
  const index = rookDirections.indexOf(direction);
  if (index < 0) return direction;
  for (let attempt = 0; attempt < rookDirections.length; attempt += 1) {
    const shifted = rookDirections[
      (((index + steps + attempt) % rookDirections.length) + rookDirections.length) % rookDirections.length
    ];
    if (installed.includes(shifted)) return shifted;
  }
  return direction;
}

/**
 * The dragged area a town fills, in BOARD GRID cells — not scene pixels.
 *
 * The editor is a tile editor and the author thinks in tiles, so the selection snaps to whole
 * cells and reads as "6 x 4 tiles". Coordinates may be negative or beyond the playable board:
 * scenery lives out in the apron, and the projection inverse is defined everywhere.
 *
 * Only the SELECTION is gridded. Buildings inside it still stand at free pixel positions, because
 * a town that snapped to cells would read as a survey rather than a settlement.
 */
export interface TownBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Grid rect -> its centre in scene pixels. */
export function townBoundsScenePolygon(bounds: TownBounds): Array<{ x: number; y: number }> {
  return [
    { x: bounds.minX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.maxY },
  ].map((corner) => {
    const seat = projectBoardPoint(corner);
    return { x: seat.left, y: seat.top };
  });
}

/** Snap a continuous grid point to the nearest whole cell corner. */
export const snapGridPoint = (point: { x: number; y: number }): { x: number; y: number } => ({
  x: Math.round(point.x),
  y: Math.round(point.y),
});

/** Centre of the dragged area, in grid cells. */
export const townBoundsCentre = (bounds: TownBounds): { x: number; y: number } => ({
  x: (bounds.minX + bounds.maxX) / 2,
  y: (bounds.minY + bounds.maxY) / 2,
});

/** The dragged area as whole tiles along each grid axis. */
export function townBoundsInTiles(bounds: TownBounds): { across: number; down: number } {
  return {
    across: Math.abs(bounds.maxX - bounds.minX),
    down: Math.abs(bounds.maxY - bounds.minY),
  };
}

/** The same measure for any pixel length quoted along the board's horizontal axis. */
export const pixelsInTilesAcross = (pixels: number): number => pixels / TILE_TOP_WIDTH;

/**
 * The street skeleton for a plan, FITTED TO THE DRAGGED AREA. The author drags the ground the
 * town is to occupy, so the skeleton adapts to that rectangle's shape and size — a wide drag runs
 * its main street the long way, a tall drag runs it the other way. Streets are inset by the
 * setback so the buildings that front them still land inside the area.
 *
 * Every building hangs off one of these; nothing is placed on open ground.
 */
export function townStreets(
  plan: TownPlanKind,
  bounds: TownBounds,
  setback: number,
  seed: number,
): TownStreet[] {
  const centre = townBoundsCentre(bounds);
  const halfW = Math.abs(bounds.maxX - bounds.minX) / 2;
  const halfH = Math.abs(bounds.maxY - bounds.minY) / 2;
  // Setback is a scene-pixel distance; express it in cells to keep frontage inside the selection.
  const setbackCells = setback / TILE_TOP_WIDTH;
  const insetX = Math.max(0, halfW - Math.min(setbackCells, halfW * 0.8));
  const insetY = Math.max(0, halfH - Math.min(setbackCells, halfH * 0.8));

  // Streets are laid out in GRID space and projected, so they run along the board's own axes
  // instead of across it. This is what the old hardcoded 0.62 vertical squash was approximating.
  const at = (dx: number, dy: number): { x: number; y: number } => {
    const seat = projectBoardPoint({ x: centre.x + dx, y: centre.y + dy });
    return { x: seat.left, y: seat.top };
  };

  if (plan === 'linear') {
    // One street along the LONGER axis of the selection, with a slight bend so it is not a ruler.
    const horizontal = halfW >= halfH;
    const reach = horizontal ? insetX : insetY;
    const bend = (hashUnit(1, 0, seed, 12) - 0.5) * (horizontal ? insetY : insetX) * 0.5;
    const a = horizontal ? at(-reach, bend * 0.2) : at(bend * 0.2, -reach);
    const mid = horizontal ? at(0, bend) : at(bend, 0);
    const b = horizontal ? at(reach, -bend * 0.2) : at(-bend * 0.2, reach);
    return [
      { x0: a.x, y0: a.y, x1: mid.x, y1: mid.y, sides: [-1, 1] },
      { x0: mid.x, y0: mid.y, x1: b.x, y1: b.y, sides: [-1, 1] },
    ];
  }

  if (plan === 'crossroads') {
    const hub = at(0, 0);
    const w0 = at(-insetX, 0);
    const w1 = at(insetX, 0);
    const n0 = at(0, -insetY);
    const n1 = at(0, insetY);
    return [
      { x0: w0.x, y0: w0.y, x1: hub.x, y1: hub.y, sides: [-1, 1] },
      { x0: hub.x, y0: hub.y, x1: w1.x, y1: w1.y, sides: [-1, 1] },
      { x0: n0.x, y0: n0.y, x1: hub.x, y1: hub.y, sides: [-1, 1] },
      { x0: hub.x, y0: hub.y, x1: n1.x, y1: n1.y, sides: [-1, 1] },
    ];
  }

  if (plan === 'green') {
    // A closed ring inscribed in the selection, wound counter-clockwise in grid space so its
    // segment normal points INWARD. Frontage is on side -1 (outside the ring), which puts every
    // building's face on the green.
    const corners = 6;
    const streets: TownStreet[] = [];
    for (let i = 0; i < corners; i += 1) {
      const t0 = (i / corners) * Math.PI * 2;
      const t1 = ((i + 1) / corners) * Math.PI * 2;
      const k0 = 1 + (hashUnit(i, 0, seed, 13) - 0.5) * 0.18;
      const k1 = 1 + (hashUnit(i + 1, 0, seed, 13) - 0.5) * 0.18;
      const p0 = at(Math.cos(t0) * insetX * k0, Math.sin(t0) * insetY * k0);
      const p1 = at(Math.cos(t1) * insetX * k1, Math.sin(t1) * insetY * k1);
      streets.push({ x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, sides: [-1] });
    }
    return streets;
  }

  // cluster: short lanes radiating from the centre, each carrying frontage on both sides.
  const lanes = 4;
  const streets: TownStreet[] = [];
  for (let i = 0; i < lanes; i += 1) {
    const t = (i / lanes) * Math.PI * 2 + hashUnit(i, 1, seed, 14) * 0.6;
    const inner = 0.18 + hashUnit(i, 2, seed, 15) * 0.15;
    const outer = 0.75 + hashUnit(i, 3, seed, 16) * 0.25;
    const p0 = at(Math.cos(t) * insetX * inner, Math.sin(t) * insetY * inner);
    const p1 = at(Math.cos(t) * insetX * outer, Math.sin(t) * insetY * outer);
    streets.push({ x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, sides: [-1, 1] });
  }
  return streets;
}

interface TownPlot {
  ground: ForestGroundPoint;
  /** Screen-space vector from the plot back toward its street — the direction it must face. */
  faceX: number;
  faceY: number;
  index: number;
  /** Distance from the town centre, used for the density gradient. */
  radius: number;
}

export interface TownPlanInput {
  /** The area the author dragged. The town fills it and never leaves it. */
  bounds: TownBounds;
  params: TownPlanParams;
  geometry: ForestSpeciesGeometry;
  board: { cols: number; rows: number };
  /** Scene art already present, for spacing rejection. Town members are excluded by the caller. */
  existing: readonly FloatingArtworkPlacement[];
}

/**
 * Stable id prefix for the town filling an area, so regenerating replaces it rather than stacking
 * a second town on the same ground. Derived from the area itself, so it survives a page reload.
 */
export function townIdPrefix(bounds: TownBounds): string {
  const parts = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
  let key = 0x811c9dc5;
  for (const part of parts) {
    key = Math.imul(key ^ (Math.round(part) | 0), 0x01000193) >>> 0;
  }
  return `t${key.toString(36)}.`;
}

/** True when a placement belongs to the town filling this area. */
export function isTownMember(placement: FloatingArtworkPlacement, bounds: TownBounds): boolean {
  return placement.id.startsWith(townIdPrefix(bounds));
}

function onPlayableBoard(ground: ForestGroundPoint, board: { cols: number; rows: number }): boolean {
  const grid = unprojectBoardPoint({ left: ground.x, top: ground.y });
  return grid.x >= -0.5 && grid.y >= -0.5 && grid.x < board.cols - 0.5 && grid.y < board.rows - 0.5;
}

export interface TownPlanResult {
  /** The buildings, depth-sorted, dense in the middle and fraying at the edge. */
  placements: FloatingArtworkPlacement[];
  /** Plots the plan offered inside the dragged area, before any rejection. */
  plotsOffered: number;
  /** Plots dropped for landing on the playable board. */
  rejectedOnBoard: number;
  /** Plots dropped for standing too close to something already placed. */
  rejectedSpacing: number;
}

/**
 * Plan a town inside the dragged area. The result carries WHY plots were dropped, so the editor
 * can name the real cause instead of blaming frontage for a town the board filter rejected.
 */
export function planTown(input: TownPlanInput): TownPlanResult {
  const { bounds, params, geometry, board, existing } = input;
  const empty: TownPlanResult = {
    placements: [], plotsOffered: 0, rejectedOnBoard: 0, rejectedSpacing: 0,
  };
  const buildings = params.buildingIds.filter((id) => geometry.directions(id).length > 0);
  if (!buildings.length || params.size <= 0 || params.plotWidth <= 0) return empty;
  const area = {
    minX: Math.min(bounds.minX, bounds.maxX),
    maxX: Math.max(bounds.minX, bounds.maxX),
    minY: Math.min(bounds.minY, bounds.maxY),
    maxY: Math.max(bounds.minY, bounds.maxY),
  };
  // A thin strip is a valid town (a roadside row), so only a selection with no extent on BOTH
  // axes is rejected. The street skeleton handles the degenerate axis by running along the other.
  if (area.maxX - area.minX < 1 && area.maxY - area.minY < 1) return empty;
  const centreCell = townBoundsCentre(area);
  const centreSeat = projectBoardPoint(centreCell);
  const centerX = centreSeat.left;
  const centerY = centreSeat.top;

  const seed = params.seed >>> 0;
  const profile = PLAN_PROFILES[params.plan] ?? PLAN_PROFILES.linear;
  const looseness = clamp(params.looseness, 0, 1);
  const wobble = clamp(params.facingWobble, 0, 1);
  // Setback is an ideal, not a floor. On a small selection the full setback would consume the
  // whole area and leave no street to front, so it scales down with the area in SCENE pixels:
  // a tight selection gets a tighter town rather than an empty one.
  const corners = townBoundsScenePolygon(area);
  const sceneHalfW = (Math.max(...corners.map((c) => c.x)) - Math.min(...corners.map((c) => c.x))) / 2;
  const sceneHalfH = (Math.max(...corners.map((c) => c.y)) - Math.min(...corners.map((c) => c.y))) / 2;
  const setback = Math.max(4, Math.min(params.setback, Math.min(sceneHalfW, sceneHalfH) * 0.45));
  const streets = townStreets(params.plan, area, setback, seed);

  // 1. Lay out every plot the plan offers, along street frontage only.
  const plots: TownPlot[] = [];
  let index = 0;
  for (const [streetIndex, street] of streets.entries()) {
    const dx = street.x1 - street.x0;
    const dy = street.y1 - street.y0;
    const length = Math.hypot(dx, dy);
    if (length < 1) continue;
    const along = { x: dx / length, y: dy / length };
    const normal = { x: -along.y, y: along.x };
    const count = Math.max(1, Math.floor(length / params.plotWidth));

    for (const side of street.sides) {
      for (let step = 0; step < count; step += 1) {
        index += 1;
        const t = (step + 0.5) * (length / count);
        const slideAlong = (hashUnit(streetIndex, index, seed, 21) - 0.5) * 2
          * profile.alongSlack * looseness * params.plotWidth;
        const slideOut = (hashUnit(streetIndex, index, seed, 22) - 0.5) * 2
          * profile.setbackSlack * looseness * setback;
        const offset = setback + slideOut;
        const ground = {
          x: street.x0 + along.x * (t + slideAlong) + normal.x * offset * side,
          y: street.y0 + along.y * (t + slideAlong) + normal.y * offset * side,
        };
        // The selection is a hard boundary. It is a GRID rect, so containment is tested after
        // unprojecting the ground point — the region is a diamond on screen, not a rectangle.
        const cell = unprojectBoardPoint({ left: ground.x, top: ground.y });
        if (cell.x < area.minX || cell.x > area.maxX
          || cell.y < area.minY || cell.y > area.maxY) continue;
        plots.push({
          ground,
          // Face back across the setback toward the street centreline.
          faceX: -normal.x * side,
          faceY: -normal.y * side,
          index,
          radius: Math.hypot(ground.x - centerX, ground.y - centerY),
        });
      }
    }
  }
  if (!plots.length) return empty;

  // 2. Take the most central plots first, with a little noise so the edge frays instead of
  //    ending on a clean circle. This is the density gradient.
  const ordered = [...plots].sort((left, right) => {
    const a = left.radius * (0.75 + hashUnit(left.index, 0, seed, 23) * 0.5);
    const b = right.radius * (0.75 + hashUnit(right.index, 0, seed, 23) * 0.5);
    return a - b;
  });

  const occupied: ForestGroundPoint[] = [];
  for (const placement of existing) {
    const ground = floatingArtworkGroundPoint(placement, geometry);
    if (ground) occupied.push(ground);
  }

  const prefix = townIdPrefix(area);
  const spacing = Math.max(0, params.spacing);
  const scaleLow = Math.min(params.scaleMin, params.scaleMax);
  const scaleHigh = Math.max(params.scaleMin, params.scaleMax);
  const mean = clamp(params.scaleMean, scaleLow, scaleHigh);
  // Vary around the AVERAGE and stay inside the boundaries: two rolls give a centre-weighted
  // spread, so most buildings sit near the average rather than smeared across the whole range.
  const halfRange = Math.min(mean - scaleLow, scaleHigh - mean);

  const produced: Array<{ placement: FloatingArtworkPlacement; ground: ForestGroundPoint }> = [];
  const landmarks = params.landmarkIds.filter((id) => geometry.directions(id).length > 0);
  let serial = 0;

  let rejectedOnBoard = 0;
  let rejectedSpacing = 0;
  for (const plot of ordered) {
    if (produced.length >= params.size) break;
    if (params.avoidPlayableBoard && onPlayableBoard(plot.ground, board)) { rejectedOnBoard += 1; continue; }

    // The focal structure takes the most central plot, then ordinary buildings fill the rest.
    const isLandmark = landmarks.length > 0 && produced.length === 0;
    const pool = isLandmark ? landmarks : buildings;
    const sourceArtId = pool[Math.floor(hashUnit(plot.index, 1, seed, 24) * pool.length) % pool.length];
    const installed = geometry.directions(sourceArtId);
    let direction = facingTowards(plot.faceX, plot.faceY, installed);
    if (!direction) continue;
    if (wobble > 0 && hashUnit(plot.index, 2, seed, 25) < profile.facingSlack * wobble) {
      direction = turnFacing(direction, hashUnit(plot.index, 3, seed, 26) < 0.5 ? -1 : 1, installed);
    }
    const sprite = geometry.sprite(sourceArtId, direction);
    if (!sprite) continue;

    const spreadRoll = hashUnit(plot.index, 4, seed, 27) + hashUnit(plot.index, 5, seed, 28) - 1;
    const instanceScale = clamp(
      Math.round((mean + spreadRoll * halfRange) * 1000) / 1000,
      Math.max(0.1, scaleLow),
      Math.min(8, scaleHigh),
    ) * (isLandmark ? 1.15 : 1);

    const scale = clamp(Math.round(instanceScale * 1000) / 1000, 0.1, 8);
    const placement: FloatingArtworkPlacement = {
      id: `${prefix}${serial}`,
      sourceArtId,
      ...groundPointToPixel(plot.ground, sprite, scale),
      direction,
      scale,
    };

    // Measure against where the sprite actually lands, after integer rounding.
    const seated = floatingArtworkGroundPoint(placement, geometry) ?? plot.ground;
    if (spacing > 0 && occupied.some((point) => Math.hypot(point.x - seated.x, point.y - seated.y) < spacing)) {
      rejectedSpacing += 1;
      continue;
    }
    occupied.push(seated);
    produced.push({ placement, ground: seated });
    serial += 1;
  }

  return {
    placements: produced
      .sort((a, b) => (a.ground.y === b.ground.y ? a.ground.x - b.ground.x : a.ground.y - b.ground.y))
      .map((entry) => entry.placement),
    plotsOffered: plots.length,
    rejectedOnBoard,
    rejectedSpacing,
  };
}
