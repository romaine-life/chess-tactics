// The three consumers of attack geometry must never disagree.
//
// `attackedSquares` (enumerate), `attacksSquare` (early-exit predicate), and
// `markAttackedSquares` (board bitmap) all run off one `scanAttacks` implementation
// in rules.ts precisely so they cannot drift — the predicate exists because check
// detection asks a yes/no question millions of times per search and materialising a
// threat list to answer it was ~40% of engine cost. This file is the structural
// guarantee behind that refactor: if anyone ever specialises one mode, these fail.
//
// The sweep is exhaustive over every square of a small board rather than sampled, so
// it covers the asymmetric cases that make a hand-written predicate tempting and
// wrong: elevation blocking uses the ATTACKER's origin height, fences close some
// crossings but never stop a knight, water is threatened but not seen through, and a
// slider's ray ends ON the first occupied square.
import { describe, it, expect } from 'vitest';
import { attackedSquares, attacksSquare, legalMoves, markAttackedSquares, sideInCheck, type MoveEnv } from './rules';
import { buildTerrainIndex } from './terrain';
import { createRng } from './rng';
import type { BoardSize, GameState, Piece, PieceType, Side, TerrainCell, TerrainType } from './types';

const SIZE: BoardSize = { cols: 7, rows: 7 };
const TYPES: readonly PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const TERRAINS: readonly TerrainType[] = ['grass', 'water', 'cliff', 'stone', 'road', 'void', 'rock'];

/** A seeded board: mixed terrain, edge fences, and a scatter of both sides' pieces. */
function scenario(seed: number): { pieces: Piece[]; env: MoveEnv } {
  const rng = createRng(seed);
  const cells: TerrainCell[] = [];
  for (let y = 0; y < SIZE.rows; y += 1) {
    for (let x = 0; x < SIZE.cols; x += 1) {
      // Leave some cells unauthored so the "no terrain cell = open ground" path is hit.
      if (rng.next() < 0.25) continue;
      cells.push({ x, y, terrain: rng.pick(TERRAINS), elevation: rng.int(3) });
    }
  }
  const fences = new Set<string>();
  for (let i = 0; i < 10; i += 1) {
    const x = rng.int(SIZE.cols - 1);
    const y = rng.int(SIZE.rows);
    fences.add(`${x},${y}|${x + 1},${y}`);
    const hx = rng.int(SIZE.cols);
    const hy = rng.int(SIZE.rows - 1);
    fences.add(`${hx},${hy}|${hx},${hy + 1}`);
  }

  const pieces: Piece[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < 10; i += 1) {
    const x = rng.int(SIZE.cols);
    const y = rng.int(SIZE.rows);
    if (taken.has(`${x},${y}`)) continue;
    taken.add(`${x},${y}`);
    const side: Side = i % 2 === 0 ? 'player' : 'enemy';
    pieces.push({
      id: `p${i}`, side, type: rng.pick(TYPES), x, y, alive: true, startY: y,
      ...(rng.next() < 0.5 ? { pawnForward: 'north' as const } : {}),
    });
  }
  // A neutral obstacle and a dead piece: both must be ignored as attackers.
  pieces.push({ id: 'rock', side: 'neutral', type: 'rock', x: 3, y: 3, alive: true, startY: 3 });
  pieces.push({ id: 'ghost', side: 'enemy', type: 'queen', x: 0, y: 0, alive: false, startY: 0 });

  return { pieces, env: { terrain: buildTerrainIndex(cells), fences } };
}

