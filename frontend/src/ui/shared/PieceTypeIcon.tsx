import type { ReactElement } from 'react';
import {
  defaultFacingForSide,
  paletteForSide,
  pieceSpritePath,
  type PlayablePieceType,
} from '../../core/pieces';
import { AlphaBoundIcon } from './AlphaBoundIcon';

/**
 * One accepted player-side battlefield sprite fitted by its visible alpha bounds.
 * Filters and pickers reuse the same live unit pixels as Battle; they do not
 * substitute a generic chess glyph for the gameplay piece.
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
      src={pieceSpritePath(type, paletteForSide('player'), defaultFacingForSide('player'))}
      draggable={false}
    />
  );
}
