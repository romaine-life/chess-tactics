import { describe, it, expect } from 'vitest';
import { evaluateObjective, evaluateVictory, victoryRulesForObjective, objectiveContextForLevel, objectiveSummary, kingSideOf, DEFAULT_SURVIVE_TURNS, MODE_NAME, type ObjectiveContext } from './objectives';
import { createBlankLevel, type VictoryRules } from './level';
import type { GameState, Piece, PieceType, Side } from './types';

function piece(id: string, side: Side, type: PieceType, x: number, y: number): Piece {
  return { id, side, type, x, y, alive: true, startY: y };
}
function state(pieces: Piece[]): GameState {
  return { size: { cols: 8, rows: 8 }, pieces, turn: 'player', winner: null };
}

describe('evaluateObjective', () => {
  it('loses on a full player wipe regardless of objective', () => {
    const s = state([piece('e', 'enemy', 'king', 0, 0)]);
    for (const obj of ['capture-all', 'capture-king', 'rival-kings', 'survive', 'reach'] as const) {
      expect(evaluateObjective(s, obj)).toBe('enemy');
    }
  });

  it('capture-all: undecided while enemies live, won when none remain', () => {
    expect(evaluateObjective(state([piece('p', 'player', 'pawn', 0, 0), piece('e', 'enemy', 'pawn', 1, 1)]), 'capture-all')).toBeNull();
    expect(evaluateObjective(state([piece('p', 'player', 'pawn', 0, 0)]), 'capture-all')).toBe('player');
  });

  it('capture-king: won when the enemy royal is gone even if lesser pieces remain', () => {
    const withKing = state([piece('p', 'player', 'pawn', 0, 0), piece('ek', 'enemy', 'king', 5, 5), piece('ep', 'enemy', 'pawn', 4, 4)]);
    expect(evaluateObjective(withKing, 'capture-king')).toBeNull();
    const noKing = state([piece('p', 'player', 'pawn', 0, 0), piece('ep', 'enemy', 'pawn', 4, 4)]);
    expect(evaluateObjective(noKing, 'capture-king')).toBe('player');
  });

  it('capture-king with kingSide=player: losing the player King loses instantly, even with pieces left', () => {
    // The player's King fell but a rook survives: the King-holder side loses the moment
    // its King is gone — this is the direction-aware half of King Assault (ADR-0050).
    const kingless = state([piece('pr', 'player', 'rook', 0, 0), piece('ep', 'enemy', 'pawn', 4, 4)]);
    expect(evaluateObjective(kingless, 'capture-king', { kingSide: 'player' })).toBe('enemy');
    // Same board judged with kingSide=enemy semantics reads as a win instead (no enemy King).
    expect(evaluateObjective(kingless, 'capture-king', { kingSide: 'enemy' })).toBe('player');
  });

  it('capture-king with kingSide=player: the player wins by wiping the kingless enemy', () => {
    const holding = state([piece('pk', 'player', 'king', 0, 0), piece('ep', 'enemy', 'pawn', 4, 4)]);
    expect(evaluateObjective(holding, 'capture-king', { kingSide: 'player' })).toBeNull();
    const routed = state([piece('pk', 'player', 'king', 0, 0)]);
    expect(evaluateObjective(routed, 'capture-king', { kingSide: 'player' })).toBe('player');
  });

  it('rival-kings: the first King captured decides', () => {
    const bothKings = state([piece('pk', 'player', 'king', 0, 0), piece('ek', 'enemy', 'king', 7, 7)]);
    expect(evaluateObjective(bothKings, 'rival-kings')).toBeNull();
    // Enemy King gone → player wins, lesser enemies notwithstanding.
    const enemyKingless = state([piece('pk', 'player', 'king', 0, 0), piece('ep', 'enemy', 'pawn', 4, 4)]);
    expect(evaluateObjective(enemyKingless, 'rival-kings')).toBe('player');
    // Player King gone → enemy wins even though a player rook survives.
    const playerKingless = state([piece('pr', 'player', 'rook', 0, 0), piece('ek', 'enemy', 'king', 7, 7)]);
    expect(evaluateObjective(playerKingless, 'rival-kings')).toBe('enemy');
  });

  it('survive: won once the required turns elapse', () => {
    const s = state([piece('p', 'player', 'pawn', 0, 0), piece('e', 'enemy', 'pawn', 1, 1)]);
    expect(evaluateObjective(s, 'survive', { surviveTurns: 5, turnsElapsed: 3 })).toBeNull();
    expect(evaluateObjective(s, 'survive', { surviveTurns: 5, turnsElapsed: 5 })).toBe('player');
  });

  it('reach: won when a PAWN reaches a target cell; other pieces do not count (pawn-only)', () => {
    const cells = [{ x: 3, y: 3 }, { x: 7, y: 0 }];
    // A pawn on a target wins; off the target is undecided.
    expect(evaluateObjective(state([piece('p', 'player', 'pawn', 3, 3), piece('e', 'enemy', 'pawn', 1, 1)]), 'reach', { reachCells: cells })).toBe('player');
    expect(evaluateObjective(state([piece('p', 'player', 'pawn', 2, 2), piece('e', 'enemy', 'pawn', 1, 1)]), 'reach', { reachCells: cells })).toBeNull();
    // A NON-pawn sitting on the target does NOT win — the pre-ADR-0055 any-piece looseness is fixed.
    expect(evaluateObjective(state([piece('k', 'player', 'knight', 3, 3), piece('e', 'enemy', 'pawn', 1, 1)]), 'reach', { reachCells: cells })).toBeNull();
  });

  it('reach: a pawn that promotes on arrival still scores (lastMove carries the pre-promotion type)', () => {
    // A pawn reaching the enemy back rank (y=0) promotes to a queen inside applyMove, so the
    // settled board shows a queen on the goal — but lastMove records pieceType 'pawn' + the
    // destination, so reach still fires.
    const promoted: GameState = {
      size: { cols: 8, rows: 8 },
      pieces: [piece('q', 'player', 'queen', 7, 0), piece('e', 'enemy', 'pawn', 1, 1)],
      turn: 'enemy',
      winner: null,
      lastMove: { pieceId: 'q', pieceType: 'pawn', side: 'player', from: { x: 7, y: 1 }, to: { x: 7, y: 0 } },
    };
    expect(evaluateObjective(promoted, 'reach', { reachCells: [{ x: 7, y: 0 }] })).toBe('player');
    // A REAL queen that merely moved onto the goal (lastMove.pieceType 'queen') does NOT score.
    const wandered: GameState = { ...promoted, lastMove: { ...promoted.lastMove!, pieceType: 'queen' } };
    expect(evaluateObjective(wandered, 'reach', { reachCells: [{ x: 7, y: 0 }] })).toBeNull();
  });
});

