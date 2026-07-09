import { describe, it, expect } from 'vitest';
import { searchBestAction, searchEnemyMove, evaluateGameState, DEFAULT_EVAL_WEIGHTS, type SearchContext } from './ai';
import { createRng } from './rng';
import type { GameState, Piece, PieceType, Side } from './types';

function piece(id: string, side: Side, type: PieceType, x: number, y: number, extra: Partial<Piece> = {}): Piece {
  return { id, side, type, x, y, alive: true, startY: y, ...extra };
}

function state(pieces: Piece[], over: Partial<GameState> = {}): GameState {
  return { size: { cols: 8, rows: 8 }, pieces, turn: 'enemy', winner: null, ...over };
}

function sctx(over: Partial<SearchContext> = {}): SearchContext {
  return { objective: 'capture-all', ctx: {}, turnsElapsed: 0, ...over };
}

// Node-bounded (no wall clock) so the search is deterministic under any timer setup.
const FAST = { maxDepth: 4, maxNodes: 50_000 };

describe('searchBestAction', () => {
  it('takes a game-ending King capture over a bigger material haul', () => {
    // Enemy rook on rank 4 can capture the player King at (7,4) — terminal in
    // rival-kings — or slide down file 0 to take the queen at (0,0) for material.
    // The enemy King sits at (7,1), off every player line so the rook isn't pinned
    // and the enemy isn't in check (both would constrain the choice under the
    // merge's check rules); the King capture must still win out.
    const s = state([
      piece('e-rook', 'enemy', 'rook', 0, 4),
      piece('p-king', 'player', 'king', 7, 4),
      piece('p-queen', 'player', 'queen', 0, 0),
      piece('e-king', 'enemy', 'king', 7, 1),
    ]);
    const chosen = searchBestAction(s, {}, sctx({ objective: 'rival-kings' }), null, FAST);
    expect(chosen).not.toBeNull();
    expect(chosen!.move).toMatchObject({ x: 7, y: 4, capture: 'p-king' });
  });

  it('declines a defended pawn when a free pawn is on offer', () => {
    // Queen at (4,4): pawn at (4,6) is defended by (3,7) — a player pawn captures
    // toward smaller y, so (3,7) guards (4,6). The pawn at (0,4) is free.
    const s = state([
      piece('e-queen', 'enemy', 'queen', 4, 4),
      piece('guarded', 'player', 'pawn', 4, 6),
      piece('guard', 'player', 'pawn', 3, 7),
      piece('free', 'player', 'pawn', 0, 4),
    ]);
    const chosen = searchBestAction(s, {}, sctx(), null, FAST);
    expect(chosen).not.toBeNull();
    expect(chosen!.move.capture).toBe('free');
  });

  it('is deterministic for a fixed seed', () => {
    const s = state([
      piece('e-knight', 'enemy', 'knight', 4, 4),
      piece('e-rook', 'enemy', 'rook', 0, 0),
      piece('p-pawn', 'player', 'pawn', 6, 6),
      piece('p-king', 'player', 'king', 7, 7),
    ]);
    const a = searchBestAction(s, {}, sctx(), createRng(42), { maxDepth: 3, maxNodes: 50_000 });
    const b = searchBestAction(s, {}, sctx(), createRng(42), { maxDepth: 3, maxNodes: 50_000 });
    expect(a).toEqual(b);
  });

  it('returns null when the side to move has no pieces with moves', () => {
    const s = state([piece('p-pawn', 'player', 'pawn', 0, 0)]);
    expect(searchEnemyMove(s, createRng(1), {}, sctx())).toBeNull();
  });

  it('moves the runner toward the reach zone when playing the player side', () => {
    const s = state(
      [
        piece('runner', 'player', 'pawn', 3, 5),
        piece('p-king', 'player', 'king', 0, 7),
        piece('e-king', 'enemy', 'king', 7, 0),
      ],
      { turn: 'player' },
    );
    const chosen = searchBestAction(
      s,
      {},
      sctx({ objective: 'reach', ctx: { reachCells: [{ x: 3, y: 0 }] } }),
      null,
      FAST,
    );
    expect(chosen).not.toBeNull();
    expect(chosen!.pieceId).toBe('runner');
    expect(chosen!.move.y).toBeLessThan(5);
  });

  it('advances on the player under a survive clock instead of loitering', () => {
    const s = state([
      piece('e-rook', 'enemy', 'rook', 7, 0),
      piece('p-king', 'player', 'king', 0, 7),
      piece('p-pawn', 'player', 'pawn', 1, 6),
    ]);
    const chosen = searchBestAction(
      s,
      {},
      sctx({ objective: 'survive', ctx: { surviveTurns: 8 }, turnsElapsed: 0 }),
      null,
      { maxDepth: 2, maxNodes: 50_000 },
    );
    expect(chosen).not.toBeNull();
    // Octile distance to the nearest player piece (the pawn at (1,6)) must shrink.
    const octile = (x: number, y: number, tx: number, ty: number): number => {
      const dx = Math.abs(x - tx);
      const dy = Math.abs(y - ty);
      return Math.max(dx, dy) + 0.41 * Math.min(dx, dy);
    };
    const before = Math.min(octile(7, 0, 1, 6), octile(7, 0, 0, 7));
    const after = Math.min(octile(chosen!.move.x, chosen!.move.y, 1, 6), octile(chosen!.move.x, chosen!.move.y, 0, 7));
    expect(after).toBeLessThan(before);
  });

  it('declines a poisoned capture whose recapture is past the horizon (quiescence)', () => {
    // maxDepth 1: without quiescence the leaf is scored the instant the rook grabs
    // the pawn — +1 material minus only the tiny static hanging penalty (0.05·5) —
    // and the recapture (the guard pawn takes the rook) sits one ply PAST the
    // horizon, unseen, so plain negamax would keep the "+0.75" and hang the rook.
    // Quiescence extends that capture, so the rook-for-pawn trade reads as the ≈ -4
    // it truly is and the engine keeps its rook. (Pre-q behavior is in git history;
    // the durable guard is the positive assertion that the poison is declined.)
    const s = state([
      piece('e-rook', 'enemy', 'rook', 4, 0), // slides up file 4 to (4,4)
      piece('poison', 'player', 'pawn', 4, 4), // the capturable-but-defended pawn
      piece('guard', 'player', 'pawn', 3, 5), // player pawn captures toward -y → defends (4,4)
    ]);
    const chosen = searchBestAction(s, {}, sctx(), null, { maxDepth: 1, maxNodes: 50_000 });
    expect(chosen).not.toBeNull();
    expect(chosen!.move.capture).not.toBe('poison');
  });

  it('is deterministic on a capture-rich position (quiescence recurses)', () => {
    // Mutually-attacking pieces so quiescence actually recurses several plies; the
    // whole ChosenAction (score, depth, node count) must be byte-identical twice.
    // The only randomness is the root epsilon pick, which quiescence never touches.
    const s = state([
      piece('e-queen', 'enemy', 'queen', 4, 4),
      piece('e-rook', 'enemy', 'rook', 4, 6),
      piece('p-rook', 'player', 'rook', 4, 2),
      piece('p-bishop', 'player', 'bishop', 2, 6),
      piece('p-pawn', 'player', 'pawn', 5, 5),
    ]);
    const a = searchBestAction(s, {}, sctx(), createRng(7), { maxDepth: 4, maxNodes: 80_000 });
    const b = searchBestAction(s, {}, sctx(), createRng(7), { maxDepth: 4, maxNodes: 80_000 });
    expect(a).toEqual(b);
  });
});

