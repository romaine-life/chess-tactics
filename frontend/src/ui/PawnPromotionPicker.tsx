import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
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

/**
 * Which Pawn the picker is standing beside.
 *
 * `promoting` is a Pawn whose move is committing: the question opens as the move is authored
 * and the sprite is still gliding to the square underneath it (ADR-0559), so the copy names the
 * event rather than claiming the Pawn has landed. `queued` is the ghost of a premoved Pawn —
 * the move is still a prediction, so it asks about a Pawn that WILL arrive (ADR-0541).
 */
export type PromotionPickerSubject = 'promoting' | 'queued';

const SUBJECT_COPY: Record<PromotionPickerSubject, { eyebrow: string; question: string }> = {
  promoting: { eyebrow: 'Pawn promoting', question: 'Choose what this Pawn becomes' },
  queued: { eyebrow: 'Premove queued', question: 'Choose what this Pawn will become' },
};

/** How far the callout stands clear of the Pawn it is asking about, in screen pixels. */
const PICKER_GAP_PX = 72;
/** How far the callout's top rises above the promotion seat, in screen pixels. */
const PICKER_RISE_PX = 156;
/** Breathing room kept between the callout and the edge of the battlefield region. */
const PICKER_EDGE_MARGIN_PX = 12;

/** A screen-space box, in the coordinate system `getBoundingClientRect` reports. */
export interface PromotionPickerBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where the callout ends up: the side it opened toward, and its offset from the seat. */
export interface PromotionPickerPlacement {
  side: PromotionPickerSide;
  /** Screen-pixel offset from the promotion seat to the callout's top-left corner. */
  left: number;
  top: number;
}

/** Keep the callout toward the board's middle instead of pushing it off an outside edge.
 * This is the opening guess, used for the frame before the battlefield edges are measured;
 * `promotionPickerPlacement` then answers the same question in the frame that decides whether
 * the callout is readable — the screen. */
export function promotionPickerSideForSeat(left: number): PromotionPickerSide {
  return left > 0 ? 'left' : 'right';
}

/** Slide a span of `extent` so it lies inside `[min, max]`, giving up on the far edge first. */
function withinBounds(start: number, extent: number, min: number, max: number): number {
  const lowest = min + PICKER_EDGE_MARGIN_PX;
  const highest = max - PICKER_EDGE_MARGIN_PX - extent;
  if (highest <= lowest) return lowest;
  return Math.min(Math.max(start, lowest), highest);
}

/**
 * Place the callout beside its Pawn without letting it leave the battlefield.
 *
 * The board is a free-panned canvas that deliberately bleeds behind the Controls panel and the
 * title bar, so a callout anchored to a board square inherits that bleed: a promotion near the
 * right edge of the view opened its question underneath the opaque panel. The side is therefore
 * chosen from the room the SCREEN has (the board's own middle is irrelevant once the camera has
 * moved), and the resulting box is slid back inside the battlefield region as a last resort —
 * an answerable question that overlaps its own square beats a legible one nobody can click.
 */
export function promotionPickerPlacement({
  seat,
  size,
  bounds,
}: {
  /** The promotion seat, in screen pixels. */
  seat: { x: number; y: number };
  /** The callout's own box, in screen pixels. */
  size: { width: number; height: number };
  /** The region the battlefield owns, in screen pixels. */
  bounds: PromotionPickerBox;
}): PromotionPickerPlacement {
  const fitsLeft = seat.x - PICKER_GAP_PX - size.width >= bounds.left + PICKER_EDGE_MARGIN_PX;
  const fitsRight = seat.x + PICKER_GAP_PX + size.width <= bounds.right - PICKER_EDGE_MARGIN_PX;
  const roomier: PromotionPickerSide = seat.x - bounds.left >= bounds.right - seat.x ? 'left' : 'right';
  const side = roomier === 'left'
    ? (fitsLeft || !fitsRight ? 'left' : 'right')
    : (fitsRight || !fitsLeft ? 'right' : 'left');
  const wantedLeft = side === 'left' ? seat.x - PICKER_GAP_PX - size.width : seat.x + PICKER_GAP_PX;
  return {
    side,
    left: withinBounds(wantedLeft, size.width, bounds.left, bounds.right) - seat.x,
    top: withinBounds(seat.y - PICKER_RISE_PX, size.height, bounds.top, bounds.bottom) - seat.y,
  };
}