describe('evaluateVictory (ADR-0055 two-list model)', () => {
  it('defeat-first: a turn that trips both a lose and a win resolves as a loss', () => {
    // Survive-shaped rules: win by outlasting, lose by wipe. When the clock hits N AND the last
    // player piece is gone, the LOSE list (checked first) decides → 'enemy'.
    const rules: VictoryRules = { win: [{ kind: 'turnLimit', turns: 5 }], lose: [{ kind: 'eliminate', side: 'player' }] };
    expect(evaluateVictory(state([piece('e', 'enemy', 'pawn', 1, 1)]), rules, { turnsElapsed: 5 })).toBe('enemy');
    const held = state([piece('p', 'player', 'pawn', 0, 0), piece('e', 'enemy', 'pawn', 1, 1)]);
    expect(evaluateVictory(held, rules, { turnsElapsed: 5 })).toBe('player');
    expect(evaluateVictory(held, rules, { turnsElapsed: 4 })).toBeNull();
  });

  it('win by ANY: reach the goal OR wipe out the enemy', () => {
    const rules: VictoryRules = {
      win: [{ kind: 'reach', side: 'player' }, { kind: 'eliminate', side: 'enemy' }],
      lose: [{ kind: 'eliminate', side: 'player' }],
    };
    // Enemy wiped → win without reaching.
    expect(evaluateVictory(state([piece('p', 'player', 'pawn', 0, 0)]), rules, {})).toBe('player');
    // Both sides live, no pawn on goal → undecided.
    const contested = state([piece('p', 'player', 'pawn', 0, 0), piece('e', 'enemy', 'pawn', 1, 1)]);
    expect(evaluateVictory(contested, rules, { reachCells: [{ x: 7, y: 7 }] })).toBeNull();
    // A pawn on the goal → win.
    expect(evaluateVictory(state([piece('p', 'player', 'pawn', 7, 7), piece('e', 'enemy', 'pawn', 1, 1)]), rules, { reachCells: [{ x: 7, y: 7 }] })).toBe('player');
  });

  it('all: an AND-group holds only when every sub-condition does', () => {
    const rules: VictoryRules = {
      win: [{ kind: 'all', of: [{ kind: 'turnLimit', turns: 3 }, { kind: 'eliminate', side: 'enemy', filter: { type: 'king' } }] }],
      lose: [{ kind: 'eliminate', side: 'player' }],
    };
    const kingUp = state([piece('p', 'player', 'pawn', 0, 0), piece('ek', 'enemy', 'king', 7, 7)]);
    expect(evaluateVictory(kingUp, rules, { turnsElapsed: 3 })).toBeNull(); // turn reached, king alive
    const kingGone = state([piece('p', 'player', 'pawn', 0, 0), piece('ep', 'enemy', 'pawn', 4, 4)]);
    expect(evaluateVictory(kingGone, rules, { turnsElapsed: 2 })).toBeNull(); // king gone, turn not reached
    expect(evaluateVictory(kingGone, rules, { turnsElapsed: 3 })).toBe('player'); // both
  });
});

