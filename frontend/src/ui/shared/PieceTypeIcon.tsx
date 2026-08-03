import type { ReactElement } from 'react';
import {
  paletteForSide,
  pieceSpritePath,
  type PlayablePieceType,
} from '../../core/pieces';
import { AlphaBoundIcon } from './AlphaBoundIcon';

/**
 * One accepted player-side battlefield sprite fitted by its visible alpha bounds.
 * Filters and pickers reuse the same live unit pixels as Battle; they do not
 * substitute a generic chess glyph for the gameplay piece.
 *
 * It faces SOUTH — at the reader — rather than taking the player side's board facing.
 * `defaultFacingForSide('player')` is north because a player unit faces up-board at the
 * enemy; that is a fact about a unit standing on a board. A filter row is not a board, and
 * a piece there showing the reader its back is a sprite that has forgotten where it is.
 */
export function PieceTypeIcon({
  type,
  className = '',
}: {
  type: PlayablePieceType;
  className?: string;
}): ReactElement {
  return (
    <AlphaBoundIcon
      className={`battlefield-unit-icon utility-piece-icon ${className}`.trim()}
      data-piece-type={type}
      src={pieceSpritePath(type, paletteForSide('player'), 'south')}
      draggable={false}
    />
  );
}
