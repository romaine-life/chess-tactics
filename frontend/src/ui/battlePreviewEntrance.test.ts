import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { boardDrawOps, resetDrawableCatalog, type BoardDrawOp } from '@chess-tactics/board-render';
import { applyTestDrawableCatalog } from '../test/drawableCatalog';
import { testLiveUnitCatalog } from '../test/liveUnitCatalog';
import { applyLiveUnitCatalog, resetLiveUnitCatalog } from './unitCatalog';
import type { EditorBoard } from './boardCode';
import { computeArrivalDelays, unitArrivalOp, UNIT_ENTRANCE_MS } from '../render/SkirmishBoard';

beforeAll(() => applyTestDrawableCatalog());
afterAll(resetDrawableCatalog);
afterEach(() => resetLiveUnitCatalog());

function boardWithUnits(): EditorBoard {
  return {
    cols: 3,
    rows: 3,
    cells: {},
    units: {
      '0,2': { unitId: 'king', direction: 'north', faction: 'navy-blue' },
      '1,2': { unitId: 'pawn', direction: 'north', faction: 'navy-blue' },
    },
    doodads: {},
    props: {},
    cover: {},
    features: {},
    featureCuts: {},
    featureExits: {},
    fences: {},
    fencePosts: {},
    walls: {},
    wallArt: {},
  };
}

const seatedOp = (): BoardDrawOp => ({ src: 'unit.png', dx: 100, dy: 200, dw: 40, dh: 60, z: 5 });

/**
 * Exploratio's shuffled preview plays the battlefield's own entrance through the read-only
 * renderer's one seam for a motion. That needs two facts to hold: a unit's ops must be findable
 * in a flat draw list, and the entrance must be the SAME function the battlefield plays
 * (ADR-0549). Neither is visible from the preview's own tests, so they are pinned here.
 */
describe('a unit entrance played outside the battlefield', () => {
  it('marks every seated unit op with the seat it belongs to', () => {
    applyLiveUnitCatalog(testLiveUnitCatalog());
    const ops = boardDrawOps(boardWithUnits());
    const unitOps = ops.filter((op) => op.unit);

    expect(unitOps.length).toBeGreaterThanOrEqual(2);
    expect(new Set(unitOps.map((op) => op.unit!.key))).toEqual(new Set(['0,2', '1,2']));
    for (const op of unitOps) {
      expect(op.unit).toEqual({ key: `${op.unit!.x},${op.unit!.y}`, x: op.unit!.x, y: op.unit!.y });
    }
    // Terrain and cover stay unmarked, so a transform keyed on the identity cannot move the ground.
    expect(ops.filter((op) => op.layer === 'terrain').every((op) => !op.unit)).toBe(true);
  });

  it('holds a unit above its seat and invisible until its own delay elapses', () => {
    const op = seatedOp();
    const staged = unitArrivalOp(op, { startMs: 1_000, delayMs: 300 }, 1_100);

    expect(staged.dy).toBe(op.dy - 60);
    expect(staged.opacity).toBe(0);
  });

  it('lands it on its seat at full strength once the entrance is over', () => {
    const op = seatedOp();
    const landed = unitArrivalOp(op, { startMs: 1_000, delayMs: 0 }, 1_000 + UNIT_ENTRANCE_MS);

    expect(landed.dx).toBe(op.dx);
    expect(landed.dy).toBe(op.dy);
    expect(landed.opacity ?? 1).toBe(1);
  });

  it('leaves an op with no entrance exactly as it was', () => {
    const op = seatedOp();

    expect(unitArrivalOp(op, undefined, 5_000)).toBe(op);
  });

  it('staggers a preview arrangement by the battlefield’s own order — royals last', () => {
    // What RunBattlePreview hands the shared orderer: seats, not pieces.
    const delays = computeArrivalDelays([
      { id: '2,5', side: 'player', type: 'king', x: 2, y: 5 },
      { id: '0,5', side: 'player', type: 'pawn', x: 0, y: 5 },
      { id: '1,5', side: 'player', type: 'bishop', x: 1, y: 5 },
    ], 0);

    expect([...delays]).toEqual([['0,5', 0], ['1,5', 50], ['2,5', 100]]);
  });
});
