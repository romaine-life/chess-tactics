import { describe, expect, it } from 'vitest';
import { applyMove } from '../core/rules';
import type { BoardSize, GameState, Piece, PieceType, Side } from '../core/types';
import { manubiaeEarnedBy } from './manubiae';
import { PIECE_VALUE } from './model';

const SIZE: BoardSize = { cols: 8, rows: 12 };

function P(side: Side, type: PieceType, x: number, y: number, extra: Partial<Piece> = {}): Piece {
  return { id: `${side}-${type}-${x}-${y}`, side, type, x, y, alive: true, startY: side === 'player' ? 11 : 0, ...extra };
}

/** Play `to` with `piece` on a board of `pieces`, and ask what the Run owes for it. */
function earned(pieces: Piece[], piece: Piece, to: { x: number; y: number; capture?: string }) {
  const state: GameState = { size: SIZE, pieces, turn: piece.side, winner: null };
  const result = applyMove(state, piece.id, to);
  return manubiaeEarnedBy(result.state, result.events);
}
const ids = (list: ReturnType<typeof earned>) => list.map((item) => item.award.id);

describe('what a committed board earns', () => {
  it('pays an advantageous capture by the material actually won, seated on the capturer', () => {
    const knight = P('player', 'knight', 4, 6);
    const rook = P('enemy', 'rook', 5, 4);
    const got = earned([knight, rook], knight, { x: 5, y: 4, capture: rook.id });

    expect(ids(got)).toEqual(['advantageous-capture']);
    expect(got[0].award).toEqual({
      id: 'advantageous-capture',
      marginPoints: PIECE_VALUE.rook - PIECE_VALUE.knight,
    });
    // The marker rises off the square the capturer now stands on, not the one it came from.
    expect(got[0].at).toEqual({ x: 5, y: 4 });
  });

  it('pays nothing for an even trade or a losing one', () => {
    const rook = P('player', 'rook', 4, 6);
    const knight = P('enemy', 'knight', 4, 4);
    expect(earned([rook, knight], rook, { x: 4, y: 4, capture: knight.id })).toEqual([]);

    const bishop = P('player', 'bishop', 2, 6);
    const foe = P('enemy', 'knight', 4, 4);
    expect(earned([bishop, foe], bishop, { x: 4, y: 4, capture: foe.id })).toEqual([]);
  });

  it('prices a promoted unit as the Pawn it started as, on BOTH sides of the capture', () => {
    // Their Queen is a Pawn that walked: taking it with a Rook wins nothing.
    const rook = P('player', 'rook', 4, 6);
    const jumped = P('enemy', 'queen', 4, 4, { promotedFrom: 'pawn' });
    expect(earned([rook, jumped], rook, { x: 4, y: 4, capture: jumped.id })).toEqual([]);

    // And our own queened Pawn still captures as a Pawn, so it wins the whole Rook.
    const ours = P('player', 'queen', 4, 6, { promotedFrom: 'pawn' });
    const theirs = P('enemy', 'rook', 4, 4);
    const got = earned([ours, theirs], ours, { x: 4, y: 4, capture: theirs.id });
    expect(got[0].award).toEqual({
      id: 'advantageous-capture',
      marginPoints: PIECE_VALUE.rook - PIECE_VALUE.pawn,
    });
  });

  it('pays a royal fork only when the forking unit survives the square it forked from', () => {
    // A Knight forking the King and a Rook, standing where nothing can reach it.
    const knight = P('player', 'knight', 4, 6);
    const king = P('enemy', 'king', 5, 2);
    const rook = P('enemy', 'rook', 3, 2);
    const safe = earned([knight, king, rook], knight, { x: 4, y: 4 });
    expect(ids(safe)).toContain('royal-fork');

    // The same geometry, with an enemy Pawn that can simply take the Knight. Taking it IS how
    // the check gets answered, so the Rook is never collected and the player has handed over a
    // piece — the exact move the bounty must not teach.
    const taker = P('enemy', 'pawn', 5, 3);
    const thrown = earned([knight, king, rook, taker], knight, { x: 4, y: 4 });
    expect(ids(thrown)).not.toContain('royal-fork');
  });

  it('asks only whether the FORKER can be taken, never whether the victim is defended', () => {
    // ADR-0527 deliberately does not ask about the victim: what a real fork is worth to answer
    // is the position's business. A defended Rook is still a fork.
    const knight = P('player', 'knight', 4, 6);
    const king = P('enemy', 'king', 5, 2);
    const rook = P('enemy', 'rook', 3, 2);
    const guard = P('enemy', 'rook', 3, 0); // defends the forked Rook down the file
    expect(ids(earned([knight, king, rook, guard], knight, { x: 4, y: 4 }))).toContain('royal-fork');
  });

  it('pays a discovered check to the piece that stepped out of the way', () => {
    // The Bishop leaves the file; the Rook behind it now runs all the way to the King.
    const rook = P('player', 'rook', 2, 4);
    const bishop = P('player', 'bishop', 2, 2);
    const king = P('enemy', 'king', 2, 0);
    const got = earned([rook, bishop, king], bishop, { x: 4, y: 4 });

    expect(ids(got)).toEqual(['discovered-check']);
    expect(got[0].at).toEqual({ x: 4, y: 4 });
  });

  it('still pays a discovered check when the piece that stepped aside is hanging', () => {
    // The forker's safety clause is deliberately NOT applied here, and this is why: the piece
    // that steps aside is not the one giving check, so the enemy has to answer the check
    // before they can collect it. Getting a free move out of an exposed piece is the whole
    // point of a discovery, not a blunder to be discouraged.
    const rook = P('player', 'rook', 2, 4);
    const bishop = P('player', 'bishop', 2, 2);
    const king = P('enemy', 'king', 2, 0);
    const taker = P('enemy', 'rook', 7, 4); // sweeps the rank the Bishop lands on
    const got = earned([rook, bishop, king, taker], bishop, { x: 4, y: 4 });

    expect(ids(got)).toEqual(['discovered-check']);
  });

  it('pays a double check INSTEAD of the discovered check, never both', () => {
    // The Knight opens the Rook's file and checks from where it lands: two checkers at once.
    const rook = P('player', 'rook', 2, 4);
    const knight = P('player', 'knight', 2, 2);
    const king = P('enemy', 'king', 2, 0);
    const got = earned([rook, knight, king], knight, { x: 0, y: 1 });

    expect(ids(got)).toEqual(['double-check']);
  });

  it('pays nothing for a check the mover gives on its own', () => {
    // An ordinary check is not a Manubium: nothing was discovered and nothing was doubled.
    const rook = P('player', 'rook', 2, 4);
    const king = P('enemy', 'king', 0, 0);
    expect(earned([rook, king], rook, { x: 0, y: 4 })).toEqual([]);
  });

  it('pays a smothered mate to the Knight that lands it', () => {
    const knight = P('player', 'knight', 4, 3);
    const king = P('enemy', 'king', 7, 0);
    const pieces = [knight, king, P('enemy', 'rook', 6, 0), P('enemy', 'pawn', 7, 1), P('enemy', 'pawn', 6, 1)];
    const got = earned(pieces, knight, { x: 5, y: 1 });

    expect(ids(got)).toContain('smothered-mate');
    expect(got.find((item) => item.award.id === 'smothered-mate')!.at).toEqual({ x: 5, y: 1 });
  });

  it('stacks deeds that are genuinely different, and never counts one twice', () => {
    // An en passant between Pawns is one deed: the capture wins no material, so the
    // advantageous-capture bounty does not also fire on it.
    const pawn = P('player', 'pawn', 4, 6, { pawnForward: 'north' });
    const victim = P('enemy', 'pawn', 5, 6, { pawnForward: 'south' });
    const state: GameState = {
      size: SIZE,
      pieces: [pawn, victim],
      turn: 'player',
      winner: null,
      lastMove: { pieceId: victim.id, pieceType: 'pawn', side: 'enemy', from: { x: 5, y: 4 }, to: { x: 5, y: 6 } },
    };
    const played = applyMove(state, pawn.id, { x: 5, y: 5, capture: victim.id, enPassant: true });
    expect(ids(manubiaeEarnedBy(played.state, played.events))).toEqual(['en-passant']);
  });

  it('pays the enemy nothing for the very same deed', () => {
    const knight = P('enemy', 'knight', 4, 6);
    const rook = P('player', 'rook', 5, 4);
    expect(earned([knight, rook], knight, { x: 5, y: 4, capture: rook.id })).toEqual([]);
  });
});
