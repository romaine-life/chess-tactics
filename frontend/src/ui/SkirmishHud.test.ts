import { afterEach, describe, expect, it } from 'vitest';
import { useSkirmish } from '../game/store';
import { runSkirmishShortcut, SHORTCUT_BINDINGS } from './SkirmishHud';

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
});