describe('attack geometry: enumerate / predicate / bitmap agree', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`agrees on every square for every piece (seed ${seed})`, () => {
      const { pieces, env } = scenario(seed);
      for (const piece of pieces) {
        const listed = attackedSquares(piece, pieces, SIZE, env);
        const listedKeys = new Set(listed.map((s) => `${s.x},${s.y}`));

        const mark = new Uint8Array(SIZE.cols * SIZE.rows);
        markAttackedSquares(pieces, piece.side, SIZE, env, mark);

        for (let y = 0; y < SIZE.rows; y += 1) {
          for (let x = 0; x < SIZE.cols; x += 1) {
            const inList = listedKeys.has(`${x},${y}`);
            expect(
              attacksSquare(piece, pieces, SIZE, env, x, y),
              `${piece.id} (${piece.type} @${piece.x},${piece.y}) vs ${x},${y}`,
            ).toBe(inList);
            // The bitmap is the union over the side, so a square this piece
            // threatens must be set in it.
            if (inList) expect(mark[y * SIZE.cols + x]).toBe(1);
          }
        }
      }
    });
  }

  it('marks exactly the union of the side\'s attacked squares', () => {
    const { pieces, env } = scenario(42);
    for (const side of ['player', 'enemy'] as const) {
      const union = new Set<string>();
      for (const p of pieces) {
        if (!p.alive || p.side !== side) continue;
        for (const s of attackedSquares(p, pieces, SIZE, env)) union.add(`${s.x},${s.y}`);
      }
      const mark = new Uint8Array(SIZE.cols * SIZE.rows);
      markAttackedSquares(pieces, side, SIZE, env, mark);
      for (let y = 0; y < SIZE.rows; y += 1) {
        for (let x = 0; x < SIZE.cols; x += 1) {
          expect(mark[y * SIZE.cols + x] === 1, `${side} ${x},${y}`).toBe(union.has(`${x},${y}`));
        }
      }
    }
  });

  it('never reports an attack for a dead piece or a neutral obstacle', () => {
    const { pieces, env } = scenario(9);
    const rock = pieces.find((p) => p.id === 'rock')!;
    const ghost = pieces.find((p) => p.id === 'ghost')!;
    for (let y = 0; y < SIZE.rows; y += 1) {
      for (let x = 0; x < SIZE.cols; x += 1) {
        expect(attacksSquare(rock, pieces, SIZE, env, x, y)).toBe(false);
        expect(attacksSquare(ghost, pieces, SIZE, env, x, y)).toBe(false);
      }
    }
    expect(attackedSquares(rock, pieces, SIZE, env)).toEqual([]);
    expect(attackedSquares(ghost, pieces, SIZE, env)).toEqual([]);
  });

  // ── Check detection: the ray-scan candidate filter vs a brute-force oracle ──────
  //
  // `sideKingAttacked` no longer asks every hostile piece whether it attacks the
  // king; it scans outward from the king for candidates and confirms those. The
  // reference below IS the exhaustive form it replaced, so these tests are a direct
  // equivalence proof over boards seeded with terrain, elevation, fences, water and
  // obstacles — the features that make the optimisation non-obvious.

  /** Brute force: ask literally every hostile piece. */
  function referenceInCheck(pieces: readonly Piece[], side: Side, env: MoveEnv): boolean {
    for (const king of pieces) {
      if (!king.alive || king.type !== 'king' || king.side !== side) continue;
      for (const p of pieces) {
        if (!p.alive || p.side === side || p.side === 'neutral') continue;
        if (attackedSquares(p, pieces, SIZE, env).some((s) => s.x === king.x && s.y === king.y)) return true;
      }
    }
    return false;
  }

  const stateOf = (pieces: Piece[]): GameState => ({ size: SIZE, pieces, turn: 'player', winner: null });

  it('detects check identically to a brute-force scan of every hostile piece', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const { pieces, env } = scenario(seed);
      // Force kings onto the board for both sides so the check test has work to do,
      // sweeping the king across every square to cover aligned and unaligned cases.
      for (const side of ['player', 'enemy'] as const) {
        for (let y = 0; y < SIZE.rows; y += 1) {
          for (let x = 0; x < SIZE.cols; x += 1) {
            const others = pieces.filter((p) => !(p.x === x && p.y === y));
            const king: Piece = { id: 'K', side, type: 'king', x, y, alive: true, startY: y };
            const board = [...others, king];
            expect(
              sideInCheck(stateOf(board), side, env),
              `seed ${seed} ${side} king @${x},${y}`,
            ).toBe(referenceInCheck(board, side, env));
          }
        }
      }
    }
  });

  it('generates the same king-safety-filtered move list as the brute-force check test', () => {
    // `legalMoves` filters every candidate through the check test, so an equivalent
    // check test must produce an identical move list — the property the search rests on.
    //
    // The reference list is built INDEPENDENTLY, not by re-filtering the output under
    // test (which could only ever catch moves wrongly kept, never moves wrongly
    // dropped). The unfiltered candidate set comes from retyping the friendly king to
    // a pawn: blocking depends on a square's occupancy and side, never on type, so
    // every other piece's raw geometry is untouched, but the side is now kingless and
    // `legalMoves` documents kingless sides as unconstrained by check.
    const afterBoard = (mover: Piece, m: { x: number; y: number; capture?: string }, pieces: readonly Piece[]): Piece[] => {
      const capturedId = m.capture ?? pieces.find((p) => p.alive && p.x === m.x && p.y === m.y)?.id;
      const captured = capturedId ? pieces.find((p) => p.id === capturedId) : undefined;
      const captures = !!captured && captured.type !== 'rock' && captured.side !== 'neutral' && captured.side !== mover.side;
      const out: Piece[] = [];
      for (const p of pieces) {
        if (captures && p.id === capturedId) continue;
        out.push(p.id === mover.id ? { ...p, x: m.x, y: m.y } : p);
      }
      return out;
    };

    let filtered = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const { pieces, env } = scenario(seed);
      const board: Piece[] = [
        ...pieces.filter((p) => !(p.x === 3 && p.y === 4) && !(p.x === 2 && p.y === 1)),
        { id: 'K', side: 'player', type: 'king', x: 3, y: 4, alive: true, startY: 4 },
        { id: 'k', side: 'enemy', type: 'king', x: 2, y: 1, alive: true, startY: 1 },
      ];
      const kingless = board.map((p) => (p.id === 'K' ? { ...p, type: 'pawn' as const } : p));

      for (const piece of board) {
        // Kings are covered exhaustively — over every square of the board — by the
        // check-equivalence test above; the substitution trick doesn't apply to them.
        if (piece.type === 'king' || piece.side !== 'player') continue;
        const unfiltered = legalMoves(piece, kingless, SIZE, env);
        const reference = unfiltered.filter((m) => !referenceInCheck(afterBoard(piece, m, board), piece.side, env));
        filtered += unfiltered.length - reference.length;
        expect(legalMoves(piece, board, SIZE, env), `seed ${seed} ${piece.id}`).toEqual(reference);
      }
    }
    // Guard against a vacuous pass: the check filter must actually have removed moves
    // across the sweep, or this proves nothing about pins and check evasion.
    expect(filtered).toBeGreaterThan(0);
  });

  it('agrees with no terrain env at all (pure chess geometry)', () => {
    const pieces: Piece[] = [
      { id: 'q', side: 'player', type: 'queen', x: 3, y: 3, alive: true, startY: 3 },
      { id: 'block', side: 'player', type: 'pawn', x: 3, y: 1, alive: true, startY: 1 },
      { id: 'foe', side: 'enemy', type: 'knight', x: 5, y: 5, alive: true, startY: 5 },
    ];
    for (const piece of pieces) {
      const keys = new Set(attackedSquares(piece, pieces, SIZE).map((s) => `${s.x},${s.y}`));
      for (let y = 0; y < SIZE.rows; y += 1) {
        for (let x = 0; x < SIZE.cols; x += 1) {
          expect(attacksSquare(piece, pieces, SIZE, undefined, x, y)).toBe(keys.has(`${x},${y}`));
        }
      }
    }
    // The blocked ray: the blocker's square is threatened, nothing past it.
    expect(attacksSquare(pieces[0], pieces, SIZE, undefined, 3, 1)).toBe(true);
    expect(attacksSquare(pieces[0], pieces, SIZE, undefined, 3, 0)).toBe(false);
  });
});
