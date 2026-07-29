import type { GameEvent, GameState, Move, Piece } from '../core/types';

/** Explicit administrator geometry, kept outside the chess legal-move generator. */
export function adminMoveTargets(game: GameState, pieceId: string): Move[] {
  const piece = game.pieces.find((candidate) => (
    candidate.id === pieceId
    && candidate.alive
    && (candidate.side === 'player' || candidate.side === 'enemy')
    && candidate.side === game.turn
  ));
  if (!piece) return [];
  const targets: Move[] = [];
  for (let y = 0; y < game.size.rows; y += 1) {
    for (let x = 0; x < game.size.cols; x += 1) {
      const occupant = game.pieces.find((candidate) => candidate.alive && candidate.x === x && candidate.y === y);
      if (occupant && (occupant.side === piece.side || occupant.side === 'neutral')) continue;
      targets.push(occupant ? { x, y, capture: occupant.id } : { x, y });
    }
  }
  return targets;
}

export function killUnitForAdmin(
  game: GameState,
  pieceId: string,
): { state: GameState; events: GameEvent[]; killed: Piece | null } {
  const killed = game.pieces.find((piece) => piece.id === pieceId && piece.alive) ?? null;
  if (!killed) return { state: game, events: [], killed: null };
  return {
    state: {
      ...game,
      pieces: game.pieces.map((piece) => piece.id === pieceId ? { ...piece, alive: false } : piece),
    },
    events: [{ kind: 'captured', pieceId, by: 'admin-playtest' }],
    killed,
  };
}
