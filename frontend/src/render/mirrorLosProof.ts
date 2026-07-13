import {
  mirrorWallFloorBoundaryY,
  mirrorSurfaceAdmitsGridPoint,
  projectBoardPoint,
  type BoardDrawOp,
  type MirrorReflectionSubject,
  type MirrorSurface,
} from '@chess-tactics/board-render';

export interface LosPoint {
  x: number;
  y: number;
}

export interface RasterAlphaMask {
  rgba: ArrayLike<number>;
  width: number;
  height: number;
}

export type MirrorLosClassification = 'pass' | 'floor-occluded' | 'outside-glass' | 'unsupported' | 'invalid';

export interface MirrorLosSample {
  physical: LosPoint;
  wallHit: LosPoint;
  virtual: LosPoint;
  classification: MirrorLosClassification;
}

export interface MirrorLosProofPlan {
  face: MirrorSurface['face'];
  wallPlane: { axis: 'x' | 'y'; coordinate: -0.5 };
  hitShift: LosPoint;
  aperture: readonly number[];
  supportedApertures: readonly (readonly number[])[];
  samples: MirrorLosSample[];
  representativeRays: MirrorLosSample[];
  counts: {
    visible: number;
    passed: number;
    floorOccluded: number;
    outsideGlass: number;
    unsupported: number;
    invalid: number;
  };
  status: 'pass' | 'fail';
}

function pointOnSegment(point: LosPoint, a: LosPoint, b: LosPoint): boolean {
  const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
  if (Math.abs(cross) > 1e-6) return false;
  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
  if (dot < -1e-6) return false;
  const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot <= lengthSquared + 1e-6;
}

/** Inclusive polygon test: a raster hit on the authored glass edge belongs to the aperture. */
export function pointInMirrorPolygon(point: LosPoint, polygon: readonly number[]): boolean {
  if (polygon.length < 6 || polygon.length % 2) return false;
  let inside = false;
  for (let index = 0; index < polygon.length; index += 2) {
    const next = (index + 2) % polygon.length;
    const a = { x: polygon[index], y: polygon[index + 1] };
    const b = { x: polygon[next], y: polygon[next + 1] };
    if (pointOnSegment(point, a, b)) return true;
    if ((a.y > point.y) !== (b.y > point.y)) {
      const crossingX = a.x + (point.y - a.y) * (b.x - a.x) / (b.y - a.y);
      if (point.x < crossingX) inside = !inside;
    }
  }
  return inside;
}

function sourcePointForDestination(
  op: BoardDrawOp,
  source: Pick<RasterAlphaMask, 'width' | 'height'>,
  point: LosPoint,
): LosPoint | null {
  let scaleX = op.dw / source.width;
  let scaleY = op.dh / source.height;
  let innerLeft = 0;
  let innerTop = 0;
  if (op.contain) {
    const fit = Math.min(scaleX, scaleY);
    scaleX = fit;
    scaleY = fit;
    innerLeft = (op.dw - source.width * fit) / 2;
    innerTop = (op.dh - source.height * fit) / 2;
  }
  let localX = point.x - op.dx;
  const localY = point.y - op.dy;
  if (op.flipX) localX = op.dw - localX;
  const x = (localX - innerLeft) / scaleX;
  const y = (localY - innerTop) / scaleY;
  if (x < 0 || y < 0 || x >= source.width || y >= source.height) return null;
  return { x, y };
}

/** Rasterize the same destination-pixel centers the live op occupies, then sample source alpha. */
export function opaqueDestinationPixels(op: BoardDrawOp, source: RasterAlphaMask): LosPoint[] {
  if (source.width <= 0 || source.height <= 0 || source.rgba.length < source.width * source.height * 4) return [];
  const points: LosPoint[] = [];
  const left = Math.floor(op.dx);
  const top = Math.floor(op.dy);
  const right = Math.ceil(op.dx + op.dw);
  const bottom = Math.ceil(op.dy + op.dh);
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const destination = { x: x + 0.5, y: y + 0.5 };
      const sourcePoint = sourcePointForDestination(op, source, destination);
      if (!sourcePoint) continue;
      const sourceX = Math.min(source.width - 1, Math.floor(sourcePoint.x));
      const sourceY = Math.min(source.height - 1, Math.floor(sourcePoint.y));
      if ((source.rgba[(sourceY * source.width + sourceX) * 4 + 3] ?? 0) <= 0) continue;
      points.push(destination);
    }
  }
  return points;
}

