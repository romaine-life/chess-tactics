// @ts-nocheck - node built-ins are untyped in the app tsconfig; vitest runs this
// through esbuild, matching the repository's source-structure guard tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const preview = readFileSync(new URL('./LevelPreviewColumn.tsx', import.meta.url), 'utf8');
const info = readFileSync(new URL('./LevelInfoCompact.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('campaign level preview chrome', () => {
  it('uses the registered inner-box primitive for both preview boxes', () => {
    expect(preview).toContain('<InnerChromeBox className="ce-preview-frame">');
    expect(info).toContain('<InnerChromeBox className="ce-level-info"');
  });

  it('does not restore either deprecated local preview frame', () => {
    expect(css).not.toContain('.ce-preview-frame::after {');

    const previewRule = css.match(/\.ce-preview-frame\s*\{([^}]*)\}/)?.[1] ?? '';
    const infoRule = css.match(/\.ce-preview-col \.ce-level-info\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(previewRule).not.toMatch(/\bborder(?:-image)?\s*:/);
    expect(previewRule).not.toContain('--media-ui-explore-frames-panel-line-png');
    expect(infoRule).not.toMatch(/\bborder(?:-image)?\s*:/);
    expect(infoRule).not.toContain('--media-ui-kit-panel-png');
  });

  it('aligns preview actions to the same full-width edges as the boxes above', () => {
    const actionsRule = css.match(/\.ce-preview-actions\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(actionsRule).toContain('padding: 0 0 8px');
    expect(actionsRule).not.toContain('padding: 0 4px');
  });
});
