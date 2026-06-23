import { describe, it, expect } from 'vitest';
import type { BoardSize, Piece, PieceType, Side } from './types';
import {
  applyMove,
  attackedSquares,
  enemyMove,
  enemyThreats,
  isEnemy,
  legalMoves,
} from './rules';
import { createRng } from './rng';

const SIZE: BoardSize = { cols: 8, rows: 12 };

function P(side: Side, type: PieceType, x: number, y: number, extra: Partial<Piece> = {}): Piece {
  return { id: `${side}-${type}-${x}-${y}`, side, type, x, y, alive: true, startY: side === 'player' ? 11 : 0, ...extra };
}
const has = (moves: ReadonlyArray<{ x: number; y: number }>, x: number, y: number) => moves.some((m) => m.x === x && m.y === y);
const find = (moves: ReadonlyArray<{ x: number; y: number; capture?: string }>, x: number, y: number) => moves.find((m) => m.x === x && m.y === y);

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

describe('threats', () => {
  it('pawn attacks the two forward diagonals', () => {
    const pawn = P('player', 'pawn', 4, 6);
    const sq = attackedSquares(pawn, [pawn], SIZE);
    expect(sq).toHaveLength(2);
    expect(has(sq, 3, 5)).toBe(true);
    expect(has(sq, 5, 5)).toBe(true);
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
  it('promotes a pawn reaching the far rank', () => {
    const pawn = P('player', 'pawn', 4, 1);
    const foe = P('enemy', 'queen', 7, 0);
    const state = { size: SIZE, pieces: [pawn, foe], turn: 'player' as const, winner: null };
    const res = applyMove(state, pawn.id, { x: 4, y: 0 });
    expect(res.state.pieces.find((p) => p.id === pawn.id)?.type).toBe('queen');
    expect(res.events.some((e) => e.kind === 'promoted')).toBe(true);
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
