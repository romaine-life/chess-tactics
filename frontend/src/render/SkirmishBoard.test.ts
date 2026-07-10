import { describe, expect, it } from 'vitest';
import { editorBoardToLevel } from '../core/levelBoard';
import type { Piece } from '../core/types';
import type { EditorBoard } from '../ui/boardCode';
import { tileFamilies } from '../art/tileset';
import { createSkirmish } from '../game/setup';
import { buildSkirmishBoard, pieceOp, skirmishTileClickIntent } from './SkirmishBoard';

const exactBoard = (): EditorBoard => {
  const grass0 = tileFamilies.grass[0].id;
  const grass3 = tileFamilies.grass[3].id;
  const stone2 = tileFamilies.stone[2].id;
  const water5 = tileFamilies.water[5].id;
  return {
    cols: 3,
    rows: 2,
    playerFaction: 'navy-blue',
    cells: {
      '0,0': grass0,
      '1,0': stone2,
      '2,0': grass3,
      '0,1': water5,
      '1,1': grass3,
      '2,1': grass0,
    },
    units: {},
    doodads: {},
    props: {},
    cover: {},
    features: {
      '1,0': { kind: 'road', material: 'cobble' },
      '1,1': { kind: 'road', material: 'cobble' },
    },
    featureCuts: {},
    featureExits: {},
    zones: {},
  };
};

describe('buildSkirmishBoard', () => {
  it('uses exact tile ids from saved boardCode instead of seed-picked variants', () => {
    const painted = exactBoard();
    const level = editorBoardToLevel(painted, { id: 'saved-map', name: 'Saved Map' });
    const game = createSkirmish({ seed: 1, level });

    expect(game.boardCode).toBe(level.boardCode);

    const boardA = buildSkirmishBoard(game, 11);
    const boardB = buildSkirmishBoard(game, 99999);

    for (const cell of boardA.cells) {
      const key = `${cell.x},${cell.y}`;
      expect(cell.asset?.id).toBe(painted.cells[key]);
      expect(boardB.cells.find((other) => other.x === cell.x && other.y === cell.y)?.asset?.id).toBe(painted.cells[key]);
    }
    expect(boardA.cells.find((cell) => cell.x === 1 && cell.y === 0)?.feature?.mask).toBe(4);
    expect(boardA.cells.find((cell) => cell.x === 1 && cell.y === 1)?.feature?.mask).toBe(1);
    expect(boardA.cells.every((cell) => !cell.groundCover)).toBe(true);
  });
});

describe('pieceOp', () => {
  it.each(['rock', 'random-rock'] as const)('renders %s obstacle art without live unit metadata', (type) => {
    const rock: Piece = { id: `${type}-1`, side: 'neutral', type, x: 0, y: 0, startY: 0, alive: true };
    const op = pieceOp(rock, { left: 36, top: 86 * 0.78 });

    expect(op?.src).toContain('/assets/units/rock/');
    expect(op?.dx).toBe(0);
    expect(op?.dy).toBe(0);
  });
});

describe('skirmishTileClickIntent', () => {
  it('clears the current selection when the player clicks an unrelated board tile', () => {
    expect(skirmishTileClickIntent(4, 3, [{ x: 2, y: 2 }], undefined, 'player')).toEqual({
      kind: 'clear-selection',
    });

    expect(skirmishTileClickIntent(4, 3, [{ x: 2, y: 2 }], { id: 'rock-1', side: 'neutral' }, 'player')).toEqual({
      kind: 'clear-selection',
    });
  });

  it('keeps moves, friendly selection, and opponent focus ahead of cancellation', () => {
    expect(skirmishTileClickIntent(2, 2, [{ x: 2, y: 2 }], { id: 'enemy-1', side: 'enemy' }, 'player')).toEqual({ kind: 'move' });
    expect(skirmishTileClickIntent(1, 1, [], { id: 'player-2', side: 'player' }, 'player')).toEqual({
      kind: 'select',
      pieceId: 'player-2',
    });
    expect(skirmishTileClickIntent(6, 6, [], { id: 'enemy-1', side: 'enemy' }, 'player')).toEqual({
      kind: 'focus',
      pieceId: 'enemy-1',
    });
  });
});
