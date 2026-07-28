import { describe, expect, it } from 'vitest';
import {
  FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT,
  type PredrawnMoveHighlightCells,
  type PredrawnMoveHighlightFootprint,
} from '@chess-tactics/board-render/render/predrawnMoveHighlight';
import {
  clampPredrawnMoveHighlightPointToDiamond,
  constrainPredrawnMoveHighlightDragPoint,
  emptyPredrawnMoveHighlightHistory,
  footprintEdgeButtonStyle,
  normalizePredrawnMoveHighlightCellsForEditor,
  predrawnMoveHighlightBoundaryBar,
  predrawnMoveHighlightCellsAfterBoundaryNudge,
  predrawnMoveHighlightCellsMatch,
  predrawnMoveHighlightCellsAfterNudge,
  predrawnMoveHighlightCellsWithFootprint,
  predrawnMoveHighlightFootprintWithEdgeNudge,
  predrawnMoveHighlightFootprintWithHandle,
  predrawnMoveHighlightNativePixelDelta,
  predrawnMoveHighlightNativePixelSteps,
  predrawnMoveHighlightNativePixelVector,
  predrawnMoveHighlightSelectionAfterClick,
  recordPredrawnMoveHighlightHistory,
  stepPredrawnMoveHighlightHistory,
} from './PredrawnMoveHighlightEditor';

function insetFootprint(amount: number): PredrawnMoveHighlightFootprint {
  return [
    5000, amount,
    10000 - amount, 5000,
    5000, 10000 - amount,
    amount, 5000,
  ];
}

describe('Predrawn move-highlight multi-tile selection', () => {
  it('uses plain click for one tile and Shift+click to add or remove tiles', () => {
    expect(predrawnMoveHighlightSelectionAfterClick(['0,0'], '1,0', false)).toEqual(['1,0']);
    expect(predrawnMoveHighlightSelectionAfterClick(['0,0'], '1,0', true)).toEqual([
      '0,0',
      '1,0',
    ]);
    expect(predrawnMoveHighlightSelectionAfterClick(['0,0', '1,0'], '0,0', true)).toEqual([
      '1,0',
    ]);
    expect(predrawnMoveHighlightSelectionAfterClick(['0,0'], '0,0', true)).toEqual(['0,0']);
  });

  it('resolves only the four contiguous outer bars of a two-by-two selection', () => {
    const selected = ['0,0', '1,0', '0,1', '1,1'];
    expect(predrawnMoveHighlightBoundaryBar(selected, '0,0', 0)).toEqual(['0,0', '1,0']);
    expect(predrawnMoveHighlightBoundaryBar(selected, '1,0', 1)).toEqual(['1,0', '1,1']);
    expect(predrawnMoveHighlightBoundaryBar(selected, '1,1', 2)).toEqual(['1,1', '0,1']);
    expect(predrawnMoveHighlightBoundaryBar(selected, '0,1', 3)).toEqual(['0,1', '0,0']);
    expect(predrawnMoveHighlightBoundaryBar(selected, '0,0', 1)).toEqual([]);
    expect(predrawnMoveHighlightBoundaryBar(selected, '0,1', 0)).toEqual([]);
  });

  it('does not bridge gaps, notches, or disconnected selected areas', () => {
    const selected = ['0,0', '1,0', '3,0', '0,1'];
    expect(predrawnMoveHighlightBoundaryBar(selected, '0,0', 0)).toEqual(['0,0', '1,0']);
    expect(predrawnMoveHighlightBoundaryBar(selected, '3,0', 0)).toEqual(['3,0']);
    expect(predrawnMoveHighlightBoundaryBar(selected, '1,0', 2)).toEqual(['1,0']);
  });

  it('keeps the empty center of a ring selectable as its own inner boundary', () => {
    const selected = [
      '0,0', '1,0', '2,0',
      '0,1',        '2,1',
      '0,2', '1,2', '2,2',
    ];
    expect(predrawnMoveHighlightBoundaryBar(selected, '1,0', 2)).toEqual(['1,0']);
    expect(predrawnMoveHighlightBoundaryBar(selected, '2,1', 3)).toEqual(['2,1']);
    expect(predrawnMoveHighlightBoundaryBar(selected, '1,2', 0)).toEqual(['1,2']);
    expect(predrawnMoveHighlightBoundaryBar(selected, '0,1', 1)).toEqual(['0,1']);
    expect(predrawnMoveHighlightBoundaryBar(selected, '0,0', 0)).toEqual([
      '0,0',
      '1,0',
      '2,0',
    ]);
  });

  it('nudges a complete border atomically and restores every sparse cell on inverse nudge', () => {
    const moved = predrawnMoveHighlightCellsAfterBoundaryNudge({
      cells: {},
      cellKeys: ['0,0', '1,0'],
      edge: 0,
      dx: -104,
      dy: 0,
      axisConstraint: 'x',
    });
    expect(moved).toEqual({
      '0,0': [4948, 52, 9948, 5052, 5000, 10000, 0, 5000],
      '1,0': [4948, 52, 9948, 5052, 5000, 10000, 0, 5000],
    });
    expect(recordPredrawnMoveHighlightHistory(
      emptyPredrawnMoveHighlightHistory(),
      {},
      moved!,
    ).undo).toEqual([{}]);
    expect(predrawnMoveHighlightCellsAfterBoundaryNudge({
      cells: moved!,
      cellKeys: ['0,0', '1,0'],
      edge: 0,
      dx: 104,
      dy: 0,
      axisConstraint: 'x',
    })).toEqual({});
  });

  it('rejects the whole border when any one segment cannot advance', () => {
    const cells = { '0,0': insetFootprint(800) };
    expect(predrawnMoveHighlightCellsAfterNudge({
      cells,
      cellKey: '0,0',
      target: { kind: 'edge', edge: 0 },
      dx: 104,
      dy: 0,
      axisConstraint: 'x',
    })).toBeDefined();
    expect(predrawnMoveHighlightCellsAfterBoundaryNudge({
      cells,
      cellKeys: ['0,0', '1,0'],
      edge: 0,
      dx: 104,
      dy: 0,
      axisConstraint: 'x',
    })).toBeUndefined();
    expect(cells).toEqual({ '0,0': insetFootprint(800) });
  });
});

