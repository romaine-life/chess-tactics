// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
// The open mark is a FAMILY behaviour: every rail that expands a panel draws it, draws it from
// the shared intent helper, and draws it through the primitive. A surface that hand-rolls the
// mark, or binds it to the committed address instead of the intended one, would look right on
// the screen it was built on and be a beat late everywhere else — which is the exact defect the
// mark exists to fix (see shared/railOpenIntent.ts).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const mainMenu = read('./MainMenu.tsx');
const enchiridion = read('./Enchiridion.tsx');
const strategikon = read('./Strategikon.tsx');
const railTab = read('./shared/ApparatusRailTab.tsx');
const styleCss = read('../style.css');

describe('rail open mark', () => {
  it('is drawn by the primitive, once, and nowhere else', () => {
    expect(railTab).toContain('<span className="settings-tab-open-mark" aria-hidden="true">›</span>');
    for (const [name, source] of [['MainMenu', mainMenu], ['Enchiridion', enchiridion], ['Strategikon', strategikon]]) {
      expect(source, `${name} draws its own open mark instead of taking the primitive's`)
        .not.toContain('settings-tab-open-mark');
    }
  });

  it('is passed only by the rails whose panel can be COLLAPSED under an active tab', () => {
    expect(mainMenu).toContain('expanded={openDest !== null && shellDest(tab.href) === openDest}');
    expect(enchiridion).toContain('expanded={openSection === candidate}');
    expect(strategikon).toContain('expanded={openSection === item.section}');
  });

  it('is DERIVED everywhere else, so a rail cannot be built without one', () => {
    // It used to default to false, which made the mark a thing each call site had to remember:
    // three rails passed it and four did not, and all four of those open a panel right beside the
    // tab (Settings, the Play choices, the editor's workspace collections, the collection rail).
    // Hunting for the ones that forgot is not a review anyone should have to do, so the tab works
    // it out — from its own address where it has one, from its selected state where it does not.
    const railTab = readFileSync(new URL('./shared/ApparatusRailTab.tsx', import.meta.url), 'utf8');
    expect(railTab).toContain('const marksOpen = expanded ?? (to ? isRailTabAddress(intentPath, railTabRoutePath(to)) : active);');
    expect(railTab).not.toContain('expanded = false');
    // The derivation reads the INTENT address, so the mark still lands on the press rather than a
    // crossfade later — the whole point of ADR-0561.
    expect(railTab).toContain('const intentPath = useLocationIntentPath();');
    // And the helper it reads must survive a node render, since that is where component tests run.
    expect(readFileSync(new URL('./shared/railOpenIntent.ts', import.meta.url), 'utf8'))
      .toContain("if (typeof window === 'undefined') return '/';");
  });

  it('reads the intended address, not the committed one', () => {
    for (const [name, source] of [['MainMenu', mainMenu], ['Enchiridion', enchiridion], ['Strategikon', strategikon]]) {
      expect(source, `${name} must resolve its open tab through the shared intent helper`)
        .toContain('useOpenRailTab(');
    }
    // The committed address still drives what is RENDERED — the destination, the pane, the
    // scene slot — so the crossfade is untouched by any of this.
    expect(mainMenu).toContain('const dest = shellDest(path);');
    expect(strategikon).toContain('const { base, section, reference } = strategikonAddress(path);');
  });

  it('is seated out of flow, so gaining it cannot move a tab’s icon or label', () => {
    const rule = styleCss.slice(styleCss.indexOf('.settings-tab > span.settings-tab-open-mark'));
    expect(rule.slice(0, rule.indexOf('}'))).toContain('position: absolute');
    // Its containing block is the tab itself, not whatever ancestor happens to be positioned.
    const tabRule = styleCss.slice(styleCss.indexOf('\n.settings-tab {'));
    expect(tabRule.slice(0, tabRule.indexOf('\n}'))).toContain('position: relative');
    // The label nudge matches the mark too, so every band that states it must be overridden —
    // otherwise the mark rides the label's optical column off the tab's trailing edge.
    const nudges = styleCss.match(/\.settings-tab > span:not\(\.settings-tab-icon\)/g) ?? [];
    const centrings = styleCss.match(/\.settings-tab > span\.settings-tab-open-mark/g) ?? [];
    expect(centrings.length).toBe(nudges.length);
  });
});
