import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Piece, PieceType, Side } from '../core/types';
import { testLiveUnitCatalog } from '../test/liveUnitCatalog';
import { applyLiveUnitCatalog, resetLiveUnitCatalog } from './unitCatalog';
import { BattleMaterialChip, battleMaterialReadout } from './BattleMaterialChip';

function unit(side: Side, type: PieceType, extra: Partial<Piece> = {}): Piece {
  return {
    id: `${side}-${type}-${extra.x ?? 0}`,
    side,
    type,
    x: extra.x ?? 0,
    y: 0,
    alive: true,
    startY: 0,
    ...extra,
  };
}

// The component reads the mounted session store, and under `renderToStaticMarkup` zustand answers
// from the store's INITIAL state (that is what useSyncExternalStore's server snapshot is), so a
// seeded board is invisible to a rendered chip. The reading is therefore a pure function and this
// is where the counting rules are held; the render test below only checks what the box is made of.
describe('battleMaterialReadout', () => {
  it('counts each force in Pawns on the shared piece scale', () => {
    const board = [
      unit('player', 'king'), unit('player', 'queen', { x: 1 }), unit('player', 'pawn', { x: 2 }),
      unit('enemy', 'king'), unit('enemy', 'rook', { x: 1 }), unit('enemy', 'knight', { x: 2 }),
    ];

    // Queen 9 + Pawn 1. The King's zero is "never bought" rather than worthless, so it adds none.
    expect(battleMaterialReadout(board, 'player', 'self').points).toBe(10);
    // Rook 5 + Knight 3.
    expect(battleMaterialReadout(board, 'player', 'opponent').points).toBe(8);
  });

  it('leaves a fallen unit and an obstacle out of the count', () => {
    const board = [
      unit('player', 'rook'), unit('player', 'queen', { x: 1, alive: false }),
      unit('enemy', 'rook'), unit('enemy', 'rock', { x: 1 }),
    ];

    expect(battleMaterialReadout(board, 'player', 'self').points).toBe(5);
    expect(battleMaterialReadout(board, 'player', 'opponent').points).toBe(5);
  });

  it('prices a promoted Pawn as the Pawn it started as', () => {
    const board = [unit('player', 'queen', { promotedFrom: 'pawn' }), unit('enemy', 'pawn')];

    expect(battleMaterialReadout(board, 'player', 'self').points).toBe(1);
  });

  it('states where the reader stands, the same way from either box', () => {
    const board = [unit('player', 'rook'), unit('enemy', 'queen')];

    for (const relation of ['self', 'opponent'] as const) {
      expect(battleMaterialReadout(board, 'player', relation).detail)
        .toContain('You are 4 behind on material.');
    }
  });

  it('reads the margin from the side that is ahead', () => {
    const board = [unit('player', 'queen'), unit('enemy', 'pawn')];

    expect(battleMaterialReadout(board, 'player', 'self').detail)
      .toContain('You are 8 ahead on material.');
  });

  it('says level rather than a margin of nothing', () => {
    const board = [unit('player', 'knight'), unit('enemy', 'bishop')];

    expect(battleMaterialReadout(board, 'player', 'self').detail)
      .toContain('The two forces are level on material.');
  });

  it('names each box for the force it counts', () => {
    const board = [unit('player', 'pawn'), unit('enemy', 'rook')];

    expect(battleMaterialReadout(board, 'player', 'self').name).toBe('Your material');
    expect(battleMaterialReadout(board, 'player', 'opponent').name).toBe('Opponent material');
    // One Pawn is a Pawn, not "1 Pawns".
    expect(battleMaterialReadout(board, 'player', 'self').label).toBe('Your material. 1 Pawn. You are 4 behind on material.');
    expect(battleMaterialReadout(board, 'player', 'opponent').label).toBe('Opponent material. 5 Pawns. You are 4 behind on material.');
  });

  it('spells the scale from the values it counts with, so the words cannot drift', () => {
    const board = [unit('player', 'pawn'), unit('enemy', 'pawn')];

    expect(battleMaterialReadout(board, 'player', 'self').detail)
      .toContain('Pawn 1, Knight 3, Bishop 3, Rook 5, Queen 9.');
  });

  it('follows the seat this client commands rather than assuming the player faction', () => {
    const board = [unit('player', 'queen'), unit('enemy', 'pawn')];

    // Commanding the enemy seat, "yours" is the enemy force — a lobby guest is not shown the
    // host's material under their own name.
    expect(battleMaterialReadout(board, 'enemy', 'self').points).toBe(1);
    expect(battleMaterialReadout(board, 'enemy', 'opponent').points).toBe(9);
    expect(battleMaterialReadout(board, 'enemy', 'self').detail)
      .toContain('You are 8 behind on material.');
  });

  it('wears the palette that army is actually rendering in, not the side default', () => {
    const board = [unit('player', 'pawn'), unit('enemy', 'pawn', { palette: 'black' })];

    // An authored level stamps its own colours on its units; the mark has to match the pieces
    // it is counting rather than the enemy default this level never used.
    expect(battleMaterialReadout(board, 'player', 'opponent').palette).toBe('black');
  });

  it('falls back to the side default when a level authored no palette at all', () => {
    const board = [unit('player', 'pawn'), unit('enemy', 'pawn')];

    expect(battleMaterialReadout(board, 'player', 'opponent').palette).toBe('crimson');
  });

  it('gives the two forces marks that cannot be the same sprite', () => {
    const board = [unit('player', 'pawn'), unit('enemy', 'pawn')];

    expect(battleMaterialReadout(board, 'player', 'self').palette)
      .not.toBe(battleMaterialReadout(board, 'player', 'opponent').palette);
  });

  it('answers for an emptied side without reaching for a dead unit\'s colours', () => {
    const board = [unit('player', 'rook'), unit('enemy', 'queen', { alive: false })];

    const opponent = battleMaterialReadout(board, 'player', 'opponent');
    expect(opponent.points).toBe(0);
    expect(opponent.palette).toBe('crimson');
  });
});

describe('BattleMaterialChip', () => {
  beforeEach(() => applyLiveUnitCatalog(testLiveUnitCatalog()));
  afterEach(() => resetLiveUnitCatalog());

  it('is one boxed tooltip carrying a live Pawn sprite and a readout', () => {
    const html = renderToStaticMarkup(<BattleMaterialChip relation="self" />);

    // The box IS the hover/keyboard target — that is what a frame in the persistent bar is for.
    expect(html).toContain('titlebar-status-tip');
    expect(html).toContain('data-chrome-unit="inner-box"');
    expect(html).toContain('skirmish-status-chip skirmish-material skirmish-material--self');
    expect(html).toContain('Your material');
    // A real battlefield sprite, not a generic chess glyph, and alpha-fitted to the mark seat.
    expect(html).toContain('data-piece-type="pawn"');
    expect(html).toContain('alpha-bound-icon');
    expect(html).toContain('data-testid="battle-material-self"');
  });

  it('gives the opponent box its own seat and name', () => {
    const html = renderToStaticMarkup(<BattleMaterialChip relation="opponent" />);

    expect(html).toContain('skirmish-material--opponent');
    expect(html).toContain('Opponent material');
    expect(html).toContain('data-testid="battle-material-opponent"');
  });
});