export function wallHitShift(
  surface: MirrorSurface,
  subject: MirrorReflectionSubject,
): LosPoint {
  const wallSeat = projectBoardPoint(surface.face === 'west'
    ? { x: -0.5, y: subject.grid.y }
    : { x: subject.grid.x, y: -0.5 });
  return {
    x: wallSeat.left - subject.seat.left,
    y: wallSeat.top - subject.seat.top,
  };
}

function sampleKey(sample: MirrorLosSample): string {
  return `${sample.physical.x},${sample.physical.y}`;
}

function representativeSamples(samples: readonly MirrorLosSample[], limit = 10): MirrorLosSample[] {
  if (!samples.length || limit <= 0) return [];
  const failures = samples.filter((sample) =>
    sample.classification === 'outside-glass' ||
    sample.classification === 'unsupported' ||
    sample.classification === 'invalid');
  const primary = failures.length ? failures : [...samples];
  const chosen: MirrorLosSample[] = [];
  const seen = new Set<string>();
  const add = (sample: MirrorLosSample | undefined): void => {
    if (!sample || chosen.length >= limit || seen.has(sampleKey(sample))) return;
    seen.add(sampleKey(sample));
    chosen.push(sample);
  };
  add(primary.reduce((best, sample) => sample.physical.y < best.physical.y ? sample : best));
  add(primary.reduce((best, sample) => sample.physical.y > best.physical.y ? sample : best));
  add(primary.reduce((best, sample) => sample.physical.x < best.physical.x ? sample : best));
  add(primary.reduce((best, sample) => sample.physical.x > best.physical.x ? sample : best));
  const addQuantiles = (pool: readonly MirrorLosSample[]): void => {
    const sorted = [...pool].sort((a, b) => a.physical.y - b.physical.y || a.physical.x - b.physical.x);
    for (let index = 0; index < limit * 2 && chosen.length < limit; index += 1) {
      const at = limit === 1 ? 0 : Math.round(index * (sorted.length - 1) / Math.max(1, limit * 2 - 1));
      add(sorted[at]);
    }
  };
  addQuantiles(primary);
  if (failures.length && chosen.length < limit) addQuantiles(samples.filter((sample) => sample.classification === 'pass'));
  return chosen;
}

export function buildMirrorLosProofPlan({
  surface,
  subject,
  source,
}: {
  surface: MirrorSurface;
  subject: MirrorReflectionSubject;
  source: RasterAlphaMask;
}): MirrorLosProofPlan {
  const shift = wallHitShift(surface, subject);
  const admitted = mirrorSurfaceAdmitsGridPoint(surface, subject.grid);
  const samples = opaqueDestinationPixels(subject.op, source).map((physical): MirrorLosSample => {
    const wallHit = { x: physical.x + shift.x, y: physical.y + shift.y };
    const virtual = { x: physical.x + shift.x * 2, y: physical.y + shift.y * 2 };
    let classification: MirrorLosClassification = 'invalid';
    if (admitted) {
      if (wallHit.y > mirrorWallFloorBoundaryY(surface.face, wallHit.x) + 1e-7) {
        classification = 'floor-occluded';
      } else if (!pointInMirrorPolygon(wallHit, surface.aperture)) {
        classification = 'outside-glass';
      } else if (!surface.segments.some((segment) => pointInMirrorPolygon(wallHit, segment.apertureClip))) {
        classification = 'unsupported';
      } else {
        classification = 'pass';
      }
    }
    return { physical, wallHit, virtual, classification };
  });
  const counts = {
    visible: samples.length,
    passed: samples.filter((sample) => sample.classification === 'pass').length,
    floorOccluded: samples.filter((sample) => sample.classification === 'floor-occluded').length,
    outsideGlass: samples.filter((sample) => sample.classification === 'outside-glass').length,
    unsupported: samples.filter((sample) => sample.classification === 'unsupported').length,
    invalid: samples.filter((sample) => sample.classification === 'invalid').length,
  };
  return {
    face: surface.face,
    wallPlane: { axis: surface.face === 'west' ? 'x' : 'y', coordinate: -0.5 },
    hitShift: shift,
    aperture: surface.aperture,
    supportedApertures: surface.segments.map((segment) => segment.apertureClip),
    samples,
    representativeRays: representativeSamples(samples),
    counts,
    status: counts.visible > 0 && counts.passed + counts.floorOccluded === counts.visible ? 'pass' : 'fail',
  };
}
