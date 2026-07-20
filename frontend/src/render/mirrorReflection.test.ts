import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  WALL_DECOR_ASSETS,
  applyLiveMediaCatalog,
  applyLiveUnitCatalog,
  boardDrawOps,
  clipPolygonToConvex,
  isNormalizedAperture,
  WALL_ART_SLOT_DATUM,
  WALL_FRAME_GEOMETRY,
  mirrorGlassOverlayZIndex,
  mirrorSegmentSupportPolygon,
  mirrorSurfaceAdmitsGridPoint,
  mirrorSurfacesForArt,
  mirrorSurfacesForPlacements,
  mirrorWallFloorBoundaryY,
  normalizeWallArtReflection,
  objectBaseZIndex,
  polygonBounds,
  projectBoardPoint,
  reflectedOpsForSubject,
  reflectedOpsForSubjects,
  reflectedSeatForSurface,
  resetLiveUnitCatalog,
  resetLiveMediaCatalog,
  roadEdgeKey,
  unitArtForId,
  wallArt,
  wallArtFrameOpsForPlacements,
  wallArtItems,
  wallArtOverlayZIndex,
  wallArtSrcs,
  wallDecorAsset,
  wallOverlayZIndex,
  type BoardDrawOp,
  type BoardGridPoint,
  type EditorBoard,
  type MirrorReflectionSubject,
} from '@chess-tactics/board-render';
import { wallFrameSrc } from '../art/tileset';
import { testGroundCoverCatalog, testWallDecorMediaSlots } from '../test/liveMediaCatalog';
import { testLiveUnitCatalog } from '../test/liveUnitCatalog';
import { applyTestDrawableCatalog } from '../test/drawableCatalog';

beforeAll(() => {
  applyTestDrawableCatalog();
  applyLiveMediaCatalog(testGroundCoverCatalog(testWallDecorMediaSlots()));
  applyLiveUnitCatalog(testLiveUnitCatalog());
});
afterAll(() => {
  resetLiveMediaCatalog();
  resetLiveUnitCatalog();
});

const blank = (cols = 6, rows = 6): EditorBoard => ({
  cols,
  rows,
  cells: {},
  units: {},
  doodads: {},
  props: {},
  cover: {},
  features: {},
  walls: {},
  wallArt: {},
  featureCuts: {},
  featureExits: {},
});

const reflectionSubject = (
  src: string,
  grid: BoardGridPoint,
): MirrorReflectionSubject => {
  const seat = projectBoardPoint(grid);
  return {
    grid,
    seat,
    facing: 'north',
    spriteForFacing: () => src,
    op: { src, dx: seat.left - 12, dy: seat.top - 24, dw: 24, dh: 24, z: 20000 },
  };
};

describe('mirror metadata and normalized optics', () => {
  it('gives every mirror source a valid authored aperture and glass layer on both faces', () => {
    const mirrors = WALL_DECOR_ASSETS.filter((asset) => asset.kind === 'mirror');
    expect(mirrors.length).toBeGreaterThanOrEqual(5);
    for (const mirror of mirrors) {
      for (const face of ['west', 'north'] as const) {
        expect(isNormalizedAperture(mirror.faces[face].aperture), `${mirror.id}/${face}`).toBe(true);
        expect(mirror.faces[face].glassSrc, `${mirror.id}/${face}`).toMatch(/^\/api\/media\/[0-9a-f]{64}$/);
      }
    }
    expect(mirrors.every((mirror) => ['authored-crop', 'full-body'].includes(mirror.mirrorCoverage))).toBe(true);
    expect(mirrors.filter((mirror) => mirror.mirrorCoverage === 'full-body').map((mirror) => mirror.id)).toEqual([
      'test-mirror-grand-gallery',
    ]);
  });

  it('gives every placeable mirror live optics with no off/none mode', () => {
    const mirrors = wallArtItems().filter((art) =>
      art.slots.some((slot) => wallDecorAsset(slot.sourceId)?.kind === 'mirror'));
    expect(mirrors.length).toBeGreaterThanOrEqual(5);
    for (const art of mirrors) {
      expect(art.reflection?.opacity).toBeGreaterThan(0);
      expect(Object.keys(art.reflection ?? {})).toEqual(['opacity']);
    }
    expect(normalizeWallArtReflection({ opacity: 2 })).toBeNull();
  });

  it('preloads both the foreground frame and generated glass backing', () => {
    const edge = roadEdgeKey(0, 0, -1, 0);
    const keep = wallDecorAsset('test-mirror-keep');
    expect(keep?.kind).toBe('mirror');
    if (!keep || keep.kind !== 'mirror') return;
    expect(wallArtSrcs({ [edge]: 'test-art-mirror-keep' }, { cols: 4, rows: 4 })).toEqual([
      keep.faces.west.src,
      keep.faces.west.glassSrc,
    ]);
  });
});

