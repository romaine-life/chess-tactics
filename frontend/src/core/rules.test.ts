import { describe, it, expect } from 'vitest';
import type { BoardSize, GameState, Move, Piece, PieceType, Side } from './types';
import {
  applyMove,
  attackedSquares,
  enemyMove,
  enemyThreats,
  gameEnv,
  isEnemy,
  legalMoves,
  type MoveEnv,
} from './rules';
import { roadEdgeKey } from './featureAutotile';
import { createRng } from './rng';

const SIZE: BoardSize = { cols: 8, rows: 12 };

function P(side: Side, type: PieceType, x: number, y: number, extra: Partial<Piece> = {}): Piece {
  return { id: `${side}-${type}-${x}-${y}`, side, type, x, y, alive: true, startY: side === 'player' ? 11 : 0, ...extra };
}
const has = (moves: ReadonlyArray<{ x: number; y: number }>, x: number, y: number) => moves.some((m) => m.x === x && m.y === y);
const find = (moves: ReadonlyArray<Move>, x: number, y: number) => moves.find((m) => m.x === x && m.y === y);

describe('pawn movement', () => {
  it('moves forward one, and two from the home rank', () => {
    const pawn = P('player', 'pawn', 4, 11); // player home rank = 11
    const moves = legalMoves(pawn, [pawn], SIZE);
    expect(has(moves, 4, 10)).toBe(true);
    expect(has(moves, 4, 9)).toBe(true);
  });
  it('no double-step away from the home rank', () => {
    const pawn = P('player', 'pawn', 4, 6);
    const moves = legalMoves(pawn, [pawn], SIZE);
    expect(has(moves, 4, 5)).toBe(true);
    expect(has(moves, 4, 4)).toBe(false);
  });
  it('is blocked by a piece directly ahead', () => {
    const pawn = P('player', 'pawn', 4, 11);
    const blocker = P('player', 'pawn', 4, 10);
    expect(legalMoves(pawn, [pawn, blocker], SIZE)).toHaveLength(0);
  });
  it('captures diagonally forward', () => {
    const pawn = P('player', 'pawn', 4, 6);
    const target = P('enemy', 'pawn', 3, 5);
    const m = find(legalMoves(pawn, [pawn, target], SIZE), 3, 5);
    expect(m?.capture).toBe(target.id);
  });
  it('uses a stable authored forward direction for movement and captures', () => {
    const pawn = P('player', 'pawn', 2, 6, { startX: 2, startY: 6, facing: 'north', pawnForward: 'east' });
    const northEastTarget = P('enemy', 'pawn', 3, 5);
    const southEastTarget = P('enemy', 'pawn', 3, 7);
    const moves = legalMoves(pawn, [pawn, northEastTarget, southEastTarget], SIZE);
    expect(has(moves, 3, 6)).toBe(true);
    expect(has(moves, 4, 6)).toBe(true);
    expect(has(moves, 2, 5)).toBe(false);
    expect(find(moves, 3, 5)?.capture).toBe(northEastTarget.id);
    expect(find(moves, 3, 7)?.capture).toBe(southEastTarget.id);
  });
  it('can capture en passant immediately after an adjacent pawn double-step', () => {
    const pawn = P('player', 'pawn', 4, 3);
    const target = P('enemy', 'pawn', 3, 3);
    const moves = legalMoves(pawn, [pawn, target], SIZE, {
      lastMove: { pieceId: target.id, pieceType: 'pawn', side: 'enemy', from: { x: 3, y: 1 }, to: { x: 3, y: 3 } },
    });
    const ep = find(moves, 3, 2);
    expect(ep).toMatchObject({ capture: target.id, enPassant: true });
  });
  it('does not allow en passant after a non-double-step pawn move', () => {
    const pawn = P('player', 'pawn', 4, 3);
    const target = P('enemy', 'pawn', 3, 3);
    const moves = legalMoves(pawn, [pawn, target], SIZE, {
      lastMove: { pieceId: target.id, pieceType: 'pawn', side: 'enemy', from: { x: 3, y: 2 }, to: { x: 3, y: 3 } },
    });
    expect(find(moves, 3, 2)?.enPassant).toBeUndefined();
  });
  it('applies en passant relative to the pawn forward direction', () => {
    const pawn = P('player', 'pawn', 4, 4, { startX: 4, startY: 4, pawnForward: 'east' });
    const target = P('enemy', 'pawn', 4, 3, { startX: 4, startY: 1, pawnForward: 'south' });
    const moves = legalMoves(pawn, [pawn, target], SIZE, {
      lastMove: { pieceId: target.id, pieceType: 'pawn', side: 'enemy', from: { x: 4, y: 1 }, to: { x: 4, y: 3 } },
    });
    const ep = find(moves, 5, 3);
    expect(ep).toMatchObject({ capture: target.id, enPassant: true });
  });
});

