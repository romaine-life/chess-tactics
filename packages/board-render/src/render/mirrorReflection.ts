import {
  normalizeWallArtReflection,
  slotSource,
  wallArt,
  wallFaceTarget,
  WALL_ART_SLOT_DATUM,
  type WallArt,
  type WallArtPlacementMap,
  type WallArtReflectionConfig,
} from '../core/wallArt';
import { roadEdgeKey } from '../core/featureAutotile';
import {
  wallDecorAsset,
  wallDecorMirrorAperture,
  type WallDecorFaceId,
} from '../core/wallDecor';
import { TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import { WALL_FRAME_GEOMETRY } from '../art/tileset';
import type { UnitFacing } from '../core/types';
import {
  boardLabCellPosition,
  projectBoardPoint,
  type BoardGridPoint,
  type BoardSeatPoint,
} from './boardProjection';
import { mirrorGlassOverlayZIndex, mirrorReflectionOverlayZIndex, wallArtOverlayZIndex } from './sceneDepth';
import type { BoardDrawOp } from './renderPlan';

export interface PolygonBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface MirrorSurfaceTarget extends BoardGridPoint {
  face: WallDecorFaceId;
  edge?: string;
}

export interface MirrorSurface {
  id: string;
  artId: string;
  slotId: string;
  sourceId: string;
  face: WallDecorFaceId;
  anchor: BoardGridPoint;
  anchorEdge?: string;
  span: number;
  /** Absolute board-space outline, directly usable for canvas clipping or an inspector overlay. */
  aperture: number[];
  apertureBounds: PolygonBounds;
  glassOp: Omit<BoardDrawOp, 'z' | 'clipPolygons'>;
  /** Per-supporting-edge wall-face slices. They bound one continuous aperture to real wall
   * support and partition its paint depth; they never create independent reflection centers. */
  segments: MirrorSurfaceSegment[];
  reflection: WallArtReflectionConfig;
}

export interface MirrorSurfaceSegment {
  index: number;
  anchor: BoardGridPoint;
  edge?: string;
  supportPolygon: number[];
  apertureClip: number[];
  glassZ: number;
  z: number;
}

export interface MirrorReflectionSubject {
  /** The current source op, including transient alpha/scale used by live movement. */
  op: BoardDrawOp;
  /** Exact continuous board-grid position. The tangent coordinate decides whether this subject
   * intersects the mirror's covered wall-cell corridor. */
  grid: BoardGridPoint;
  /** Exact continuous board-space seat in projected pixels. Integer cells and in-flight animation
  * both use this shape; reflection placement comes from grid, while seat preserves sprite-local
  * offsets from the physical draw operation. */
  seat: BoardSeatPoint;
  /** Semantic board-grid facing from physical piece state, never inferred from its raster URL. */
  facing: UnitFacing;
  /** Resolve an ordinary, unflipped accepted asset for another facing of this same unit/palette. */
  spriteForFacing: (facing: UnitFacing) => string;
}

export interface MirrorFacingPlan {
  /** The orientation of the virtual piece after reflecting its board-facing vector in the wall. */
  reflectedFacing: UnitFacing;
  /** The canonical directional asset which appears as reflectedFacing after screen flip. */
  sourceFacing: UnitFacing;
  /** Directional reflections always flip the selected raster to preserve mirror chirality. */
  flipX: true;
}

/** Reflecting a board-facing vector in the west wall negates grid X. */
const WEST_WALL_REFLECTED_FACING: Readonly<Record<UnitFacing, UnitFacing>> = {
  north: 'north',
  'north-east': 'north-west',
  east: 'west',
  'south-east': 'south-west',
  south: 'south',
  'south-west': 'south-east',
  west: 'east',
  'north-west': 'north-east',
};

/** Reflecting a board-facing vector in the north wall negates grid Y. */
const NORTH_WALL_REFLECTED_FACING: Readonly<Record<UnitFacing, UnitFacing>> = {
  north: 'south',
  'north-east': 'south-east',
  east: 'east',
  'south-east': 'north-east',
  south: 'north',
  'south-west': 'north-west',
  west: 'west',
  'north-west': 'south-west',
};

/** Under the canonical projection, a horizontal raster flip swaps the apparent board X and Y
 * facing components. This map is its own inverse, so it also selects the source direction whose
 * flipped pixels present a requested target direction. */
const SCREEN_HORIZONTAL_FLIP_FACING: Readonly<Record<UnitFacing, UnitFacing>> = {
  north: 'west',
  'north-east': 'south-west',
  east: 'south',
  'south-east': 'south-east',
  south: 'east',
  'south-west': 'north-east',
  west: 'north',
  'north-west': 'north-west',
};

/** Plan a face-specific virtual orientation and the directional raster needed to render it with
 * true mirror chirality. Selecting reflectedFacing directly and then flipping would be wrong: in
 * this isometric projection that flip changes its apparent board facing by swapping X and Y. */
export function mirrorFacingPlan(
  face: WallDecorFaceId,
  facing: UnitFacing,
): MirrorFacingPlan {
  const reflectedFacing = face === 'west'
    ? WEST_WALL_REFLECTED_FACING[facing]
    : NORTH_WALL_REFLECTED_FACING[facing];
  return {
    reflectedFacing,
    sourceFacing: SCREEN_HORIZONTAL_FLIP_FACING[reflectedFacing],
    flipX: true,
  };
}

export function polygonBounds(polygon: readonly number[]): PolygonBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index + 1 < polygon.length; index += 2) {
    minX = Math.min(minX, polygon[index]);
    minY = Math.min(minY, polygon[index + 1]);
    maxX = Math.max(maxX, polygon[index]);
    maxY = Math.max(maxY, polygon[index + 1]);
  }
  if (!Number.isFinite(minX)) return { left: 0, top: 0, width: 0, height: 0 };
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

