import { afterEach, describe, expect, it } from 'vitest';
import { useSkirmish } from '../game/store';
import { runSkirmishShortcut, SHORTCUT_BINDINGS, skirmishRosterAction, skirmishUnitOwnerLabel } from './SkirmishHud';

afterEach(() => {
  useSkirmish.setState({ selectedId: null, focusedId: null, premoves: [] });
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

    expect(runSkirmishShortcut('R')).toBe(true);
    expect(useSkirmish.getState().selectedId).toBeNull();
    expect(useSkirmish.getState().focusedId).toBeNull();
    expect(useSkirmish.getState().premoves).toEqual([{ pieceId: 'player-piece', x: 2, y: 3 }]);
  });

  it('does not repeatedly execute Deselect all while R is held', () => {
    useSkirmish.setState({ selectedId: 'player-piece', focusedId: 'player-piece' });

    expect(runSkirmishShortcut('r', true)).toBe(false);
    expect(useSkirmish.getState().selectedId).toBe('player-piece');
  });

  it('describes the overlay shortcuts from the client perspective', () => {
    expect(SHORTCUT_BINDINGS.q).toMatchObject({ label: 'Opp. attacks', hint: expect.stringMatching(/opponent attack/i) });
    expect(SHORTCUT_BINDINGS.w).toMatchObject({ label: 'Opp. moves', hint: expect.stringMatching(/opponent legal-move/i) });
    expect(SHORTCUT_BINDINGS.a).toMatchObject({ label: 'Your attacks', hint: expect.stringMatching(/friendly attack/i) });
    expect(SHORTCUT_BINDINGS.s).toMatchObject({ label: 'Your moves', hint: expect.stringMatching(/friendly legal-move/i) });
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
