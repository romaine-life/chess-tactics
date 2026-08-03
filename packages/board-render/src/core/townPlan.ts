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

import { TILE_STEP_X, TILE_STEP_Y, TILE_TOP_HEIGHT, TILE_TOP_WIDTH } from '../art/projectionContract';
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

export type TownFitPolicy = 'drop' | 'shrink';

export const TOWN_FIT_POLICIES: readonly TownFitPolicy[] = ['drop', 'shrink'];

export const TOWN_FIT_LABELS: Record<TownFitPolicy, string> = {
  drop: 'Fewer buildings',
  shrink: 'Smaller buildings',
};

export const TOWN_FIT_NOTES: Record<TownFitPolicy, string> = {
  drop: 'Keep every building at its section size and site fewer of them where the ground is tight.',
  shrink: 'Keep the count up by building smaller where it is tight, down to the section minimum.',
};

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

/**
 * One band of a town: its own buildings and its own size range, taking a share of the total.
 *
 * A town is rarely uniform — a row of large houses along the main street and smaller ones behind
 * it is the normal case. Sections carry that, and `blend` decides whether they occupy separate
 * parts of the town, interleave completely, or meet across a graded band.
 */
export interface TownSection {
  id: string;
  /** Building sources this section draws from. */
  buildingIds: readonly string[];
  /** Relative weight against the other sections. Shares are normalised, so they need not sum to 1. */
  share: number;
  /** Average building scale for this section, and the boundaries it may vary between. */
  scaleMean: number;
  scaleMin: number;
  scaleMax: number;
}

export const DEFAULT_TOWN_SECTION: Omit<TownSection, 'id'> = {
  buildingIds: [],
  share: 1,
  scaleMean: 1,
  scaleMin: 0.75,
  scaleMax: 1.35,
};

export interface TownPlanParams {
  /** The bands the town is built from. A plot belongs to exactly one. */
  sections: readonly TownSection[];
  /**
   * How the sections meet, across the town's long axis.
   * 0 keeps each section in its own stretch of the town, divided sharply.
   * 1 interleaves them completely, so a big house may stand next to a small one anywhere.
   * Between the two, sections hold their own ground but mingle across a band at the divide,
   * and the band widens as this rises.
   */
  blend: number;
  /** Optional focal structures (a mill, a castle). At most one is sited per town. */
  landmarkIds: readonly string[];
  plan: TownPlanKind;
  /** How many buildings to site, before spacing and board rejection thin it. */
  size: number;
  /** Average frontage per building along a street, in scene pixels. */
  plotWidth: number;
  /** Distance from a street's centreline to the buildings that face it. */
  setback: number;
  // Extent is not a parameter: the author drags the area the town fills.
  /** 0 keeps every building on its surveyed plot; 1 lets the plan run to its tolerances. */
  looseness: number;
  /** 0 makes every building face its street exactly; 1 lets facings turn off-axis. */
  facingWobble: number;
  /** Clear ground left between two buildings' footprints, in scene pixels. */
  spacing: number;
  /**
   * What to do when a building will not fit — because it would overlap a neighbour or overhang
   * the selection. Buildings are not points: a house occupies real ground and cannot intersect
   * another one, so something has to give.
   * 'drop' keeps every building at its section's size and sites fewer of them.
   * 'shrink' keeps the count up by building smaller where it is tight, down to the section floor.
   */
  fit: TownFitPolicy;
  /** Skip buildings whose ground point lands on a playable board cell. */
  avoidPlayableBoard: boolean;
  seed: number;
}

