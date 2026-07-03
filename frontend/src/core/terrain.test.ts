import { describe, it, expect } from 'vitest';
import {
  buildTerrainIndex, terrainAt, elevationAt, isPassableTerrain, canTraverse, haltsTravel, MAX_CLIMB,
} from './terrain';
import { attackedSquares, legalMoves } from './rules';
import type { GameState, Piece, PieceType, Side, TerrainCell } from './types';

function piece(id: string, side: Side, type: PieceType, x: number, y: number, extra: Partial<Piece> = {}): Piece {
  return { id, side, type, x, y, alive: true, startY: y, ...extra };
}
function state(pieces: Piece[], over: Partial<GameState> = {}): GameState {
  return { size: { cols: 8, rows: 8 }, pieces, turn: 'player', winner: null, ...over };
}
function index(cells: TerrainCell[]) {
  return buildTerrainIndex(cells);
}

describe('terrain index', () => {
  it('looks cells up by coordinate and reports elevation', () => {
    const idx = index([{ x: 2, y: 3, terrain: 'water', elevation: 0 }, { x: 4, y: 4, terrain: 'stone', elevation: 2 }]);
    expect(terrainAt(idx, 2, 3)).toEqual({ terrain: 'water', elevation: 0 });
    expect(terrainAt(idx, 0, 0)).toBeNull();
    expect(elevationAt(idx, 4, 4)).toBe(2);
    expect(elevationAt(idx, 0, 0)).toBe(0); // unauthored == ground
  });
});

describe('isPassableTerrain', () => {
  it('treats water as walkable and cliff/rock/void as barriers', () => {
    expect(isPassableTerrain('water')).toBe(true);
    expect(isPassableTerrain('cliff')).toBe(false);
    expect(isPassableTerrain('rock')).toBe(false);
    expect(isPassableTerrain('void')).toBe(false);
    for (const t of ['grass', 'stone', 'road', 'bridge'] as const) expect(isPassableTerrain(t)).toBe(true);
  });
});

describe('canTraverse', () => {
  const idx = index([
    { x: 1, y: 0, terrain: 'water', elevation: 0 },
    { x: 2, y: 0, terrain: 'cliff', elevation: 0 },
    { x: 3, y: 0, terrain: 'grass', elevation: 2 },
    { x: 4, y: 0, terrain: 'bridge', elevation: 0 },
  ]);
  it('allows open/unauthored ground', () => expect(canTraverse(idx, 0, 7, 7)).toBe(true));
  it('allows water terrain', () => expect(canTraverse(idx, 0, 1, 0)).toBe(true));
  it('blocks impassable terrain', () => expect(canTraverse(idx, 0, 2, 0)).toBe(false));
  it('allows a climb within MAX_CLIMB', () => expect(canTraverse(index([{ x: 2, y: 0, terrain: 'grass', elevation: 1 }]), 0, 2, 0)).toBe(true));
  it('blocks a rise greater than MAX_CLIMB', () => expect(canTraverse(idx, 0, 3, 0)).toBe(false));
  it('allows descending any height', () => expect(canTraverse(idx, 5, 3, 0)).toBe(true));
  it('keeps bridges passable over notional gaps', () => expect(canTraverse(idx, 0, 4, 0)).toBe(true));
  it('MAX_CLIMB is one', () => expect(MAX_CLIMB).toBe(1));
});

describe('haltsTravel', () => {
  it('halts on water only', () => {
    const idx = index([{ x: 1, y: 0, terrain: 'water', elevation: 0 }, { x: 2, y: 0, terrain: 'grass', elevation: 0 }]);
    expect(haltsTravel(idx, 1, 0)).toBe(true);
    expect(haltsTravel(idx, 2, 0)).toBe(false);
    expect(haltsTravel(idx, 7, 7)).toBe(false); // unauthored == open ground
  });
});

