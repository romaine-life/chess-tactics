import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Piece } from '../core/types';
import { testLiveUnitCatalog } from '../test/liveUnitCatalog';
import { applyLiveUnitCatalog, resetLiveUnitCatalog } from './unitCatalog';
import {
  PawnPromotionPicker,
  promotionPickerPlacement,
  promotionPickerPositionStyle,
  promotionPickerSideForSeat,
} from './PawnPromotionPicker';

/** A battlefield that stops well short of the window, exactly as the real one stops at the
 * Controls divider. */
const field = { left: 0, top: 84, right: 960, bottom: 800 };
const picker = { width: 296, height: 236 };

const pawn: Piece = {
  id: 'pawn-1',
  type: 'pawn',
  side: 'player',
  x: 0,
  y: 0,
  startY: 1,
  alive: true,
  facing: 'north',
};

describe('PawnPromotionPicker', () => {
  beforeEach(() => applyLiveUnitCatalog(testLiveUnitCatalog({ directionalUrls: true })));
  afterEach(() => resetLiveUnitCatalog());

  it('names the promoting Pawn and exposes every replacement as an anchored dialog', () => {
    const markup = renderToStaticMarkup(
      <PawnPromotionPicker
        piece={pawn}
        choices={['queen', 'rook', 'bishop', 'knight']}
        boardSeat={{ left: 0, top: 0 }}
        boardZoom={2}
        onChoose={() => {}}
        onUndo={() => {}}
      />,
    );

    expect(markup).toContain('aria-label="Pawn promotion"');
    expect(markup).toContain('data-chrome-fill-role="outer"');
    // Four replacements and the Undo that declines all four (ADR-0641) — every leaf in the
    // callout is on the oak, so nothing in it arrives as a bare control.
    expect(markup.match(/data-chrome-fill-surface="hybrid-wood-oak"/g)).toHaveLength(5);
    // The default subject opens while the Pawn is still gliding in, so the eyebrow names the
    // event rather than claiming it has landed (ADR-0559).
    expect(markup).toContain('Pawn promoting');
    expect(markup).not.toContain('Pawn arrived');
    expect(markup).toContain('Choose what this Pawn becomes');
    expect(markup).not.toContain('autofocus');
    for (const label of ['Queen', 'Rook', 'Bishop', 'Knight']) {
      expect(markup).toContain(`aria-label="Promote to ${label}"`);
    }
    // The question is answerable OR withdrawable — a forced choice was the whole defect
    // (ADR-0641). Undo is a text button, not a fifth swatch: it is not a piece.
    expect(markup).toContain('data-testid="undo-promotion-move"');
    expect(markup).toContain('aria-label="Undo this move"');
    expect(markup).toContain('data-chrome-unit="inner-text-button"');
    // It names the price so it cannot be mistaken for the Run's paid Undo, which rewinds a
    // move that really was played.
    expect(markup).toContain('it costs nothing');
    // ...and it carries the phase past the last choice, so its plank is not the Queen's again.
    expect(markup).toContain('--promotion-leaf-index:4');
  });

  it('asks about a Pawn that has not arrived yet when the subject is a queued premove', () => {
    const markup = renderToStaticMarkup(
      <PawnPromotionPicker
        piece={pawn}
        choices={['queen', 'knight']}
        subject="queued"
        boardSeat={{ left: 0, top: 0 }}
        boardZoom={1}
        onChoose={() => {}}
        onUndo={() => {}}
      />,
    );

    expect(markup).toContain('Premove queued');
    expect(markup).toContain('Choose what this Pawn will become');
    expect(markup).not.toContain('Pawn promoting');
    expect(markup).toContain('aria-label="Pawn promotion"');
    // Undo names what it takes back, because a queued step is not a played move — and says the
    // rest of the plan survives, which is what separates it from Escape (ADR-0541/ADR-0641).
    expect(markup).toContain('aria-label="Undo this premove"');
    expect(markup).toContain('The rest of the premove chain stays.');
    expect(markup).not.toContain('Undo this move"');
    // Two choices, so the phase continues from two — the index is the data's, not the DOM's.
    expect(markup).toContain('--promotion-leaf-index:2');
  });

  it('opens toward the board middle and cancels board zoom for its screen-size controls', () => {
    expect(promotionPickerSideForSeat(40)).toBe('left');
    expect(promotionPickerSideForSeat(-40)).toBe('right');
    // The offsets ride the transform, past the inverse scale, so they stay screen pixels at every
    // zoom — and so a stylesheet that gives the chrome frame `position: relative` cannot move them.
    expect(promotionPickerPositionStyle('right', 2)).toMatchObject({
      transform: 'scale(0.5) translate(72px, -156px)',
      transformOrigin: 'top left',
    });
    expect(promotionPickerPositionStyle('left', 0.5)).toMatchObject({
      transform: 'scale(2) translate(calc(-100% - 72px), -156px)',
      transformOrigin: 'top left',
    });
    expect(promotionPickerPositionStyle('left', 1, { side: 'left', left: -368, top: -156 }))
      .toMatchObject({ transform: 'scale(1) translate(-368px, -156px)' });
  });

  it('opens away from the crowded edge, so the Controls panel never covers the question', () => {
    // A Pawn promoting on the right of the view: the callout opens leftward even though the
    // board-space rule would have sent it toward the panel.
    expect(promotionPickerPlacement({ seat: { x: 880, y: 400 }, size: picker, bounds: field }))
      .toEqual({ side: 'left', left: -(72 + 296), top: -156 });
    // ...and on the left of the view it opens rightward.
    expect(promotionPickerPlacement({ seat: { x: 80, y: 400 }, size: picker, bounds: field }))
      .toEqual({ side: 'right', left: 72, top: -156 });
  });

  it('slides the callout back inside the battlefield rather than off its edges', () => {
    // A Pawn promoting high in a narrow view has room on neither side, so the callout is slid
    // inside the region — overlapping its own square beats sitting under the Controls panel.
    const narrow = { left: 0, top: 84, right: 500, bottom: 800 };
    const cornered = promotionPickerPlacement({ seat: { x: 250, y: 120 }, size: picker, bounds: narrow });
    expect(250 + cornered.left).toBe(12);
    expect(120 + cornered.top).toBe(84 + 12);
    expect(250 + cornered.left + picker.width).toBeLessThanOrEqual(narrow.right);

    // A battlefield smaller than the callout itself pins it to the near edges rather than
    // pushing its heading and first choice out past the far ones.
    const cramped = promotionPickerPlacement({
      seat: { x: 120, y: 260 },
      size: picker,
      bounds: { left: 0, top: 84, right: 220, bottom: 300 },
    });
    expect(120 + cramped.left).toBe(12);
    expect(260 + cramped.top).toBe(96);
  });
});
