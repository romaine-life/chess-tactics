import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLiveMediaCatalog,
  boardDrawOps,
  predrawnBoardPlacement,
  resetLiveMediaCatalog,
  type EditorBoard,
} from '@chess-tactics/board-render';
import { testGroundCoverCatalog } from '../test/liveMediaCatalog';
import {
  predrawnBoardHomography,
  predrawnBoardCoverPolygon,
  predrawnBoardPlateForEditorReview,
  normalizePredrawnGridCount,
  predrawnBoardPreviewRegistration,
  predrawnBoardPreviewSrc,
  predrawnBoardRegistrationStorageKey,
  predrawnRectifiedSourcePoint,
  predrawnRegistrationGridSize,
  predrawnReviewGridCells,
  projectPredrawnPoint,
  savePredrawnBoardRegistrationLocally,
  serializePredrawnBoardPreviewRegistration,
  serializePredrawnRegistrationHandoff,
  runtimePredrawnBoardPlate,
  storedPredrawnBoardRegistration,
  storePredrawnBoardRegistration,
} from './PredrawnBoardLayer';

const surface = {
  kind: 'predrawn' as const,
  slot: 'boards/fortress-gate/plate.png',
  frameWidth: 950,
  frameHeight: 565,
};

const board = (): EditorBoard => ({
  cols: 5,
  rows: 11,
  cells: {},
  surface,
  units: {},
  doodads: {},
  props: { '4,5': { propId: 'cottage-small' } },
  cover: {},
  features: { '1,5': { kind: 'road', material: 'cobble' } },
  fences: { '1,1|2,1': 'wood' },
  featureCuts: {},
  featureExits: {},
});

afterEach(() => resetLiveMediaCatalog());

