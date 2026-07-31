import { describe, expect, it } from 'vitest';
import { shouldLoadSkirmishWorldBackground } from './Skirmish';
import { readFileSync } from 'node:fs';

const skirmishSource = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('Skirmish world background ownership', () => {
  it('waits for the actual board choice before requesting ordinary ambience', () => {
    expect(shouldLoadSkirmishWorldBackground(false, false)).toBe(false);
  });

  it('does not request ordinary ambience behind a complete pre-drawn board', () => {
    expect(shouldLoadSkirmishWorldBackground(true, true)).toBe(false);
    expect(skirmishSource).toContain(
      "className={screenPredrawnBackgroundActive ? 'is-predrawn-board' : ''}",
    );
    expect(skirmishSource).toContain(
      "className={`skirmish-screen${runSelfInspectionOpen ? ' is-run-self-inspection-open' : ''} ${className}`.trim()}",
    );
    expect(styleCss).toMatch(
      /\.skirmish-screen\.is-predrawn-board::before\s*\{[\s\S]*?content:\s*none;/,
    );
  });

  it('keeps ordinary ambience for a settled legacy board', () => {
    expect(shouldLoadSkirmishWorldBackground(true, false)).toBe(true);
  });
});
