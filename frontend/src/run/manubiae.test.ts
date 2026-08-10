import { describe, expect, it } from 'vitest';
import { applyMove } from '../core/rules';
import type { BoardSize, GameState, Piece, PieceType, Side } from '../core/types';
import type { PromotionPieceType } from '../core/types';
import { manubiaeEarnedBy } from './manubiae';
import { manubiumGoldTenths, PIECE_VALUE, RUN_UNDERPROMOTION_MATE_TENTHS } from './model';

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

/**
 * The same, for a Pawn arriving on the promotion rank and choosing what it becomes.
 *
 * The player's promotion rank is row 0 — the far edge from where a player Pawn starts — which
 * is the shape every Run battle authors (`run-player-promotion`), so these boards are the real
 * one rather than a fixture geometry.
 */
function earnedByPromoting(
  pieces: Piece[],
  pawn: Piece,
  to: { x: number; y: number; capture?: string },
  promotion: PromotionPieceType,
) {
  const cells = Array.from({ length: SIZE.cols }, (_, x) => ({ x, y: 0 }));
  const state: GameState = {
    size: SIZE,
    pieces,
    turn: pawn.side,
    winner: null,
    promotionRules: [{ side: 'player', cells }],
  };
  const result = applyMove(state, pawn.id, to, { promotion });
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

  it('pays a royal fork the enemy cannot reach at all', () => {
    const knight = P('player', 'knight', 4, 6);
    const king = P('enemy', 'king', 5, 2);
    const rook = P('enemy', 'rook', 3, 2);
    expect(ids(earned([knight, king, rook], knight, { x: 4, y: 4 }))).toContain('royal-fork');
  });

  it('does not pay a fork the enemy can take with something CHEAPER', () => {
    // Taking the Knight IS how the check gets answered, so the Rook is never collected and the
    // player has handed over a piece for a Pawn — the exact move the bounty must not teach.
    const knight = P('player', 'knight', 4, 6);
    const king = P('enemy', 'king', 5, 2);
    const rook = P('enemy', 'rook', 3, 2);
    const pawn = P('enemy', 'pawn', 5, 3);
    expect(ids(earned([knight, king, rook, pawn], knight, { x: 4, y: 4 }))).not.toContain('royal-fork');
  });

  it('pays a fork whose only taker costs the enemy MORE than the forking unit', () => {
    // Their Queen can take the Knight, and our Rook takes back: they spend a Queen to answer a
    // Knight, or they lose the Rook. Either way the fork won, so it pays.
    const knight = P('player', 'knight', 4, 6);
    const guard = P('player', 'rook', 4, 0); // recaptures down the file the Knight stands on
    const king = P('enemy', 'king', 5, 2);
    const rook = P('enemy', 'rook', 3, 2);
    const queen = P('enemy', 'queen', 7, 1); // (7,1) → (4,4) is a clear diagonal
    expect(ids(earned([knight, guard, king, rook, queen], knight, { x: 4, y: 4 }))).toContain('royal-fork');
  });

  it('does not pay when that bigger taker gets the forking unit for FREE', () => {
    // The same Queen, with nothing to take back: "only a bigger piece can reach it" is not
    // safety on its own — an undefended unit is simply lost, whatever takes it.
    const knight = P('player', 'knight', 4, 6);
    const king = P('enemy', 'king', 5, 2);
    const rook = P('enemy', 'rook', 3, 2);
    const queen = P('enemy', 'queen', 7, 1);
    expect(ids(earned([knight, king, rook, queen], knight, { x: 4, y: 4 }))).not.toContain('royal-fork');
  });

  it('does not pay an even trade — the fork has to win something', () => {
    const knight = P('player', 'knight', 4, 6);
    const guard = P('player', 'rook', 4, 0);
    const king = P('enemy', 'king', 5, 2);
    const rook = P('enemy', 'rook', 3, 2);
    const trader = P('enemy', 'bishop', 7, 1); // worth the same as the Knight
    expect(ids(earned([knight, guard, king, rook, trader], knight, { x: 4, y: 4 }))).not.toContain('royal-fork');
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

describe('the mate pays once, for what is standing there giving it', () => {
  /**
   * A Pawn's mate: the King sealed against the edge by four of its own men, the fifth square
   * held by the mating Pawn itself, which a second Pawn defends so the King cannot take it.
   */
  function pawnMate() {
    const pawn = P('player', 'pawn', 2, 2, { pawnForward: 'north' });
    return {
      pawn,
      pieces: [
        pawn,
        P('player', 'pawn', 1, 2, { pawnForward: 'north' }),
        P('enemy', 'king', 1, 0),
        P('enemy', 'rook', 0, 0),
        P('enemy', 'knight', 2, 0),
        P('enemy', 'pawn', 0, 1, { pawnForward: 'south' }),
        P('enemy', 'pawn', 1, 1, { pawnForward: 'south' }),
      ],
    };
  }

  it('pays a Pawn the most, seated on the Pawn that gave the mate', () => {
    const { pawn, pieces } = pawnMate();
    const got = earned(pieces, pawn, { x: 2, y: 1 });

    expect(ids(got)).toEqual(['humble-mate']);
    expect(got[0].award).toEqual({ id: 'humble-mate', piece: 'pawn' });
    expect(got[0].at).toEqual({ x: 2, y: 1 });
  });

  it('names the unit that gave the mate, and pays a Queen nothing at all', () => {
    // One back-rank mate, delivered onto the same square by two different units. The gradient
    // between the piece types is pinned in run/model.test.ts; what matters here is that the
    // board's answer is the piece actually standing there.
    const board = (type: PieceType) => {
      const mater = P('player', type, 7, 4);
      return { mater, pieces: [mater, P('enemy', 'king', 0, 0), P('enemy', 'pawn', 0, 1), P('enemy', 'pawn', 1, 1)] };
    };
    const rook = board('rook');
    expect(earned(rook.pieces, rook.mater, { x: 7, y: 0 })[0].award).toEqual({ id: 'humble-mate', piece: 'rook' });

    const queen = board('queen');
    expect(earned(queen.pieces, queen.mater, { x: 7, y: 0 })).toEqual([]);
  });

  it('pays a queened Pawn the PAWN rate — the endgame win is the whole point of this bounty', () => {
    // Trading down to a Pawn advantage, passing the Pawn and walking it home is how a lean win is
    // won. That Queen is a Pawn's work, the roster hands her back as a Pawn next Battle, and
    // pricing her at nine would pay nothing for the entire endgame — on top of a Deditio already
    // near zero for the army that was ground down.
    const queened = P('player', 'queen', 7, 4, { promotedFrom: 'pawn' });
    const pieces = [queened, P('enemy', 'king', 0, 0), P('enemy', 'pawn', 0, 1), P('enemy', 'pawn', 1, 1)];
    const got = earned(pieces, queened, { x: 7, y: 0 });

    expect(got.map((item) => item.award)).toEqual([{ id: 'humble-mate', piece: 'pawn' }]);

    // And a Queen who was always a Queen, on the same square, still pays nothing at all.
    const born = P('player', 'queen', 7, 4);
    const same = [born, P('enemy', 'king', 0, 0), P('enemy', 'pawn', 0, 1), P('enemy', 'pawn', 1, 1)];
    expect(earned(same, born, { x: 7, y: 0 })).toEqual([]);
  });

  it('takes the humblest of two checkers by what each STARTED as', () => {
    // A double-check mate: the Knight steps off the long diagonal to check from (1,2), uncovering
    // the queened Pawn behind it. Two units mate at once, and the deed is the lesser of them —
    // the Queen who was a Pawn — so the Pawn rate is paid and her square is where it seats.
    const knight = P('player', 'knight', 3, 3);
    const queened = P('player', 'queen', 4, 4, { promotedFrom: 'pawn' });
    const pieces = [knight, queened, P('enemy', 'king', 0, 0), P('enemy', 'rook', 1, 0), P('enemy', 'pawn', 0, 1)];
    const got = earned(pieces, knight, { x: 1, y: 2 });

    expect(ids(got)).toContain('double-check');
    const humble = got.find((item) => item.award.id === 'humble-mate')!;
    expect(humble.award).toEqual({ id: 'humble-mate', piece: 'pawn' });
    expect(humble.at).toEqual({ x: 4, y: 4 });
  });

  it('pays a smothered mate INSTEAD of the humble mate its Knight would earn', () => {
    const knight = P('player', 'knight', 4, 3);
    const king = P('enemy', 'king', 7, 0);
    const pieces = [knight, king, P('enemy', 'rook', 6, 0), P('enemy', 'pawn', 7, 1), P('enemy', 'pawn', 6, 1)];
    const got = ids(earned(pieces, knight, { x: 5, y: 1 }));

    expect(got).toEqual(['smothered-mate']);
    expect(got).not.toContain('humble-mate');
  });

  it('pays nothing for a check that is not mate, however small the unit giving it', () => {
    // The bounty is for ENDING the Battle with a lesser piece, not for checking with one.
    const pawn = P('player', 'pawn', 2, 2, { pawnForward: 'north' });
    const pieces = [pawn, P('enemy', 'king', 1, 0)];

    expect(earned(pieces, pawn, { x: 2, y: 1 })).toEqual([]);
  });

  it('pays the enemy nothing for mating the player with a Pawn', () => {
    const pawn = P('enemy', 'pawn', 2, 9, { pawnForward: 'south' });
    const pieces = [
      pawn,
      P('enemy', 'pawn', 1, 9, { pawnForward: 'south' }),
      P('player', 'king', 1, 11),
      P('player', 'rook', 0, 11),
      P('player', 'knight', 2, 11),
      P('player', 'pawn', 0, 10, { pawnForward: 'north' }),
      P('player', 'pawn', 1, 10, { pawnForward: 'north' }),
    ];

    expect(earned(pieces, pawn, { x: 2, y: 10 })).toEqual([]);
  });
});

describe('a Pawn that ends the Battle by arriving', () => {
  /** A Pawn one step from the far rank, with the enemy King sealed against that rank by its own men. */
  function backRankBoard() {
    const pawn = P('player', 'pawn', 7, 1, { pawnForward: 'north' });
    return {
      pawn,
      pieces: [
        pawn,
        P('enemy', 'king', 0, 0),
        P('enemy', 'pawn', 0, 1, { pawnForward: 'south' }),
        P('enemy', 'pawn', 1, 1, { pawnForward: 'south' }),
      ],
    };
  }

  it('pays a promotion mate, seated on the square the Pawn arrived at', () => {
    const { pawn, pieces } = backRankBoard();
    const got = earnedByPromoting(pieces, pawn, { x: 7, y: 0 }, 'queen');

    expect(ids(got)).toEqual(['promotion-mate']);
    expect(got[0].at).toEqual({ x: 7, y: 0 });
  });

  it('pays an underpromotion mate INSTEAD of the promotion mate, never both', () => {
    // The very same board and the very same mate — a Rook on that square sweeps the rank exactly
    // as the Queen does. All that changed is the piece the player chose, so this is the one
    // ladder paying its better rung.
    const { pawn, pieces } = backRankBoard();
    const got = earnedByPromoting(pieces, pawn, { x: 7, y: 0 }, 'rook');

    expect(ids(got)).toEqual(['underpromotion-mate']);
    expect(got[0].award).toEqual({ id: 'underpromotion-mate', piece: 'rook' });
  });

  it('pays a Knight mate a Queen could not have given at all', () => {
    // The whole reason underpromotion exists: from (2,0) a Queen does not even attack (0,1), so
    // taking her here throws the mate away. The King's flights are answered by its own men at
    // (0,0), (1,0) and (1,1), by the new Knight at (1,2), and by the second Pawn at (0,2).
    const pawn = P('player', 'pawn', 2, 1, { pawnForward: 'north' });
    const pieces = [
      pawn,
      P('player', 'pawn', 1, 3, { pawnForward: 'north' }),
      P('enemy', 'king', 0, 1),
      P('enemy', 'bishop', 0, 0),
      P('enemy', 'pawn', 1, 0, { pawnForward: 'south' }),
      P('enemy', 'pawn', 1, 1, { pawnForward: 'south' }),
    ];
    const got = earnedByPromoting(pieces, pawn, { x: 2, y: 0 }, 'knight');

    expect(ids(got)).toEqual(['underpromotion-mate']);
    expect(got[0].award).toEqual({ id: 'underpromotion-mate', piece: 'knight' });
    expect(got[0].at).toEqual({ x: 2, y: 0 });
  });

  it('pays the Bishop and the Knight more than the Rook', () => {
    const rook = manubiumGoldTenths({ id: 'underpromotion-mate', piece: 'rook' });
    const bishop = manubiumGoldTenths({ id: 'underpromotion-mate', piece: 'bishop' });
    const knight = manubiumGoldTenths({ id: 'underpromotion-mate', piece: 'knight' });

    expect(rook).toBe(RUN_UNDERPROMOTION_MATE_TENTHS.rook);
    expect(bishop).toBeGreaterThan(rook);
    expect(knight).toBeGreaterThan(rook);
    expect(knight).toBe(bishop);
    // And every underpromotion outpays the ordinary promotion mate it stands in for.
    expect(rook).toBeGreaterThan(manubiumGoldTenths({ id: 'promotion-mate' }));
  });

  it('pays nothing for a promotion that only gives check', () => {
    // The same Queen arriving on the same square, with one of the King's own blockers gone: the
    // King simply steps out. Reaching the far rank is not itself the deed.
    const pawn = P('player', 'pawn', 7, 1, { pawnForward: 'north' });
    const pieces = [pawn, P('enemy', 'king', 0, 0), P('enemy', 'pawn', 0, 1, { pawnForward: 'south' })];

    expect(earnedByPromoting(pieces, pawn, { x: 7, y: 0 }, 'queen')).toEqual([]);
  });

  it('pays nothing for a promotion when a DIFFERENT unit delivers the mate', () => {
    // The Pawn takes the Rook and becomes a Knight, which attacks nothing near the King. What
    // mates is the Rook behind it, down the file the Pawn just vacated — that is a discovered
    // check, and it is paid as the thing it is rather than as a promotion mate.
    const pawn = P('player', 'pawn', 2, 1, { pawnForward: 'north' });
    const victim = P('enemy', 'rook', 3, 0);
    const pieces = [
      pawn,
      P('player', 'rook', 2, 8),
      P('player', 'bishop', 5, 2), // defends the square the new Knight lands on
      victim,
      P('enemy', 'king', 2, 0),
      P('enemy', 'pawn', 1, 0, { pawnForward: 'south' }),
      P('enemy', 'pawn', 1, 1, { pawnForward: 'south' }),
      P('enemy', 'pawn', 3, 1, { pawnForward: 'south' }),
    ];
    const got = ids(earnedByPromoting(pieces, pawn, { x: 3, y: 0, capture: victim.id }, 'knight'));

    expect(got).toContain('discovered-check');
    expect(got).toContain('advantageous-capture');
    expect(got).not.toContain('promotion-mate');
    expect(got).not.toContain('underpromotion-mate');
  });

  it('pays an underpromotion mate INSTEAD of the humble mate the same Knight would earn', () => {
    // Both entries describe one mate — the Knight is the lesser piece the Pawn chose — so the
    // dearer rung pays and the other stands down. The mate pays once.
    const pawn = P('player', 'pawn', 2, 1, { pawnForward: 'north' });
    const pieces = [
      pawn,
      P('player', 'pawn', 1, 3, { pawnForward: 'north' }),
      P('enemy', 'king', 0, 1),
      P('enemy', 'bishop', 0, 0),
      P('enemy', 'pawn', 1, 0, { pawnForward: 'south' }),
      P('enemy', 'pawn', 1, 1, { pawnForward: 'south' }),
    ];
    const got = ids(earnedByPromoting(pieces, pawn, { x: 2, y: 0 }, 'knight'));

    expect(got).toEqual(['underpromotion-mate']);
    expect(got).not.toContain('humble-mate');
  });

  it('pays the enemy nothing for promoting into mate', () => {
    const pawn = P('enemy', 'pawn', 7, 10, { pawnForward: 'south' });
    const pieces = [
      pawn,
      P('player', 'king', 0, 11),
      P('player', 'pawn', 0, 10, { pawnForward: 'north' }),
      P('player', 'pawn', 1, 10, { pawnForward: 'north' }),
    ];
    const cells = Array.from({ length: SIZE.cols }, (_, x) => ({ x, y: 11 }));
    const state: GameState = {
      size: SIZE,
      pieces,
      turn: 'enemy',
      winner: null,
      promotionRules: [{ side: 'enemy', cells }],
    };
    const result = applyMove(state, pawn.id, { x: 7, y: 11 }, { promotion: 'knight' });

    expect(manubiaeEarnedBy(result.state, result.events)).toEqual([]);
  });
});