export function polygonOutline(polygon: readonly number[]): BoardSeatPoint[] {
  const points: BoardSeatPoint[] = [];
  for (let index = 0; index + 1 < polygon.length; index += 2) {
    points.push({ left: polygon[index], top: polygon[index + 1] });
  }
  return points;
}

function polygonSignedArea(polygon: readonly number[]): number {
  let area = 0;
  for (let index = 0; index + 1 < polygon.length; index += 2) {
    const next = (index + 2) % polygon.length;
    area += polygon[index] * polygon[next + 1] - polygon[next] * polygon[index + 1];
  }
  return area / 2;
}

function lineIntersection(
  start: BoardSeatPoint,
  end: BoardSeatPoint,
  clipStart: BoardSeatPoint,
  clipEnd: BoardSeatPoint,
): BoardSeatPoint {
  const sx = end.left - start.left;
  const sy = end.top - start.top;
  const cx = clipEnd.left - clipStart.left;
  const cy = clipEnd.top - clipStart.top;
  const denominator = sx * cy - sy * cx;
  if (Math.abs(denominator) < 1e-9) return end;
  const t = ((clipStart.left - start.left) * cy - (clipStart.top - start.top) * cx) / denominator;
  return { left: start.left + t * sx, top: start.top + t * sy };
}

/** Sutherland-Hodgman intersection used to combine a frame-owned aperture with one convex
 * supporting-edge band. The gallery still has one aperture; the resulting pieces only partition
 * paint order so later wall tiles cannot seam across it. */
