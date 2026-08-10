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
      // The rook keeps a mate available: bare Kings are a dead position (ADR-0554), which
      // would settle this before the clock ever spoke.
      ...state([
        piece('pk', 'player', 'king', 0, 3),
        piece('ek', 'enemy', 'king', 3, 0),
        piece('pr', 'player', 'rook', 1, 2),
      ], 'enemy'),
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

// ---- Dead position (ADR-0554) -------------------------------------------------------------

describe('a dead position is a draw on a board of nothing but squares', () => {
  const KINGS = () => [piece('pk', 'player', 'king', 0, 3), piece('ek', 'enemy', 'king', 3, 0)];
  const mate = victoryRulesForObjective('rival-kings');
  const deadDraw = { kind: 'dead-position', winner: 'draw', rule: null, side: 'player' };

  it('ends King against King at once, with no clock and nothing authored', () => {
    expect(adjudicateCommittedPosition(state(KINGS()), { victoryRules: mate })).toEqual(deadDraw);
  });

  it.each([
    ['a lone Bishop', 'bishop'],
    ['a lone Knight', 'knight'],
  ] as const)('ends King and %s against King', (_label, type) => {
    const pieces = [...KINGS(), piece('pm', 'player', type, 1, 1)];
    expect(adjudicateCommittedPosition(state(pieces), { victoryRules: mate })).toEqual(deadDraw);
  });

  it('ends Bishop against Bishop on the same colour, but not on opposite colours', () => {
    // (1,1) and (2,2) are the same colour complex; (1,1) and (2,1) are not.
    const same = [...KINGS(), piece('pb', 'player', 'bishop', 1, 1), piece('eb', 'enemy', 'bishop', 2, 2)];
    expect(adjudicateCommittedPosition(state(same), { victoryRules: mate })).toEqual(deadDraw);

    const opposite = [...KINGS(), piece('pb', 'player', 'bishop', 1, 1), piece('eb', 'enemy', 'bishop', 2, 1)];
    expect(adjudicateCommittedPosition(state(opposite), { victoryRules: mate })).toBeNull();
  });

  it.each([
    ['a Pawn', 'pawn'],
    ['a Rook', 'rook'],
    ['a Queen', 'queen'],
  ] as const)('leaves the game running while %s is alive', (_label, type) => {
    const pieces = [...KINGS(), piece('pm', 'player', type, 1, 1)];
    expect(adjudicateCommittedPosition(state(pieces), { victoryRules: mate })).toBeNull();
  });

  it('leaves King and two Knights running — FIDE keeps the helpmate (ADR-0072 parity)', () => {
    const pieces = [...KINGS(), piece('n1', 'player', 'knight', 1, 1), piece('n2', 'player', 'knight', 2, 2)];
    expect(adjudicateCommittedPosition(state(pieces), { victoryRules: mate })).toBeNull();
  });

  it('leaves a second King on one side running — two Kings mate a lone King', () => {
    const pieces = [...KINGS(), piece('pk2', 'player', 'king', 0, 1)];
    expect(adjudicateCommittedPosition(state(pieces), { victoryRules: mate })).toBeNull();
  });

  it('says nothing on a board that is not all squares', () => {
    const kings = KINGS();
    const fenced: GameState = { ...state(kings), fences: ['1,1|1,2'] };
    expect(adjudicateCommittedPosition(fenced, { victoryRules: mate })).toBeNull();

    const walled: GameState = { ...state(kings), terrain: [{ x: 1, y: 1, terrain: 'cliff', elevation: 0 }] };
    expect(adjudicateCommittedPosition(walled, { victoryRules: mate })).toBeNull();

    const wet: GameState = { ...state(kings), terrain: [{ x: 1, y: 1, terrain: 'water', elevation: 0 }] };
    expect(adjudicateCommittedPosition(wet, { victoryRules: mate })).toBeNull();

    const raised: GameState = { ...state(kings), terrain: [{ x: 1, y: 1, terrain: 'grass', elevation: 1 }] };
    expect(adjudicateCommittedPosition(raised, { victoryRules: mate })).toBeNull();

    const blocked = [...kings, piece('rk', 'neutral', 'rock', 1, 1)];
    expect(adjudicateCommittedPosition(state(blocked), { victoryRules: mate })).toBeNull();
  });

  it('never takes a Survive win away: a turn limit can still decide the level', () => {
    const survive = victoryRulesForObjective('survive', { surviveTurns: 20 });
    expect(adjudicateCommittedPosition(state(KINGS()), { victoryRules: survive, turnsElapsed: 3 })).toBeNull();
    // ...and the authored win still lands when the clock runs out.
    expect(adjudicateCommittedPosition(state(KINGS()), { victoryRules: survive, turnsElapsed: 20 }))
      .toMatchObject({ kind: 'victory-rule', winner: 'player' });
  });

  it('draws a Reach level, whose pawn-only win no dead position can satisfy', () => {
    expect(adjudicateCommittedPosition(state(KINGS()), { victoryRules: victoryRulesForObjective('reach') }))
      .toEqual(deadDraw);
  });

  it('leaves a level running whose win is capturing a minor the King can still take', () => {
    const rules: VictoryRules = [
      { name: 'Take the bishop', if: [{ kind: 'eliminate', side: 'enemy', filter: { type: 'bishop' } }], do: [{ kind: 'win', side: 'player' }] },
    ];
    const pieces = [...KINGS(), piece('eb', 'enemy', 'bishop', 1, 1)];
    expect(adjudicateCommittedPosition(state(pieces), { victoryRules: rules })).toBeNull();
  });

  it('outranks the authored chess draws, and stalemate outranks it', () => {
    const clocked: GameState = { ...state(KINGS()), drawRules: { fiftyMove: true }, halfmoveClock: 100 };
    expect(adjudicateCommittedPosition(clocked, { victoryRules: mate })).toEqual(deadDraw);

    // The enemy owns a lone King boxed into a corner of a 1-wide board by the player's:
    // no legal move and no check, which is stalemate however dead the material is.
    const stuck: GameState = {
      size: { cols: 1, rows: 3 },
      pieces: [piece('ek', 'enemy', 'king', 0, 0), piece('pk', 'player', 'king', 0, 2)],
      turn: 'enemy',
      winner: null,
    };
    expect(adjudicateCommittedPosition(stuck, { victoryRules: mate }))
      .toMatchObject({ kind: 'stalemate', winner: 'draw' });
  });
});
