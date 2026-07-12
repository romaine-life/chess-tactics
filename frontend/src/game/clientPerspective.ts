import type { GameState, Side } from '../core/types';

/** The two simulation factions a person can command. Neutral is never a client seat. */
export type PlayingSide = Exclude<Side, 'neutral'>;

export type ClientSideRelation = 'self' | 'opponent' | 'neutral';

/**
 * Resolve the side this client commands. Solo play owns `player`; a lobby client owns
 * the concrete simulation side assigned by its seat. Invalid neutral seats fail loudly
 * instead of silently presenting an observer as one of the players.
 */
export function clientSide(net: { localSide: Side } | null): PlayingSide {
  if (!net) return 'player';
  if (net.localSide === 'player' || net.localSide === 'enemy') return net.localSide;
  throw new Error('A client player seat cannot command the neutral side.');
}

export function opponentSide(localSide: PlayingSide): PlayingSide {
  return localSide === 'player' ? 'enemy' : 'player';
}

/** Relate a canonical simulation faction to the person using this client. */
export function clientSideRelation(side: Side, localSide: PlayingSide): ClientSideRelation {
  if (side === 'neutral') return 'neutral';
  return side === localSide ? 'self' : 'opponent';
}

/** Adjective used in player-facing unit and force labels. */
export function clientSideLabel(side: Side, localSide: PlayingSide): 'Your' | 'Opponent' | 'Neutral' {
  const relation = clientSideRelation(side, localSide);
  if (relation === 'self') return 'Your';
  if (relation === 'opponent') return 'Opponent';
  return 'Neutral';
}

/** Always puts the client's force before the opposing force without rotating the board. */
export function clientSideOrder(localSide: PlayingSide): readonly [PlayingSide, PlayingSide] {
  return [localSide, opponentSide(localSide)];
}

/** One status vocabulary for every player interface. Transport may add a pending
 * interval, but it does not create a host/guest or solo/lobby turn model. */
export function clientTurnLabel(
  game: Pick<GameState, 'turn' | 'winner'>,
  localSide: PlayingSide,
  movePending = false,
): 'Draw' | 'Victory' | 'Defeat' | 'Move pending' | 'Your turn' | 'Opponent turn' {
  if (game.winner) {
    if (game.winner === 'draw') return 'Draw';
    return game.winner === localSide ? 'Victory' : 'Defeat';
  }
  if (movePending && game.turn === localSide) return 'Move pending';
  return game.turn === localSide ? 'Your turn' : 'Opponent turn';
}
