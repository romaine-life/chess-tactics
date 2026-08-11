import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ChromeDividedGridRow,
  DividedInnerChromeBox,
  chromeDividedGridTopology,
} from './ChromeDividedGrid';

const styleCss = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');

function cssRule(selector: string): string {
  const start = styleCss.indexOf(`${selector} {`);
  expect(start, `style.css should contain ${selector}`).toBeGreaterThanOrEqual(0);
  return styleCss.slice(start, styleCss.indexOf('}', start) + 1);
}

describe('divided inner chrome topology', () => {
  it('derives every rail and junction from column lines with a scrollbar gutter', () => {
    const topology = chromeDividedGridTopology(3, true);

    expect(topology.trackCount).toBe(4);
    expect(topology.verticalLines).toEqual([2, 3, 4]);
    expect(topology.rowNodes).toEqual([
      { line: 1, sides: 'nes', inlineBoundary: 'frame-start' },
      { line: 2, sides: 'nesw', inlineBoundary: 'internal' },
      { line: 3, sides: 'nesw', inlineBoundary: 'internal' },
      { line: 4, sides: 'nsw', inlineBoundary: 'internal' },
    ]);
    expect(topology.topNodes.map(({ line, sides }) => ({ line, sides }))).toEqual([
      { line: 2, sides: 'esw' },
      { line: 3, sides: 'esw' },
      { line: 4, sides: 'esw' },
    ]);
    expect(topology.bottomNodes.map(({ line, sides }) => ({ line, sides }))).toEqual([
      { line: 2, sides: 'new' },
      { line: 3, sides: 'new' },
      { line: 4, sides: 'new' },
    ]);
  });

  it('tees row rails into both frame sides when no scrollbar gutter exists', () => {
    const topology = chromeDividedGridTopology(2, false);

    expect(topology.trackCount).toBe(2);
    expect(topology.verticalLines).toEqual([2]);
    expect(topology.horizontalEndBoundary).toBe('frame-end');
    expect(topology.rowNodes).toEqual([
      { line: 1, sides: 'nes', inlineBoundary: 'frame-start' },
      { line: 2, sides: 'nesw', inlineBoundary: 'internal' },
      { line: 3, sides: 'nsw', inlineBoundary: 'frame-end' },
    ]);
  });

  it('renders one topology-owned node at each intersection and no divider-owned endpoints', () => {
    const html = renderToStaticMarkup(
      <DividedInnerChromeBox columns={['80px', '1fr', '72px']} scroll>
        <ChromeDividedGridRow><span>A</span><span>B</span><span>C</span></ChromeDividedGridRow>
        <ChromeDividedGridRow><span>D</span><span>E</span><span>F</span></ChromeDividedGridRow>
      </DividedInnerChromeBox>,
    );

    expect(html.match(/data-chrome-divider-junctions="none"/g)).toHaveLength(4);
    expect(html.match(/data-chrome-junction-role="inner"/g)).toHaveLength(10);
    expect(html.match(/data-chrome-junction-sides="nesw"/g)).toHaveLength(2);
    expect(html).not.toContain('data-chrome-divider-junctions="endpoints"');
  });

  // A divided row beside a spanning one still has a vertical rail, and that rail BEGINS or ENDS
  // at the boundary between them. The boundary used to draw nothing there — reasoning that a
  // four-way crossing would be an ornament — which left the segment starting out of thin air with
  // no cap, the exact uncapped rail this module exists to make unsayable. It is a tee.
  it('tees a vertical rail into the boundary where its neighbour spans every column', () => {
    const html = renderToStaticMarkup(
      <DividedInnerChromeBox columns={['minmax(0, 1fr)', 'minmax(0, 1fr)']}>
        <ChromeDividedGridRow spans="all"><span>name</span></ChromeDividedGridRow>
        <ChromeDividedGridRow><span>left</span><span>right</span></ChromeDividedGridRow>
      </DividedInnerChromeBox>,
    );

    // The rail runs SOUTH from the boundary into the divided row, with the horizontal rail east
    // and west of it — and reaches the bottom frame, where the block boundary caps it northward.
    expect(html.match(/data-chrome-junction-sides="esw"/g)).toHaveLength(1);
    expect(html.match(/data-chrome-junction-sides="new"/g)).toHaveLength(1);
    expect(html).not.toContain('data-chrome-junction-sides="nesw"');
  });

  it('tees the other way when the divided row comes first', () => {
    const html = renderToStaticMarkup(
      <DividedInnerChromeBox columns={['minmax(0, 1fr)', 'minmax(0, 1fr)']}>
        <ChromeDividedGridRow><span>left</span><span>right</span></ChromeDividedGridRow>
        <ChromeDividedGridRow spans="all"><span>verb</span></ChromeDividedGridRow>
      </DividedInnerChromeBox>,
    );

    // The rail arrives from the NORTH and stops; the top frame caps its other end southward.
    expect(html.match(/data-chrome-junction-sides="new"/g)).toHaveLength(1);
    expect(html.match(/data-chrome-junction-sides="esw"/g)).toHaveLength(1);
    expect(html).not.toContain('data-chrome-junction-sides="nesw"');
  });

  it('caps nothing on a boundary between two rows that both span every column', () => {
    const html = renderToStaticMarkup(
      <DividedInnerChromeBox columns={['minmax(0, 1fr)', 'minmax(0, 1fr)']}>
        <ChromeDividedGridRow spans="all"><span>name</span></ChromeDividedGridRow>
        <ChromeDividedGridRow spans="all"><span>body</span></ChromeDividedGridRow>
      </DividedInnerChromeBox>,
    );

    // Only the horizontal rail's own two ends against the side frames.
    expect(html.match(/data-chrome-junction-sides="nes"/g)).toHaveLength(1);
    expect(html.match(/data-chrome-junction-sides="nsw"/g)).toHaveLength(1);
    expect(html).not.toContain('data-chrome-junction-sides="esw"');
    expect(html).not.toContain('data-chrome-junction-sides="new"');
    expect(html).not.toContain('data-chrome-junction-sides="nesw"');
  });

  it('refuses a scrollbar gutter beside a spanning row rather than shipping it uncapped', () => {
    expect(() => renderToStaticMarkup(
      <DividedInnerChromeBox columns={['minmax(0, 1fr)']} scroll>
        <ChromeDividedGridRow spans="all"><span>name</span></ChromeDividedGridRow>
        <ChromeDividedGridRow><span>option</span></ChromeDividedGridRow>
      </DividedInnerChromeBox>,
    )).toThrow('has no installed "sw" junction atom');
  });

  it('centers perimeter tees on the frame rail instead of the frame outer edge', () => {
    expect(styleCss).toMatch(
      /--chrome-divided-grid-boundary-node-offset:\s*calc\(var\(--chrome-divided-grid-reach\) \/ 2\);/,
    );
    expect(cssRule(
      '.chrome-divided-grid__junction[data-chrome-grid-inline-boundary="frame-start"]',
    )).toContain(
      'calc(-1 * var(--chrome-divided-grid-boundary-node-offset))',
    );
    expect(cssRule(
      '.chrome-divided-grid__junction[data-chrome-grid-inline-boundary="frame-end"]',
    )).toContain(
      'var(--chrome-divided-grid-boundary-node-offset)',
    );
    expect(cssRule(
      '.chrome-divided-grid__junction[data-chrome-grid-block-boundary="frame-start"]',
    )).toContain(
      'calc(-1 * var(--chrome-divided-grid-boundary-node-offset))',
    );
    expect(cssRule(
      '.chrome-divided-grid__junction[data-chrome-grid-block-boundary="frame-end"]',
    )).toContain(
      'var(--chrome-divided-grid-boundary-node-offset)',
    );
  });

  it('rejects an unpartitioned grid instead of silently inventing tracks', () => {
    expect(() => chromeDividedGridTopology(0, false))
      .toThrow('A divided chrome grid requires at least one content column.');
  });
});