/** Shipped baseline. The Town panel renders from this and its Reset restores from it (ADR-0057). */
export const TOWN_PLAN_DEFAULTS: TownPlanParams = {
  sections: [{ id: 'a', ...DEFAULT_TOWN_SECTION }],
  blend: 0.35,
  landmarkIds: [],
  plan: 'linear',
  size: 14,
  plotWidth: 110,
  setback: 78,
  looseness: 0.45,
  facingWobble: 0.2,
  spacing: 10,
  fit: 'shrink',
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

/**
 * The ground a building occupies, as an ellipse in scene pixels.
 *
 * Houses cannot intersect, so they need real extent — a point plus a "minimum spacing" says
 * nothing, because a lodge is several hundred pixels across and the gap between two ground points
 * is not the gap between two buildings. The ellipse is wide as the drawn sprite and half as deep,
 * which is what a rectangular footprint looks like foreshortened onto this projection.
 */
export interface TownFootprint {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

/** Ground the building covers, padded by half the requested gap so two of them leave the full gap. */
export function townFootprint(
  ground: ForestGroundPoint,
  sprite: { w: number; h: number; scale: number },
  instanceScale: number,
  gap: number,
): TownFootprint {
  const drawnWidth = sprite.w * sprite.scale * instanceScale;
  // Sprites are square frames around art that does not fill them, so the mass is a fraction of the
  // frame rather than all of it.
  const rx = drawnWidth * 0.34 + Math.max(0, gap) / 2;
  return { x: ground.x, y: ground.y, rx, ry: rx * 0.5 };
}

export function footprintsOverlap(a: TownFootprint, b: TownFootprint): boolean {
  const dx = (a.x - b.x) / (a.rx + b.rx);
  const dy = (a.y - b.y) / (a.ry + b.ry);
  return dx * dx + dy * dy < 1;
}

/**
 * The footprint's half-extent in GRID cells, on both axes.
 *
 * Exact rather than sampled. Unprojecting the ellipse gives
 *   gx = gx0 + (rx cos t / stepX + ry sin t / stepY) / 2
 * whose extreme over t is sqrt((rx/stepX)^2 + (ry/stepY)^2) / 2 — and the same falls out for gy,
 * so one radius covers both. Sampling points on the ellipse misses the true extreme; testing its
 * bounding-box corners overshoots it and throws away usable ground.
 */
export function footprintGridRadius(box: TownFootprint): number {
  return Math.sqrt((box.rx / TILE_STEP_X) ** 2 + (box.ry / TILE_STEP_Y) ** 2) / 2;
}

/** True when the whole footprint sits inside the selection, not merely its centre. */
function footprintWithin(box: TownFootprint, area: TownBounds): boolean {
  const radius = footprintGridRadius(box);
  const centre = unprojectBoardPoint({ left: box.x, top: box.y });
  return centre.x - radius >= area.minX && centre.x + radius <= area.maxX
    && centre.y - radius >= area.minY && centre.y + radius <= area.maxY;
}

interface TownPlot {
  ground: ForestGroundPoint;
  /** Normalised position along the town's long axis, 0..1. Decides which section claims it. */
  axis: number;
  /** Screen-space vector from the plot back toward its street — the direction it must face. */
  faceX: number;
  faceY: number;
  index: number;
  /** Distance from the town centre, used for the density gradient. */
  radius: number;
}

export interface TownPlanInput {
  /** Identity of the town being planned. Its buildings are tagged with it. */
  townId: string;
  /** The area the author dragged. The town fills it and never leaves it. */
  bounds: TownBounds;
  params: TownPlanParams;
  geometry: ForestSpeciesGeometry;
  board: { cols: number; rows: number };
  /** Scene art already present, for spacing rejection. Town members are excluded by the caller. */
  existing: readonly FloatingArtworkPlacement[];
}

/**
 * Id prefix for one town INSTANCE. Keyed by the town's own id rather than by its area, so a town
 * can be re-tuned, re-seeded and re-dragged without losing hold of the buildings it already owns,
 * and so a board can carry as many towns as the author wants without them colliding.
 */
export function townIdPrefix(townId: string): string {
  return `t${townId}.`;
}

/** True when a placement belongs to this town instance. */
export function isTownMember(placement: FloatingArtworkPlacement, townId: string): boolean {
  return placement.id.startsWith(townIdPrefix(townId));
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
  /** Plots dropped because the building would have overlapped another. */
  rejectedSpacing: number;
  /** Plots dropped because the building would have overhung the selection. */
  rejectedOutside: number;
}

/**
 * Plan a town inside the dragged area. The result carries WHY plots were dropped, so the editor
 * can name the real cause instead of blaming frontage for a town the board filter rejected.
 */
export function planTown(input: TownPlanInput): TownPlanResult {
  const { townId, bounds, params, geometry, board, existing } = input;
  const empty: TownPlanResult = {
    placements: [], plotsOffered: 0, rejectedOnBoard: 0, rejectedSpacing: 0, rejectedOutside: 0,
  };
  // Only sections that can actually draw something count, so an empty section neither takes a
  // share of the town nor leaves a hole in it.
  const sections = params.sections
    .map((section) => ({
      ...section,
      buildingIds: section.buildingIds.filter((id) => geometry.directions(id).length > 0),
    }))
    .filter((section) => section.buildingIds.length > 0 && section.share > 0);
  if (!sections.length || params.size <= 0 || params.plotWidth <= 0) return empty;
  const shareTotal = sections.reduce((sum, section) => sum + section.share, 0);
  // Cumulative share bands across the town's long axis. A plot's position picks its section.
  const bands: Array<{ end: number; section: (typeof sections)[number] }> = [];
  let running = 0;
  for (const section of sections) {
    running += section.share / shareTotal;
    bands.push({ end: running, section });
  }
  bands[bands.length - 1].end = 1;
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
        // Coarse reject on the plot centre; the real boundary test is on the building's whole
        // footprint once its size is known, since the sprite reaches well past its ground point.
        const cell = unprojectBoardPoint({ left: ground.x, top: ground.y });
        if (cell.x < area.minX || cell.x > area.maxX
          || cell.y < area.minY || cell.y > area.maxY) continue;
        plots.push({
          ground,
          axis: 0,
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

  // 2. Fix each plot's position along the town's LONG axis, normalised across the plots that
  //    actually exist. Sections are laid out along this axis, so a two-section town reads as one
  //    stretch of large houses giving way to another of small ones rather than as noise.
  {
    const wide = Math.abs(area.maxX - area.minX) >= Math.abs(area.maxY - area.minY);
    const coordinate = (plot: TownPlot): number => {
      const cell = unprojectBoardPoint({ left: plot.ground.x, top: plot.ground.y });
      return wide ? cell.x : cell.y;
    };
    const values = plots.map(coordinate);
    const low = Math.min(...values);
    const span = Math.max(...values) - low;
    plots.forEach((plot, i) => { plot.axis = span > 0 ? (values[i] - low) / span : 0.5; });
  }

  // 3. Take the most central plots first, with a little noise so the edge frays instead of
  //    ending on a clean circle. This is the density gradient.
  const ordered = [...plots].sort((left, right) => {
    const a = left.radius * (0.75 + hashUnit(left.index, 0, seed, 23) * 0.5);
    const b = right.radius * (0.75 + hashUnit(right.index, 0, seed, 23) * 0.5);
    return a - b;
  });

  const prefix = townIdPrefix(townId);
  const spacing = Math.max(0, params.spacing);

  // Scene art already on the board takes up ground too, so a town cannot be built through it.
  const occupied: TownFootprint[] = [];
  for (const placement of existing) {
    const ground = floatingArtworkGroundPoint(placement, geometry);
    const sprite = geometry.sprite(placement.sourceArtId, placement.direction);
    if (ground && sprite) occupied.push(townFootprint(ground, sprite, placement.scale, spacing));
  }


  const produced: Array<{ placement: FloatingArtworkPlacement; ground: ForestGroundPoint }> = [];
  const landmarks = params.landmarkIds.filter((id) => geometry.directions(id).length > 0);
  let serial = 0;

  let rejectedOnBoard = 0;
  let rejectedSpacing = 0;
  let rejectedOutside = 0;
  for (const plot of ordered) {
    if (produced.length >= params.size) break;
    if (params.avoidPlayableBoard && onPlayableBoard(plot.ground, board)) { rejectedOnBoard += 1; continue; }

    // The focal structure takes the most central plot, then ordinary buildings fill the rest.
    const isLandmark = landmarks.length > 0 && produced.length === 0;
    // Which section claims this plot. Blend displaces the plot's position along the axis before
    // the band lookup: at 0 the bands are hard-edged, and as it rises the displacement grows until
    // a plot can land in any band at all, which is a full interleave.
    const drift = (hashUnit(plot.index, 7, seed, 29) - 0.5) * clamp(params.blend, 0, 1);
    const at = clamp(plot.axis + drift, 0, 1);
    const section = (bands.find((band) => at <= band.end) ?? bands[bands.length - 1]).section;
    const pool = isLandmark ? landmarks : section.buildingIds;
    const sourceArtId = pool[Math.floor(hashUnit(plot.index, 1, seed, 24) * pool.length) % pool.length];
    const installed = geometry.directions(sourceArtId);
    let direction = facingTowards(plot.faceX, plot.faceY, installed);
    if (!direction) continue;
    if (wobble > 0 && hashUnit(plot.index, 2, seed, 25) < profile.facingSlack * wobble) {
      direction = turnFacing(direction, hashUnit(plot.index, 3, seed, 26) < 0.5 ? -1 : 1, installed);
    }
    const sprite = geometry.sprite(sourceArtId, direction);
    if (!sprite) continue;

    // Size comes from the SECTION, which is what lets one part of a town be built large and
    // another small. Two rolls give a centre-weighted spread, so most buildings sit near the
    // section's average rather than smeared across its range.
    const scaleLow = Math.min(section.scaleMin, section.scaleMax);
    const scaleHigh = Math.max(section.scaleMin, section.scaleMax);
    const mean = clamp(section.scaleMean, scaleLow, scaleHigh);
    const halfRange = Math.min(mean - scaleLow, scaleHigh - mean);
    const spreadRoll = hashUnit(plot.index, 4, seed, 27) + hashUnit(plot.index, 5, seed, 28) - 1;
    const instanceScale = clamp(
      Math.round((mean + spreadRoll * halfRange) * 1000) / 1000,
      Math.max(0.1, scaleLow),
      Math.min(8, scaleHigh),
    ) * (isLandmark ? 1.15 : 1);

    // A building is not a point. Try it at its section's size, and if it will not fit, either take
    // the plot away or build smaller on it, depending on the fit policy.
    const wanted = clamp(Math.round(instanceScale * 1000) / 1000, 0.1, 8);
    const floor = Math.max(0.1, Math.min(scaleLow, wanted));
    let placed: { placement: FloatingArtworkPlacement; ground: ForestGroundPoint; box: TownFootprint } | null = null;
    let blockedBy: 'overlap' | 'outside' = 'overlap';

    for (let attempt = 0; attempt < (params.fit === 'shrink' ? 12 : 1); attempt += 1) {
      // Step down geometrically, never below the section's own minimum.
      const scale = attempt === 0 ? wanted : Math.max(floor, Math.round(wanted * 0.88 ** attempt * 1000) / 1000);
      const candidate: FloatingArtworkPlacement = {
        id: `${prefix}${serial}`,
        sourceArtId,
        ...groundPointToPixel(plot.ground, sprite, scale),
        direction,
        scale,
      };
      // Measure against where the sprite actually lands, after integer rounding.
      const seated = floatingArtworkGroundPoint(candidate, geometry) ?? plot.ground;
      const box = townFootprint(seated, sprite, scale, spacing);
      if (!footprintWithin(box, area)) {
        blockedBy = 'outside';
      } else if (occupied.some((other) => footprintsOverlap(box, other))) {
        blockedBy = 'overlap';
      } else {
        placed = { placement: candidate, ground: seated, box };
        break;
      }
      if (scale <= floor) break;
    }

    if (!placed) {
      if (blockedBy === 'outside') rejectedOutside += 1; else rejectedSpacing += 1;
      continue;
    }
    occupied.push(placed.box);
    produced.push({ placement: placed.placement, ground: placed.ground });
    serial += 1;
  }

  return {
    placements: produced
      .sort((a, b) => (a.ground.y === b.ground.y ? a.ground.x - b.ground.x : a.ground.y - b.ground.y))
      .map((entry) => entry.placement),
    plotsOffered: plots.length,
    rejectedOnBoard,
    rejectedSpacing,
    rejectedOutside,
  };
}
