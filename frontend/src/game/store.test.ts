import { describe, it, expect } from 'vitest';
import { useSkirmish } from './store';
import { livingPieces } from '../core/rules';

function playFirstMove(seed: number) {
  useSkirmish.getState().newSkirmish({ seed });
  const moves = useSkirmish.getState().movesForSelected();
  if (moves.length) useSkirmish.getState().tryMoveTo(moves[0].x, moves[0].y);
  return useSkirmish.getState().game;
}

describe('skirmish store', () => {
  it('starts on the player turn with a selected player piece', () => {
    useSkirmish.getState().newSkirmish({ seed: 5 });
    const s = useSkirmish.getState();
    expect(s.game.turn).toBe('player');
    expect(s.selectedId).not.toBeNull();
    expect(livingPieces(s.game.pieces, 'player').length).toBeGreaterThan(0);
  });

  it('a legal move advances state and hands the turn back to the player (or ends)', () => {
    useSkirmish.getState().newSkirmish({ seed: 5 });
    const before = useSkirmish.getState().game;
    const moves = useSkirmish.getState().movesForSelected();
    expect(moves.length).toBeGreaterThan(0);
    useSkirmish.getState().tryMoveTo(moves[0].x, moves[0].y);
    const after = useSkirmish.getState().game;
    expect(after).not.toBe(before); // new immutable state
    expect(['player', 'done']).toContain(after.turn);
  });

  it('ignores an illegal destination', () => {
    useSkirmish.getState().newSkirmish({ seed: 5 });
    const before = useSkirmish.getState().game;
    useSkirmish.getState().tryMoveTo(-1, -1);
    expect(useSkirmish.getState().game).toBe(before);
  });

  it('is fully deterministic for a seed + move sequence', () => {
    expect(playFirstMove(5)).toEqual(playFirstMove(5));
  });
});