export function clipPolygonToConvex(subject: readonly number[], clip: readonly number[]): number[] {
  let output = polygonOutline(subject);
  const clipPoints = polygonOutline(clip);
  if (output.length < 3 || clipPoints.length < 3) return [];
  const orientation = Math.sign(polygonSignedArea(clip)) || 1;
  const inside = (point: BoardSeatPoint, a: BoardSeatPoint, b: BoardSeatPoint): boolean => {
    const cross = (b.left - a.left) * (point.top - a.top) - (b.top - a.top) * (point.left - a.left);
    return orientation > 0 ? cross >= -1e-7 : cross <= 1e-7;
  };
  for (let edge = 0; edge < clipPoints.length; edge += 1) {
    const clipStart = clipPoints[edge];
    const clipEnd = clipPoints[(edge + 1) % clipPoints.length];
    const input = output;
    output = [];
    if (!input.length) break;
    let start = input[input.length - 1];
    for (const end of input) {
      const endInside = inside(end, clipStart, clipEnd);
      const startInside = inside(start, clipStart, clipEnd);
      if (endInside) {
        if (!startInside) output.push(lineIntersection(start, end, clipStart, clipEnd));
        output.push(end);
      } else if (startInside) {
        output.push(lineIntersection(start, end, clipStart, clipEnd));
      }
      start = end;
    }
  }
  return output.flatMap((point) => [point.left, point.top]);
}

const SEGMENT_VERTICAL_EXTENT = 512;

function wallArtSegmentBoundary(
  target: MirrorSurfaceTarget,
  segmentIndex: number,
  segmentCount: number,
): { start: BoardSeatPoint; end: BoardSeatPoint } {
  const anchor = target.face === 'west'
    ? { x: target.x, y: target.y + segmentIndex }
    : { x: target.x + segmentIndex, y: target.y };
  const seat = projectBoardPoint(anchor);
  const tangent = target.face === 'west'
    ? { left: -TILE_STEP_X, top: TILE_STEP_Y }
    : { left: TILE_STEP_X, top: TILE_STEP_Y };
  let start = { left: seat.left, top: seat.top + WALL_FRAME_GEOMETRY.backEdgeApexOffsetY };
  let end = { left: start.left + tangent.left, top: start.top + tangent.top };
  if (segmentIndex === 0) {
    start = { left: start.left - tangent.left / 2, top: start.top - tangent.top / 2 };
  }
  if (segmentIndex === segmentCount - 1) {
    end = { left: end.left + tangent.left / 2, top: end.top + tangent.top / 2 };
  }
  return { start, end };
}

/** A coplanar, non-overlapping screen-space depth band for ordinary multi-cell wall art. It is
 * deliberately unbounded across the wall/floor seam because it partitions painter order only. */
export function wallArtSegmentDepthBandPolygon(
  target: MirrorSurfaceTarget,
  segmentIndex: number,
  segmentCount: number,
): number[] {
  const { start, end } = wallArtSegmentBoundary(target, segmentIndex, segmentCount);
  return [
    start.left, start.top - SEGMENT_VERTICAL_EXTENT,
    end.left, end.top - SEGMENT_VERTICAL_EXTENT,
    end.left, end.top + SEGMENT_VERTICAL_EXTENT,
    start.left, start.top + SEGMENT_VERTICAL_EXTENT,
  ];
}

/** The finite visual wall face supporting one mirror segment. Its lower edge is the generated
 * wall's exact back-edge/floor seam, so frame, glass, and reflection pixels on the board side are
 * hidden by the boundary tile. First/last segments retain a half-cell tangent overhang. */
export function mirrorSegmentSupportPolygon(
  target: MirrorSurfaceTarget,
  segmentIndex: number,
  segmentCount: number,
): number[] {
  const { start, end } = wallArtSegmentBoundary(target, segmentIndex, segmentCount);
  return [
    start.left, start.top - SEGMENT_VERTICAL_EXTENT,
    end.left, end.top - SEGMENT_VERTICAL_EXTENT,
    end.left, end.top,
    start.left, start.top,
  ];
}

/** Projected visual floor seam used by every perimeter mirror support polygon. */
export function mirrorWallFloorBoundaryY(face: WallDecorFaceId, screenX: number): number {
  const slope = TILE_STEP_Y / TILE_STEP_X;
  return WALL_FRAME_GEOMETRY.backEdgeApexOffsetY + (face === 'west' ? -slope : slope) * screenX;
}

