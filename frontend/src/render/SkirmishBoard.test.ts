import { afterEach, describe, expect, it } from 'vitest';
import { editorBoardToLevel } from '../core/levelBoard';
import type { Piece } from '../core/types';
import type { EditorBoard } from '../ui/boardCode';
import { tileFamilies } from '../art/tileset';
import { createSkirmish } from '../game/setup';
import { testLiveUnitCatalog } from '../test/liveUnitCatalog';
import { applyLiveUnitCatalog, resetLiveUnitCatalog, unitArtForId } from '../ui/unitCatalog';
import {
  mirrorSurfacesForArt,
  projectBoardPoint,
  reflectedOpsForSubjects,
  wallArt,
} from '@chess-tactics/board-render';
import {
  buildSkirmishBoard,
  mirrorSpriteSourcesForPiece,
  mirrorSubjectForSeat,
  pieceOp,
  skirmishTileClickIntent,
} from './SkirmishBoard';

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

describe('live mirror subjects', () => {
  it('derives continuous grid coordinates from an animated projected seat', () => {
    const start = projectBoardPoint({ x: 0, y: 2 });
    const end = projectBoardPoint({ x: 1, y: 1 });
    const seat = {
      left: start.left + (end.left - start.left) * 0.25,
      top: start.top + (end.top - start.top) * 0.25,
    };
    const op = { src: 'knight.png', dx: seat.left - 12, dy: seat.top - 24, dw: 24, dh: 24, z: 1 };
    const knight: Piece = {
      id: 'knight-1', side: 'player', type: 'knight', x: 1, y: 1, startY: 1, alive: true, facing: 'west',
    };

    const subject = mirrorSubjectForSeat(op, seat, knight)!;

    expect(subject.grid.x).toBeCloseTo(0.25, 12);
    expect(subject.grid.y).toBeCloseTo(1.75, 12);
    expect(subject.seat).toBe(seat);
    expect(subject.op).toBe(op);
    expect(subject.facing).toBe('west');
  });

  it('supplies face-specific directional sprites for an animated west-facing knight', () => {
    applyLiveUnitCatalog(testLiveUnitCatalog({ directionalUrls: true }));
    const knight: Piece = {
      id: 'knight-1', side: 'player', type: 'knight', x: 1, y: 1, startY: 1, alive: true, facing: 'west',
    };
    const seat = projectBoardPoint(knight);
    const op = pieceOp(knight, seat)!;
    const subject = mirrorSubjectForSeat(op, seat, knight)!;
    const art = wallArt('mirror-keep-wall')!;
    const west = mirrorSurfacesForArt(art, { x: 0, y: 1, face: 'west' })[0];
    const north = mirrorSurfacesForArt(art, { x: 1, y: 0, face: 'north' })[0];
    const westReflection = reflectedOpsForSubjects([west], [subject])[0];
    const northReflection = reflectedOpsForSubjects([north], [subject])[0];
    const unit = unitArtForId('knight')!;

    expect(op.src).toBe(unit.sprite('navy-blue', 'west'));
    expect(westReflection.src).toBe(unit.sprite('navy-blue', 'south'));
    expect(westReflection.flipX).toBe(true);
    expect(northReflection.src).toBe(unit.sprite('navy-blue', 'north'));
    expect(northReflection.flipX).toBe(true);
    expect(mirrorSpriteSourcesForPiece(knight, ['west', 'north'])).toEqual([
      westReflection.src,
      northReflection.src,
    ]);
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
