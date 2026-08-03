import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import { gameEnv, legalMoves } from '../core/rules';
import { createFromLevel } from '../game/setup';
import { RUN_RELICS, RUN_RELIC_ABILITY_GRANTS } from './model';

describe('Run relic chess invariant', () => {
  it('keeps every piece legal-move set identical when Run adjudication metadata is present', () => {
    const level = createBlankLevel('invariant', 'Invariant', 8, 8);
    level.layers.units = [
      { x: 4, y: 7, type: 'king', side: 'player' },
      { x: 0, y: 7, type: 'rook', side: 'player' },
      { x: 2, y: 6, type: 'bishop', side: 'player' },
      { x: 1, y: 6, type: 'knight', side: 'player' },
      { x: 3, y: 5, type: 'pawn', side: 'player' },
      { x: 4, y: 0, type: 'king', side: 'enemy' },
      { x: 3, y: 1, type: 'pawn', side: 'enemy' },
    ];
    const ordinary = createFromLevel(level, 7);
    const runGame = { ...ordinary, checkmateRequiresEnemyNonKingEliminated: true };
    const ordinaryEnv = gameEnv(ordinary);
    const runEnv = gameEnv(runGame);

    for (const piece of ordinary.pieces.filter((candidate) => candidate.alive)) {
      const ordinaryMoves = legalMoves(piece, ordinary.pieces, ordinary.size, ordinaryEnv);
      const runPiece = runGame.pieces.find((candidate) => candidate.id === piece.id)!;
      const runMoves = legalMoves(runPiece, runGame.pieces, runGame.size, runEnv);
      expect(runMoves).toEqual(ordinaryMoves);
    }
  });

  it('keeps the approved relic registry outside piece movement definitions', () => {
    expect(RUN_RELICS).toHaveLength(20);
    for (const relic of RUN_RELICS) {
      expect(Object.keys(relic).every((key) => [
        'id',
        'name',
        'description',
        'flavorText',
        'requires',
        'immediate',
      ].includes(key))).toBe(true);
      expect(relic.flavorText.length).toBeGreaterThan(0);
    }
  });

  it('expresses placement relics only as shared unit-ability grants', () => {
    expect(RUN_RELIC_ABILITY_GRANTS).toEqual({
      'training-linens': { ability: 'eutactic', unitType: 'pawn' },
      'royal-decree': { ability: 'eutactic', unitType: 'king' },
      'crenellated-rampart': { ability: 'eutactic', unitType: 'rook' },
      'popes-staff': { ability: 'eutactic', unitType: 'bishop' },
      'ghibelline-rampart': { ability: 'agminate', unitType: 'rook' },
      'popes-robes': { ability: 'agminate', unitType: 'bishop' },
      'royal-sceptre': { ability: 'agminate', unitType: 'king' },
    });
    expect(Object.fromEntries(
      Object.keys(RUN_RELIC_ABILITY_GRANTS).map((id) => [id, RUN_RELICS.find((relic) => relic.id === id)?.description]),
    )).toEqual({
      'training-linens': 'Your Pawns gain Eutactic.',
      'royal-decree': 'Your King gains Eutactic.',
      'crenellated-rampart': 'Your Rooks gain Eutactic.',
      'popes-staff': 'Your Bishops gain Eutactic.',
      'ghibelline-rampart': 'Your Rooks gain Agminate.',
      'popes-robes': 'Your Bishops gain Agminate.',
      'royal-sceptre': 'Your King gains Agminate.',
    });
  });
});
