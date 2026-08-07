import type { CSSProperties, ReactElement } from 'react';
import type { Piece, PromotionPieceType } from '../core/types';
import { paletteForSide, pieceSpritePath } from '../core/pieces';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ChromeButton } from './shared/ChromeButton';
import { InnerChromeBox } from './shared/ChromeBox';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';

const PROMOTION_LABEL: Record<PromotionPieceType, string> = {
  queen: 'Queen',
  rook: 'Rook',
  bishop: 'Bishop',
  knight: 'Knight',
};

export type PromotionPickerSide = 'left' | 'right';

/** Keep the callout toward the board's middle instead of pushing it off an outside edge. */
export function promotionPickerSideForSeat(left: number): PromotionPickerSide {
  return left > 0 ? 'left' : 'right';
}

/**
 * The picker sits in transformed board space so it follows camera pan, but its inverse scale
 * keeps the controls at one legible screen size. Offsets are divided by the same zoom so the
 * visual gap from the Pawn remains stable too.
 */
export function promotionPickerPositionStyle(
  side: PromotionPickerSide,
  boardZoom: number,
): CSSProperties {
  const zoom = Math.max(0.25, boardZoom);
  const sideOffset = 72 / zoom;
  return {
    top: -156 / zoom,
    transform: `scale(${1 / zoom})`,
    transformOrigin: side === 'left' ? 'top right' : 'top left',
    ...(side === 'left' ? { right: sideOffset } : { left: sideOffset }),
  };
}

export function PawnPromotionPicker({
  piece,
  choices,
  boardSeat,
  boardZoom,
  onChoose,
}: {
  piece: Piece;
  choices: readonly PromotionPieceType[];
  boardSeat: { left: number; top: number };
  boardZoom: number;
  onChoose: (type: PromotionPieceType) => void;
}): ReactElement {
  const side = promotionPickerSideForSeat(boardSeat.left);
  const palette = paletteForSide(piece.side, piece.palette);

  return (
    <div
      className="skirmish-promotion-picker-anchor"
      style={{ left: boardSeat.left, top: boardSeat.top }}
    >
      <InnerChromeBox
        className={`skirmish-promotion-picker is-${side}`}
        fillRole="outer"
        style={promotionPickerPositionStyle(side, boardZoom)}
        role="dialog"
        aria-modal="true"
        aria-live="assertive"
        aria-label="Pawn promotion"
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <header className="skirmish-promotion-picker-heading">
          <span className="skirmish-eyebrow">Pawn arrived</span>
          <strong>Choose what this Pawn becomes</strong>
        </header>
        <div className="skirmish-promotion-options">
          {choices.map((type, index) => (
            <ChromeButton
              unit="inner-asset-swatch"
              key={type}
              data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
              className={chromeUnitClassNames('inner-asset-swatch', 'app-header-button', 'skirmish-promotion-option')}
              style={{ ['--promotion-leaf-index' as string]: index }}
              onClick={() => onChoose(type)}
              aria-label={`Promote to ${PROMOTION_LABEL[type]}`}
              title={`Promote to ${PROMOTION_LABEL[type]}`}
            >
              <img src={pieceSpritePath(type, palette, piece.facing)} alt="" draggable={false} />
              <span>{PROMOTION_LABEL[type]}</span>
            </ChromeButton>
          ))}
        </div>
      </InnerChromeBox>
    </div>
  );
}