describe('canonical mirror math', () => {
  it('reflects continuous board-grid coordinates exactly across the supporting wall', () => {
    const art = wallArt('test-art-mirror-keep')!;
    const grid = { x: 2.25, y: 1.5 };
    const west = mirrorSurfacesForArt(art, { x: 0, y: 0, face: 'west' })[0];
    const north = mirrorSurfacesForArt(art, { x: 0, y: 0, face: 'north' })[0];
    expect(reflectedSeatForSurface(west, grid)).toEqual(projectBoardPoint({
      x: -1 - grid.x,
      y: grid.y,
    }));
    expect(reflectedSeatForSurface(north, grid)).toEqual(projectBoardPoint({
      x: grid.x,
      y: -1 - grid.y,
    }));
  });

  it('moves west and north reflections along their projected wall-normal grid axes', () => {
    const art = wallArt('test-art-mirror-keep')!;
    const west = mirrorSurfacesForArt(art, { x: 0, y: 0, face: 'west' })[0];
    const north = mirrorSurfacesForArt(art, { x: 0, y: 0, face: 'north' })[0];

    const westNear = reflectedSeatForSurface(west, { x: 1, y: 2 });
    const westFar = reflectedSeatForSurface(west, { x: 2, y: 2 });
    const projectedNegativeX = projectBoardPoint({ x: -1, y: 0 });
    expect({
      left: westFar.left - westNear.left,
      top: westFar.top - westNear.top,
    }).toEqual(projectedNegativeX);

    const northNear = reflectedSeatForSurface(north, { x: 2, y: 1 });
    const northFar = reflectedSeatForSurface(north, { x: 2, y: 2 });
    const projectedNegativeY = projectBoardPoint({ x: 0, y: -1 });
    expect({
      left: northFar.left - northNear.left,
      top: northFar.top - northNear.top,
    }).toEqual(projectedNegativeY);
  });

  it('admits only subjects in a gallery wall-cell corridor on both faces', () => {
    const westEdge = roadEdgeKey(0, 1, -1, 1);
    const northEdge = roadEdgeKey(1, 0, 1, -1);
    const west = mirrorSurfacesForPlacements(
      { [westEdge]: 'test-art-mirror-grand-gallery' },
      { cols: 6, rows: 6 },
    )[0];
    const north = mirrorSurfacesForPlacements(
      { [northEdge]: 'test-art-mirror-grand-gallery' },
      { cols: 6, rows: 6 },
    )[0];
    const queen = reflectionSubject('queen.png', { x: 0, y: 0 });
    const knight = reflectionSubject('knight.png', { x: 1, y: 1 });

    for (const surface of [west, north]) {
      expect(mirrorSurfaceAdmitsGridPoint(surface, queen.grid)).toBe(false);
      expect(mirrorSurfaceAdmitsGridPoint(surface, knight.grid)).toBe(true);
      expect(reflectedOpsForSubject(surface, queen)).toEqual([]);
      const reflected = reflectedOpsForSubjects([surface], [queen, knight]);
      expect(reflected).toHaveLength(surface.segments.length);
      expect(reflected.every((op) => op.src === knight.op.src)).toBe(true);
      expect(reflected.some((op) => op.src === queen.op.src)).toBe(false);
    }
  });

  it('uses exact continuous half-open corridor boundaries while a subject moves', () => {
    const west = mirrorSurfacesForPlacements(
      { [roadEdgeKey(0, 1, -1, 1)]: 'test-art-mirror-grand-gallery' },
      { cols: 6, rows: 6 },
    )[0];
    const north = mirrorSurfacesForPlacements(
      { [roadEdgeKey(1, 0, 1, -1)]: 'test-art-mirror-grand-gallery' },
      { cols: 6, rows: 6 },
    )[0];

    expect([
      mirrorSurfaceAdmitsGridPoint(west, { x: 4, y: 0.499999 }),
      mirrorSurfaceAdmitsGridPoint(west, { x: 4, y: 0.5 }),
      mirrorSurfaceAdmitsGridPoint(west, { x: 4, y: 3.499999 }),
      mirrorSurfaceAdmitsGridPoint(west, { x: 4, y: 3.5 }),
    ]).toEqual([false, true, true, false]);
    expect([
      mirrorSurfaceAdmitsGridPoint(north, { x: 0.499999, y: 4 }),
      mirrorSurfaceAdmitsGridPoint(north, { x: 0.5, y: 4 }),
      mirrorSurfaceAdmitsGridPoint(north, { x: 3.499999, y: 4 }),
      mirrorSurfaceAdmitsGridPoint(north, { x: 3.5, y: 4 }),
    ]).toEqual([false, true, true, false]);
    expect([
      mirrorSurfaceAdmitsGridPoint(west, { x: -0.500001, y: 1 }),
      mirrorSurfaceAdmitsGridPoint(west, { x: -0.5, y: 1 }),
      mirrorSurfaceAdmitsGridPoint(north, { x: 1, y: -0.500001 }),
      mirrorSurfaceAdmitsGridPoint(north, { x: 1, y: -0.5 }),
    ]).toEqual([false, true, false, true]);
  });
});

