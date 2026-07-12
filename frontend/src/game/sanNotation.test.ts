// SAN notation against hand-checked positions. Fixtures play REAL moves through
// playable records (replayStates), so every token is derived exactly the way the
// score sheet derives it.

import { describe, it, expect } from 'vitest';
import { createBlankLevel, type Level, type LevelUnit, type ObjectiveType } from '../core/level';
import { createFromLevel } from './setup';
import { applyMove, gameEnv, legalMoves, recordPosition } from '../core/rules';
import type { GameState } from '../core/types';
import type { RecordedMove } from './selfplay';
import { sanForGame, sanFullMoves } from './sanNotation';

function tinyLevel(units: LevelUnit[], cols: number, rows: number, objective: ObjectiveType = 'rival-kings'): Level {
  const lvl = createBlankLevel('tiny', 'Tiny', cols, rows);
  lvl.objective = objective;
  lvl.layers.units = units.map((u) => ({ ...u }));
  return lvl;
}

function withPromoRow(lvl: Level, y = 0): Level {
  lvl.layers.zones.push({ id: 'promo', type: 'pawn-promotion', tiles: Array.from({ length: lvl.board.cols }, (_, x) => [x, y] as [number, number]) });
  return lvl;
}

/** Play a scripted move sequence through the real applyMove, recording states + moves.
 * Each step names the mover's CURRENT square and its destination; the move object is
 * looked up from legalMoves so captures/en-passant/promotion markers are authentic. */
function playScript(lvl: Level, script: Array<[from: [number, number], to: [number, number]]>): { states: GameState[]; moves: RecordedMove[] } {
  let game = createFromLevel(lvl, 1);
  const base = gameEnv(game);
  const states: GameState[] = [game];
  const moves: RecordedMove[] = [];
  for (const [[fx, fy], [tx, ty]] of script) {
    const piece = game.pieces.find((p) => p.alive && p.x === fx && p.y === fy);
    if (!piece) throw new Error(`no piece at (${fx},${fy})`);
    const env = { ...base, lastMove: game.lastMove };
    const move = legalMoves(piece, game.pieces, game.size, env).find((m) => m.x === tx && m.y === ty);
    if (!move) throw new Error(`illegal: (${fx},${fy})->(${tx},${ty}) for ${piece.id}`);
    moves.push({ pieceId: piece.id, side: piece.side as 'player' | 'enemy', from: { x: fx, y: fy }, move });
    game = recordPosition(applyMove(game, piece.id, move).state);
    states.push(game);
  }
  return { states, moves };
}

describe('sanForGame', () => {
  it('pawn advances, knight development, and a pawn capture read as standard SAN', () => {
    // 8x8, kings + pawns + knights placed like the chess openings they mimic.
    const lvl = tinyLevel([
      { x: 4, y: 7, side: 'player', type: 'king', facing: 'north' },
      { x: 4, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 4, y: 6, side: 'player', type: 'pawn', facing: 'north' },   // e2
      { x: 3, y: 1, side: 'enemy', type: 'pawn', facing: 'south' },    // d7
      { x: 6, y: 7, side: 'player', type: 'knight', facing: 'north' }, // g1
    ], 8, 8);
    const { states, moves } = playScript(lvl, [
      [[4, 6], [4, 4]], // e2-e4 -> 'e4'
      [[3, 1], [3, 3]], // d7-d5 -> 'd5'
      [[4, 4], [3, 3]], // exd5 (pawn capture)
      [[4, 0], [3, 1]], // Kd7 (king sidestep)
      [[6, 7], [5, 5]], // Ng1-f3 -> 'Nf3'
    ]);
    expect(sanForGame(states, moves)).toEqual(['e4', 'd5', 'exd5', 'Kd7', 'Nf3']);
  });

  it('marks check and checkmate', () => {
    // A rook check on the king's file, then a back-rank ladder mate.
    const lvl = tinyLevel([
      { x: 4, y: 7, side: 'player', type: 'king', facing: 'north' },
      { x: 0, y: 5, side: 'player', type: 'rook', facing: 'north' },  // a3
      { x: 7, y: 4, side: 'player', type: 'rook', facing: 'north' },  // h4
      { x: 3, y: 0, side: 'enemy', type: 'king', facing: 'south' },   // d8
    ], 8, 8);
    const { states, moves } = playScript(lvl, [
      [[0, 5], [0, 1]], // Ra3-a7: cuts the 7th rank        -> 'Ra7'
      [[3, 0], [2, 0]], // Kd8-c8
      [[7, 4], [2, 4]], // Rh4-c4: check down the c-file    -> 'Rc4+'
      [[2, 0], [3, 0]], // Kc8-d8: steps off the file
      [[2, 4], [7, 4]], // Rc4-h4: retreats
      [[3, 0], [2, 0]], // Kd8-c8
      [[7, 4], [7, 0]], // Rh4-h8: back-rank ladder mate    -> 'Rh8#'
    ]);
    expect(sanForGame(states, moves)).toEqual(['Ra7', 'Kc8', 'Rc4+', 'Kd8', 'Rh4', 'Kc8', 'Rh8#']);
  });

  it('disambiguates twin rooks by file when both reach the target', () => {
    const lvl = tinyLevel([
      { x: 4, y: 7, side: 'player', type: 'king', facing: 'north' },
      { x: 0, y: 4, side: 'player', type: 'rook', facing: 'north' },  // a4
      { x: 7, y: 4, side: 'player', type: 'rook', facing: 'north' },  // h4
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },   // a8
    ], 8, 8);
    const { states, moves } = playScript(lvl, [
      [[0, 4], [3, 4]], // both rooks see d4 -> 'Rad4'
    ]);
    expect(sanForGame(states, moves)).toEqual(['Rad4']);
  });

  it('notates promotion with the promoted piece letter', () => {
    const lvl = withPromoRow(tinyLevel([
      { x: 2, y: 4, side: 'player', type: 'king', facing: 'north' },
      { x: 0, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 2, y: 1, side: 'player', type: 'pawn', facing: 'north' },
    ], 3, 5));
    const { states, moves } = playScript(lvl, [
      [[2, 1], [2, 0]], // c4-c5=Q on the 3x5 board's promo row
    ]);
    const [san] = sanForGame(states, moves);
    expect(san.startsWith('c5=Q')).toBe(true);
  });

  it('pairs plies into numbered full moves, score-sheet style', () => {
    const lvl = tinyLevel([
      { x: 4, y: 7, side: 'player', type: 'king', facing: 'north' },
      { x: 4, y: 0, side: 'enemy', type: 'king', facing: 'south' },
      { x: 4, y: 6, side: 'player', type: 'pawn', facing: 'north' },
      { x: 3, y: 1, side: 'enemy', type: 'pawn', facing: 'south' },
    ], 8, 8);
    const { states, moves } = playScript(lvl, [
      [[4, 6], [4, 4]], [[3, 1], [3, 3]], [[4, 4], [3, 3]],
    ]);
    const rows = sanFullMoves(states, moves);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ number: 1, first: { ply: 1, san: 'e4' }, second: { ply: 2, san: 'd5' } });
    expect(rows[1]).toEqual({ number: 2, first: { ply: 3, san: 'exd5' }, second: null });
  });
});
