import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShellControlsPanel } from './ChromeBox';

function rails(html: string): number {
  return html.match(/chrome-divided-grid__horizontal-rail/g)?.length ?? 0;
}

function junctions(html: string): string[] {
  return [...html.matchAll(/data-chrome-junction-sides="([a-z]+)"/g)].map(([, sides]) => sides);
}

/**
 * Every Controls head closes on a line under the name, and which line it is says what the boundary
 * IS (ADR-0589). Between the name and a strip of compartments inside the head it is the block's own
 * inner rail. Between the HEAD and the panel body it is the panel's standard outer section break —
 * the same divider the panel lays under a `fixed` section.
 *
 * The head that is only a name shipped with neither. ADR-0589 enumerated two heads, a strip and a
 * single control, and took the bolted forged strip off the title element on the strength of that.
 * The Run borrows this panel with its whole activity in the BODY, so its head is only the name, and
 * it came out as bare marble under the title with no rule anywhere on it.
 */
describe('the Controls head closes with a line under the name', () => {
  it('breaks on the standard outer divider when the head is only its name', () => {
    const html = renderToStaticMarkup(<ShellControlsPanel><p>Run activity</p></ShellControlsPanel>);

    expect(html).toContain('le-control-divider-host shell-controls-break');
    expect(html).toContain('data-chrome-divider-role="outer"');
    expect(html).toContain('data-chrome-divider-junctions="endpoints"');
    // No block: a block rules the lines BETWEEN a head's members, and this head has none. Laying
    // one anyway put the strip's inner weight on a boundary that is a panel section break.
    expect(html).not.toContain('chrome-divided-grid shell-controls-head');
    expect(rails(html)).toBe(0);
    expect(junctions(html)).toEqual([]);
  });

  it('rules the same line under a head holding one undivided control', () => {
    const html = renderToStaticMarkup(
      <ShellControlsPanel titleContent={<button type="button">Layer</button>}><p>Editor</p></ShellControlsPanel>,
    );

    expect(rails(html)).toBe(1);
    // One column has no boundary between compartments, so it closes at the name and has no foot.
    expect(html).not.toContain('shell-controls-head-foot');
    expect(junctions(html)).toEqual([]);
  });

  it('closes a strip of compartments at both ends, teeing every vertical into the boundary', () => {
    const html = renderToStaticMarkup(
      <ShellControlsPanel
        titleSections={['unit', 'roster', 'log'].map((id) => ({ id, content: <span>{id}</span> }))}
      >
        <p>Battle</p>
      </ShellControlsPanel>,
    );

    expect(rails(html)).toBe(2);
    expect(html).toContain('shell-controls-head-foot');
    // Two internal verticals, each beginning at the rail under the name and ending at the foot.
    expect(junctions(html).filter((sides) => sides === 'esw')).toHaveLength(2);
    expect(junctions(html).filter((sides) => sides === 'new')).toHaveLength(2);
  });
});
