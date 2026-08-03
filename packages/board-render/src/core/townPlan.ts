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
  /** Overall town extent in scene pixels. */
  spread: number;
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
  spread: 460,
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
 * The street skeleton for a plan. Streets are line segments in scene pixels, centred on the town.
 * Every building in the town hangs off one of these; nothing is placed on open ground.
 */
export function townStreets(
  plan: TownPlanKind,
  centerX: number,
  centerY: number,
  spread: number,
  seed: number,
): TownStreet[] {
  const at = (dx: number, dy: number): { x: number; y: number } => ({ x: centerX + dx, y: centerY + dy });
  // Streets are laid out in screen space but squashed vertically to sit along the iso ground plane.
  const squash = 0.62;
  const angle = (hashUnit(0, 0, seed, 11) - 0.5) * 0.7;
  const rotate = (dx: number, dy: number): { x: number; y: number } => at(
    dx * Math.cos(angle) - dy * Math.sin(angle),
    (dx * Math.sin(angle) + dy * Math.cos(angle)) * squash,
  );

  if (plan === 'linear') {
    // A single street with a slight bend, so the row is not a ruler-straight line.
    const bend = (hashUnit(1, 0, seed, 12) - 0.5) * spread * 0.22;
    const a = rotate(-spread, 0);
    const mid = rotate(0, bend);
    const b = rotate(spread, 0);
    return [
      { x0: a.x, y0: a.y, x1: mid.x, y1: mid.y, sides: [-1, 1] },
      { x0: mid.x, y0: mid.y, x1: b.x, y1: b.y, sides: [-1, 1] },
    ];
  }

  if (plan === 'crossroads') {
    const a = rotate(-spread, 0);
    const b = rotate(spread, 0);
    const c = rotate(0, -spread * 0.85);
    const d = rotate(0, spread * 0.85);
    const hub = rotate(0, 0);
    return [
      { x0: a.x, y0: a.y, x1: hub.x, y1: hub.y, sides: [-1, 1] },
      { x0: hub.x, y0: hub.y, x1: b.x, y1: b.y, sides: [-1, 1] },
      { x0: c.x, y0: c.y, x1: hub.x, y1: hub.y, sides: [-1, 1] },
      { x0: hub.x, y0: hub.y, x1: d.x, y1: d.y, sides: [-1, 1] },
    ];
  }

  if (plan === 'green') {
    // A closed ring wound counter-clockwise, so its segment normal points INWARD. Frontage is
    // therefore on side -1 (outside the ring), which puts every building's face on the green.
    const radius = spread * 0.55;
    const corners = 6;
    const streets: TownStreet[] = [];
    for (let i = 0; i < corners; i += 1) {
      const t0 = (i / corners) * Math.PI * 2;
      const t1 = ((i + 1) / corners) * Math.PI * 2;
      const wobble = 1 + (hashUnit(i, 0, seed, 13) - 0.5) * 0.18;
      const p0 = rotate(Math.cos(t0) * radius * wobble, Math.sin(t0) * radius * wobble);
      const p1 = rotate(Math.cos(t1) * radius * wobble, Math.sin(t1) * radius * wobble);
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
    const outer = 0.7 + hashUnit(i, 3, seed, 16) * 0.35;
    const p0 = rotate(Math.cos(t) * spread * inner, Math.sin(t) * spread * inner);
    const p1 = rotate(Math.cos(t) * spread * outer, Math.sin(t) * spread * outer);
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
  centerX: number;
  centerY: number;
  params: TownPlanParams;
  geometry: ForestSpeciesGeometry;
  board: { cols: number; rows: number };
  /** Scene art already present, for spacing rejection. Town members are excluded by the caller. */
  existing: readonly FloatingArtworkPlacement[];
}

/** Stable id prefix for a town sited at a point, so a regenerate replaces it rather than stacking. */
export function townIdPrefix(centerX: number, centerY: number): string {
  const key = (Math.imul(Math.round(centerX) | 0, 0x9e3779b1) ^ Math.imul(Math.round(centerY) | 0, 0x85ebca6b)) >>> 0;
  return `t${key.toString(36)}.`;
}

/** True when a placement belongs to the town sited at this point. */
export function isTownMember(placement: FloatingArtworkPlacement, centerX: number, centerY: number): boolean {
  return placement.id.startsWith(townIdPrefix(centerX, centerY));
}

function onPlayableBoard(ground: ForestGroundPoint, board: { cols: number; rows: number }): boolean {
  const grid = unprojectBoardPoint({ left: ground.x, top: ground.y });
  return grid.x >= -0.5 && grid.y >= -0.5 && grid.x < board.cols - 0.5 && grid.y < board.rows - 0.5;
}

/**
 * Site a town. Returns the buildings depth-sorted, dense in the middle and fraying at the edge.
 */
export function planTown(input: TownPlanInput): FloatingArtworkPlacement[] {
  const { centerX, centerY, params, geometry, board, existing } = input;
  const buildings = params.buildingIds.filter((id) => geometry.directions(id).length > 0);
  if (!buildings.length || params.size <= 0 || params.plotWidth <= 0) return [];

  const seed = params.seed >>> 0;
  const profile = PLAN_PROFILES[params.plan] ?? PLAN_PROFILES.linear;
  const looseness = clamp(params.looseness, 0, 1);
  const wobble = clamp(params.facingWobble, 0, 1);
  const streets = townStreets(params.plan, centerX, centerY, Math.max(40, params.spread), seed);

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
          * profile.setbackSlack * looseness * params.setback;
        const offset = params.setback + slideOut;
        const ground = {
          x: street.x0 + along.x * (t + slideAlong) + normal.x * offset * side,
          y: street.y0 + along.y * (t + slideAlong) + normal.y * offset * side,
        };
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
  if (!plots.length) return [];

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

  const prefix = townIdPrefix(centerX, centerY);
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

  for (const plot of ordered) {
    if (produced.length >= params.size) break;
    if (params.avoidPlayableBoard && onPlayableBoard(plot.ground, board)) continue;

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
      continue;
    }
    occupied.push(seated);
    produced.push({ placement, ground: seated });
    serial += 1;
  }

  return produced
    .sort((a, b) => (a.ground.y === b.ground.y ? a.ground.x - b.ground.x : a.ground.y - b.ground.y))
    .map((entry) => entry.placement);
}
