import { describe, expect, it } from 'vitest';
import {
  mirrorFacingPlan,
  reflectedOpsForSubject,
  type MirrorReflectionSubject,
  type MirrorSurface,
  type UnitFacing,
  type WallDecorFaceId,
} from '@chess-tactics/board-render';

type ExpectedFacing = readonly [physical: UnitFacing, reflected: UnitFacing, source: UnitFacing];

const WEST_EXPECTED: readonly ExpectedFacing[] = [
  ['north', 'north', 'west'],
  ['north-east', 'north-west', 'north-west'],
  ['east', 'west', 'north'],
  ['south-east', 'south-west', 'north-east'],
  ['south', 'south', 'east'],
  ['south-west', 'south-east', 'south-east'],
  ['west', 'east', 'south'],
  ['north-west', 'north-east', 'south-west'],
];

const NORTH_EXPECTED: readonly ExpectedFacing[] = [
  ['north', 'south', 'east'],
  ['north-east', 'south-east', 'south-east'],
  ['east', 'east', 'south'],
  ['south-east', 'north-east', 'south-west'],
  ['south', 'north', 'west'],
  ['south-west', 'north-west', 'north-west'],
  ['west', 'west', 'north'],
  ['north-west', 'south-west', 'north-east'],
];

function surface(face: WallDecorFaceId): MirrorSurface {
  const clip = [-200, -200, 200, -200, 200, 200, -200, 200];
  return {
    id: `mirror-${face}`,
    artId: 'mirror-art',
    slotId: 'mirror-slot',
    sourceId: 'mirror-source',
    face,
    anchor: { x: 0, y: 0 },
    span: 1,
    aperture: clip,
    apertureBounds: { left: -200, top: -200, width: 400, height: 400 },
    glassOp: { src: 'glass.png', dx: -200, dy: -200, dw: 400, dh: 400 },
    segments: [{
      index: 0,
      anchor: { x: 0, y: 0 },
      supportPolygon: clip,
      apertureClip: clip,
      glassZ: 1,
      z: 2,
    }],
    reflection: { opacity: 1 },
  };
}

describe('mirrorFacingPlan', () => {
  it.each(WEST_EXPECTED)(
    'west wall maps physical %s to reflected %s using flipped %s pixels',
    (physical, reflectedFacing, sourceFacing) => {
      expect(mirrorFacingPlan('west', physical)).toEqual({
        reflectedFacing,
        sourceFacing,
        flipX: true,
      });
    },
  );

  it.each(NORTH_EXPECTED)(
    'north wall maps physical %s to reflected %s using flipped %s pixels',
    (physical, reflectedFacing, sourceFacing) => {
      expect(mirrorFacingPlan('north', physical)).toEqual({
        reflectedFacing,
        sourceFacing,
        flipX: true,
      });
    },
  );

  it.each([
    ['west', 'south', 'east'],
    ['north', 'north', 'west'],
  ] as const)(
    '%s wall renders a west-facing piece from the %s asset, flipped to appear %s',
    (face, sourceFacing, _reflectedFacing) => {
      const subject: MirrorReflectionSubject = {
        grid: { x: 0, y: 0 },
        seat: { left: 0, top: 0 },
        facing: 'west',
        spriteForFacing: (facing) => `sprite-${facing}.png`,
        op: { src: 'sprite-west.png', dx: -10, dy: -20, dw: 20, dh: 20, z: 10 },
      };

      const reflected = reflectedOpsForSubject(surface(face), subject);

      expect(reflected).toHaveLength(1);
      expect(reflected[0].src).toBe(`sprite-${sourceFacing}.png`);
      expect(reflected[0].flipX).toBe(true);
    },
  );
});
