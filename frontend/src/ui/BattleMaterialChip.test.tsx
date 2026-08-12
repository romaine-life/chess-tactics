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

/** The reader's own force, then the opposing one — the order the box paints them in. */
const forces = (board: readonly Piece[], localSide: 'player' | 'enemy' = 'player') =>
  battleMaterialReadout(board, localSide).forces;

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
    expect(forces(board)[0].points).toBe(10);
    // Rook 5 + Knight 3.
    expect(forces(board)[1].points).toBe(8);
  });

  it('leaves a fallen unit and an obstacle out of the count', () => {
    const board = [
      unit('player', 'rook'), unit('player', 'queen', { x: 1, alive: false }),
      unit('enemy', 'rook'), unit('enemy', 'rock', { x: 1 }),
    ];

    expect(forces(board)[0].points).toBe(5);
    expect(forces(board)[1].points).toBe(5);
  });

  it('prices a promoted Pawn as the Pawn it started as', () => {
    const board = [unit('player', 'queen', { promotedFrom: 'pawn' }), unit('enemy', 'pawn')];

    expect(forces(board)[0].points).toBe(1);
  });

  it('states where the reader stands — the whole reason the two numbers share a box', () => {
    const board = [unit('player', 'rook'), unit('enemy', 'queen')];

    expect(battleMaterialReadout(board, 'player').detail).toContain('You are 4 behind on material.');
    expect(battleMaterialReadout(board, 'player').label).toContain('You are 4 behind on material.');
  });

  it('reads the margin from the side that is ahead', () => {
    const board = [unit('player', 'queen'), unit('enemy', 'pawn')];

    expect(battleMaterialReadout(board, 'player').detail).toContain('You are 8 ahead on material.');
  });

  it('says level rather than a margin of nothing', () => {
    const board = [unit('player', 'knight'), unit('enemy', 'bishop')];

    expect(battleMaterialReadout(board, 'player').detail)
      .toContain('The two forces are level on material.');
  });

  it('reads out both forces at once, the reader\'s own first', () => {
    const board = [unit('player', 'pawn'), unit('enemy', 'rook')];

    // One Pawn is a Pawn, not "1 Pawns".
    expect(battleMaterialReadout(board, 'player').label)
      .toBe('Material. Yours 1 Pawn, opponent 5. You are 4 behind on material.');
    expect(forces(board).map((force) => force.relation)).toEqual(['self', 'opponent']);
  });

  it('spells the scale from the values it counts with, so the words cannot drift', () => {
    const board = [unit('player', 'pawn'), unit('enemy', 'pawn')];

    expect(battleMaterialReadout(board, 'player').detail)
      .toContain('Pawn 1, Knight 3, Bishop 3, Rook 5, Queen 9.');
  });

  it('follows the seat this client commands rather than assuming the player faction', () => {
    const board = [unit('player', 'queen'), unit('enemy', 'pawn')];

    // Commanding the enemy seat, the FIRST force is the enemy one — a lobby guest is not shown
    // the host's material in the seat their own number should be in.
    expect(forces(board, 'enemy')[0].points).toBe(1);
    expect(forces(board, 'enemy')[1].points).toBe(9);
    expect(battleMaterialReadout(board, 'enemy').detail).toContain('You are 8 behind on material.');
  });

  it('wears the palette that army is actually rendering in, not the side default', () => {
    const board = [unit('player', 'pawn'), unit('enemy', 'pawn', { palette: 'black' })];

    // An authored level stamps its own colours on its units; the mark has to match the pieces
    // it is counting rather than the enemy default this level never used.
    expect(forces(board)[1].palette).toBe('black');
  });

  it('falls back to the side default when a level authored no palette at all', () => {
    const board = [unit('player', 'pawn'), unit('enemy', 'pawn')];

    expect(forces(board)[1].palette).toBe('crimson');
  });

  it('gives the two forces marks that cannot be the same sprite', () => {
    const board = [unit('player', 'pawn'), unit('enemy', 'pawn')];

    // Both numbers live in one box now, so the marks are the ONLY thing saying which is which.
    expect(forces(board)[0].palette).not.toBe(forces(board)[1].palette);
  });

  it('answers for an emptied side without reaching for a dead unit\'s colours', () => {
    const board = [unit('player', 'rook'), unit('enemy', 'queen', { alive: false })];

    expect(forces(board)[1].points).toBe(0);
    expect(forces(board)[1].palette).toBe('crimson');
  });
});

describe('BattleMaterialChip', () => {
  beforeEach(() => applyLiveUnitCatalog(testLiveUnitCatalog()));
  afterEach(() => resetLiveUnitCatalog());

  it('holds both forces in ONE box, each behind its own live Pawn sprite', () => {
    const html = renderToStaticMarkup(<BattleMaterialChip />);

    // The box IS the hover/keyboard target — that is what a frame in the persistent bar is for.
    expect(html).toContain('titlebar-status-tip');
    expect(html).toContain('data-chrome-unit="inner-box"');
    expect(html).toContain('skirmish-status-chip skirmish-material');
    expect(html).toContain('Material');
    // Two readouts and two marks, inside one frame.
    expect(html).toContain('data-testid="battle-material-self"');
    expect(html).toContain('data-testid="battle-material-opponent"');
    expect(html.match(/skirmish-material-force--/g)).toHaveLength(2);
    expect(html.match(/data-piece-type="pawn"/g)).toHaveLength(2);
    // One frame, not two: a second inner box would be the pair this replaced.
    expect(html.match(/titlebar-status-tip/g)).toHaveLength(1);
    // A real battlefield sprite, not a generic chess glyph, alpha-fitted to the mark seat.
    expect(html).toContain('alpha-bound-icon');
  });

  it('paints the reader\'s own force first', () => {
    const html = renderToStaticMarkup(<BattleMaterialChip />);

    expect(html.indexOf('battle-material-self')).toBeLessThan(html.indexOf('battle-material-opponent'));
  });
});
