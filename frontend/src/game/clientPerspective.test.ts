import { describe, expect, it } from 'vitest';
import {
  clientSide,
  clientSideLabel,
  clientSideOrder,
  clientSideRelation,
  clientTurnLabel,
  opponentSide,
  type PlayingSide,
} from './clientPerspective';

describe.each([
  ['player', 'enemy'],
  ['enemy', 'player'],
] as const)('client perspective from the %s seat', (localSide, opponent) => {
  it('projects canonical factions into self and opponent', () => {
    expect(opponentSide(localSide)).toBe(opponent);
    expect(clientSideRelation(localSide, localSide)).toBe('self');
    expect(clientSideRelation(opponent, localSide)).toBe('opponent');
    expect(clientSideRelation('neutral', localSide)).toBe('neutral');
  });

  it('uses relative labels and puts this client first', () => {
    expect(clientSideLabel(localSide, localSide)).toBe('Your');
    expect(clientSideLabel(opponent, localSide)).toBe('Opponent');
    expect(clientSideLabel('neutral', localSide)).toBe('Neutral');
    expect(clientSideOrder(localSide)).toEqual([localSide, opponent]);
  });

  it('uses the same relative turn, pending, and result vocabulary', () => {
    expect(clientTurnLabel({ turn: localSide, winner: null }, localSide)).toBe('Your turn');
    expect(clientTurnLabel({ turn: localSide, winner: null }, localSide, true)).toBe('Move pending');
    expect(clientTurnLabel({ turn: opponent, winner: null }, localSide)).toBe('Opponent turn');
    expect(clientTurnLabel({ turn: 'done', winner: localSide }, localSide)).toBe('Victory');
    expect(clientTurnLabel({ turn: 'done', winner: opponent }, localSide)).toBe('Defeat');
    expect(clientTurnLabel({ turn: 'done', winner: 'draw' }, localSide)).toBe('Draw');
  });
});

describe('clientSide', () => {
  it('defaults solo play to player and preserves either lobby seat', () => {
    expect(clientSide(null)).toBe('player');
    expect(clientSide({ localSide: 'player' })).toBe('player');
    expect(clientSide({ localSide: 'enemy' })).toBe('enemy');
  });

  it('rejects a neutral observer masquerading as a player seat', () => {
    expect(() => clientSide({ localSide: 'neutral' })).toThrow(/neutral side/i);
  });

  it('keeps the playing-side type free of neutral', () => {
    const sides: PlayingSide[] = ['player', 'enemy'];
    expect(sides).toHaveLength(2);
  });
});
