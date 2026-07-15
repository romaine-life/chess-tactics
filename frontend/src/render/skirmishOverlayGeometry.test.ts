// @ts-nocheck — node built-ins are untyped in the app tsconfig; Vitest runs
// this source-contract check through esbuild.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

function ruleBody(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `style.css should contain a ${selector} rule`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('Skirmish tactical overlay geometry', () => {
  it('derives its painted and interactive diamond from the canonical board cell variables', () => {
    const body = ruleBody('.skirmish-board-cell-hit');

    expect(body).toMatch(/width:\s*var\(--iso-tile-width\)/);
    expect(body).toMatch(/height:\s*var\(--iso-tile-height\)/);
    expect(body).toMatch(/left:\s*0/);
    expect(body).toMatch(/top:\s*0/);
    expect(body).not.toMatch(/(?:width|height|left|top):\s*-?\d+px/);
    expect(body).not.toMatch(/transform:/);
  });
});
