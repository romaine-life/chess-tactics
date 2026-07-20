import { describe, expect, it } from 'vitest';
import type { MirrorReflectionSubject, MirrorSurface } from '@chess-tactics/board-render';
import {
  buildMirrorLosProofPlan,
  opaqueDestinationPixels,
  pointInMirrorPolygon,
  wallHitShift,
  type RasterAlphaMask,
} from './mirrorLosProof';

const RECTANGLE = [-74, 11, -70, 11, -70, 15, -74, 15];

function alphaMask(alpha: readonly number[]): RasterAlphaMask {
  const rgba = new Uint8Array(alpha.length * 4);
  alpha.forEach((value, index) => { rgba[index * 4 + 3] = value; });
  return { rgba, width: 2, height: Math.ceil(alpha.length / 2) };
}

function subject(): MirrorReflectionSubject {
  return {
    op: { src: 'unit.png', dx: -1, dy: 51, dw: 2, dh: 2, z: 1 },
    grid: { x: 1, y: 1 },
    seat: { left: 0, top: 54 },
    facing: 'west',
    spriteForFacing: () => 'unit.png',
  };
}

function surface(face: 'west' | 'north' = 'west', aperture: readonly number[] = RECTANGLE): MirrorSurface {
  return {
    id: `surface-${face}`,
    artId: 'test-art-mirror-grand-gallery',
    slotId: `gallery-${face}`,
    sourceId: 'test-mirror-grand-gallery',
    face,
    anchor: face === 'west' ? { x: 0, y: 1 } : { x: 1, y: 0 },
    span: 3,
    aperture: [...aperture],
    apertureBounds: { left: -74, top: 11, width: 4, height: 4 },
    glassOp: { src: 'glass.png', dx: -74, dy: 11, dw: 4, dh: 4 },
    segments: [{
      index: 0,
      anchor: face === 'west' ? { x: 0, y: 1 } : { x: 1, y: 0 },
      supportPolygon: [...aperture],
      apertureClip: [...aperture],
      glassZ: 1,
      z: 2,
    }],
    reflection: { opacity: 1 },
  };
}

describe('mirror semantic line-of-sight proof', () => {
  it('projects west and north wall hits from the canonical board plane', () => {
    expect(wallHitShift(surface('west'), subject())).toEqual({ x: -72, y: -40.5 });
    expect(wallHitShift(surface('north'), subject())).toEqual({ x: 72, y: -40.5 });
  });

  it('classifies every visible destination pixel and proves its midpoint construction', () => {
    const plan = buildMirrorLosProofPlan({ surface: surface(), subject: subject(), source: alphaMask([255, 255, 255, 255]) });
    expect(plan.counts).toEqual({ visible: 4, passed: 4, floorOccluded: 0, outsideGlass: 0, unsupported: 0, invalid: 0 });
    expect(plan.status).toBe('pass');
    for (const sample of plan.samples) {
      expect(sample.wallHit.x).toBeCloseTo((sample.physical.x + sample.virtual.x) / 2);
      expect(sample.wallHit.y).toBeCloseTo((sample.physical.y + sample.virtual.y) / 2);
    }
  });

  it('distinguishes glass misses from unsupported decorative overhang', () => {
    const source = alphaMask([255, 0, 0, 0]);
    const outside = buildMirrorLosProofPlan({
      surface: surface('west', [0, 0, 2, 0, 2, 2, 0, 2]),
      subject: subject(),
      source,
    });
    expect(outside.counts.outsideGlass).toBe(1);

    const unsupportedSurface = surface();
    unsupportedSurface.segments[0].apertureClip = [0, 0, 2, 0, 2, 2, 0, 2];
    const unsupported = buildMirrorLosProofPlan({ surface: unsupportedSurface, subject: subject(), source });
    expect(unsupported.counts.unsupported).toBe(1);
  });

  it('reports pixels hidden by the floor boundary separately from supported glass', () => {
    const low = subject();
    low.op = { ...low.op, dy: 53 };
    const plan = buildMirrorLosProofPlan({ surface: surface(), subject: low, source: alphaMask([255, 0, 0, 0]) });
    expect(plan.counts).toEqual({ visible: 1, passed: 0, floorOccluded: 1, outsideGlass: 0, unsupported: 0, invalid: 0 });
    expect(plan.status).toBe('pass');
  });

  it('ignores transparent pixels and treats aperture edges as glass', () => {
    expect(opaqueDestinationPixels(subject().op, alphaMask([255, 0, 0, 0]))).toHaveLength(1);
    expect(pointInMirrorPolygon({ x: -74, y: 12 }, RECTANGLE)).toBe(true);
    expect(pointInMirrorPolygon({ x: -75, y: 12 }, RECTANGLE)).toBe(false);
  });

  it('fails the proof when the piece is outside the mirror corridor', () => {
    const moved = subject();
    moved.grid = { x: 1, y: 4 };
    const plan = buildMirrorLosProofPlan({ surface: surface(), subject: moved, source: alphaMask([255, 0, 0, 0]) });
    expect(plan.counts.invalid).toBe(1);
    expect(plan.status).toBe('fail');
  });
});
