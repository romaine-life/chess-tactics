// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('canonical interactive board viewport aspect', () => {
  it('uses one 4:3 token for gameplay and the selected-level live preview', () => {
    expect(styleCss).toMatch(
      /--board-view-aspect-width:\s*4;[\s\S]*?--board-view-aspect-height:\s*3;[\s\S]*?--board-view-aspect:\s*var\(--board-view-aspect-width\) \/ var\(--board-view-aspect-height\);/,
    );
    expect(styleCss).toMatch(
      /\.skirmish-screen:not\(\.level-editor-screen\) \.skirmish-board-frame\s*\{[\s\S]*?aspect-ratio:\s*var\(--board-view-aspect\);/,
    );
    expect(styleCss).toMatch(
      /\.ce-preview-frame\s*\{[\s\S]*?aspect-ratio:\s*var\(--board-view-aspect\);/,
    );
  });

  it('fits gameplay inside both available axes and compensates the canonical preview rail', () => {
    expect(styleCss).toMatch(
      /\.skirmish-field\s*\{[\s\S]*?container-type:\s*size;[\s\S]*?place-items:\s*center;/,
    );
    expect(styleCss).toContain(
      'calc(100cqh * var(--board-view-aspect-width) / var(--board-view-aspect-height))',
    );
    expect(styleCss).toContain(
      '(100cqi - 2 * var(--ce-preview-rail))',
    );
  });
});