describe('knight movement', () => {
  it('has eight in-bounds L-moves on an open board', () => {
    const knight = P('player', 'knight', 4, 6);
    expect(legalMoves(knight, [knight], SIZE)).toHaveLength(8);
  });
  it('is blocked by friendly pieces but captures enemies', () => {
    const knight = P('player', 'knight', 4, 6);
    const friend = P('player', 'pawn', 5, 4);
    const foe = P('enemy', 'pawn', 3, 4);
    const moves = legalMoves(knight, [knight, friend, foe], SIZE);
    expect(has(moves, 5, 4)).toBe(false);
    expect(find(moves, 3, 4)?.capture).toBe(foe.id);
  });
});

describe('sliding pieces', () => {
  it('queen rays to the board edges', () => {
    const queen = P('player', 'queen', 4, 6);
    const moves = legalMoves(queen, [queen], SIZE);
    expect(has(moves, 4, 0)).toBe(true);
    expect(has(moves, 0, 6)).toBe(true);
    expect(has(moves, 7, 6)).toBe(true);
    expect(has(moves, 4, 11)).toBe(true);
  });
  it('queen stops at an enemy (capturing) and before a friend', () => {
    const queen = P('player', 'queen', 4, 6);
    const foe = P('enemy', 'pawn', 4, 3);
    const friend = P('player', 'pawn', 6, 6);
    const moves = legalMoves(queen, [queen, foe, friend], SIZE);
    expect(has(moves, 4, 4)).toBe(true);
    expect(find(moves, 4, 3)?.capture).toBe(foe.id);
    expect(has(moves, 4, 2)).toBe(false);
    expect(has(moves, 5, 6)).toBe(true);
    expect(has(moves, 6, 6)).toBe(false);
  });
  it('bishop is diagonal, queen is both', () => {
    const bishop = P('player', 'bishop', 4, 6);
    const bm = legalMoves(bishop, [bishop], SIZE);
    expect(has(bm, 5, 7)).toBe(true);
    expect(has(bm, 3, 5)).toBe(true);
    expect(has(bm, 4, 5)).toBe(false);
    const queen = P('player', 'queen', 4, 6);
    const qm = legalMoves(queen, [queen], SIZE);
    expect(has(qm, 4, 0)).toBe(true);
    expect(has(qm, 6, 8)).toBe(true);
  });
  it('rocks never move and are not capturable', () => {
    const queen = P('player', 'queen', 4, 6);
    const rock = P('neutral', 'rock', 4, 3);
    expect(legalMoves(rock, [rock], SIZE)).toHaveLength(0);
    expect(isEnemy(queen, rock)).toBe(false);
    expect(has(legalMoves(queen, [queen, rock], SIZE), 4, 3)).toBe(false); // blocked, no capture
  });
});

