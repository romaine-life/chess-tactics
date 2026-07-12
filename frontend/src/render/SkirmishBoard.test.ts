import { afterEach, describe, expect, it } from 'vitest';
import { editorBoardToLevel } from '../core/levelBoard';
import type { Piece } from '../core/types';
import type { EditorBoard } from '../ui/boardCode';
import { tileFamilies } from '../art/tileset';
import { createSkirmish } from '../game/setup';
import { testLiveUnitCatalog } from '../test/liveUnitCatalog';
import { applyLiveUnitCatalog, resetLiveUnitCatalog } from '../ui/unitCatalog';
import { buildSkirmishBoard, pieceOp, skirmishArmyOverlaySet, skirmishTileClickIntent } from './SkirmishBoard';

afterEach(() => resetLiveUnitCatalog());

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

  it('paints accepted native art at its exact authored dimensions', () => {
    const catalog = testLiveUnitCatalog({ scales: { pawn: 66 }, nativeScales: { pawn: 66 } });
    const pawnAsset = catalog.assets.find((asset) => asset.family === 'pawn')!;
    pawnAsset.footprint.sourceCanvasWidth = 51;
    pawnAsset.footprint.sourceCanvasHeight = 61;
    pawnAsset.footprint.sourceFootprintPx = 15;
    applyLiveUnitCatalog(catalog);
    const pawn: Piece = { id: 'pawn-1', side: 'player', type: 'pawn', x: 0, y: 0, startY: 0, alive: true };

    const op = pieceOp(pawn, { left: 36, top: 70 });

    expect(op?.dw).toBe(51);
    expect(op?.dh).toBe(61);
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

  it.each([
    ['player', 'enemy'],
    ['enemy', 'player'],
  ] as const)('keeps moves, own-side selection, and opponent focus ahead of cancellation for the %s seat', (localSide, opponent) => {
    expect(skirmishTileClickIntent(2, 2, [{ x: 2, y: 2 }], { id: 'opponent-1', side: opponent }, localSide)).toEqual({ kind: 'move' });
    expect(skirmishTileClickIntent(1, 1, [], { id: 'own-2', side: localSide }, localSide)).toEqual({
      kind: 'select',
      pieceId: 'own-2',
    });
    expect(skirmishTileClickIntent(6, 6, [], { id: 'opponent-1', side: opponent }, localSide)).toEqual({
      kind: 'focus',
      pieceId: 'opponent-1',
    });
  });
});

describe('skirmishArmyOverlaySet', () => {
  const pieces: Piece[] = [
    { id: 'player-rook', side: 'player', type: 'rook', x: 1, y: 2, startY: 2, alive: true },
    { id: 'enemy-rook', side: 'enemy', type: 'rook', x: 6, y: 5, startY: 5, alive: true },
  ];

  it.each([
    ['player', 'enemy', '1,2', '6,5'],
    ['enemy', 'player', '6,5', '1,2'],
  ] as const)('keeps Your/Opponent overlay ownership correct for the %s seat', (localSide, opponent, ownCell, opponentCell) => {
    const own = skirmishArmyOverlaySet(pieces, localSide, (piece) => [{ x: piece.x, y: piece.y }]);
    const remote = skirmishArmyOverlaySet(pieces, opponent, (piece) => [{ x: piece.x, y: piece.y }]);

    expect([...own]).toEqual([ownCell]);
    expect([...remote]).toEqual([opponentCell]);
  });
});
