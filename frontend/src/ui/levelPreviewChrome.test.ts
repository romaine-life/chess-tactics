// @ts-nocheck - node built-ins are untyped in the app tsconfig; vitest runs this
// through esbuild, matching the repository's source-structure guard tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const preview = readFileSync(new URL('./LevelPreviewColumn.tsx', import.meta.url), 'utf8');
const verbRow = readFileSync(new URL('./shared/ChromeVerbRow.tsx', import.meta.url), 'utf8');
const info = readFileSync(new URL('./LevelInfoCompact.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('campaign level preview chrome', () => {
  // The column is ONE box. It used to be a floating heading over three framed slabs with a loose
  // pair of buttons under them, so the page showed through in four places and the name had
  // nothing behind it. Every separation is the divided grid's own rail (ADR-0059).
  it('is one divided box, not a stack of framed slabs', () => {
    expect(preview).toContain('<DividedInnerChromeBox');
    expect(preview).toContain('className="ce-preview-box"');
    expect(preview).toContain('fillRole={CHROME_STRUCTURAL_FILL_ROLE}');
    // The parts are rows of that box, so nothing between them can draw a frame of its own.
    expect(preview).not.toContain('<InnerChromeBox');
    expect(preview).not.toContain('ce-preview-frame');
    expect(preview).not.toContain('ce-force-readout-box');
    expect(preview).not.toContain('ce-preview-actions');
  });

  it('seats the name inside the box, above every other row', () => {
    expect(preview).toMatch(/<ChromeDividedGridRow spans="all" className="ce-preview-name">/);
    expect(preview).toContain('<h2 id={titleId}>{title}</h2>');
    // The name is not one of the compartments the verbs split the box into.
    expect(preview).not.toContain('ce-selected-head');
  });

  // Declared, never handed over rendered: a caller that could pass its own markup could wrap the
  // verbs in a box of its own, which is exactly how they came to sit outside the frame. The shape
  // is the shared one every divided box's closing verbs use — the Aftermath's Back and Continue
  // are the same row — so the column takes it rather than building a second copy of it.
  it('takes its verbs as data and seats each one as a cell of the bottom row', () => {
    expect(preview).toContain('verbs?: readonly LevelPreviewVerb[];');
    expect(preview).toContain('export type LevelPreviewVerb = ChromeVerb;');
    expect(preview).not.toContain('actions?: ReactNode');
    expect(preview).toContain('const columns = verbColumns(verbs);');
    expect(preview).toContain('<ChromeVerbRow verbs={verbs} className="ce-preview-verbs" cellClassName="ce-preview-verb" />');
    // One verb has no neighbour, so its row spans the box rather than being ruled off from
    // nothing — decided by the row itself, never by a count a consumer restates.
    expect(verbRow).toContain("return verbs.length > 1 ? verbs.map(() => 'minmax(0, 1fr)') : ['minmax(0, 1fr)'];");
    expect(verbRow).toMatch(/spans=\{verbs\.length > 1 \? undefined : 'all'\}/);
    // The cell IS the control — the same reset the section box's full-width verbs use, so no
    // registered unit brings a second frame inside the rail that already bounds it.
    expect(verbRow).toContain('`section-box-member-verb ${className ?? \'\'}`.trim()');
    expect(verbRow).toContain("'data-chrome-fill-surface': CHROME_LEAF_FILL_SURFACE");
    expect(preview).not.toContain('<NavButton');
  });

  it('keeps the readout frameless inside the box it is a row of', () => {
    expect(preview).toContain('<LevelInfoCompact level={level} framed={false} />');
    // The consumer may compose an extra class onto the readout, but the registered inner-box
    // primitive and the `ce-level-info` role class are not negotiable. A host that already owns
    // the frame — a divided pane whose rail is this readout's edge — takes `framed={false}` and
    // gets the same class and test id with no second frame; nothing else may drop the box.
    expect(info).toContain('const Frame = framed ? InnerChromeBox : UnframedLevelInfo;');
    expect(info).toMatch(/<Frame\s+className=\{`ce-level-info \$\{className\}`\.trim\(\)\}/);
    expect(info).toContain('framed = true,');
  });

  it('does not restore a local frame on the readout, or pad the box away from its rails', () => {
    expect(css).not.toContain('.ce-preview-frame');
    const infoRule = css.match(/\.ce-preview-col \.ce-level-info\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(infoRule).not.toMatch(/\bborder(?:-image)?\s*:/);
    expect(infoRule).not.toContain('--media-ui-kit-panel-png');
    // The map compartment reaches the frame, and so must every rail; the text rows inset instead.
    const boxRule = css.match(/\.ce-preview-box\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(boxRule).toContain('padding: 0');
  });
});