describe('legalMoves with terrain env', () => {
  it('ends a queen ray on water: the tile is reachable, nothing past it', () => {
    const queen = piece('r', 'player', 'queen', 4, 4);
    const env = { terrain: index([{ x: 4, y: 2, terrain: 'water', elevation: 0 }]) };
    const up = legalMoves(queen, [queen], { cols: 8, rows: 8 }, env).filter((m) => m.x === 4 && m.y < 4).map((m) => m.y);
    expect(up).toEqual([3, 2]); // reaches the water at y2, never y1/y0
  });

  it('keeps an enemy beyond water out of a rook\'s reach', () => {
    const rook = piece('r', 'player', 'rook', 4, 4);
    const foe = piece('foe', 'enemy', 'pawn', 4, 1);
    const env = { terrain: index([{ x: 4, y: 2, terrain: 'water', elevation: 0 }]) };
    const moves = legalMoves(rook, [rook, foe], { cols: 8, rows: 8 }, env);
    expect(moves.some((m) => m.capture === 'foe')).toBe(false);
  });

  it('still allows capturing an enemy standing on the water tile itself', () => {
    const rook = piece('r', 'player', 'rook', 4, 4);
    const foe = piece('foe', 'enemy', 'pawn', 4, 2);
    const env = { terrain: index([{ x: 4, y: 2, terrain: 'water', elevation: 0 }]) };
    const moves = legalMoves(rook, [rook, foe], { cols: 8, rows: 8 }, env);
    expect(moves.some((m) => m.x === 4 && m.y === 2 && m.capture === 'foe')).toBe(true);
  });

  it('lets a knight hop over water and land on it', () => {
    const kn = piece('k', 'player', 'knight', 4, 4);
    // Ring the knight in water, plus water on one landing square (3,2).
    const ring = [[3, 3], [4, 3], [5, 3], [3, 4], [5, 4], [3, 5], [4, 5], [5, 5], [3, 2]]
      .map(([x, y]) => ({ x, y, terrain: 'water' as const, elevation: 0 }));
    const moves = legalMoves(kn, [kn], { cols: 8, rows: 8 }, { terrain: index(ring) });
    expect(moves).toHaveLength(8); // all knight steps survive
    expect(moves.some((m) => m.x === 3 && m.y === 2)).toBe(true); // landing on water is fine
  });

  it('moves at full range off a water tile', () => {
    const rook = piece('r', 'player', 'rook', 4, 4);
    const env = { terrain: index([{ x: 4, y: 4, terrain: 'water', elevation: 0 }]) };
    const up = legalMoves(rook, [rook], { cols: 8, rows: 8 }, env).filter((m) => m.x === 4 && m.y < 4).map((m) => m.y);
    expect(up).toEqual([3, 2, 1, 0]); // origin water never halts the mover
  });

  it('wades a river one tile at a time: the next water cell still halts', () => {
    const rook = piece('r', 'player', 'rook', 4, 4);
    const env = { terrain: index([
      { x: 4, y: 4, terrain: 'water', elevation: 0 },
      { x: 4, y: 3, terrain: 'water', elevation: 0 },
    ]) };
    const up = legalMoves(rook, [rook], { cols: 8, rows: 8 }, env).filter((m) => m.x === 4 && m.y < 4).map((m) => m.y);
    expect(up).toEqual([3]); // off its own tile freely, but the next water cell ends the slide
  });

  it('halts a pawn double-step that passes through water', () => {
    const pawn = piece('p', 'player', 'pawn', 3, 6);
    const env = { terrain: index([{ x: 3, y: 5, terrain: 'water', elevation: 0 }]) };
    const moves = legalMoves(pawn, [pawn], { cols: 8, rows: 8 }, env);
    expect(moves.some((m) => m.x === 3 && m.y === 5)).toBe(true); // single advance into water
    expect(moves.some((m) => m.x === 3 && m.y === 4)).toBe(false); // cannot pass through it
  });

  it('allows a pawn double-step that only lands on water', () => {
    const pawn = piece('p', 'player', 'pawn', 3, 6);
    const env = { terrain: index([{ x: 3, y: 4, terrain: 'water', elevation: 0 }]) };
    const moves = legalMoves(pawn, [pawn], { cols: 8, rows: 8 }, env);
    expect(moves.some((m) => m.x === 3 && m.y === 4)).toBe(true);
  });

  it('removes a knight step that lands on a cliff', () => {
    const kn = piece('k', 'player', 'knight', 4, 4);
    const env = { terrain: index([{ x: 6, y: 5, terrain: 'cliff', elevation: 0 }]) };
    const moves = legalMoves(kn, [kn], { cols: 8, rows: 8 }, env);
    expect(moves.some((m) => m.x === 6 && m.y === 5)).toBe(false); // cliff blocked
    expect(moves.some((m) => m.x === 6 && m.y === 3)).toBe(true); // sibling step still legal
  });

  it('allows a pawn advance into water', () => {
    const pawn = piece('p', 'player', 'pawn', 3, 6);
    const foe = piece('foe', 'enemy', 'pawn', 2, 5);
    const env = { terrain: index([{ x: 3, y: 5, terrain: 'water', elevation: 0 }]) };
    const moves = legalMoves(pawn, [pawn, foe], { cols: 8, rows: 8 }, env);
    // The single advance enters the water; the double-step would pass through it.
    expect(moves).toEqual([{ x: 3, y: 5 }, { x: 2, y: 5, capture: 'foe' }]);
  });

  it('uses the origin elevation: a piece cannot ray up past a +1 rise', () => {
    const queen = piece('r', 'player', 'queen', 4, 4);
    const env = { terrain: index([
      { x: 4, y: 3, terrain: 'grass', elevation: 1 }, // +1 from ground: reachable
      { x: 4, y: 2, terrain: 'grass', elevation: 2 }, // +2 from origin: a wall
    ]) };
    const up = legalMoves(queen, [queen], { cols: 8, rows: 8 }, env).filter((m) => m.x === 4 && m.y < 4).map((m) => m.y);
    expect(up).toEqual([3]);
  });

  it('treats a void as an obstacle for rays', () => {
    const queen = piece('r', 'player', 'queen', 4, 4);
    const env = { terrain: index([{ x: 4, y: 2, terrain: 'void', elevation: 0 }]) };
    const up = legalMoves(queen, [queen], { cols: 8, rows: 8 }, env).filter((m) => m.x === 4 && m.y < 4).map((m) => m.y);
    expect(up).toEqual([3]);
  });

  it('lets a knight hop over a void but not land on one', () => {
    const knight = piece('k', 'player', 'knight', 2, 2);
    const env = { terrain: index([
      { x: 3, y: 2, terrain: 'void', elevation: 0 },
      { x: 4, y: 1, terrain: 'void', elevation: 0 },
    ]) };
    const moves = legalMoves(knight, [knight], { cols: 8, rows: 8 }, env);
    expect(moves.some((m) => m.x === 4 && m.y === 3)).toBe(true);
    expect(moves.some((m) => m.x === 4 && m.y === 1)).toBe(false);
  });

  it('is identical to plain movement when no terrain is supplied', () => {
    const queen = piece('r', 'player', 'queen', 4, 4);
    const up = legalMoves(queen, [queen], { cols: 8, rows: 8 }).filter((m) => m.x === 4 && m.y < 4).map((m) => m.y);
    expect(up).toEqual([3, 2, 1, 0]);
  });
});

