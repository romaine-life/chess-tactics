import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TileGrid } from './TileGrid';

describe('TileGrid', () => {
  it('uses originCells for board centering independently of rendered cells', () => {
    const renderedCells = [
      { key: 'playable', x: 0, y: 0 },
      { key: 'sparse-scenery', x: 10, y: 0 },
    ];

    const anchoredMarkup = renderToStaticMarkup(
      <TileGrid cells={renderedCells} originCells={[{ x: 0, y: 0 }]} />,
    );
    const sceneryCenteredMarkup = renderToStaticMarkup(<TileGrid cells={renderedCells} />);

    expect(anchoredMarkup).toContain('--board-origin-left:0px');
    expect(sceneryCenteredMarkup).toContain('--board-origin-left:-240px');
  });

  it('keeps flat editor overlays above terrain even at negative scenic depth', () => {
    const markup = renderToStaticMarkup(
      <TileGrid
        cells={[{ key: 'north-west-scenery', x: -3, y: -2 }]}
        renderCellOverlay={() => <span className="selection-proof" />}
      />,
    );

    expect(markup).toContain('class="tileset-generated-board-overlay-cell"');
    expect(markup).toContain('z-index:9995');
    expect(markup).toContain('class="selection-proof"');
  });
});
