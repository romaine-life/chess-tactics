// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reference = readFileSync(new URL('./PredrawnReference.tsx', import.meta.url), 'utf8');
const levelEditor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');

describe('pre-drawn reference navigation', () => {
  it('keeps the editor return in the typed title-bar lane outside capture mode', () => {
    const visibleChrome = reference.match(/\{!captureMode \? \(([\s\S]*?)\) : null\}/)?.[1] ?? '';

    expect(visibleChrome).toContain('<TitleBarControlContribution');
    expect(visibleChrome).toContain('ariaLabel="Pre-drawn reference navigation"');
    expect(visibleChrome).toContain("id: 'predrawn-reference-back'");
    expect(visibleChrome).toContain("kind: 'navigation'");
    expect(visibleChrome).toContain("presentation: 'return'");
    expect(visibleChrome).toContain("label: '‹ Back to editor'");
    expect(visibleChrome).toContain('destination: returnHref');
    expect(visibleChrome).toContain("testId: 'predrawn-reference-back'");
  });

  it('opens the reference as same-tab app navigation with an exact editor return target', () => {
    const control = levelEditor.match(/<NavButton[\s\S]*?data-testid="open-predrawn-reference"[\s\S]*?<\/NavButton>/)?.[0] ?? '';

    expect(control).toContain('predrawnReferenceHref(');
    expect(control).toContain('levelEditorHrefForDocument(window.location.href');
    expect(control).not.toContain('target="_blank"');
  });
});
