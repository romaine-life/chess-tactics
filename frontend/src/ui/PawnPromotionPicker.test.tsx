import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Piece } from '../core/types';
import { testLiveUnitCatalog } from '../test/liveUnitCatalog';
import { applyLiveUnitCatalog, resetLiveUnitCatalog } from './unitCatalog';
import {
  PawnPromotionPicker,
  promotionPickerPositionStyle,
  promotionPickerSideForSeat,
} from './PawnPromotionPicker';

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
      />,
    );

    expect(markup).toContain('aria-label="Pawn promotion"');
    expect(markup).toContain('data-chrome-fill-role="outer"');
    expect(markup.match(/data-chrome-fill-surface="hybrid-wood-oak"/g)).toHaveLength(4);
    // The default subject opens while the Pawn is still gliding in, so the eyebrow names the
    // event rather than claiming it has landed (ADR-0556).
    expect(markup).toContain('Pawn promoting');
    expect(markup).not.toContain('Pawn arrived');
    expect(markup).toContain('Choose what this Pawn becomes');
    expect(markup).not.toContain('autofocus');
    for (const label of ['Queen', 'Rook', 'Bishop', 'Knight']) {
      expect(markup).toContain(`aria-label="Promote to ${label}"`);
    }
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
      />,
    );

    expect(markup).toContain('Premove queued');
    expect(markup).toContain('Choose what this Pawn will become');
    expect(markup).not.toContain('Pawn promoting');
    expect(markup).toContain('aria-label="Pawn promotion"');
  });

  it('opens toward the board middle and cancels board zoom for its screen-size controls', () => {
    expect(promotionPickerSideForSeat(40)).toBe('left');
    expect(promotionPickerSideForSeat(-40)).toBe('right');
    expect(promotionPickerPositionStyle('right', 2)).toMatchObject({
      left: 36,
      top: -78,
      transform: 'scale(0.5)',
      transformOrigin: 'top left',
    });
  });
});