function surfaceSegments(
  art: WallArt,
  target: MirrorSurfaceTarget,
  aperture: readonly number[],
): MirrorSurfaceSegment[] {
  const count = Math.max(1, art.span);
  return Array.from({ length: count }, (_, index) => {
    const anchor = target.face === 'west'
      ? { x: target.x, y: target.y + index }
      : { x: target.x + index, y: target.y };
    const supportPolygon = mirrorSegmentSupportPolygon(target, index, count);
    const edge = target.edge
      ? target.face === 'west'
        ? roadEdgeKey(0, anchor.y, -1, anchor.y)
        : roadEdgeKey(anchor.x, 0, anchor.x, -1)
      : undefined;
    return {
      index,
      anchor,
      ...(edge ? { edge } : {}),
      supportPolygon,
      apertureClip: clipPolygonToConvex(aperture, supportPolygon),
      glassZ: mirrorGlassOverlayZIndex(anchor),
      z: mirrorReflectionOverlayZIndex(anchor),
    };
  });
}

/** Pure draft builder used by Studio: no registry mutation, so unsaved reflection controls can be
 * previewed against the exact same surface geometry used by gameplay and thumbnails. */
export function mirrorSurfacesForArt(art: WallArt, target: MirrorSurfaceTarget): MirrorSurface[] {
  const cell = boardLabCellPosition(target);
  const reflection = normalizeWallArtReflection(art.reflection);
  const surfaces: MirrorSurface[] = [];

  for (const slot of art.slots) {
    if (slot.face !== target.face) continue;
    const source = slotSource(slot);
    if (source.kind !== 'mirror') continue;
    const normalized = wallDecorMirrorAperture(source, target.face);
    if (!normalized) continue;
    const face = source.faces[target.face];
    const dx = cell.left - WALL_ART_SLOT_DATUM.anchorX + slot.x - face.mountX * slot.scale;
    const dy = cell.top - WALL_ART_SLOT_DATUM.anchorY + slot.y - face.mountY * slot.scale;
    const aperture: number[] = [];
    for (let index = 0; index + 1 < normalized.length; index += 2) {
      aperture.push(
        dx + normalized[index] * face.width * slot.scale,
        dy + normalized[index + 1] * face.height * slot.scale,
      );
    }
    const bounds = polygonBounds(aperture);
    surfaces.push({
      id: `${art.id}:${slot.id}:${target.edge ?? `${target.x},${target.y}`}`,
      artId: art.id,
      slotId: slot.id,
      sourceId: source.id,
      face: target.face,
      anchor: { x: target.x, y: target.y },
      ...(target.edge ? { anchorEdge: target.edge } : {}),
      span: art.span,
      aperture,
      apertureBounds: bounds,
      glassOp: {
        src: face.glassSrc,
        dx,
        dy,
        dw: face.width * slot.scale,
        dh: face.height * slot.scale,
      },
      segments: surfaceSegments(art, target, aperture),
      reflection,
    });
  }
  return surfaces;
}

/** Resolve every placed mirror from its anchor edge and authored slots. Span affects occupancy;
 * the actual continuous glass outline comes from the transformed source aperture, so an oversized
 * three-wall gallery remains one surface rather than three seams. */
export function mirrorSurfacesForPlacements(
  placements: WallArtPlacementMap | undefined,
  bounds: { cols: number; rows: number },
): MirrorSurface[] {
  const surfaces: MirrorSurface[] = [];
  for (const [anchorEdge, artId] of Object.entries(placements ?? {})) {
    const target = wallFaceTarget(anchorEdge, bounds);
    const definition = wallArt(artId);
    if (!target || !definition) continue;
    const available = target.face === 'west' ? bounds.rows - target.y : bounds.cols - target.x;
    if (available < definition.span) continue;
    surfaces.push(...mirrorSurfacesForArt(definition, {
      x: target.x,
      y: target.y,
      face: target.face,
      edge: anchorEdge,
    }));
  }
  return surfaces;
}