describe('victoryRulesForObjective (preset expansion)', () => {
  it('capture-king expands direction-aware; the others are fixed pairs', () => {
    expect(victoryRulesForObjective('capture-all')).toEqual({
      win: [{ kind: 'eliminate', side: 'enemy' }],
      lose: [{ kind: 'eliminate', side: 'player' }],
    });
    expect(victoryRulesForObjective('capture-king', { kingSide: 'enemy' })).toEqual({
      win: [{ kind: 'eliminate', side: 'enemy', filter: { type: 'king' } }],
      lose: [{ kind: 'eliminate', side: 'player' }],
    });
    expect(victoryRulesForObjective('capture-king', { kingSide: 'player' })).toEqual({
      win: [{ kind: 'eliminate', side: 'enemy' }],
      lose: [{ kind: 'eliminate', side: 'player', filter: { type: 'king' } }],
    });
    expect(victoryRulesForObjective('survive', { surviveTurns: 6 })).toEqual({
      win: [{ kind: 'turnLimit', turns: 6 }],
      lose: [{ kind: 'eliminate', side: 'player' }],
    });
    expect(victoryRulesForObjective('reach')).toEqual({
      win: [{ kind: 'reach', side: 'player' }],
      lose: [{ kind: 'eliminate', side: 'player' }],
    });
  });

  it('the preset path stays in sync with evaluateObjective across boards and contexts', () => {
    const boards: GameState[] = [
      state([piece('p', 'player', 'pawn', 0, 0), piece('e', 'enemy', 'pawn', 1, 1)]),
      state([piece('p', 'player', 'pawn', 0, 0)]),
      state([piece('pk', 'player', 'king', 0, 0), piece('ep', 'enemy', 'pawn', 4, 4)]),
      state([piece('pr', 'player', 'rook', 0, 0), piece('ek', 'enemy', 'king', 7, 7)]),
    ];
    const ctxs: ObjectiveContext[] = [{}, { kingSide: 'player' }, { surviveTurns: 5, turnsElapsed: 5 }, { reachCells: [{ x: 0, y: 0 }] }];
    for (const obj of ['capture-all', 'capture-king', 'rival-kings', 'survive', 'reach'] as const) {
      for (const g of boards) for (const ctx of ctxs) {
        expect(evaluateVictory(g, victoryRulesForObjective(obj, ctx), ctx)).toBe(evaluateObjective(g, obj, ctx));
      }
    }
  });
});