describe('evaluateGameState', () => {
  it('scores material player-positive', () => {
    const up = state([piece('p-queen', 'player', 'queen', 0, 0), piece('e-pawn', 'enemy', 'pawn', 7, 7)]);
    const down = state([piece('p-pawn', 'player', 'pawn', 0, 0), piece('e-queen', 'enemy', 'queen', 7, 7)]);
    expect(evaluateGameState(up, sctx())).toBeGreaterThan(0);
    expect(evaluateGameState(down, sctx())).toBeLessThan(0);
  });

  it('penalizes a hanging piece more than a defended one', () => {
    // Enemy rook attacks the pawn; with the guard, the pawn is defended.
    const hanging = state([
      piece('e-rook', 'enemy', 'rook', 4, 0),
      piece('victim', 'player', 'pawn', 4, 6),
    ]);
    const defended = state([
      piece('e-rook', 'enemy', 'rook', 4, 0),
      piece('victim', 'player', 'pawn', 4, 6),
      piece('guard', 'player', 'pawn', 3, 7),
    ]);
    const w = DEFAULT_EVAL_WEIGHTS;
    const hangingPenalty = evaluateGameState(hanging, sctx(), w);
    // Normalize away the guard pawn's material + distance terms by comparing the
    // victim's safety directly: reconstruct both scores minus material.
    expect(hangingPenalty).toBeLessThan(evaluateGameState(defended, sctx(), w) - w.pieceValues.pawn + 0.5);
  });
});

describe('search sees the chess draw rules (ADR-0072)', () => {
  it('scores every line as a dead draw when the next quiet move fills the 50-move clock', () => {
    // Player queen up huge, but the clock sits at 99: whatever the enemy plays, the
    // reply position has clock 100 and no capture available to reset it — the search
    // must read the whole tree as 0 instead of the big material deficit.
    const pieces = [
      piece('p-queen', 'player', 'queen', 0, 7),
      piece('p-king', 'player', 'king', 7, 7),
      piece('e-king', 'enemy', 'king', 0, 0),
    ];
    const drawn = state(pieces, { drawRules: { fiftyMove: true }, halfmoveClock: 99 });
    const withRule = searchBestAction(drawn, {}, sctx(), createRng(1), FAST)!;
    expect(withRule.score).toBeCloseTo(0, 8); // exactly the draw score (±0)
    // The same position without the authored rule is still a lost game for the enemy.
    const losing = state(pieces, { halfmoveClock: 99 });
    const noRule = searchBestAction(losing, {}, sctx(), createRng(1), FAST)!;
    expect(noRule.score).toBeGreaterThan(1);
  });
});