describe('pre-drawn board surface', () => {
  it('registers the complete review frame against canonical board centering', () => {
    const cells = Array.from({ length: 11 }, (_, y) =>
      Array.from({ length: 5 }, (__, x) => ({ x, y }))).flat();
    expect(predrawnBoardPlacement(surface, cells)).toEqual({
      left: -619,
      top: -71.5,
      width: 950,
      height: 565,
    });
  });

  it('carries persisted registration into runtime plates while legacy surfaces stay unregistered', () => {
    const sha256 = 'a'.repeat(64);
    applyLiveMediaCatalog(testGroundCoverCatalog([{
      slot: surface.slot,
      domain: 'review-media',
      role: 'plate',
      availabilityPolicy: 'critical',
      activeVersionId: '10000000-0000-4000-8000-000000000001',
      rowRevision: 1,
      metadata: {},
      versionStatus: 'accepted',
      productionEligible: true,
      versionMetadata: {},
      provenance: {},
      nativeEvidence: {},
      media: {
        url: `/assets/${surface.slot}`,
        immutableUrl: `/api/media/${sha256}`,
        sha256,
        mediaType: 'image/png',
        width: 1672,
        height: 941,
        byteLength: 1,
      },
    }]));
    const registration = {
      sourceWidth: 1672,
      sourceHeight: 941,
      north: [1034.223, 96.015] as const,
      east: [1375.402, 300.134] as const,
      south: [611.986, 723.847] as const,
      west: [281.123, 532.992] as const,
      gridColumns: 5,
      gridRows: 11,
      columnGuides: [0, 0.2, 0.4, 0.6, 0.8, 1],
      rowGuides: [0, 0.090909, 0.181818, 0.272727, 0.363636, 0.454545, 0.545455, 0.636364, 0.727273, 0.818182, 0.909091, 1],
      boundaryReference: {
        north: [1020.229, 112.223] as const,
        east: [1346.622, 295.818] as const,
        south: [628.558, 699.729] as const,
        west: [302.166, 516.133] as const,
      },
    };
    const registeredSurface = {
      ...surface,
      frameWidth: 1672,
      frameHeight: 941,
      registration,
    };

    expect(runtimePredrawnBoardPlate(registeredSurface)).toEqual({
      surface: registeredSurface,
      src: `/api/media/${sha256}`,
      registration,
    });
    expect(runtimePredrawnBoardPlate(surface)).toEqual({
      surface,
      src: `/api/media/${sha256}`,
    });
  });

  it('reports the complete painted frame as the viewport-cover boundary', () => {
    const cells = Array.from({ length: 11 }, (_, y) =>
      Array.from({ length: 5 }, (__, x) => ({ x, y }))).flat();
    expect(predrawnBoardCoverPolygon({ surface, src: '/assets/boards/fortress-gate/plate.png' }, cells))
      .toEqual([
        { x: -475, y: -282.5 },
        { x: 475, y: -282.5 },
        { x: 475, y: 282.5 },
        { x: -475, y: 282.5 },
      ]);
  });

  it('replaces baked tile, path, prop and fence pixels with one continuous plate op', () => {
    expect(boardDrawOps(board())).toEqual([expect.objectContaining({
      layer: 'terrain',
      src: '/assets/boards/fortress-gate/plate.png',
      dw: 950,
      dh: 565,
    })]);
  });

  it('accepts only same-origin temporary review files in development', () => {
    const origin = 'http://localhost:5177';
    expect(predrawnBoardPreviewSrc('?predrawnPreview=%2Ftmp-shots%2Fplate.png', origin, true))
      .toBe('/tmp-shots/plate.png');
    expect(predrawnBoardPreviewSrc('?predrawnPreview=https%3A%2F%2Fevil.test%2Fplate.png', origin, true))
      .toBeNull();
    expect(predrawnBoardPreviewSrc('?predrawnPreview=%2Ftmp-shots%2Fplate.png', origin, false))
      .toBeNull();
  });

  it('mounts a registered temporary candidate as a locked editor plate without persisting a media pointer', () => {
    const registration = {
      sourceWidth: 1672,
      sourceHeight: 940,
      north: [970.851, 56.223] as const,
      east: [1494.778, 317.82] as const,
      south: [662.094, 854.279] as const,
      west: [138.678, 554.173] as const,
    };
    expect(predrawnBoardPlateForEditorReview(
      undefined,
      '/tmp-shots/controlled-pass/fortress-gate-surface-only-v1.png',
      registration,
    )).toEqual({
      surface: {
        kind: 'predrawn',
        slot: 'boards/review/uncommitted/plate.png',
        frameWidth: 1672,
        frameHeight: 940,
      },
      src: '/tmp-shots/controlled-pass/fortress-gate-surface-only-v1.png',
      registration,
    });
  });

  it('pins all four generated top-plane corners exactly with one homography', () => {
    const cells = Array.from({ length: 11 }, (_, y) =>
      Array.from({ length: 5 }, (__, x) => ({ x, y }))).flat();
    const registration = predrawnBoardPreviewRegistration(
      '?predrawnCorners=1628,966,1092,13,1553,242,553,758,82,535',
      true,
    );
    expect(registration).toBeDefined();
    const homography = predrawnBoardHomography(surface, cells, registration!);
    expect(homography).toBeDefined();
    const sourcePoints = [registration!.north, registration!.east, registration!.south, registration!.west]
      .map(([x, y]) => [x * surface.frameWidth / registration!.sourceWidth, y * surface.frameHeight / registration!.sourceHeight] as const);
    const targets = [[0, -27], [240, 108], [-288, 405], [-528, 270]];
    sourcePoints.forEach((point, index) => {
      const projected = projectPredrawnPoint(homography!, point)!;
      expect(Math.abs(projected[0] - targets[index][0])).toBeLessThan(1e-6);
      expect(Math.abs(projected[1] - targets[index][1])).toBeLessThan(1e-6);
    });
  });

  it('rejects malformed or production corner calibration', () => {
    expect(predrawnBoardPreviewRegistration('?predrawnCorners=1,2,3', true)).toBeUndefined();
    expect(predrawnBoardPreviewRegistration('?predrawnCorners=1628,966,1092,13,1553,242,553,758,82,535', false))
      .toBeUndefined();
  });

  it('round-trips owner-picked source corners through the stable URL format', () => {
    const registration = {
      sourceWidth: 1628,
      sourceHeight: 966,
      north: [1092.5964, 7.9794] as const,
      east: [1553, 243.564] as const,
      south: [621.4562, 741.1238] as const,
      west: [82, 534.984] as const,
    };
    const encoded = serializePredrawnBoardPreviewRegistration(registration);
    expect(encoded).toBe('1628,966,1092.596,7.979,1553,243.564,621.456,741.124,82,534.984');
    expect(predrawnBoardPreviewRegistration(`?predrawnCorners=${encoded}`, true)).toEqual({
      ...registration,
      north: [1092.596, 7.979],
      south: [621.456, 741.124],
    });
  });

  it('synchronously stores and reads back an exact source-scoped registration', () => {
    const items = new Map<string, string>();
    const storage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => { items.set(key, value); },
    };
    const registration = {
      sourceWidth: 1628,
      sourceHeight: 966,
      north: [1092.596, 7.979] as const,
      east: [1553, 243.564] as const,
      south: [621.456, 741.124] as const,
      west: [82, 534.984] as const,
    };

    expect(storePredrawnBoardRegistration('/tmp-shots/plate.png', registration, storage)).toBe(true);
    expect(items.get(predrawnBoardRegistrationStorageKey('/tmp-shots/plate.png'))).toBe(JSON.stringify({
      version: 4,
      registration: '1628,966,1092.596,7.979,1553,243.564,621.456,741.124,82,534.984',
    }));
    expect(storedPredrawnBoardRegistration('/tmp-shots/plate.png', storage)).toEqual(registration);
    expect(storedPredrawnBoardRegistration('/tmp-shots/a-different-plate.png', storage)).toBeUndefined();
  });

  it('fails closed when browser storage rejects or corrupts a registration', () => {
    expect(storePredrawnBoardRegistration('/tmp-shots/plate.png', {
      sourceWidth: 100,
      sourceHeight: 100,
      north: [50, 0],
      east: [100, 50],
      south: [50, 100],
      west: [0, 50],
    }, {
      getItem: () => null,
      setItem: () => { throw new Error('blocked'); },
    })).toBe(false);
    expect(storedPredrawnBoardRegistration('/tmp-shots/plate.png', {
      getItem: () => '{"version":1,"registration":"not-a-registration"}',
      setItem: () => undefined,
    })).toBeUndefined();
  });

  it('reports a local save only after exact synchronous read-back', () => {
    const registration = {
      sourceWidth: 100,
      sourceHeight: 100,
      north: [50, 0] as const,
      east: [100, 50] as const,
      south: [50, 100] as const,
      west: [0, 50] as const,
    };
    let retained: string | null = null;
    expect(savePredrawnBoardRegistrationLocally('/tmp-shots/plate.png', registration, {
      getItem: () => retained,
      setItem: (_key, value) => { retained = value; },
    })).toEqual(registration);

    expect(savePredrawnBoardRegistrationLocally('/tmp-shots/plate.png', registration, {
      getItem: () => null,
      setItem: () => undefined,
    })).toBeUndefined();
    expect(savePredrawnBoardRegistrationLocally('/tmp-shots/plate.png', registration, {
      getItem: () => JSON.stringify({
        version: 1,
        registration: '100,100,50,0,100,50,51,100,0,50',
      }),
      setItem: () => undefined,
    })).toBeUndefined();
  });

  it('round-trips a monotonic full-grid calibration without breaking legacy corner links', () => {
    const registration = {
      sourceWidth: 100,
      sourceHeight: 100,
      north: [50, 0] as const,
      east: [100, 50] as const,
      south: [50, 100] as const,
      west: [0, 50] as const,
      columnGuides: [0, 0.17, 0.39, 0.61, 0.82, 1],
      rowGuides: [0, 0.08, 0.18, 0.28, 0.37, 0.46, 0.55, 0.64, 0.73, 0.82, 0.91, 1],
    };
    const encoded = serializePredrawnBoardPreviewRegistration(registration);
    expect(encoded).toBe(
      'v2;100,100,50,0,100,50,50,100,0,50;0,0.17,0.39,0.61,0.82,1;0,0.08,0.18,0.28,0.37,0.46,0.55,0.64,0.73,0.82,0.91,1',
    );
    expect(predrawnBoardPreviewRegistration(`?predrawnCorners=${encodeURIComponent(encoded)}`, true)).toEqual(registration);
    expect(predrawnBoardPreviewRegistration('?predrawnCorners=100,100,50,0,100,50,50,100,0,50', true))
      .toEqual(expect.objectContaining({ north: [50, 0], south: [50, 100] }));
  });

  it('round-trips explicit refit dimensions independently of the playable level dimensions', () => {
    const registration = {
      sourceWidth: 100,
      sourceHeight: 100,
      north: [50, 0] as const,
      east: [100, 50] as const,
      south: [50, 100] as const,
      west: [0, 50] as const,
      gridColumns: 6,
      gridRows: 11,
      columnGuides: [0, 0.166667, 0.333333, 0.5, 0.666667, 0.833333, 1],
      rowGuides: [0, 0.090909, 0.181818, 0.272727, 0.363636, 0.454545, 0.545455, 0.636364, 0.727273, 0.818182, 0.909091, 1],
    };
    const encoded = serializePredrawnBoardPreviewRegistration(registration);
    expect(encoded).toContain('v3;100,100,50,0,100,50,50,100,0,50;6,11;');
    expect(predrawnBoardPreviewRegistration(`?predrawnCorners=${encodeURIComponent(encoded)}`, true)).toEqual(registration);
    expect(predrawnRegistrationGridSize(registration, 5, 11)).toEqual({ columns: 6, rows: 11 });
  });

  it('round-trips an independently pinned painted-boundary reference', () => {
    const registration = {
      sourceWidth: 100,
      sourceHeight: 100,
      north: [50, 0] as const,
      east: [100, 50] as const,
      south: [50, 100] as const,
      west: [0, 50] as const,
      gridColumns: 2,
      gridRows: 2,
      columnGuides: [0, 0.5, 1],
      rowGuides: [0, 0.5, 1],
      boundaryReference: {
        north: [48, 2] as const,
        east: [98, 48] as const,
        south: [52, 98] as const,
        west: [2, 52] as const,
      },
    };
    const encoded = serializePredrawnBoardPreviewRegistration(registration);
    expect(encoded).toContain('v4;100,100,50,0,100,50,50,100,0,50;2,2;0,0.5,1;0,0.5,1;');
    expect(predrawnBoardPreviewRegistration(`?predrawnCorners=${encodeURIComponent(encoded)}`, true)).toEqual(registration);
    expect(JSON.parse(serializePredrawnRegistrationHandoff(
      '/tmp-shots/controlled-pass/plate.png',
      registration,
    ))).toEqual({
      kind: 'chess-tactics/predrawn-registration',
      source: '/tmp-shots/controlled-pass/plate.png',
      registration: encoded,
    });
  });

  it('maps the artwork boundary to the configured six-column refit target', () => {
    const cells = Array.from({ length: 11 }, (_, y) =>
      Array.from({ length: 5 }, (__, x) => ({ x, y }))).flat();
    const registration = {
      sourceWidth: 100,
      sourceHeight: 100,
      north: [50, 0] as const,
      east: [100, 50] as const,
      south: [50, 100] as const,
      west: [0, 50] as const,
      gridColumns: 6,
      gridRows: 11,
      columnGuides: [0, 0.166667, 0.333333, 0.5, 0.666667, 0.833333, 1],
      rowGuides: [0, 0.090909, 0.181818, 0.272727, 0.363636, 0.454545, 0.545455, 0.636364, 0.727273, 0.818182, 0.909091, 1],
    };
    const homography = predrawnBoardHomography(surface, cells, registration);
    expect(homography).toBeDefined();
    const sourcePoints = [registration.north, registration.east, registration.south, registration.west]
      .map(([x, y]) => [x * surface.frameWidth / registration.sourceWidth, y * surface.frameHeight / registration.sourceHeight] as const);
    const targets = [[0, -27], [288, 135], [-240, 432], [-528, 270]];
    sourcePoints.forEach((point, index) => {
      const projected = projectPredrawnPoint(homography!, point)!;
      expect(projected[0]).toBeCloseTo(targets[index][0], 6);
      expect(projected[1]).toBeCloseTo(targets[index][1], 6);
    });
  });

  it('keeps the post-picker review grid at the saved refit dimensions', () => {
    const playableCells = Array.from({ length: 11 }, (_, y) =>
      Array.from({ length: 5 }, (__, x) => ({ x, y }))).flat();
    const reviewCells = predrawnReviewGridCells(playableCells, {
      sourceWidth: 100,
      sourceHeight: 100,
      north: [50, 0],
      east: [100, 50],
      south: [50, 100],
      west: [0, 50],
      gridColumns: 6,
      gridRows: 11,
    });

    expect(reviewCells).toHaveLength(66);
    expect(Math.max(...reviewCells.map((cell) => cell.x))).toBe(5);
    expect(Math.max(...reviewCells.map((cell) => cell.y))).toBe(10);
    expect(playableCells).toHaveLength(55);
  });

  it('normalizes owner-entered refit dimensions to the supported grid range', () => {
    expect(normalizePredrawnGridCount(6, 5)).toBe(6);
    expect(normalizePredrawnGridCount(0, 5)).toBe(1);
    expect(normalizePredrawnGridCount(100, 5)).toBe(64);
    expect(normalizePredrawnGridCount(Number.NaN, 5)).toBe(5);
  });

  it('maps equal destination spacing back through the owner-fitted source guides', () => {
    const registration = {
      sourceWidth: 100,
      sourceHeight: 100,
      north: [0, 0] as const,
      east: [100, 0] as const,
      south: [100, 100] as const,
      west: [0, 100] as const,
      columnGuides: [0, 0.3, 1],
      rowGuides: [0, 0.5, 1],
    };
    const source = predrawnRectifiedSourcePoint(registration, [50, 25], { width: 100, height: 100 });
    expect(source?.[0]).toBeCloseTo(30, 6);
    expect(source?.[1]).toBeCloseTo(25, 6);
  });
});
