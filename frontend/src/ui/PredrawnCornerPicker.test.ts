import { describe, expect, it } from 'vitest';
import { clampPredrawnGuide } from '../render/PredrawnBoardLayer';
import {
  clonePredrawnGridCalibrationSnapshot,
  emptyPredrawnGridHistory,
  predrawnGridSpanFraction,
  predrawnGridSpanPercent,
  predrawnGridStretchSummary,
  predrawnIdealGridSeed,
  predrawnIdealGridSnap,
  predrawnLocalCellNodes,
  predrawnLocalNodeIsBoundary,
  predrawnSourcePointForClient,
  predrawnUniformGridScale,
  predrawnUniformGridScaleForSpan,
  predrawnUniformGridScaleLimit,
  predrawnViewportScrollForZoomAnchor,
  predrawnZoomAfterWheel,
  predrawnZoomAnchorForViewport,
  recordPredrawnGridHistory,
  stepPredrawnGridHistory,
  type PredrawnGridCalibrationSnapshot,
} from './PredrawnCornerPicker';

function gridSnapshot(
  overrides: Partial<PredrawnGridCalibrationSnapshot> = {},
): PredrawnGridCalibrationSnapshot {
  return {
    points: {
      north: [400, 100],
      east: [900, 350],
      south: [500, 700],
      west: [100, 400],
    },
    boundaryPoints: {
      north: undefined,
      east: undefined,
      south: undefined,
      west: undefined,
    },
    gridColumns: 4,
    gridRows: 3,
    columnGuides: [0, 0.25, 0.5, 0.75, 1],
    rowGuides: [0, 1 / 3, 2 / 3, 1],
    meshOverrides: [],
    ...overrides,
  };
}