describe('king may not move into check', () => {
  // A far-off enemy king keeps a board legal (both sides fielded) without
  // touching the squares under test.
  const farKing = () => P('enemy', 'king', 7, 0);
  const farPlayerKing = () => P('player', 'king', 7, 11);

  it('skips squares an enemy rook attacks', () => {
    const king = P('player', 'king', 4, 6);
    const rook = P('enemy', 'rook', 0, 5); // rakes row 5
    const moves = legalMoves(king, [king, rook, farKing()], SIZE);
    expect(has(moves, 3, 5)).toBe(false);
    expect(has(moves, 4, 5)).toBe(false);
    expect(has(moves, 5, 5)).toBe(false);
    expect(has(moves, 3, 6)).toBe(true);
    expect(has(moves, 4, 7)).toBe(true);
  });

  it('cannot retreat straight back along the checking line (slider x-rays the vacated square)', () => {
    const king = P('player', 'king', 4, 3);
    const rook = P('enemy', 'rook', 4, 0); // checks down column 4, blocked at the king
    const moves = legalMoves(king, [king, rook, farPlayerKing()], SIZE);
    expect(has(moves, 4, 4)).toBe(false); // stepping away in-line is still check
    expect(has(moves, 4, 2)).toBe(false); // toward the rook, still on the file
    expect(has(moves, 3, 3)).toBe(true); // sidestep off the file escapes
    expect(has(moves, 5, 4)).toBe(true);
  });

  it('may capture an undefended attacker', () => {
    const king = P('player', 'king', 4, 6);
    const rook = P('enemy', 'rook', 4, 5); // adjacent, giving check, undefended
    const m = find(legalMoves(king, [king, rook, farKing()], SIZE), 4, 5);
    expect(m?.capture).toBe(rook.id);
  });

  it('may not capture a defended attacker', () => {
    const king = P('player', 'king', 4, 6);
    const rook = P('enemy', 'rook', 4, 5); // adjacent checker...
    const guard = P('enemy', 'rook', 0, 5); // ...defended along row 5
    expect(has(legalMoves(king, [king, rook, guard, farKing()], SIZE), 4, 5)).toBe(false);
    expect(has(legalMoves(king, [king, rook, guard, farKing()], SIZE), 3, 6)).toBe(true); // still has an out
  });

  it('keeps the two kings apart (cannot step next to the enemy king)', () => {
    const king = P('player', 'king', 4, 6);
    const foeKing = P('enemy', 'king', 4, 4); // guards row 5 around (4,5)
    const moves = legalMoves(king, [king, foeKing], SIZE);
    expect(has(moves, 4, 5)).toBe(false);
    expect(has(moves, 3, 5)).toBe(false);
    expect(has(moves, 5, 5)).toBe(false);
    expect(has(moves, 4, 7)).toBe(true);
  });

  it('still offers every genuinely safe square on an open board', () => {
    const king = P('player', 'king', 4, 6);
    expect(legalMoves(king, [king, farKing()], SIZE)).toHaveLength(8);
  });

  it('applies symmetrically to the enemy king', () => {
    const foeKing = P('enemy', 'king', 4, 6);
    const rook = P('player', 'rook', 0, 5); // player rook rakes row 5
    const moves = legalMoves(foeKing, [foeKing, rook, farPlayerKing()], SIZE);
    expect(has(moves, 4, 5)).toBe(false);
    expect(has(moves, 3, 6)).toBe(true);
  });
});