export interface WallArtFramePlanOptions {
  /** When supplied, an invalid placement missing any supporting wall is omitted as a whole. */
  hasWall?: (edge: string) => boolean;
}

export function mirrorGlassOpsForSurfaces(surfaces: readonly MirrorSurface[]): BoardDrawOp[] {
  return surfaces.flatMap((surface) => surface.segments
    .filter((segment) => segment.apertureClip.length >= 6)
    .map((segment) => ({
      ...surface.glassOp,
      z: segment.glassZ,
      clipPolygons: [[...segment.apertureClip]],
    })));
}

/** Pure frame planner for an explicit normalized draft, paired with mirrorSurfacesForArt. */
export function wallArtFrameOpsForArt(
  definition: WallArt,
  target: MirrorSurfaceTarget,
): BoardDrawOp[] {
  const ops: BoardDrawOp[] = [];
  const cell = boardLabCellPosition(target);
  for (const slot of definition.slots) {
    if (slot.face !== target.face) continue;
    const source = slotSource(slot);
    const face = source.faces[target.face];
    const base: Omit<BoardDrawOp, 'z'> = {
      src: face.src,
      dx: cell.left - WALL_ART_SLOT_DATUM.anchorX + slot.x - face.mountX * slot.scale,
      dy: cell.top - WALL_ART_SLOT_DATUM.anchorY + slot.y - face.mountY * slot.scale,
      dw: face.width * slot.scale,
      dh: face.height * slot.scale,
    };
    if (definition.span === 1) {
      ops.push({
        ...base,
        z: wallArtOverlayZIndex(target),
        ...(source.kind === 'mirror'
          ? { clipPolygons: [mirrorSegmentSupportPolygon(target, 0, 1)] }
          : {}),
      });
      continue;
    }
    for (let index = 0; index < definition.span; index += 1) {
      const anchor = target.face === 'west'
        ? { x: target.x, y: target.y + index }
        : { x: target.x + index, y: target.y };
      ops.push({
        ...base,
        z: wallArtOverlayZIndex(anchor),
        clipPolygons: [source.kind === 'mirror'
          ? mirrorSegmentSupportPolygon(target, index, definition.span)
          : wallArtSegmentDepthBandPolygon(target, index, definition.span)],
      });
    }
  }
  return ops;
}

/** Plan generated wall-art material above the glass. Multi-wall definitions duplicate the same
 * full source transform into per-edge clip bands/depth lanes; this partitions painter order only,
 * so the gallery image stays continuous and never restarts at a tile seam. */
export function wallArtFrameOpsForPlacements(
  placements: WallArtPlacementMap | undefined,
  bounds: { cols: number; rows: number },
  options: WallArtFramePlanOptions = {},
): BoardDrawOp[] {
  const ops: BoardDrawOp[] = [];
  for (const [anchorEdge, artId] of Object.entries(placements ?? {})) {
    const target = wallFaceTarget(anchorEdge, bounds);
    const definition = wallArt(artId);
    if (!target || !definition) continue;
    const available = target.face === 'west' ? bounds.rows - target.y : bounds.cols - target.x;
    if (available < definition.span) continue;
    const segmentEdges = Array.from({ length: definition.span }, (_, index) =>
      target.face === 'west'
        ? roadEdgeKey(0, target.y + index, -1, target.y + index)
        : roadEdgeKey(target.x + index, 0, target.x + index, -1));
    if (options.hasWall && !segmentEdges.every(options.hasWall)) continue;
    ops.push(...wallArtFrameOpsForArt(definition, {
      x: target.x,
      y: target.y,
      face: target.face,
      edge: anchorEdge,
    }));
  }
  return ops;
}

