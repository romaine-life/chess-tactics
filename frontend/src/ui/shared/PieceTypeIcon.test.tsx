import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultFacingForSide, paletteForSide, pieceSpritePath } from '../../core/pieces';
import { testLiveUnitCatalog } from '../../test/liveUnitCatalog';
import { applyLiveUnitCatalog, resetLiveUnitCatalog } from '../unitCatalog';
import { PieceTypeIcon } from './PieceTypeIcon';

describe('Piece type icon', () => {
  beforeEach(() => applyLiveUnitCatalog(testLiveUnitCatalog({ directionalUrls: true })));
  afterEach(() => resetLiveUnitCatalog());

  it('renders the accepted player-side battlefield frame without duplicating the piece name', () => {
    const markup = renderToStaticMarkup(<PieceTypeIcon type="rook" />);
    expect(markup).toContain('class="alpha-bound-icon battlefield-unit-icon utility-piece-icon"');
    expect(markup).toContain('data-piece-type="rook"');
    expect(markup).toContain(pieceSpritePath('rook', paletteForSide('player'), 'south'));
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('icon-rook');
    expect(markup).not.toContain('Rook');
  });

  it('faces the reader rather than taking the player side\'s up-board facing', () => {
    // A filter row is not a board. `defaultFacingForSide('player')` is north because a unit
    // ON a board faces the enemy; borrowing it here shows the reader the piece's back.
    const south = pieceSpritePath('rook', paletteForSide('player'), 'south');
    const north = pieceSpritePath('rook', paletteForSide('player'), defaultFacingForSide('player'));
    expect(south).not.toBe(north);
    expect(renderToStaticMarkup(<PieceTypeIcon type="rook" />)).toContain(south);
  });
});