describe('pre-drawn source corner picking', () => {
  it('maps a fitted display click into intrinsic source pixels', () => {
    expect(predrawnSourcePointForClient(
      { left: 100, top: 50, width: 814, height: 483 },
      { x: 507, y: 291.5 },
      { width: 1628, height: 966 },
    )).toEqual([814, 483]);
  });

  it('clamps clicks to the source image bounds', () => {
    expect(predrawnSourcePointForClient(
      { left: 100, top: 50, width: 814, height: 483 },
      { x: 20, y: 600 },
      { width: 1628, height: 966 },
    )).toEqual([0, 966]);
  });

  it('steps mouse-wheel zoom through the fitted scale and explicit zoom levels', () => {
    expect(predrawnZoomAfterWheel('fit', 0.8, -1)).toBe(1);
    expect(predrawnZoomAfterWheel('fit', 0.8, 1)).toBe(0.75);
    expect(predrawnZoomAfterWheel(1, 0.8, 1)).toBe('fit');
    expect(predrawnZoomAfterWheel(4, 0.8, -1)).toBe(4);
    expect(predrawnZoomAfterWheel(0.5, 0.8, 1)).toBe(0.5);
  });

  it('keeps the source point under the mouse fixed while wheel zoom changes the stage size', () => {
    const anchor = predrawnZoomAnchorForViewport({
      scrollLeft: 300,
      scrollTop: 150,
      viewportX: 200,
      viewportY: 100,
      stageLeft: 20,
      stageTop: 10,
      stageWidth: 1_000,
      stageHeight: 500,
    });
    const nextScroll = predrawnViewportScrollForZoomAnchor(anchor, {
      stageLeft: 20,
      stageTop: 10,
      stageWidth: 2_000,
      stageHeight: 1_000,
    });
    expect((nextScroll.left + 200 - 20) / 2_000).toBeCloseTo(anchor.sourceX);
    expect((nextScroll.top + 100 - 10) / 1_000).toBeCloseTo(anchor.sourceY);
  });

  it('keeps stretched guides monotonic instead of allowing a folded board', () => {
    const guides = [0, 0.2, 0.4, 0.6, 0.8, 1];
    expect(clampPredrawnGuide(guides, 2, 0.9)).toBeLessThan(guides[3]);
    expect(clampPredrawnGuide(guides, 2, -1)).toBeGreaterThan(guides[1]);
    expect(clampPredrawnGuide(guides, 0, 0.5)).toBe(0);
  });

  it('reports the exact per-axis correction range from the fitted grid', () => {
    expect(predrawnGridStretchSummary(
      [0, 0.25, 0.6, 1],
      [0, 0.4, 1],
    )).toEqual({
      columnMinScale: 0.75,
      columnMaxScale: 1.2000000000000002,
      rowMinScale: 0.8,
      rowMaxScale: 1.2,
      maximumDeviationPercent: 25,
    });
  });

  it('snaps the selected dimensions to the exact accepted grid projection', () => {
    const snapped = predrawnIdealGridSnap({
      north: [896, 284],
      east: [1284, 416],
      south: [724, 736],
      west: [416, 554],
    }, { width: 2000, height: 1200 }, 6, 10);
    expect(snapped).toBeDefined();

    const north = snapped!.north!;
    const east = snapped!.east!;
    const west = snapped!.west!;
    const columnStep = [(east[0] - north[0]) / 6, (east[1] - north[1]) / 6];
    const rowStep = [(west[0] - north[0]) / 10, (west[1] - north[1]) / 10];
    expect(columnStep[1] / columnStep[0]).toBeCloseTo(27 / 48, 5);
    expect(rowStep[1] / -rowStep[0]).toBeCloseTo(27 / 48, 5);
    expect(columnStep[0]).toBeCloseTo(-rowStep[0], 3);
  });

  it('seeds the first fit with the centered canonical game-grid shape', () => {
    const seeded = predrawnIdealGridSeed({ width: 2000, height: 1200 }, 6, 10)!;
    const points = [seeded.north!, seeded.east!, seeded.south!, seeded.west!];
    expect(points.every(([x, y]) => x > 0 && x < 2000 && y > 0 && y < 1200)).toBe(true);
    expect(points.reduce((sum, [x]) => sum + x, 0) / 4).toBeCloseTo(1000, 3);
    expect(points.reduce((sum, [, y]) => sum + y, 0) / 4).toBeCloseTo(600, 3);
    const columnStep = [
      (seeded.east![0] - seeded.north![0]) / 6,
      (seeded.east![1] - seeded.north![1]) / 6,
    ];
    const rowStep = [
      (seeded.west![0] - seeded.north![0]) / 10,
      (seeded.west![1] - seeded.north![1]) / 10,
    ];
    expect(columnStep[1] / columnStep[0]).toBeCloseTo(27 / 48, 5);
    expect(rowStep[1] / -rowStep[0]).toBeCloseTo(27 / 48, 5);
  });

  it('scales a complete grid around its center without changing its proportions', () => {
    const seeded = predrawnIdealGridSeed({ width: 2000, height: 1200 }, 6, 10)!;
    const scaled = predrawnUniformGridScale(seeded, { width: 2000, height: 1200 }, 1.02)!;
    const center = (points: typeof seeded): [number, number] => [
      (points.north![0] + points.east![0] + points.south![0] + points.west![0]) / 4,
      (points.north![1] + points.east![1] + points.south![1] + points.west![1]) / 4,
    ];
    expect(center(scaled)).toEqual(center(seeded));
    expect(scaled.east![0] - scaled.north![0]).toBeCloseTo(
      (seeded.east![0] - seeded.north![0]) * 1.02,
      3,
    );
    expect(scaled.east![1] - scaled.north![1]).toBeCloseTo(
      (seeded.east![1] - seeded.north![1]) * 1.02,
      3,
    );
  });

  it('measures the placed grid against the artwork it has to sit on', () => {
    const source = { width: 2000, height: 1200 };
    const seeded = predrawnIdealGridSeed(source, 6, 10)!;
    const fraction = predrawnGridSpanFraction(seeded, source)!;
    const xs = [seeded.north!, seeded.east!, seeded.south!, seeded.west!].map(([x]) => x);
    expect(fraction).toBeCloseTo((Math.max(...xs) - Math.min(...xs)) / source.width, 6);
    expect(fraction).toBeGreaterThan(0);
    expect(fraction).toBeLessThanOrEqual(1);
    expect(predrawnGridSpanFraction({ ...seeded, east: undefined }, source)).toBeUndefined();
  });

  it('bounds the size control at the largest grid the artwork can still supply pixels for', () => {
    const source = { width: 2000, height: 1200 };
    const seeded = predrawnIdealGridSeed(source, 6, 10)!;
    const limit = predrawnUniformGridScaleLimit(seeded, source)!;
    expect(limit).toBeGreaterThan(1);

    const atLimit = predrawnUniformGridScale(seeded, source, limit * 0.999)!;
    expect(atLimit).toBeDefined();
    for (const point of [atLimit.north!, atLimit.east!, atLimit.south!, atLimit.west!]) {
      expect(point[0]).toBeGreaterThanOrEqual(0);
      expect(point[0]).toBeLessThanOrEqual(source.width);
      expect(point[1]).toBeGreaterThanOrEqual(0);
      expect(point[1]).toBeLessThanOrEqual(source.height);
    }
    expect(predrawnUniformGridScale(seeded, source, limit * 1.05)).toBeUndefined();
  });

  it('resizes a placed grid to span an exact fraction of the artwork width', () => {
    const source = { width: 2000, height: 1200 };
    const seeded = predrawnIdealGridSeed(source, 6, 10)!;
    const factor = predrawnUniformGridScaleForSpan(seeded, source, 0.5)!;
    const resized = predrawnUniformGridScale(seeded, source, factor)!;
    expect(predrawnGridSpanFraction(resized, source)).toBeCloseTo(0.5, 4);
    expect(predrawnUniformGridScaleForSpan(seeded, source, 0)).toBeUndefined();
  });

  it('quantizes grid size onto the control lattice so the slider round-trips its own value', () => {
    expect(predrawnGridSpanPercent(0.6666)).toBe(66.7);
    expect(predrawnGridSpanPercent(0.5)).toBe(50);
  });

  it('addresses one tile through four shared mesh intersections', () => {
    expect(predrawnLocalCellNodes(4, 3)).toEqual([
      { corner: 'north', column: 4, row: 3 },
      { corner: 'east', column: 5, row: 3 },
      { corner: 'south', column: 5, row: 4 },
      { corner: 'west', column: 4, row: 4 },
    ]);
  });

  it('gives adjacent tiles the same shared intersection address', () => {
    const east = predrawnLocalCellNodes(4, 3).find((node) => node.corner === 'east');
    const westOfNorthEastNeighbor = predrawnLocalCellNodes(5, 2)
      .find((node) => node.corner === 'west');
    expect(east).toMatchObject({ column: 5, row: 3 });
    expect(westOfNorthEastNeighbor).toMatchObject({ column: 5, row: 3 });
  });

  it('locks every outside-edge intersection while leaving interior intersections editable', () => {
    expect(predrawnLocalNodeIsBoundary(0, 3, 12, 8)).toBe(true);
    expect(predrawnLocalNodeIsBoundary(12, 3, 12, 8)).toBe(true);
    expect(predrawnLocalNodeIsBoundary(4, 0, 12, 8)).toBe(true);
    expect(predrawnLocalNodeIsBoundary(4, 8, 12, 8)).toBe(true);
    expect(predrawnLocalNodeIsBoundary(4, 3, 12, 8)).toBe(false);
  });

  it('undoes and redoes every calibration field in exact operation order', () => {
    const states = [
      gridSnapshot(),
      gridSnapshot({
        points: {
          north: [410, 110],
          east: [900, 350],
          south: [500, 700],
          west: [100, 400],
        },
      }),
      gridSnapshot({
        points: {
          north: [410, 110],
          east: [900, 350],
          south: [500, 700],
          west: [100, 400],
        },
        boundaryPoints: {
          north: [400, 100],
          east: [900, 350],
          south: [500, 700],
          west: [100, 400],
        },
      }),
      gridSnapshot({
        gridColumns: 5,
        columnGuides: [0, 0.2, 0.4, 0.6, 0.8, 1],
      }),
      gridSnapshot({
        gridColumns: 5,
        gridRows: 4,
        columnGuides: [0, 0.2, 0.4, 0.6, 0.8, 1],
        rowGuides: [0, 0.25, 0.5, 0.75, 1],
      }),
      gridSnapshot({
        gridColumns: 5,
        gridRows: 4,
        columnGuides: [0, 0.18, 0.41, 0.63, 0.82, 1],
        rowGuides: [0, 0.25, 0.5, 0.75, 1],
      }),
      gridSnapshot({
        gridColumns: 5,
        gridRows: 4,
        columnGuides: [0, 0.18, 0.41, 0.63, 0.82, 1],
        rowGuides: [0, 0.22, 0.52, 0.76, 1],
      }),
      gridSnapshot({
        gridColumns: 5,
        gridRows: 4,
        columnGuides: [0, 0.18, 0.41, 0.63, 0.82, 1],
        rowGuides: [0, 0.22, 0.52, 0.76, 1],
        meshOverrides: [{ column: 2, row: 2, point: [505, 405] }],
      }),
    ];

    let history = emptyPredrawnGridHistory();
    for (let index = 1; index < states.length; index += 1) {
      history = recordPredrawnGridHistory(history, states[index - 1], states[index]);
    }

    let current = states[states.length - 1];
    for (let index = states.length - 2; index >= 0; index -= 1) {
      const stepped = stepPredrawnGridHistory(history, current, 'undo')!;
      expect(stepped.target).toEqual(states[index]);
      history = stepped.history;
      current = stepped.target;
    }
    for (let index = 1; index < states.length; index += 1) {
      const stepped = stepPredrawnGridHistory(history, current, 'redo')!;
      expect(stepped.target).toEqual(states[index]);
      history = stepped.history;
      current = stepped.target;
    }
  });

  it('restores compound operations atomically', () => {
    const opening = gridSnapshot({
      meshOverrides: [{ column: 2, row: 1, point: [490, 320] }],
    });
    const translated = gridSnapshot({
      points: {
        north: [430, 120],
        east: [930, 370],
        south: [530, 720],
        west: [130, 420],
      },
      meshOverrides: [{ column: 2, row: 1, point: [520, 340] }],
    });
    const resizedAndRespaced = gridSnapshot({
      gridColumns: 5,
      gridRows: 4,
      columnGuides: [0, 0.2, 0.4, 0.6, 0.8, 1],
      rowGuides: [0, 0.25, 0.5, 0.75, 1],
    });
    let history = recordPredrawnGridHistory(emptyPredrawnGridHistory(), opening, translated);
    history = recordPredrawnGridHistory(history, translated, resizedAndRespaced);

    const undoResize = stepPredrawnGridHistory(history, resizedAndRespaced, 'undo')!;
    expect(undoResize.target).toEqual(translated);
    const undoTranslate = stepPredrawnGridHistory(undoResize.history, translated, 'undo')!;
    expect(undoTranslate.target).toEqual(opening);
  });

  it('ignores no-ops, clears redo on a branch, caps history, and isolates clones', () => {
    const opening = gridSnapshot();
    const first = gridSnapshot({
      meshOverrides: [{ column: 2, row: 1, point: [500, 330] }],
    });
    const replacement = gridSnapshot({
      meshOverrides: [{ column: 2, row: 1, point: [510, 335] }],
    });
    let history = emptyPredrawnGridHistory();
    expect(recordPredrawnGridHistory(history, opening, opening)).toBe(history);
    history = recordPredrawnGridHistory(history, opening, first);
    const undone = stepPredrawnGridHistory(history, first, 'undo')!;
    expect(undone.history.redo).toHaveLength(1);
    const branched = recordPredrawnGridHistory(undone.history, opening, replacement);
    expect(branched.redo).toEqual([]);
    expect(branched.undo).toEqual([opening]);

    const cloned = clonePredrawnGridCalibrationSnapshot(first);
    cloned.points.north = [999, cloned.points.north![1]];
    cloned.columnGuides[1] = 0.99;
    cloned.meshOverrides[0] = {
      ...cloned.meshOverrides[0],
      point: [999, cloned.meshOverrides[0].point[1]],
    };
    expect(first.points.north).toEqual([400, 100]);
    expect(first.columnGuides[1]).toBe(0.25);
    expect(first.meshOverrides[0].point).toEqual([500, 330]);

    history = emptyPredrawnGridHistory();
    let current = opening;
    for (let index = 1; index <= 105; index += 1) {
      const next = gridSnapshot({
        points: {
          ...opening.points,
          north: [400 + index, 100],
        },
      });
      history = recordPredrawnGridHistory(history, current, next);
      current = next;
    }
    expect(history.undo).toHaveLength(100);
    expect(history.undo[0].points.north).toEqual([405, 100]);
  });
});