describe('no move may leave your own king in check (pins & check evasion)', () => {
  const farKing = () => P('enemy', 'king', 7, 0);

  it('a pinned piece may only move along the pinning line', () => {
    const king = P('player', 'king', 4, 6);
    const rook = P('player', 'rook', 4, 4); // pinned to the king down column 4
    const pinner = P('enemy', 'rook', 4, 0);
    const moves = legalMoves(rook, [king, rook, pinner, farKing()], SIZE);
    expect(moves.every((m) => m.x === 4)).toBe(true); // never leaves the file
    expect(has(moves, 4, 5)).toBe(true); // slide toward the king
    expect(has(moves, 3, 4)).toBe(false); // stepping off the file exposes the king
    expect(has(moves, 5, 4)).toBe(false);
    expect(find(moves, 4, 0)?.capture).toBe(pinner.id); // capturing the pinner is fine
  });

  it('while in check, only moves that answer the check are legal (interpose)', () => {
    const king = P('player', 'king', 4, 6);
    const checker = P('enemy', 'rook', 4, 0); // checks down column 4
    const knight = P('player', 'knight', 2, 3); // can jump onto the checking file
    const moves = legalMoves(knight, [king, checker, knight, farKing()], SIZE);
    expect(moves).toHaveLength(2); // only the two interposing squares
    expect(has(moves, 4, 2)).toBe(true);
    expect(has(moves, 4, 4)).toBe(true);
    expect(has(moves, 0, 2)).toBe(false); // any non-blocking jump leaves the king in check
    expect(has(moves, 3, 5)).toBe(false);
  });

  it('while in check, capturing the checker is legal (and is the only out for that piece)', () => {
    const king = P('player', 'king', 0, 0);
    const checker = P('enemy', 'rook', 0, 4); // checks down column 0
    const rook = P('player', 'rook', 4, 4); // can take the checker along row 4
    const moves = legalMoves(rook, [king, checker, rook, farKing()], SIZE);
    expect(moves).toHaveLength(1);
    expect(find(moves, 0, 4)?.capture).toBe(checker.id);
  });

  it('does not constrain a side that fields no king (pure movement is unaffected)', () => {
    const rook = P('player', 'rook', 4, 4); // no friendly king on the board
    const enemyRook = P('enemy', 'rook', 4, 0);
    const moves = legalMoves(rook, [rook, enemyRook, farKing()], SIZE);
    expect(has(moves, 3, 4)).toBe(true); // free to move anywhere legal — nothing to protect
    expect(has(moves, 5, 4)).toBe(true);
  });
});

describe('threats', () => {
  it('pawn attacks the two forward diagonals', () => {
    const pawn = P('player', 'pawn', 4, 6);
    const sq = attackedSquares(pawn, [pawn], SIZE);
    expect(sq).toHaveLength(2);
    expect(has(sq, 3, 5)).toBe(true);
    expect(has(sq, 5, 5)).toBe(true);
  });
  it('pawn attacks follow its authored forward direction', () => {
    const pawn = P('player', 'pawn', 4, 6, { pawnForward: 'east' });
    const sq = attackedSquares(pawn, [pawn], SIZE);
    expect(sq).toHaveLength(2);
    expect(has(sq, 5, 5)).toBe(true);
    expect(has(sq, 5, 7)).toBe(true);
  });
  it('enemyThreats unions every living enemy', () => {
    const ep = P('enemy', 'pawn', 4, 2);
    const t = enemyThreats([ep, P('player', 'queen', 0, 0)], SIZE);
    expect(has(t, 3, 3)).toBe(true);
    expect(has(t, 5, 3)).toBe(true);
  });
});