describe('objectiveContextForLevel', () => {
  it('capture objectives imply no extra context', () => {
    expect(objectiveContextForLevel(createBlankLevel('a'))).toEqual({}); // createBlankLevel = capture-all
  });

  it('survive implies the default turn target', () => {
    const level = { ...createBlankLevel('a'), objective: 'survive' as const };
    expect(objectiveContextForLevel(level)).toEqual({ surviveTurns: DEFAULT_SURVIVE_TURNS });
  });

  it('survive honours an authored level.surviveTurns over the default', () => {
    const level = { ...createBlankLevel('a'), objective: 'survive' as const, surviveTurns: 3 };
    expect(objectiveContextForLevel(level)).toEqual({ surviveTurns: 3 });
  });

  it('reach uses authored objective-zone tiles when present', () => {
    const base = createBlankLevel('a', 'x', 4, 4);
    const level = {
      ...base,
      objective: 'reach' as const,
      layers: { ...base.layers, zones: [{ id: 'z', type: 'objective' as const, tiles: [[1, 1], [2, 2]] as Array<[number, number]> }] },
    };
    expect(objectiveContextForLevel(level).reachCells).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]);
  });

  it('reach falls back to the enemy back rank (y=0) when no zone is authored', () => {
    const level = { ...createBlankLevel('a', 'x', 3, 3), objective: 'reach' as const };
    expect(objectiveContextForLevel(level).reachCells).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
  });
});

describe('mode vocabulary (ADR-0050)', () => {
  it('MODE_NAME maps every stored id to its owner-facing name', () => {
    expect(MODE_NAME).toEqual({
      'capture-all': 'Last Man Standing',
      'capture-king': 'King Assault',
      'rival-kings': 'Rival Kings',
      survive: 'Survive',
      reach: 'Reach',
    });
  });

  it('kingSideOf: the side fielding a living King; enemy when both or neither', () => {
    const pk = piece('pk', 'player', 'king', 0, 0);
    const ek = piece('ek', 'enemy', 'king', 7, 7);
    expect(kingSideOf([pk, piece('ep', 'enemy', 'pawn', 4, 4)])).toBe('player');
    expect(kingSideOf([piece('pp', 'player', 'pawn', 0, 0), ek])).toBe('enemy');
    expect(kingSideOf([pk, ek])).toBe('enemy'); // both ⇒ rival-kings territory, default enemy
    expect(kingSideOf([piece('pp', 'player', 'pawn', 0, 0)])).toBe('enemy'); // neither ⇒ free-skirmish default
    // A dead King does not count as fielded.
    expect(kingSideOf([{ ...pk, alive: false }, ek])).toBe('enemy');
    expect(kingSideOf([pk, { ...ek, alive: false }])).toBe('player');
  });

  it('objectiveSummary: direction-aware for capture-king, static for the rest', () => {
    expect(objectiveSummary('capture-king')).toBe('Capture the enemy King');
    expect(objectiveSummary('capture-king', 'enemy')).toBe('Capture the enemy King');
    expect(objectiveSummary('capture-king', 'player')).toBe('Protect your King');
    expect(objectiveSummary('rival-kings')).toBe('Capture the rival King');
    expect(objectiveSummary('capture-all')).toBe('Defeat every enemy piece');
  });
});