describe('aperture clipping and continuous spans', () => {
  it('intersects an authored aperture with a supporting-edge band', () => {
    const clipped = clipPolygonToConvex(
      [0, 0, 10, 0, 10, 10, 0, 10],
      [5, -5, 15, -5, 15, 15, 5, 15],
    );
    expect(polygonBounds(clipped)).toEqual({ left: 5, top: 0, width: 5, height: 10 });
  });

  it('caps every mirror support segment exactly at the projected wall-floor seam', () => {
    for (const face of ['west', 'north'] as const) {
      const target = face === 'west'
        ? { x: 0, y: 1, face }
        : { x: 1, y: 0, face };
      const polygon = mirrorSegmentSupportPolygon(target, 0, 3);
      const floorEdge = [
        { x: polygon[4], y: polygon[5] },
        { x: polygon[6], y: polygon[7] },
      ];
      for (const point of floorEdge) {
        expect(point.y).toBeCloseTo(mirrorWallFloorBoundaryY(face, point.x));
      }
    }
  });

  it('clips, tints, preserves exact dimensions, and flips the subject through the frame aperture', () => {
    const art = wallArt('test-art-mirror-keep')!;
    const surface = mirrorSurfacesForArt(art, { x: 0, y: 0, face: 'west' })[0];
    const seat = projectBoardPoint({ x: 0, y: 0 });
    const op: BoardDrawOp = { src: 'pawn-east.png', dx: seat.left - 100, dy: seat.top - 30, dw: 200, dh: 30, z: 20000, opacity: 0.5 };
    const reflected = reflectedOpsForSubjects([surface], [{
      op,
      grid: { x: 0, y: 0 },
      seat,
      facing: 'east',
      spriteForFacing: () => op.src,
    }]);
    expect(reflected).toHaveLength(1);
    expect(reflected[0].src).toBe(op.src);
    expect(reflected[0].flipX).toBe(true);
    expect(reflected[0].opacity).toBeCloseTo(0.5 * art.reflection!.opacity);
    expect(reflected[0].dw).toBe(op.dw);
    expect(reflected[0].dh).toBe(op.dh);
    expect(reflected[0].dx).toBe(reflectedSeatForSurface(surface, { x: 0, y: 0 }).left - 100);
    expect(reflected[0].dy).toBe(reflectedSeatForSurface(surface, { x: 0, y: 0 }).top - 30);
    expect(reflected[0].clipPolygons).toEqual([[...surface.segments[0].apertureClip]]);
  });

  it('keeps a three-wall gallery as one aperture split only into depth clips', () => {
    const edge = roadEdgeKey(0, 1, -1, 1);
    const surfaces = mirrorSurfacesForPlacements({ [edge]: 'test-art-mirror-grand-gallery' }, { cols: 6, rows: 6 });
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0].span).toBe(3);
    expect(surfaces[0].segments).toHaveLength(3);
    expect(surfaces[0].segments.every((segment) => segment.apertureClip.length >= 6)).toBe(true);
    expect(new Set(surfaces[0].segments.map((segment) => segment.z)).size).toBe(3);

    const frames = wallArtFrameOpsForPlacements(
      { [edge]: 'test-art-mirror-grand-gallery' },
      { cols: 6, rows: 6 },
      { hasWall: () => true },
    );
    expect(frames).toHaveLength(3);
    expect(new Set(frames.map((op) => `${op.dx},${op.dy},${op.dw},${op.dh}`)).size).toBe(1);
    expect(new Set(frames.map((op) => op.z)).size).toBe(3);
    expect(frames.every((op) => op.clipPolygons?.length === 1)).toBe(true);
    expect(frames.map((op) => op.clipPolygons)).toEqual(
      surfaces[0].segments.map((segment) => [[...segment.supportPolygon]]),
    );

    for (const segment of surfaces[0].segments) {
      for (let index = 0; index < segment.apertureClip.length; index += 2) {
        expect(segment.apertureClip[index + 1]).toBeLessThanOrEqual(
          mirrorWallFloorBoundaryY('west', segment.apertureClip[index]) + 1e-7,
        );
      }
    }

    const northEdge = roadEdgeKey(1, 0, 1, -1);
    const north = mirrorSurfacesForPlacements({ [northEdge]: 'test-art-mirror-grand-gallery' }, { cols: 6, rows: 6 });
    expect(north).toHaveLength(1);
    expect(north[0].segments.map((segment) => segment.anchor)).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(north[0].segments.every((segment) => segment.apertureClip.length >= 6)).toBe(true);

    for (const surface of [surfaces[0], north[0]]) {
      for (let index = 1; index < surface.segments.length; index += 1) {
        const previousSupport = polygonBounds(surface.segments[index - 1].supportPolygon);
        const laterSupport = polygonBounds(surface.segments[index].supportPolygon);
        const supportOverlap = Math.min(previousSupport.left + previousSupport.width, laterSupport.left + laterSupport.width)
          - Math.max(previousSupport.left, laterSupport.left);
        expect(supportOverlap, `${surface.face} support seam ${index}`).toBeCloseTo(1);

        const previousAperture = polygonBounds(surface.segments[index - 1].apertureClip);
        const laterAperture = polygonBounds(surface.segments[index].apertureClip);
        const apertureOverlap = Math.min(previousAperture.left + previousAperture.width, laterAperture.left + laterAperture.width)
          - Math.max(previousAperture.left, laterAperture.left);
        expect(apertureOverlap, `${surface.face} aperture seam ${index}`).toBeCloseTo(1);

        const polygon = surface.segments[index].supportPolygon;
        for (const pointIndex of [4, 6]) {
          expect(polygon[pointIndex + 1]).toBeCloseTo(
            mirrorWallFloorBoundaryY(surface.face, polygon[pointIndex]),
          );
        }
      }
    }
  });

  it('uses one tall canonical wall geometry and a stable base-relative art datum', () => {
    expect(WALL_FRAME_GEOMETRY).toEqual({
      width: 128,
      height: 336,
      anchorX: 64,
      anchorY: 192,
      wallHeight: 160,
      backEdgeApexOffsetY: -28,
    });
    expect(WALL_ART_SLOT_DATUM).toEqual({ anchorX: 64, anchorY: 96 });
  });

  it('grounds the full-body gallery while its generated source grows upward', () => {
    const gallery = wallArt('test-art-mirror-grand-gallery')!;
    expect(gallery.slots.map(({ face, x, y, scale }) => ({ face, x, y, scale }))).toEqual([
      { face: 'west', x: 42, y: 72, scale: 1 },
      { face: 'north', x: 86, y: 72, scale: 1 },
    ]);
  });

  it('does not render a gallery missing one of its supporting walls', () => {
    const edge = roadEdgeKey(0, 0, -1, 0);
    let checked = 0;
    const frames = wallArtFrameOpsForPlacements(
      { [edge]: 'test-art-mirror-grand-gallery' },
      { cols: 6, rows: 6 },
      { hasWall: () => ++checked !== 2 },
    );
    expect(frames).toEqual([]);
  });
});