describe('threats respect terrain the same way movement does', () => {
  const BOARD = { cols: 8, rows: 8 };

  it('a terrain wall ends a threat ray, just as it ends a movement ray', () => {
    const rook = piece('r', 'enemy', 'rook', 0, 4);
    const wall = { terrain: index([{ x: 2, y: 4, terrain: 'cliff', elevation: 0 }]) };
    const rakedThroughWall = attackedSquares(rook, [rook], BOARD, wall).filter((s) => s.y === 4).map((s) => s.x).sort((a, b) => a - b);
    expect(rakedThroughWall).toEqual([1]); // stops before the cliff at x=2
    const rakedOpen = attackedSquares(rook, [rook], BOARD).filter((s) => s.y === 4).map((s) => s.x);
    expect(rakedOpen).toContain(5); // without terrain the whole row is threatened
  });

  it('a king may stand where a terrain wall shields it from an enemy slider', () => {
    const king = piece('k', 'player', 'king', 4, 4);
    const rook = piece('r', 'enemy', 'rook', 0, 4); // same row as the king
    const foeKing = piece('ek', 'enemy', 'king', 7, 0);
    const wall = { terrain: index([{ x: 2, y: 4, terrain: 'cliff', elevation: 0 }]) };
    // The wall breaks the rook's line, so (3,4) is safe and the king may step onto it.
    expect(legalMoves(king, [king, rook, foeKing], BOARD, wall).some((m) => m.x === 3 && m.y === 4)).toBe(true);
    // Without the wall the rook rakes the whole row and (3,4) is off-limits.
    expect(legalMoves(king, [king, rook, foeKing], BOARD).some((m) => m.x === 3 && m.y === 4)).toBe(false);
  });

  it('a threat ray may end on water but never pass it', () => {
    const rook = piece('r', 'enemy', 'rook', 0, 4);
    const river = { terrain: index([{ x: 2, y: 4, terrain: 'water', elevation: 0 }]) };
    const raked = attackedSquares(rook, [rook], BOARD, river).filter((s) => s.y === 4).map((s) => s.x).sort((a, b) => a - b);
    expect(raked).toEqual([1, 2]); // the water square itself is threatened, nothing beyond
  });

  it('a king across a river is out of a slider\'s reach — but not on the river itself', () => {
    const king = piece('k', 'player', 'king', 3, 4); // one square beyond the water
    const rook = piece('r', 'enemy', 'rook', 0, 4);
    const foeKing = piece('ek', 'enemy', 'king', 7, 0);
    const river = { terrain: index([{ x: 2, y: 4, terrain: 'water', elevation: 0 }]) };
    const moves = legalMoves(king, [king, rook, foeKing], BOARD, river);
    expect(moves.some((m) => m.x === 3 && m.y === 3)).toBe(true); // beyond the river: free to move
    expect(moves.some((m) => m.x === 2 && m.y === 4)).toBe(false); // stepping ONTO the river: still raked
  });
});
