// Standard algebraic notation for recorded games — the accepted way to notate chess.
// Given a game's per-ply states (replayStates' output) and its recorded moves, produce
// one SAN token per ply: piece letter, disambiguation, capture, destination, promotion,
// castling, and check/mate suffixes. Files run a.. from x=0; ranks count from the
// PLAYER's home edge (player pawns advance toward decreasing y, so rank = rows − y).
// Boards wider than 26 files fall back to the coordinate labels — SAN's grammar stops
// meaning anything there.
//
// Check/mate marks reflect CHESS terminality only (opponent in check / in check with no
// legal reply). A game that ends by an authored victory rule (reach, capture-the-king
// race, turn limit) simply ends — SAN never invents a mark for it.

import type { GameState, Move, Piece, Side } from '../core/types';
import type { MoveEnv } from '../core/rules';
import { gameEnv, legalMoves, livingPieces, sideInCheck } from '../core/rules';
import type { RecordedMove } from './selfplay';

const SAN_LETTER: Record<string, string> = { pawn: '', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' };

const fileOf = (x: number): string => String.fromCharCode(97 + x);
const squareOf = (x: number, y: number, rows: number): string => `${fileOf(x)}${rows - y}`;

function envOf(state: GameState): MoveEnv {
  return { ...gameEnv(state), lastMove: state.lastMove };
}

function reachesSquare(piece: Piece, state: GameState, env: MoveEnv, x: number, y: number): boolean {
  return legalMoves(piece, state.pieces, state.size, env).some((m: Move) => m.x === x && m.y === y);
}

function oppOf(side: Side): 'player' | 'enemy' { return side === 'player' ? 'enemy' : 'player'; }

/** '+' when the opponent stands in check after the move, '#' when checked with no legal
 * reply. Empty when neither (stalemate carries no SAN mark). */
function checkSuffix(after: GameState, moverSide: Side): string {
  const opp = oppOf(moverSide);
  if (!livingPieces(after.pieces, opp).some((p) => p.type === 'king')) return '';
  const env = envOf(after);
  if (!sideInCheck(after, opp, env)) return '';
  const anyReply = livingPieces(after.pieces, opp)
    .some((p) => legalMoves(p, after.pieces, after.size, env).length > 0);
  return anyReply ? '+' : '#';
}

/** SAN token for ply i of a recorded game (states from replayStates: states[i] is the
 * position the move was played FROM, states[i+1] the position after). */
export function sanForPly(states: readonly GameState[], moves: readonly RecordedMove[], i: number): string {
  const before = states[i];
  const after = states[i + 1];
  const m = moves[i];
  if (!before || !after || !m) return '';
  const rows = before.size.rows;
  if (before.size.cols > 26) return `${m.pieceId} (${m.from.x},${m.from.y})->(${m.move.x},${m.move.y})`;

  const mover = before.pieces.find((p) => p.id === m.pieceId);
  if (!mover) return '';
  const suffix = checkSuffix(after, mover.side);

  if (m.move.castle) {
    return `${m.move.castle.kingTo.x > m.from.x ? 'O-O' : 'O-O-O'}${suffix}`;
  }

  const target = squareOf(m.move.x, m.move.y, rows);
  const captures = m.move.capture ? 'x' : '';

  if (mover.type === 'pawn') {
    const moverAfter = after.pieces.find((p) => p.id === m.pieceId);
    const promo = moverAfter && moverAfter.type !== 'pawn' ? `=${SAN_LETTER[moverAfter.type] || moverAfter.type.toUpperCase()}` : '';
    const core = captures ? `${fileOf(m.from.x)}x${target}` : target;
    return `${core}${promo}${suffix}`;
  }

  const letter = SAN_LETTER[mover.type] ?? mover.type.charAt(0).toUpperCase();
  // Disambiguate against same-type siblings that could also legally reach the target:
  // file when files differ, else rank, else both (SAN's standard ladder).
  const env = envOf(before);
  const rivals = before.pieces.filter((p) =>
    p.alive && p.id !== mover.id && p.side === mover.side && p.type === mover.type
    && reachesSquare(p, before, env, m.move.x, m.move.y));
  let disambig = '';
  if (rivals.length > 0) {
    const fileUnique = rivals.every((p) => p.x !== mover.x);
    const rankUnique = rivals.every((p) => p.y !== mover.y);
    disambig = fileUnique ? fileOf(mover.x) : rankUnique ? String(rows - mover.y) : `${fileOf(mover.x)}${rows - mover.y}`;
  }
  return `${letter}${disambig}${captures}${target}${suffix}`;
}

/** SAN token per ply for the whole record. */
export function sanForGame(states: readonly GameState[], moves: readonly RecordedMove[]): string[] {
  return moves.map((_, i) => sanForPly(states, moves, i));
}

export interface SanFullMove {
  /** Full-move number (1-based). */
  number: number;
  /** Ply index + SAN for the first half-move (null when the game opens on the reply side). */
  first: { ply: number; san: string } | null;
  second: { ply: number; san: string } | null;
}

/** Pair plies into numbered full moves, score-sheet style. A game that opens with the
 * enemy to move renders "1. … <reply>" (the standard ellipsis form). */
export function sanFullMoves(states: readonly GameState[], moves: readonly RecordedMove[]): SanFullMove[] {
  const san = sanForGame(states, moves);
  const opensWithReply = moves.length > 0 && moves[0].side === 'enemy';
  const rows: SanFullMove[] = [];
  let i = 0;
  let number = 1;
  if (opensWithReply) {
    rows.push({ number, first: null, second: { ply: 1, san: san[0] } });
    number += 1;
    i = 1;
  }
  for (; i < moves.length; i += 2, number += 1) {
    rows.push({
      number,
      first: { ply: i + 1, san: san[i] },
      second: i + 1 < moves.length ? { ply: i + 2, san: san[i + 1] } : null,
    });
  }
  return rows;
}
