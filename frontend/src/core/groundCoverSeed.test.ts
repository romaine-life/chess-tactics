import { describe, expect, it } from 'vitest';
import {
  LEGACY_GROUND_COVER_SEED,
  resolveGroundCover,
  rollGroundCover,
  type CoverCell,
  type GroundCover,
} from './groundCover';
import type { TileFamilyId } from './tileSockets';
import { decodeBoard, encodeBoard, type EditorBoard } from '../ui/boardCode';

// Cover rolls are BAKED into the cell that carries them. The seed control shapes what is painted
// next; it must never restyle grass already on the board, and the game must render the exact
// arrangement the author saw.

const GRASS = 'grass' as TileFamilyId;

type TestCoverCell = CoverCell & { groundCover?: GroundCover };

const cellsFor = (keys: string[]): TestCoverCell[] => keys.map((key) => {
  const [x, y] = key.split(',').map(Number);
  return { x, y, terrain: GRASS };
});

const board = (over: Partial<EditorBoard> = {}): EditorBoard => ({
  cols: 4,
  rows: 4,
  cells: { '0,0': 'grass-surface-1', '1,0': 'grass-surface-1' },
  units: {},
  doodads: {},
  props: {},
  cover: { '0,0': 'filled', '1,0': 'filled' },
  features: {},
  featureCuts: {},
  featureExits: {},
  ...over,
} as EditorBoard);

describe('baked ground-cover seeds', () => {
  it('rolls a cell from the seed baked into it, not a shared one', () => {
    const cells = cellsFor(['0,0', '1,0']);
    // Two cells with DIFFERENT baked seeds, resolved in the same pass.
    const baked: Record<string, number> = { '0,0': 11, '1,0': 22 };
    resolveGroundCover(cells, (cell) => baked[`${cell.x},${cell.y}`], () => 'filled');
    expect(cells[0].groundCover!.tufts).toEqual(rollGroundCover(GRASS, 0, 0, 11, 'filled'));
    expect(cells[1].groundCover!.tufts).toEqual(rollGroundCover(GRASS, 1, 0, 22, 'filled'));
  });

  // The property Nelson asked for: the control affects generation, never what is already placed.
  it('leaves an already-painted cell untouched when the brush seed moves on', () => {
    const painted = cellsFor(['0,0']);
    resolveGroundCover(painted, () => 4242, () => 'filled');
    const before = painted[0].groundCover!.tufts;

    // The author re-rolls the brush and paints a NEW cell. The old one keeps its baked seed.
    const after = cellsFor(['0,0', '1,0']);
    const baked: Record<string, number> = { '0,0': 4242, '1,0': 8888 };
    resolveGroundCover(after, (cell) => baked[`${cell.x},${cell.y}`], () => 'filled');
    expect(after[0].groundCover!.tufts).toEqual(before);
    expect(after[1].groundCover!.tufts).not.toEqual(before);
  });

  it('falls back to the legacy seed for cells with no baked one, so old boards are unchanged', () => {
    const cells = cellsFor(['0,0']);
    resolveGroundCover(cells, () => LEGACY_GROUND_COVER_SEED, () => 'filled');
    expect(cells[0].groundCover!.tufts)
      .toEqual(rollGroundCover(GRASS, 0, 0, LEGACY_GROUND_COVER_SEED, 'filled'));
  });
});

describe('cover seeds in the board code', () => {
  it('round-trips baked seeds', () => {
    const decoded = decodeBoard(encodeBoard(board({ coverSeeds: { '0,0': 7, '1,0': 99 } })));
    expect(decoded?.coverSeeds).toEqual({ '0,0': 7, '1,0': 99 });
  });

  it('encodes byte-identically to a pre-baking board when nothing is baked', () => {
    // A board authored before baking must not change its code merely by passing through.
    expect(encodeBoard(board({ coverSeeds: {} }))).toBe(encodeBoard(board()));
  });

  it('decodes a legacy code with no baked seeds into an empty map, not a crash', () => {
    const decoded = decodeBoard(encodeBoard(board()));
    expect(decoded?.coverSeeds).toEqual({});
  });

  it('drops a baked seed for a cell that carries no cover', () => {
    const decoded = decodeBoard(encodeBoard(board({ coverSeeds: { '0,0': 7, '3,3': 5 } })));
    expect(decoded?.coverSeeds).toEqual({ '0,0': 7 });
  });

  it('rejects a malformed seed rather than carrying it into a roll', () => {
    const decoded = decodeBoard(encodeBoard(board({
      coverSeeds: { '0,0': 7, '1,0': Number.NaN } as Record<string, number>,
    })));
    expect(decoded?.coverSeeds).toEqual({ '0,0': 7 });
  });
});
