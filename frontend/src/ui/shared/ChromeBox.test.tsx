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
 * The line under CONTROLS is the head block's own row boundary against the panel body (ADR-0589).
 * It belongs to the head, not to whatever the head happens to carry — so every shape draws it,
 * including the shape that carries nothing.
 *
 * That last one shipped without it. ADR-0589 enumerated two heads, a strip of compartments and a
 * single control, and took the bolted forged strip off the title element on the strength of that.
 * The Run borrows this panel with its whole activity in the BODY, so its head is only the name, and
 * it came out as bare marble under the title with no rule anywhere on it.
 */
describe('the Controls head closes with the block\'s own rail', () => {
  it('rules the line under the name when the head is only its name', () => {
    const html = renderToStaticMarkup(<ShellControlsPanel><p>Run activity</p></ShellControlsPanel>);

    expect(html).toContain('chrome-divided-grid shell-controls-head');
    expect(html).toContain('shell-controls-head-foot');
    expect(rails(html)).toBe(1);
    // Nothing stands under the name, so the block has no vertical to cross that rail — and a cap
    // with no rail arriving at it is a stray atom sitting on the panel's frame.
    expect(html).not.toContain('chrome-divided-grid__vertical-rail');
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
