// @ts-nocheck — node built-ins are untyped in the app tsconfig (see settingsRailContinuity.test.ts);
// vitest runs this via esbuild with no typecheck, so the fs/url reads are fine at runtime.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A rail tab that cannot be CLICKED is the one failure this family can ship looking perfect.
//
// .settings-screen is a full-screen placement layer that keeps unused canvas click-through, so
// every panel standing on it must opt back into pointer input. Two classes did that —
// .settings-frame and .menu-dest-col — and every rail wore one of them by hand. Converting Run
// preparation to the shared primitive (ADR-0558) replaced its hand-assembled .menu-dest-col
// column with a bare .apparatus-rail-column, and Current Run / Start New Run rendered at the
// right size, in the right seat, wearing the right oak and the right marks, hovered as buttons,
// reported `disabled: false` — and swallowed every click, because the whole column inherited
// pointer-events: none. Nothing in the DOM said "broken"; the tabs were simply not there to hit.
//
// The primitive owns the opt-in now, so no consumer has to remember. This guard pins it, and
// pins the pairing that makes it necessary — if .settings-screen ever stops being click-through
// the rule is harmless, but while it IS, the rail cannot go without it.

const css = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');
const uiDir = fileURLToPath(new URL('..', import.meta.url));

/** The body of a top-level rule whose selector list is exactly `selector`. */
function ruleBody(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `no \`${selector} {\` rule in style.css`).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('\n}', at));
}

describe('a menu-language rail column is interactive by construction', () => {
  it('.settings-screen keeps unused canvas click-through', () => {
    expect(ruleBody('.settings-screen')).toMatch(/pointer-events:\s*none;/);
  });

  it('.apparatus-rail-column opts its buttons back into pointer input', () => {
    expect(ruleBody('.apparatus-rail-column')).toMatch(/pointer-events:\s*auto;/);
  });

  it('the shared opt-in classes a rail may ALSO wear are still declared', () => {
    // .settings-frame / .menu-dest-col remain the opt-in for non-rail panels (detail columns,
    // action columns). The rail no longer depends on them, but they must not quietly vanish.
    expect(css).toMatch(/\.settings-frame,\s*\.menu-dest-col,\s*\.utility-screen\s*\{\s*pointer-events:\s*auto;\s*\}/);
  });

  it('every ApparatusRailColumn consumer relies on the primitive, not a per-surface rule', () => {
    // The point of moving the opt-in into the primitive is that a rail can be mounted with a
    // className the pointer-events rules have never heard of. This asserts such a rail exists —
    // i.e. the fix is load-bearing and not incidentally covered by .menu-dest-col everywhere.
    const files = readdirSync(uiDir).filter((f) => f.endsWith('.tsx'));
    const bare: string[] = [];
    for (const f of files) {
      const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
      for (const m of src.matchAll(/<ApparatusRailColumn[\s\S]{0,240}?>/g)) {
        const className = m[0].match(/className=(?:"([^"]*)"|\{([^}]*)\})/);
        const text = className ? (className[1] ?? className[2]) : '';
        if (!/settings-frame|menu-dest-col/.test(text)) bare.push(`${f}: ${text.trim() || '(none)'}`);
      }
    }
    expect(bare.length, 'no rail mounts without a legacy opt-in class — is the primitive rule still load-bearing?').toBeGreaterThan(0);
  });
});