describe('static EditorBoard reflection parity', () => {
  it('emits a small mirror into wall -> glass -> reflection -> frame -> physical-piece lanes', () => {
    const edge = roadEdgeKey(0, 0, -1, 0);
    const board: EditorBoard = {
      ...blank(),
      walls: { [edge]: 'stone' },
      wallArt: { [edge]: 'test-art-mirror-keep' },
      units: { '0,0': { unitId: 'pawn', direction: 'east', faction: 'navy-blue' } },
    };
    const ops = boardDrawOps(board);
    const wall = ops.find((op) => op.src === wallFrameSrc('stone', 8))!;
    const glass = ops.find((op) => op.z === mirrorGlassOverlayZIndex({ x: 0, y: 0 }))!;
    const reflection = ops.find((op) => op.contain && op.clipPolygons?.length)!;
    const keepFrameSource = wallDecorAsset('test-mirror-keep');
    expect(keepFrameSource?.kind).toBe('mirror');
    if (!keepFrameSource || keepFrameSource.kind !== 'mirror') return;
    const frameSrc = keepFrameSource.faces.west.src;
    const frame = ops.find((op) => op.src === frameSrc)!;
    const physical = ops.find((op) => op.contain && !op.clipPolygons)!;
    const unit = unitArtForId('pawn')!;

    const keep = wallDecorAsset('test-mirror-keep');
    expect(keep?.kind).toBe('mirror');
    if (!keep || keep.kind !== 'mirror') return;
    expect(glass.src).toBe(keep.faces.west.glassSrc);
    expect(reflection.src).toBe(unit.sprite('navy-blue', 'north'));
    expect(reflection.flipX).toBe(true);
    expect(reflection.clipPolygons?.[0].length).toBeGreaterThanOrEqual(6);
    expect(wall.z).toBe(wallOverlayZIndex({ x: 0, y: 0 }));
    expect(glass.z).toBeGreaterThan(wall.z);
    expect(reflection.z).toBeGreaterThan(glass.z);
    expect(frame.z).toBe(wallArtOverlayZIndex({ x: 0, y: 0 }));
    expect(frame.z).toBeGreaterThan(reflection.z);
    expect(frame.clipPolygons).toEqual([mirrorSegmentSupportPolygon({ x: 0, y: 0, face: 'west' }, 0, 1)]);
    expect(physical.z).toBe(objectBaseZIndex({ x: 0, y: 0 }));
    expect(physical.z).toBeGreaterThan(frame.z);
  });

  it('uses face-specific authored views for a west-facing knight on both wall axes', () => {
    applyLiveUnitCatalog(testLiveUnitCatalog({ directionalUrls: true }));
    try {
      const westEdge = roadEdgeKey(0, 1, -1, 1);
      const northEdge = roadEdgeKey(1, 0, 1, -1);
      const board: EditorBoard = {
        ...blank(),
        walls: { [westEdge]: 'stone', [northEdge]: 'stone' },
        wallArt: {
          [westEdge]: 'test-art-mirror-keep',
          [northEdge]: 'test-art-mirror-keep',
        },
        units: { '1,1': { unitId: 'knight', direction: 'west', faction: 'navy-blue' } },
      };
      const ops = boardDrawOps(board);
      const reflected = ops.filter((op) => op.contain && op.clipPolygons?.length);
      const physical = ops.find((op) => op.contain && !op.clipPolygons);
      const unit = unitArtForId('knight')!;
      const westClip = mirrorSurfacesForPlacements(
        { [westEdge]: 'test-art-mirror-keep' },
        { cols: board.cols, rows: board.rows },
      )[0].segments[0].apertureClip;
      const northClip = mirrorSurfacesForPlacements(
        { [northEdge]: 'test-art-mirror-keep' },
        { cols: board.cols, rows: board.rows },
      )[0].segments[0].apertureClip;

      expect(physical?.src).toBe(unit.sprite('navy-blue', 'west'));
      expect(reflected).toHaveLength(2);
      expect(reflected).toEqual(expect.arrayContaining([
        expect.objectContaining({
          src: unit.sprite('navy-blue', 'south'),
          flipX: true,
          clipPolygons: [[...westClip]],
        }),
        expect.objectContaining({
          src: unit.sprite('navy-blue', 'north'),
          flipX: true,
          clipPolygons: [[...northClip]],
        }),
      ]));
    } finally {
      applyLiveUnitCatalog(testLiveUnitCatalog());
    }
  });

  it('keeps legacy unit-art ids visible through the accepted family art resolver', () => {
    expect(unitArtForId('pawn-codexsheet')?.family).toBe('pawn');
  });
});