export function reflectedSeatForSurface(
  surface: MirrorSurface,
  grid: BoardGridPoint,
): BoardSeatPoint {
  // Reflect the exact continuous grid coordinate across the supporting wall plane, then use the
  // canonical projection. There is no depth compression or post-projection fitting.
  return projectBoardPoint(surface.face === 'west'
    ? { x: -1 - grid.x, y: grid.y }
    : { x: grid.x, y: -1 - grid.y });
}

/** Mirrors only see the board-grid corridor covered by their supporting wall cells. The interval
 * is deliberately half-open so a continuously moving subject belongs to exactly one adjacent
 * placement at a shared boundary. */
export function mirrorSurfaceAdmitsGridPoint(
  surface: MirrorSurface,
  grid: BoardGridPoint,
): boolean {
  const inward = surface.face === 'west' ? grid.x : grid.y;
  if (inward < -0.5) return false;
  const anchor = surface.face === 'west' ? surface.anchor.y : surface.anchor.x;
  const tangent = surface.face === 'west' ? grid.y : grid.x;
  return tangent >= anchor - 0.5 && tangent < anchor + surface.span - 0.5;
}

function reflectedOpGeometry(
  surface: MirrorSurface,
  subject: MirrorReflectionSubject,
): Omit<BoardDrawOp, 'z' | 'clipPolygons'> {
  const destination = reflectedSeatForSurface(surface, subject.grid);
  const localLeft = subject.op.dx - subject.seat.left;
  const localTop = subject.op.dy - subject.seat.top;
  const facingPlan = mirrorFacingPlan(surface.face, subject.facing);
  return {
    ...subject.op,
    // Reflect the complete seat-relative rectangle, select the canonical view whose raster flip
    // presents the wall-reflected grid facing, then flip the pixels for true mirror chirality.
    src: subject.spriteForFacing(facingPlan.sourceFacing),
    dx: destination.left - localLeft - subject.op.dw,
    dy: destination.top + localTop,
    dw: subject.op.dw,
    dh: subject.op.dh,
    flipX: facingPlan.flipX,
    opacity: Math.max(0, Math.min(1, (subject.op.opacity ?? 1) * surface.reflection.opacity)),
  };
}

export function reflectedOpsForSubject(
  surface: MirrorSurface,
  subject: MirrorReflectionSubject,
): BoardDrawOp[] {
  if (!mirrorSurfaceAdmitsGridPoint(surface, subject.grid)) return [];
  const geometry = reflectedOpGeometry(surface, subject);
  return surface.segments
    .filter((segment) => segment.apertureClip.length >= 6)
    .map((segment) => ({
      ...geometry,
      z: segment.z,
      clipPolygons: [[...segment.apertureClip]],
    }));
}

/** Convert exact current subjects into one clipped op per mirror surface. Subject order is sorted
 * by reflected seat height inside each surface, which preserves a stable painter's order while all
 * glass stays in the dedicated depth lane below its frame. */
export function reflectedOpsForSubjects(
  surfaces: readonly MirrorSurface[],
  subjects: readonly MirrorReflectionSubject[],
): BoardDrawOp[] {
  const out: BoardDrawOp[] = [];
  for (const surface of surfaces) {
    const admittedSubjects = subjects.filter((subject) =>
      mirrorSurfaceAdmitsGridPoint(surface, subject.grid));
    for (const segment of surface.segments) {
      if (segment.apertureClip.length < 6) continue;
      const reflected = admittedSubjects.map((subject) => ({
        op: {
          ...reflectedOpGeometry(surface, subject),
          z: segment.z,
          clipPolygons: [[...segment.apertureClip]],
        } satisfies BoardDrawOp,
        seatTop: reflectedSeatForSurface(surface, subject.grid).top,
      }));
      reflected.sort((a, b) => a.seatTop - b.seatTop);
      out.push(...reflected.map((entry) => entry.op));
    }
  }
  return out;
}