describe('Predrawn move-highlight footprint geometry', () => {
  it('aligns selectable edge hit lines to the rendered 96-by-54 cell aspect', () => {
    const style = footprintEdgeButtonStyle(FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT, 0);
    expect(style.left).toBe('75%');
    expect(style.top).toBe('25%');
    expect(Number.parseFloat(String(style.width))).toBeCloseTo(57.367, 3);
    expect(String(style.transform)).toContain('rotate(29.357');
  });

  it('keeps dragged handles inside the canonical diamond and rejects folded shapes', () => {
    expect(clampPredrawnMoveHighlightPointToDiamond(20000, 5000)).toEqual([10000, 5000]);
    expect(clampPredrawnMoveHighlightPointToDiamond(-5000, 5000)).toEqual([0, 5000]);
    expect(clampPredrawnMoveHighlightPointToDiamond(8000, 9000)).toEqual([7143, 7857]);

    expect(
      predrawnMoveHighlightFootprintWithHandle(
        FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT,
        0,
        5000,
        1200,
      ),
    ).toEqual([5000, 1200, 10000, 5000, 5000, 10000, 0, 5000]);
    expect(
      predrawnMoveHighlightFootprintWithHandle(
        FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT,
        0,
        5000,
        7000,
      ),
    ).toBeUndefined();
  });

  it('locks constrained drags to exact image axes even at the diamond boundary', () => {
    expect(
      constrainPredrawnMoveHighlightDragPoint(5000, 1200, 9000, 9000, 'x'),
    ).toEqual([6200, 1200]);
    expect(
      constrainPredrawnMoveHighlightDragPoint(8200, 5000, -1000, 9000, 'y'),
    ).toEqual([8200, 6800]);
    expect(
      constrainPredrawnMoveHighlightDragPoint(5000, 1200, 9000, 9000, 'free'),
    ).toEqual([9000, 9000]);
  });

  it('converts one native artwork pixel into the nearest v1 footprint coordinate step', () => {
    expect(predrawnMoveHighlightNativePixelSteps({
      frameWidth: 1450,
      frameHeight: 816,
      worldBounds: { minX: 0, minY: 0, width: 1450, height: 816 },
    })).toEqual({ x: 104, y: 185 });
    expect(predrawnMoveHighlightNativePixelSteps({
      frameWidth: 192,
      frameHeight: 108,
      worldBounds: { minX: 0, minY: 0, width: 96, height: 54 },
    })).toEqual({ x: 52, y: 93 });
    expect(predrawnMoveHighlightNativePixelDelta({
      frameWidth: 1450,
      frameHeight: 816,
      worldBounds: { minX: 0, minY: 0, width: 1450, height: 816 },
    }, 10, -10)).toEqual({ x: 1042, y: -1852 });
    const exactPixelVector = predrawnMoveHighlightNativePixelVector({
      frameWidth: 1450,
      frameHeight: 816,
      worldBounds: { minX: 0, minY: 0, width: 1450, height: 816 },
    }, 1, 1);
    expect(exactPixelVector.x).toBeCloseTo(104.1666666667);
    expect(exactPixelVector.y).toBeCloseTo(185.1851851852);
  });

  it('applies only allowed single-axis nudges and omits blocked or clamped no-ops', () => {
    const leftFromRightEdge = predrawnMoveHighlightCellsAfterNudge({
      cells: {},
      cellKey: '0,0',
      target: { kind: 'point', handle: 1 },
      dx: -104,
      dy: 0,
      axisConstraint: 'free',
    });
    expect(leftFromRightEdge).toEqual({
      '0,0': [5000, 0, 9896, 5000, 5000, 10000, 0, 5000],
    });
    expect(predrawnMoveHighlightCellsAfterNudge({
      cells: {},
      cellKey: '0,0',
      target: { kind: 'point', handle: 1 },
      dx: 104,
      dy: 0,
      axisConstraint: 'free',
    })).toBeUndefined();
    expect(predrawnMoveHighlightCellsAfterNudge({
      cells: {},
      cellKey: '0,0',
      target: { kind: 'point', handle: 1 },
      dx: 0,
      dy: -185,
      axisConstraint: 'x',
    })).toBeUndefined();
    expect(predrawnMoveHighlightCellsAfterNudge({
      cells: {},
      cellKey: '0,0',
      target: { kind: 'point', handle: 1 },
      dx: -104,
      dy: 0,
      axisConstraint: 'y',
    })).toBeUndefined();
    expect(predrawnMoveHighlightCellsAfterNudge({
      cells: {},
      cellKey: '0,0',
      target: { kind: 'point', handle: 1 },
      dx: -104,
      dy: -185,
      axisConstraint: 'free',
    })).toBeUndefined();

    const history = recordPredrawnMoveHighlightHistory(
      emptyPredrawnMoveHighlightHistory(),
      {},
      leftFromRightEdge!,
    );
    expect(history.undo).toEqual([{}]);
    expect(history.redo).toEqual([]);
  });

  it('selects a whole edge and moves its supporting line from the default diamond', () => {
    const opening: PredrawnMoveHighlightCells = {};
    const moved = predrawnMoveHighlightCellsAfterNudge({
      cells: opening,
      cellKey: '0,0',
      target: { kind: 'edge', edge: 0 },
      dx: -104,
      dy: 0,
      axisConstraint: 'x',
    });

    expect(moved).toEqual({
      '0,0': [4948, 52, 9948, 5052, 5000, 10000, 0, 5000],
    });
    expect(
      moved!['0,0'][2] - moved!['0,0'][0],
    ).toBe(
      FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT[2] - FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT[0],
    );
    expect(
      moved!['0,0'][3] - moved!['0,0'][1],
    ).toBe(
      FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT[3] - FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT[1],
    );
    expect(predrawnMoveHighlightCellsAfterNudge({
      cells: opening,
      cellKey: '0,0',
      target: { kind: 'edge', edge: 0 },
      dx: -104,
      dy: 0,
      axisConstraint: 'y',
    })).toBeUndefined();
  });

  it('jointly rounds edge intersections and rejects outward boundary movement', () => {
    expect(predrawnMoveHighlightFootprintWithEdgeNudge(
      FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT,
      0,
      0,
      185,
    )).toEqual([4907, 93, 9907, 5093, 5000, 10000, 0, 5000]);
    expect(predrawnMoveHighlightCellsAfterNudge({
      cells: {},
      cellKey: '0,0',
      target: { kind: 'edge', edge: 0 },
      dx: 104,
      dy: 0,
      axisConstraint: 'free',
    })).toBeUndefined();
  });

  it.each([
    { edge: 0 as const, dx: -104, dy: 0 },
    { edge: 1 as const, dx: -104, dy: 0 },
    { edge: 2 as const, dx: 104, dy: 0 },
    { edge: 3 as const, dx: 104, dy: 0 },
  ])('moves edge $edge inward without rotating its selected side', ({ edge, dx, dy }) => {
    const moved = predrawnMoveHighlightFootprintWithEdgeNudge(
      FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT,
      edge,
      dx,
      dy,
    );
    expect(moved).toBeDefined();
    const first = edge;
    const second = (edge + 1) % 4;
    expect([
      moved![second * 2] - moved![first * 2],
      moved![second * 2 + 1] - moved![first * 2 + 1],
    ]).toEqual([
      FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT[second * 2]
        - FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT[first * 2],
      FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT[second * 2 + 1]
        - FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT[first * 2 + 1],
    ]);
  });

  it('computes a ten-pixel edge step before jointly rounding its endpoints', () => {
    const exactTenPixelDelta = predrawnMoveHighlightNativePixelVector({
      frameWidth: 1450,
      frameHeight: 816,
      worldBounds: { minX: 0, minY: 0, width: 1450, height: 816 },
    }, -10, 0);
    expect(predrawnMoveHighlightFootprintWithEdgeNudge(
      FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT,
      0,
      exactTenPixelDelta.x,
      exactTenPixelDelta.y,
    )).toEqual([4479, 521, 9479, 5521, 5000, 10000, 0, 5000]);
  });

  it('preserves neighboring supporting lines on an already-custom footprint', () => {
    expect(predrawnMoveHighlightFootprintWithEdgeNudge(
      insetFootprint(800),
      0,
      -104,
      0,
    )).toEqual([4948, 852, 9148, 5052, 5000, 9200, 800, 5000]);
  });

  it('does not accumulate edge rotation while jointly rounding an irregular footprint', () => {
    const opening: PredrawnMoveHighlightFootprint = [
      4800, 500,
      9300, 4600,
      5200, 9200,
      700, 5300,
    ];
    let moved = opening;
    for (let index = 0; index < 8; index += 1) {
      const next = predrawnMoveHighlightFootprintWithEdgeNudge(
        moved,
        0,
        -104,
        0,
      );
      expect(next).toBeDefined();
      moved = next!;
    }
    const openingEdgeX = opening[2] - opening[0];
    const openingEdgeY = opening[3] - opening[1];
    const movedEdgeX = moved[2] - moved[0];
    const movedEdgeY = moved[3] - moved[1];
    expect(movedEdgeX * openingEdgeY - movedEdgeY * openingEdgeX).toBe(0);
  });

  it('removes the sparse cell when an inverse edge nudge restores the full diamond', () => {
    const inset = predrawnMoveHighlightCellsAfterNudge({
      cells: {},
      cellKey: '0,0',
      target: { kind: 'edge', edge: 0 },
      dx: -104,
      dy: 0,
      axisConstraint: 'x',
    });
    expect(predrawnMoveHighlightCellsAfterNudge({
      cells: inset!,
      cellKey: '0,0',
      target: { kind: 'edge', edge: 0 },
      dx: 104,
      dy: 0,
      axisConstraint: 'x',
    })).toEqual({});
  });

  it('stores only valid custom cells and removes a reset full-diamond cell', () => {
    const custom = insetFootprint(800);
    const cells = normalizePredrawnMoveHighlightCellsForEditor({
      '1,0': FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT,
      '0,0': custom,
      '2,0': [0, 0, 0, 0, 0, 0, 0, 0],
    });

    expect(cells).toEqual({ '0,0': custom });
    expect(
      predrawnMoveHighlightCellsWithFootprint(
        cells,
        '0,0',
        FULL_CELL_MOVE_HIGHLIGHT_FOOTPRINT,
      ),
    ).toEqual({});
  });
});

