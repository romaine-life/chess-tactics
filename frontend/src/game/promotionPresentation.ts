import type { GameState, Move, Piece } from '../core/types';
import { applyMove, promotionRuleForMove } from '../core/rules';

/** The canvas compositor's authored glide for a player-controlled unit. */
export const PLAYER_MOVE_PRESENTATION_MS = 360;

/** Promotion choices appear only after the arriving Pawn has finished that glide. */
export const PROMOTION_CHOICE_REVEAL_MS = PLAYER_MOVE_PRESENTATION_MS;

/**
 * Project the physical arrival half of a promotion without committing chess state.
 *
 * `applyMove` remains the one atomic rules operation. This helper borrows its exact
 * movement/capture/facing projection for presentation, then restores the mover's Pawn
 * identity until the player chooses the replacement. In netplay this is deliberately
 * client-local: only the ordered relay may mutate the canonical board.
 */
export function promotionArrivalPieces(
  game: GameState,
  pieceId: string,
  move: Move,
): readonly Piece[] {
  const pawn = game.pieces.find((piece) => piece.id === pieceId && piece.alive);
  if (!pawn || pawn.type !== 'pawn' || !promotionRuleForMove(game, pawn, move)) return game.pieces;

  const arrived = applyMove(game, pieceId, move, { stats: false }).state.pieces;
  return arrived.map((piece) => (
    piece.id === pieceId ? { ...piece, type: 'pawn' as const } : piece
  ));
}
