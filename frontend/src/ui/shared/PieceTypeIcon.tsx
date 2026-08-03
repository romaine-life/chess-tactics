import type { ReactElement } from 'react';
import {
  paletteForSide,
  pieceSpritePath,
  type PlayablePieceType,
} from '../../core/pieces';
import { AlphaBoundIcon } from './AlphaBoundIcon';

/**
 * A unit identifying itself in chrome faces the reader, so this icon uses the
 * south-facing frame rather than the board's player deployment facing — the same
 * choice the run card faces make. A north-facing sprite shows the reader a back.
 */
const CHROME_PIECE_FACING = 'south';

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
      data-unit-facing={CHROME_PIECE_FACING}
      src={pieceSpritePath(type, paletteForSide('player'), CHROME_PIECE_FACING)}
      draggable={false}
    />
  );
}
