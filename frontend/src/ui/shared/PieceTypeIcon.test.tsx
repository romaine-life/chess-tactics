import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    expect(markup).toContain(`/api/unit-sprites/${'1'.repeat(64)}.png`);
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('icon-rook');
    expect(markup).not.toContain('Rook');
  });
});
