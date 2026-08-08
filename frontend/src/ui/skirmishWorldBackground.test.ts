import { describe, expect, it } from 'vitest';
import { shouldLoadSkirmishWorldBackground, skirmishScreenClassName } from './Skirmish';
import { readFileSync } from 'node:fs';

const skirmishSource = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');
const skirmishShellSource = readFileSync(new URL('./SkirmishShell.tsx', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('Skirmish world background ownership', () => {
  it('waits for the actual board choice before requesting ordinary ambience', () => {
    expect(shouldLoadSkirmishWorldBackground(false, false)).toBe(false);
  });

  it('does not request ordinary ambience behind a complete pre-drawn board', () => {
    expect(shouldLoadSkirmishWorldBackground(true, true)).toBe(false);
    expect(skirmishShellSource).toContain(
      "className={`skirmish-screen${persistentViewportArtwork ? ' has-persistent-viewport-artwork' : ''} ${className}`.trim()}",
    );
    expect(styleCss).toMatch(
      /\.skirmish-screen\.is-predrawn-board::before\s*\{[\s\S]*?content:\s*none;/,
    );
  });

  it('keeps ordinary ambience for a settled legacy board', () => {
    expect(shouldLoadSkirmishWorldBackground(true, false)).toBe(true);
  });
});

describe('Skirmish screen class composition', () => {
  it('keeps the pre-drawn rule when a Run phase contributes its own screen class', () => {
    // Regression: Deployment and Sectio used to REPLACE the pre-drawn rule with their own
    // class, so both painted the ordinary world vista behind a plate owning every pixel.
    expect(skirmishScreenClassName('run-deployment-screen', true))
      .toBe('run-deployment-screen is-predrawn-board');
  });

  it('carries a Run phase class alone on a legacy board', () => {
    expect(skirmishScreenClassName('run-deployment-screen', false)).toBe('run-deployment-screen');
  });

  it('applies the pre-drawn rule with no phase class', () => {
    expect(skirmishScreenClassName(undefined, true)).toBe('is-predrawn-board');
    expect(skirmishScreenClassName(undefined, false)).toBe('');
  });

  it('never lets a construction path opt back into the default world raster', () => {
    // `undefined` is SkirmishShell's opt-IN signal, so no screenStyle may be passed as
    // `runDeployment ? undefined : …`. Every path resolves to a style or an explicit null.
    expect(skirmishSource).not.toMatch(/screenStyle[:=]\s*\{?runDeployment\s*\?\s*undefined/);
    expect(skirmishSource).toContain('const resolvedScreenStyle = screenStyle ?? null;');
  });
});