describe('Predrawn move-highlight edit history', () => {
  it('undoes and redoes exact sparse snapshots, then clears redo on a branch', () => {
    const opening: PredrawnMoveHighlightCells = {};
    const first = { '0,0': insetFootprint(500) };
    const second = { ...first, '1,0': insetFootprint(700) };
    let history = emptyPredrawnMoveHighlightHistory();
    history = recordPredrawnMoveHighlightHistory(history, opening, first);
    history = recordPredrawnMoveHighlightHistory(history, first, second);

    const undo = stepPredrawnMoveHighlightHistory(history, second, 'undo');
    expect(undo?.target).toEqual(first);
    expect(undo?.history.redo).toEqual([second]);

    const redo = stepPredrawnMoveHighlightHistory(undo!.history, first, 'redo');
    expect(redo?.target).toEqual(second);

    const replacement = { '2,0': insetFootprint(900) };
    const branched = recordPredrawnMoveHighlightHistory(
      undo!.history,
      first,
      replacement,
    );
    expect(branched.redo).toEqual([]);
    expect(predrawnMoveHighlightCellsMatch(opening, {})).toBe(true);
  });

  it('records no-op changes once and bounds the undo stack at 100 entries', () => {
    let history = emptyPredrawnMoveHighlightHistory();
    expect(recordPredrawnMoveHighlightHistory(history, {}, {})).toBe(history);

    let current: PredrawnMoveHighlightCells = {};
    for (let index = 1; index <= 105; index += 1) {
      const next = { '0,0': insetFootprint(index) };
      history = recordPredrawnMoveHighlightHistory(history, current, next);
      current = next;
    }
    expect(history.undo).toHaveLength(100);
    expect(history.redo).toHaveLength(0);
  });
});