describe('applyMove', () => {
  it('captures, leaves the source state untouched (immutable)', () => {
    const queen = P('player', 'queen', 4, 6);
    const pawn = P('player', 'pawn', 0, 11);
    const foePawn = P('enemy', 'pawn', 4, 3);
    const foeKnight = P('enemy', 'knight', 7, 0);
    const state = { size: SIZE, pieces: [queen, pawn, foePawn, foeKnight], turn: 'player' as const, winner: null };
    const res = applyMove(state, queen.id, { x: 4, y: 3, capture: foePawn.id });
    expect(res.events.some((e) => e.kind === 'captured')).toBe(true);
    expect(res.state.pieces.find((p) => p.id === foePawn.id)?.alive).toBe(false);
    expect(res.state.turn).toBe('enemy');
    expect(res.state.winner).toBeNull();
    // immutability: the input arrays/objects are unchanged
    expect(state.pieces.find((p) => p.id === foePawn.id)?.alive).toBe(true);
  });
  it('turns the acting piece toward its move or attack destination', () => {
    const queen = P('player', 'queen', 4, 6, { facing: 'south' });
    const foePawn = P('enemy', 'pawn', 5, 5);
    const foeKing = P('enemy', 'king', 7, 0);
    const state = { size: SIZE, pieces: [queen, foePawn, foeKing], turn: 'player' as const, winner: null };
    const res = applyMove(state, queen.id, { x: 5, y: 5, capture: foePawn.id });
    expect(res.state.pieces.find((p) => p.id === queen.id)?.facing).toBe('north-east');
    expect(state.pieces.find((p) => p.id === queen.id)?.facing).toBe('south');
  });
  it('keeps a pawn moving in its original forward direction after its sprite turns', () => {
    const pawn = P('player', 'pawn', 4, 4, { startX: 4, startY: 4, facing: 'east', pawnForward: 'east' });
    const foePawn = P('enemy', 'pawn', 5, 3);
    const foeKing = P('enemy', 'king', 7, 0);
    const state = { size: SIZE, pieces: [pawn, foePawn, foeKing], turn: 'player' as const, winner: null };
    const res = applyMove(state, pawn.id, { x: 5, y: 3, capture: foePawn.id });
    const moved = res.state.pieces.find((p) => p.id === pawn.id)!;
    expect(moved.facing).toBe('north-east');
    expect(moved.pawnForward).toBe('east');
    const nextMoves = legalMoves(moved, res.state.pieces, SIZE);
    expect(has(nextMoves, 6, 3)).toBe(true);
    expect(has(nextMoves, 6, 2)).toBe(false);
  });
  it('promotes a pawn reaching the far rank', () => {
    const pawn = P('player', 'pawn', 4, 1);
    const foe = P('enemy', 'queen', 7, 0);
    const state = { size: SIZE, pieces: [pawn, foe], turn: 'player' as const, winner: null };
    const res = applyMove(state, pawn.id, { x: 4, y: 0 });
    expect(res.state.pieces.find((p) => p.id === pawn.id)?.type).toBe('queen');
    expect(res.events.some((e) => e.kind === 'promoted')).toBe(true);
  });
  it('promotes a pawn reaching its authored forward edge', () => {
    const pawn = P('player', 'pawn', 6, 4, { startX: 6, startY: 4, pawnForward: 'east' });
    const foe = P('enemy', 'queen', 7, 0);
    const state = { size: SIZE, pieces: [pawn, foe], turn: 'player' as const, winner: null };
    const res = applyMove(state, pawn.id, { x: 7, y: 4 });
    expect(res.state.pieces.find((p) => p.id === pawn.id)?.type).toBe('queen');
    expect(res.events.some((e) => e.kind === 'promoted')).toBe(true);
  });
  it('removes the side pawn captured en passant', () => {
    const pawn = P('player', 'pawn', 4, 3);
    const target = P('enemy', 'pawn', 3, 3);
    const state = { size: SIZE, pieces: [pawn, target, P('enemy', 'king', 7, 0)], turn: 'player' as const, winner: null };
    const res = applyMove(state, pawn.id, { x: 3, y: 2, capture: target.id, enPassant: true });
    expect(res.state.pieces.find((p) => p.id === pawn.id)).toMatchObject({ x: 3, y: 2 });
    expect(res.state.pieces.find((p) => p.id === target.id)?.alive).toBe(false);
  });
  it('declares victory when one side is wiped out', () => {
    const queen = P('player', 'queen', 4, 6);
    const lastFoe = P('enemy', 'pawn', 4, 5);
    const state = { size: SIZE, pieces: [queen, lastFoe], turn: 'player' as const, winner: null };
    const res = applyMove(state, queen.id, { x: 4, y: 5, capture: lastFoe.id });
    expect(res.state.winner).toBe('player');
    expect(res.state.turn).toBe('done');
    expect(res.events.some((e) => e.kind === 'victory')).toBe(true);
  });
});

