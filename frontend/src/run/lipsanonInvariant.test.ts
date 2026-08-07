import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import { gameEnv, legalMoves } from '../core/rules';
import { createFromLevel } from '../game/setup';
import { RUN_LIPSANA, RUN_LIPSANON_OFFER_POOL } from './model';

describe('Run lipsanon invariant', () => {
  it('keeps Run adjudication metadata out of chess movement', () => {
    const level = createBlankLevel('invariant', 'Invariant', 8, 8);
    level.layers.units = [
      { x: 4, y: 7, type: 'king', side: 'player' },
      { x: 0, y: 7, type: 'rook', side: 'player' },
      { x: 2, y: 6, type: 'bishop', side: 'player' },
      { x: 1, y: 6, type: 'knight', side: 'player' },
      { x: 3, y: 5, type: 'pawn', side: 'player' },
      { x: 4, y: 0, type: 'king', side: 'enemy' },
    ];
    const ordinary = createFromLevel(level, 7);
    const runGame = { ...ordinary, checkmateRequiresEnemyNonKingEliminated: true };
    for (const piece of ordinary.pieces.filter((candidate) => candidate.alive)) {
      expect(legalMoves(runGame.pieces.find((candidate) => candidate.id === piece.id)!, runGame.pieces, runGame.size, gameEnv(runGame)))
        .toEqual(legalMoves(piece, ordinary.pieces, ordinary.size, gameEnv(ordinary)));
    }
  });

  it('has seven player-facing, target-free lipsanon definitions', () => {
    expect(RUN_LIPSANA).toHaveLength(7);
    expect(RUN_LIPSANON_OFFER_POOL).toEqual(RUN_LIPSANA);
    for (const lipsanon of RUN_LIPSANA) {
      expect(Object.keys(lipsanon).every((key) => ['id', 'name', 'description', 'flavorText', 'immediate'].includes(key))).toBe(true);
      expect(JSON.stringify(lipsanon)).not.toMatch(/adlected|eutactic|agminate|cacochymic/i);
    }
  });
});