/**
 * The picker sits in transformed board space so it follows camera pan, but its inverse scale
 * keeps the controls at one legible screen size. Everything after that scale is therefore stated
 * in screen pixels, so the gap from the Pawn stays stable at every zoom.
 *
 * The offset rides the `transform` deliberately: `left`/`right`/`top` would only mean what this
 * component intends while the box computes to `position: absolute`, and the registered inner
 * chrome frame it wears sets `position: relative` on any box carrying a surface fill. A translate
 * from the element's own static position — the zero-size anchor seated on the promotion square —
 * places it identically either way.
 */
export function promotionPickerPositionStyle(
  side: PromotionPickerSide,
  boardZoom: number,
  placement: PromotionPickerPlacement | null = null,
): CSSProperties {
  const zoom = Math.max(0.25, boardZoom);
  // Before the callout has been measured, `-100%` is its own width — the intended placement,
  // stated without needing to know how wide the box came out.
  const x = placement
    ? `${placement.left}px`
    : side === 'left' ? `calc(-100% - ${PICKER_GAP_PX}px)` : `${PICKER_GAP_PX}px`;
  const y = `${placement ? placement.top : -PICKER_RISE_PX}px`;
  return {
    transform: `scale(${1 / zoom}) translate(${x}, ${y})`,
    transformOrigin: 'top left',
  };
}

/** The battlefield region the callout must stay inside: everything the board owns up to the
 * Controls divider, which is exactly the box the chrome does not cover. */
function promotionPickerBounds(anchor: HTMLElement): PromotionPickerBox {
  const region = anchor.closest('.skirmish-field') ?? anchor.closest('.tileset-view-stage');
  if (region) {
    const box = region.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  }
  return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
}

function samePlacement(a: PromotionPickerPlacement | null, b: PromotionPickerPlacement): boolean {
  return a !== null && a.side === b.side && a.left === b.left && a.top === b.top;
}

export function PawnPromotionPicker({
  piece,
  choices,
  subject = 'promoting',
  boardSeat,
  boardZoom,
  onChoose,
}: {
  piece: Piece;
  choices: readonly PromotionPieceType[];
  subject?: PromotionPickerSubject;
  boardSeat: { left: number; top: number };
  boardZoom: number;
  onChoose: (type: PromotionPieceType) => void;
}): ReactElement {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<PromotionPickerPlacement | null>(null);
  const side = placement?.side ?? promotionPickerSideForSeat(boardSeat.left);
  const palette = paletteForSide(piece.side, piece.palette);
  const copy = SUBJECT_COPY[subject];

  // Measured on every render rather than on a dependency list: the seat travels across the screen
  // whenever the camera moves, and a pan is not a prop of this component. Re-measuring is two
  // rects, and the equality guard means an unchanged placement re-renders nothing.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const picker = anchor?.querySelector<HTMLElement>('.skirmish-promotion-picker');
    if (!anchor || !picker) return;
    const seatBox = anchor.getBoundingClientRect();
    const next = promotionPickerPlacement({
      seat: { x: seatBox.left, y: seatBox.top },
      size: { width: picker.offsetWidth, height: picker.offsetHeight },
      bounds: promotionPickerBounds(anchor),
    });
    setPlacement((current) => (samePlacement(current, next) ? current : next));
  });

  return (
    <div
      ref={anchorRef}
      className="skirmish-promotion-picker-anchor"
      style={{ left: boardSeat.left, top: boardSeat.top }}
    >
      <InnerChromeBox
        className={`skirmish-promotion-picker is-${side}`}
        fillRole="outer"
        style={promotionPickerPositionStyle(side, boardZoom, placement)}
        role="dialog"
        aria-modal="true"
        aria-live="assertive"
        aria-label="Pawn promotion"
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <header className="skirmish-promotion-picker-heading">
          <span className="skirmish-eyebrow">{copy.eyebrow}</span>
          <strong>{copy.question}</strong>
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
