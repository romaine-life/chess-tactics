import { describe, expect, it } from 'vitest';
import type { VictoryRules } from './level';
import type { GameState, Piece, PieceType, Side } from './types';
import { adjudicateCommittedPosition, settleCommittedPosition } from './adjudication';
import { applyMove } from './rules';
import { victoryRulesForObjective } from './objectives';

function piece(id: string, side: Side, type: PieceType, x: number, y: number): Piece {
  return { id, side, type, x, y, alive: true, startX: x, startY: y };
}

function state(pieces: Piece[], turn: GameState['turn'] = 'player'): GameState {
  return { size: { cols: 4, rows: 4 }, pieces, turn, winner: null };
}

describe('canonical committed-position adjudication', () => {
  it('lets the exact authored rule decide a wipe instead of move mechanics', () => {
    const attacker = piece('p', 'player', 'rook', 0, 1);
    const lastEnemy = piece('e', 'enemy', 'pawn', 0, 0);
    const moved = applyMove(state([attacker, lastEnemy]), attacker.id, { x: 0, y: 0, capture: lastEnemy.id }).state;

    expect(moved).toMatchObject({ winner: null, turn: 'enemy' });

    // Deliberately non-preset authored meaning: eliminating enemy causes PLAYER to
    // lose. The point is not the design of this rule, but that it—not applyMove's
    // former hard-coded wipe—has authority over the result.
    const exactRule = {
      name: 'Pyrrhic capture',
      if: [{ kind: 'eliminate' as const, side: 'enemy' as const }],
      do: [{ kind: 'lose' as const, side: 'player' as const }],
    };
    const result = adjudicateCommittedPosition(moved, { victoryRules: [exactRule] });

    expect(result).toEqual({
      kind: 'victory-rule',
      winner: 'enemy',
      rule: exactRule,
      side: null,
    });
  });

  it('returns and stamps the exact first fired rule metadata', () => {
    const rules: VictoryRules = [
      { name: 'First', if: [{ kind: 'turnLimit', turns: 2 }], do: [{ kind: 'win', side: 'enemy' }] },
      { name: 'Second', if: [{ kind: 'turnLimit', turns: 2 }], do: [{ kind: 'win', side: 'player' }] },
    ];
    const live = state([piece('pk', 'player', 'king', 0, 3), piece('ek', 'enemy', 'king', 3, 0)]);
    const settled = settleCommittedPosition(live, { victoryRules: rules, turnsElapsed: 2 });

    expect(settled.adjudication).toMatchObject({ kind: 'victory-rule', winner: 'enemy', rule: rules[0] });
    expect(settled.state).toMatchObject({ winner: 'enemy', turn: 'done' });
  });

  it('applies the same initial-position checkmate and stalemate rules', () => {
    const checkmated = state([
      piece('ek', 'enemy', 'king', 0, 0),
      piece('pr', 'player', 'rook', 0, 1),
      piece('pk', 'player', 'king', 1, 1),
    ], 'enemy');
    expect(adjudicateCommittedPosition(checkmated, { victoryRules: [] })).toEqual({
      kind: 'checkmate', winner: 'player', rule: null, side: 'enemy',
    });

    const noArmy = state([piece('pk', 'player', 'king', 3, 3)], 'enemy');
    expect(adjudicateCommittedPosition(noArmy, { victoryRules: [] })).toEqual({
      kind: 'stalemate', winner: 'draw', rule: null, side: 'enemy',
    });
  });

  it('gives an authored victory precedence over an authored chess draw', () => {
    const live: GameState = {
      ...state([piece('pk', 'player', 'king', 0, 3), piece('ek', 'enemy', 'king', 3, 0)], 'enemy'),
      drawRules: { fiftyMove: true },
      halfmoveClock: 100,
    };
    const win = adjudicateCommittedPosition(live, {
      victoryRules: [{ name: 'Outlasted', if: [{ kind: 'turnLimit', turns: 4 }], do: [{ kind: 'win', side: 'player' }] }],
      turnsElapsed: 4,
    });
    expect(win).toMatchObject({ kind: 'victory-rule', winner: 'player', rule: { name: 'Outlasted' } });

    const draw = adjudicateCommittedPosition(live, {
      victoryRules: victoryRulesForObjective('rival-kings'),
    });
    expect(draw).toEqual({ kind: 'fifty-move', winner: 'draw', rule: null, side: 'enemy' });
  });
});
