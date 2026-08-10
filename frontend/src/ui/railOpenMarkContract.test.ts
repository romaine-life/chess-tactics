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

  it('is passed by every rail that expands a panel', () => {
    expect(mainMenu).toContain('expanded={openDest !== null && shellDest(tab.href) === openDest}');
    expect(enchiridion).toContain('expanded={openSection === candidate}');
    expect(strategikon).toContain('expanded={openSection === item.section}');
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