describe('applyMove service-record stats', () => {
  const after = (pieces: Piece[], id: string, move: Move) =>
    applyMove({ size: SIZE, pieces, turn: 'player' as const, winner: null }, id, move)
      .state.pieces.find((p) => p.id === id)!;

  it('counts every action in timesUsed', () => {
    const queen = P('player', 'queen', 4, 6);
    const moved = after([queen, P('player', 'king', 0, 11), P('enemy', 'king', 7, 0)], queen.id, { x: 2, y: 4 });
    expect(moved.timesUsed).toBe(1);
  });

  it('measures distance with diagonals as 1.5 and orthogonals as 1', () => {
    const ctx = (p: Piece) => [p, P('player', 'king', 0, 11), P('enemy', 'king', 7, 0)];
    const diag = after(ctx(P('player', 'queen', 4, 6)), 'player-queen-4-6', { x: 2, y: 4 }); // 2 diagonal steps
    expect(diag.squaresTraveled).toBe(3);
    const orth = after(ctx(P('player', 'rook', 0, 6)), 'player-rook-0-6', { x: 3, y: 6 }); // 3 orthogonal steps
    expect(orth.squaresTraveled).toBe(3);
    const knight = after(ctx(P('player', 'knight', 4, 6)), 'player-knight-4-6', { x: 5, y: 4 }); // 1 diag + 1 straight
    expect(knight.squaresTraveled).toBe(2.5);
  });

  it('counts a capture in enemiesKilled', () => {
    const queen = P('player', 'queen', 4, 6);
    const foe = P('enemy', 'pawn', 4, 3);
    const killed = after([queen, foe, P('player', 'king', 0, 11), P('enemy', 'king', 7, 0)], queen.id, { x: 4, y: 3, capture: foe.id });
    expect(killed.enemiesKilled).toBe(1);
  });

  it('counts an escape only when leaving a square an opponent attacks', () => {
    const knight = P('player', 'knight', 4, 6);
    const rook = P('enemy', 'rook', 4, 0); // attacks down column 4, including (4,6)
    const fled = after([knight, rook, P('player', 'king', 0, 11), P('enemy', 'king', 7, 0)], knight.id, { x: 5, y: 4 });
    expect(fled.escapes).toBe(1);

    const safe = P('player', 'knight', 4, 6);
    const calm = after([safe, P('player', 'king', 0, 11), P('enemy', 'king', 7, 0)], safe.id, { x: 5, y: 4 });
    expect(calm.escapes ?? 0).toBe(0);
  });

  it('counts opponents newly placed under attack in threatsMade', () => {
    const rook = P('player', 'rook', 0, 0);
    const foe = P('enemy', 'pawn', 5, 5);
    const aggressor = after([rook, foe, P('player', 'king', 1, 11), P('enemy', 'king', 7, 11)], rook.id, { x: 5, y: 0 });
    expect(aggressor.threatsMade).toBe(1); // now attacks down column 5 onto the pawn

    const idle = P('player', 'rook', 0, 0);
    const quiet = after([idle, P('enemy', 'pawn', 5, 5), P('player', 'king', 1, 11), P('enemy', 'king', 7, 11)], idle.id, { x: 0, y: 3 });
    expect(quiet.threatsMade ?? 0).toBe(0);
  });
});

