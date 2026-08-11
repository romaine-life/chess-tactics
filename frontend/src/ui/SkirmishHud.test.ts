import { afterEach, describe, expect, it } from 'vitest';
import { useSkirmish } from '../game/store';
import { createSkirmishViewStore } from '../game/skirmishView';
import { hudTabFromRoute, moveNumberLabel, runMoveReviewKey, runSkirmishShortcut, SHORTCUT_BINDINGS, skirmishRosterAction, skirmishUnitOwnerLabel } from './SkirmishHud';

const viewStore = createSkirmishViewStore();

afterEach(() => {
  useSkirmish.setState({ selectedId: null, focusedId: null, premoves: [] });
  viewStore.setState({
    showMoves: true,
    showEnemyAttacks: true,
    showBlocked: false,
    showEnemyMoves: false,
    showPlayerAttacks: false,
    showPlayerMoves: false,
    showPromotionZones: false,
    showGrid: false,
  });
});

describe('Skirmish HUD shortcuts', () => {
  it('shows R as Deselect all in the command card', () => {
    expect(SHORTCUT_BINDINGS.r).toEqual({
      kind: 'deselect',
      label: 'Deselect all',
      hint: 'Clear the selected and focused units',
    });
  });

  it('clears movement selection and inspection focus without deleting queued premoves', () => {
    useSkirmish.setState({
      selectedId: 'player-piece',
      focusedId: 'enemy-piece',
      premoves: [{ pieceId: 'player-piece', x: 2, y: 3 }],
    });

    expect(runSkirmishShortcut('R', false, viewStore)).toBe(true);
    expect(useSkirmish.getState().selectedId).toBeNull();
    expect(useSkirmish.getState().focusedId).toBeNull();
    expect(useSkirmish.getState().premoves).toEqual([{ pieceId: 'player-piece', x: 2, y: 3 }]);
  });

  it('offers Clear all as a distinct action that turns off every board overlay only', () => {
    useSkirmish.setState({
      selectedId: 'player-piece',
      focusedId: 'player-piece',
      premoves: [
        { pieceId: 'player-piece', x: 2, y: 3 },
        { pieceId: 'player-piece', x: 3, y: 3 },
      ],
    });
    viewStore.setState({
      showMoves: true,
      showEnemyAttacks: true,
      showBlocked: true,
      showEnemyMoves: true,
      showPlayerAttacks: true,
      showPlayerMoves: true,
      showPromotionZones: true,
      showGrid: true,
    });

    expect(SHORTCUT_BINDINGS.t).toEqual({
      kind: 'clear-overlays',
      label: 'Clear all',
      hint: 'Turn off all board overlays',
    });
    expect(runSkirmishShortcut('T', false, viewStore)).toBe(true);
    expect(useSkirmish.getState().premoves).toEqual([
      { pieceId: 'player-piece', x: 2, y: 3 },
      { pieceId: 'player-piece', x: 3, y: 3 },
    ]);
    expect(useSkirmish.getState().selectedId).toBe('player-piece');
    expect(useSkirmish.getState().focusedId).toBe('player-piece');
    expect(viewStore.getState()).toMatchObject({
      showMoves: false,
      showEnemyAttacks: false,
      showBlocked: false,
      showEnemyMoves: false,
      showPlayerAttacks: false,
      showPlayerMoves: false,
      showPromotionZones: false,
      showGrid: false,
    });
  });

  it('does not repeatedly execute Deselect all while R is held', () => {
    useSkirmish.setState({ selectedId: 'player-piece', focusedId: 'player-piece' });

    expect(runSkirmishShortcut('r', true, viewStore)).toBe(false);
    expect(useSkirmish.getState().selectedId).toBe('player-piece');
  });

  it('describes the overlay shortcuts from the client perspective', () => {
    expect(SHORTCUT_BINDINGS.q).toMatchObject({ label: 'Opp. attacks', hint: expect.stringMatching(/opponent attack/i) });
    expect(SHORTCUT_BINDINGS.w).toMatchObject({ label: 'Opp. moves', hint: expect.stringMatching(/opponent legal-move/i) });
    expect(SHORTCUT_BINDINGS.a).toMatchObject({ label: 'Your attacks', hint: expect.stringMatching(/friendly attack/i) });
    expect(SHORTCUT_BINDINGS.s).toMatchObject({ label: 'Your moves', hint: expect.stringMatching(/friendly legal-move/i) });
    expect(SHORTCUT_BINDINGS.d).toEqual({
      kind: 'toggle',
      flag: 'showPromotionZones',
      label: 'Promotion zones',
      hint: 'View pawn promotion zones',
    });
  });

  it('toggles pawn promotion zones from the Controls command card', () => {
    expect(viewStore.getState().showPromotionZones).toBe(false);

    expect(runSkirmishShortcut('D', false, viewStore)).toBe(true);
    expect(viewStore.getState().showPromotionZones).toBe(true);

    expect(runSkirmishShortcut('d', false, viewStore)).toBe(true);
    expect(viewStore.getState().showPromotionZones).toBe(false);
  });
});