describe('enemy AI', () => {
  it('is deterministic for a given seed', () => {
    const pieces = [P('player', 'pawn', 4, 6), P('enemy', 'knight', 4, 2), P('enemy', 'queen', 1, 1)];
    const state = { size: SIZE, pieces, turn: 'enemy' as const, winner: null };
    const a = enemyMove(state, createRng(123));
    const b = enemyMove(state, createRng(123));
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });
  it('prefers a capturing move when one exists', () => {
    // enemy queen on the same file as a lone player pawn -> a capture is available
    const pawn = P('player', 'pawn', 4, 6);
    const queen = P('enemy', 'queen', 4, 2);
    const idle = P('enemy', 'knight', 0, 0);
    const state = { size: SIZE, pieces: [pawn, queen, idle], turn: 'enemy' as const, winner: null };
    const chosen = enemyMove(state, createRng(7));
    expect(chosen?.move.capture).toBe(pawn.id);
  });
});

describe('edge fences (movement blocking)', () => {
  it('stops a rook from crossing a fenced edge, but leaves other directions open', () => {
    const rook = P('player', 'rook', 4, 4);
    const env: MoveEnv = { fences: new Set([roadEdgeKey(4, 4, 5, 4)]) }; // wall on the E edge
    const moves = legalMoves(rook, [rook], SIZE, env);
    expect(has(moves, 5, 4)).toBe(false); // can't step east across the fence
    expect(has(moves, 6, 4)).toBe(false); // ...nor continue past it
    expect(has(moves, 3, 4)).toBe(true); // west is open
    expect(has(moves, 4, 5)).toBe(true); // south is open
  });

  it('lets a knight hop a fenced edge (its jumps are never orthogonally adjacent)', () => {
    const knight = P('player', 'knight', 4, 4);
    const env: MoveEnv = { fences: new Set([
      roadEdgeKey(4, 4, 5, 4), roadEdgeKey(4, 4, 3, 4), roadEdgeKey(4, 4, 4, 5), roadEdgeKey(4, 4, 4, 3),
    ]) };
    expect(legalMoves(knight, [knight], SIZE, env)).toHaveLength(8);
  });

  it('lets a bishop slide diagonally past a lone edge fence (a corner, not the edge)', () => {
    const bishop = P('player', 'bishop', 4, 4);
    const env: MoveEnv = { fences: new Set([roadEdgeKey(4, 4, 5, 4)]) };
    expect(has(legalMoves(bishop, [bishop], SIZE, env), 5, 5)).toBe(true);
  });

  it('stops a pawn from stepping across a fenced forward edge', () => {
    const pawn = P('player', 'pawn', 3, 6, { startY: 6 });
    const env: MoveEnv = { fences: new Set([roadEdgeKey(3, 6, 3, 5)]) }; // wall on the N (forward) edge
    expect(legalMoves(pawn, [pawn], SIZE, env)).toHaveLength(0);
  });

  it('walls a threat ray so a rook does not reach across a fence', () => {
    const rook = P('enemy', 'rook', 4, 0);
    const env: MoveEnv = { fences: new Set([roadEdgeKey(4, 2, 4, 3)]) };
    const threats = attackedSquares(rook, [rook], SIZE, env);
    expect(has(threats, 4, 2)).toBe(true); // reaches up to the fence
    expect(has(threats, 4, 3)).toBe(false); // but not across it
  });

  it('gameEnv threads a state\'s fences into the movement env (the one env builder all consumers share)', () => {
    const env = gameEnv({ size: SIZE, pieces: [], turn: 'player', winner: null, fences: [roadEdgeKey(2, 2, 3, 2)] } as GameState);
    expect(env.fences?.has(roadEdgeKey(2, 2, 3, 2))).toBe(true);
    const rook = P('player', 'rook', 2, 2);
    expect(has(legalMoves(rook, [rook], SIZE, env), 3, 2)).toBe(false); // the fenced edge blocks the step
    // A fence-free state yields no fence set (so movement is byte-identical to a fence-free game).
    expect(gameEnv({ size: SIZE, pieces: [], turn: 'player', winner: null } as GameState).fences).toBeUndefined();
  });
});