describe('Skirmish HUD event log', () => {
  it('numbers a move row the way a score sheet does, replies included', () => {
    expect(moveNumberLabel({ text: 'e4', side: 'player', ply: 0 })).toBe('1.');
    expect(moveNumberLabel({ text: 'e5', side: 'enemy', ply: 1 })).toBe('1…');
    expect(moveNumberLabel({ text: 'Nf3', side: 'player', ply: 2 })).toBe('2.');
    expect(moveNumberLabel({ text: 'Qxh7#', side: 'enemy', ply: 41 })).toBe('21…');
  });

  it('leaves the number column empty for a line that is not a move', () => {
    expect(moveNumberLabel({ text: 'Your King is in check!' })).toBe('');
  });

  it('opens on the section a ?hud= link asks for, and on Unit for anything else', () => {
    expect(hudTabFromRoute('log')).toBe('log');
    expect(hudTabFromRoute('controls')).toBe('controls');
    expect(hudTabFromRoute(null)).toBe('unit');
    expect(hudTabFromRoute('admin')).toBe('unit'); // admin-only, never link-addressable
    expect(hudTabFromRoute('nonsense')).toBe('unit');
  });
});

describe('move review keyboard', () => {
  // Two half-moves recorded, so there is somewhere to step back to.
  const seeded = () => {
    const game = useSkirmish.getState().game;
    useSkirmish.setState({
      reviewIndex: null,
      positions: [
        { ply: 0, snapshot: { pieces: game.pieces, turn: 'player', winner: null } },
        { ply: 1, snapshot: { pieces: game.pieces, turn: 'enemy', winner: null } },
        { ply: 2, snapshot: { pieces: game.pieces, turn: 'player', winner: null } },
      ],
    });
  };

  it('walks the score sheet with the arrows every chess site uses', () => {
    seeded();

    expect(runMoveReviewKey('ArrowLeft')).toBe(true);
    expect(useSkirmish.getState().reviewIndex).toBe(1);
    expect(runMoveReviewKey('ArrowLeft')).toBe(true);
    expect(useSkirmish.getState().reviewIndex).toBe(0);
    expect(runMoveReviewKey('ArrowRight')).toBe(true);
    expect(useSkirmish.getState().reviewIndex).toBe(1);
  });

  it('jumps to the opening and back to the live board', () => {
    seeded();

    expect(runMoveReviewKey('Home')).toBe(true);
    expect(useSkirmish.getState().reviewIndex).toBe(0);
    expect(runMoveReviewKey('End')).toBe(true);
    expect(useSkirmish.getState().reviewIndex).toBeNull();
  });

  it('claims Escape only while a review is actually open', () => {
    seeded();

    // Nothing under review: Escape still means whatever else it means on this screen.
    expect(runMoveReviewKey('Escape')).toBe(false);

    runMoveReviewKey('ArrowLeft');
    expect(runMoveReviewKey('Escape')).toBe(true);
    expect(useSkirmish.getState().reviewIndex).toBeNull();
  });

  it('leaves keys it does not own to the command card', () => {
    seeded();

    expect(runMoveReviewKey('q')).toBe(false);
    expect(useSkirmish.getState().reviewIndex).toBeNull();
  });
});

describe.each([
  ['player', 'enemy'],
  ['enemy', 'player'],
] as const)('Skirmish HUD from the %s seat', (localSide, opponentSide) => {
  it('labels and routes roster units relative to this client', () => {
    expect(skirmishUnitOwnerLabel(localSide, localSide)).toBe('Your unit');
    expect(skirmishRosterAction(localSide, localSide)).toBe('select');
    expect(skirmishUnitOwnerLabel(opponentSide, localSide)).toBe('Opponent unit');
    expect(skirmishRosterAction(opponentSide, localSide)).toBe('focus');
  });
});
