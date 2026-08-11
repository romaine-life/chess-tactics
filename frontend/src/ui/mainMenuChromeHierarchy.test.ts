// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainMenu = readFileSync(new URL('./MainMenu.tsx', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const playMenu = readFileSync(new URL('./PlayMenu.tsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('./Settings.tsx', import.meta.url), 'utf8');
const editor = readFileSync(new URL('./CampaignEditor.tsx', import.meta.url), 'utf8');
const warEditor = readFileSync(new URL('./WarEditor.tsx', import.meta.url), 'utf8');
const editorLevelRow = readFileSync(new URL('./shared/EditorLevelRow.tsx', import.meta.url), 'utf8');
const lobbies = readFileSync(new URL('./Lobbies.tsx', import.meta.url), 'utf8');
const settingsControls = readFileSync(new URL('./shared/SettingsControls.tsx', import.meta.url), 'utf8');
const apparatusRailTab = readFileSync(new URL('./shared/ApparatusRailTab.tsx', import.meta.url), 'utf8');
const chromeSurfacePolicy = readFileSync(new URL('./shared/chromeSurfacePolicy.ts', import.meta.url), 'utf8');
const actionList = readFileSync(new URL('./shared/ActionList.tsx', import.meta.url), 'utf8');
const chromeBox = readFileSync(new URL('./shared/ChromeBox.tsx', import.meta.url), 'utf8');

function expectTaggedLegacyControls(source: string, legacyClass: string, helper = 'chromeUnitClassNames('): void {
  const tags = source.match(new RegExp(`<(?:button|NavButton|ChromeButton|ChromeNavButton|div)\\b[\\s\\S]*?${legacyClass}[\\s\\S]*?>`, 'g')) ?? [];
  expect(tags.length, `expected controls using ${legacyClass}`).toBeGreaterThan(0);
  for (const tag of tags) {
    expect(tag.includes('data-chrome-unit=') || tag.includes('unit='), `${legacyClass} bypasses registered inner chrome`).toBe(true);
    expect(tag, `${legacyClass} bypasses the chrome registry helper`).toContain(helper);
  }
}

function cssBlock(selector: string): string {
  const start = styleCss.indexOf(`${selector} {`);
  const end = styleCss.indexOf('\n}', start);
  return start >= 0 && end >= 0 ? styleCss.slice(start, end + 2) : '';
}

describe('Main Menu chrome hierarchy', () => {
  it('registers every mode button as a canonical inner-box consumer', () => {
    const modeTab = mainMenu.match(/function ModeTab[\s\S]*?^}/m)?.[0] ?? '';

    expect(modeTab).toContain('<ApparatusRailTab');
    expect(apparatusRailTab).toContain('<ChromeNavButton unit="inner-box"');
    expect(apparatusRailTab).toMatch(/chromeUnitClassNames\(\s*'inner-box',\s*'settings-tab main-menu-mode-tab',/);
    expect(modeTab).not.toMatch(/className=\{`settings-tab main-menu-mode-tab/);
  });

  it('uses the registered title-oak surface for every semantic tab in the main-menu shell', () => {
    // The surface is declared ONCE on the shared rail primitive, so every menu-language
    // rail (Main Menu, Settings, Editor, Play, Enchiridion, Strategikon) is painted from
    // the same source and a re-skin is a single edit. A per-screen literal is the drift.
    expect(chromeSurfacePolicy).toContain("export const CHROME_LEAF_FILL_SURFACE = 'hybrid-wood-oak'");
    expect(apparatusRailTab).toContain('export const APPARATUS_RAIL_FILL_SURFACE = CHROME_LEAF_FILL_SURFACE');
    expect(apparatusRailTab).toContain('data-chrome-tab-fill-surface={APPARATUS_RAIL_FILL_SURFACE}');
    expect(mainMenu).not.toContain('data-chrome-tab-fill-surface=');
    expect(mainMenu).not.toContain('STONE_SURFACE');
    // Reveal gating is NOT this screen's job any more. The menu used to decode the oak
    // surface and the brand shield itself, which is why the bar revealed whole here and
    // nowhere else; both are shell art on the one cold-load ladder now (ADR-0369).
    expect(mainMenu).not.toContain('ui-surfaces-hybrid-wood-oak-png');
    expect(mainMenu).not.toContain('buttonArt');
    expect(mainMenu).not.toContain('reportReady');
  });

  it('owns the main-menu icon footprint without changing shared settings tabs', () => {
    expect(styleCss).toMatch(/\.settings-tab\.main-menu-mode-tab\s*\{[\s\S]*?--settings-tab-icon-size:\s*44px;[\s\S]*?overflow:\s*hidden;/);
    expect(styleCss).toMatch(/\.main-menu-mode-tab \.settings-tab-icon\s*\{[\s\S]*?overflow:\s*visible;[\s\S]*?position:\s*relative;/);
    // `top: 50%`, NOT the `calc(50% - .5px)` this used to pin. That nudge existed to keep the
    // raster on whole logical pixels and bought nothing — 44/64 is already a fractional scale,
    // so the art resamples either way — while costing the symmetry the eye reads: it put 6px
    // above the mark and 7px below it on every button in the rail (ADR-0560).
    expect(styleCss).toMatch(/\.main-menu-mode-tab \.settings-tab-icon img\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?left:\s*50%;[\s\S]*?top:\s*50%;[\s\S]*?transform:\s*translate\(calc\(-50% \+ 0px\), -50%\);/);
    expect(styleCss).not.toMatch(/\.main-menu-mode-tab \.settings-tab-icon img\s*\{[^}]*top:\s*calc\(50% - \.5px\)/);
    // The shared rail button centres its own icon+label row. Both rail heights were computed
    // against a 2px border while the panel-line border-image resolves to 7px a side, so a 40px
    // icon row sat in a 30px content box and overflowed the full 10px downward — every mark and
    // label 5px under its button's centre line, on every rail in the family (ADR-0560).
    expect(styleCss).toMatch(/\.settings-tab\s*\{[\s\S]*?align-content:\s*center;/);
  });

  it('rejects legacy button boxes anywhere in a menu destination', () => {
    expect(mainMenu).toContain('<ApparatusRailTab');
    expect(playMenu).toContain('<ApparatusRailTab');
    // The primitive is the ONLY place a rail tab is assembled — Settings and the Editor mount
    // <ApparatusRailTab> now, and check-rail-tab-primitive.mjs fails the build on any file that
    // names these classes in markup again (ADR-0558). So this asserts the one remaining
    // assembly is registered, and that the converted surfaces carry none.
    // The primitive assembles the tab across several lines now, so match its registered call
    // rather than a single-tag regex: chromeUnitClassNames + a registered unit on both hosts.
    expect(apparatusRailTab).toMatch(/chromeUnitClassNames\(\s*'inner-box',/);
    expect(apparatusRailTab).toContain('<ChromeNavButton unit="inner-box"');
    expect(apparatusRailTab).toContain('data-chrome-unit="inner-box"');
    for (const source of [settings, editor]) {
      expect(source).not.toMatch(/className=\{?.*?(?<![\w-])settings-tab(?![\w-])/);
      expect(source).toContain('<ApparatusRailTab');
    }
    expectTaggedLegacyControls(playMenu, 'ce-link-button');
    for (const source of [editor, warEditor]) expectTaggedLegacyControls(source, 'ce-link-button');
    expectTaggedLegacyControls(lobbies, 'utility-button', 'utilityButtonClassNames(');
    expect(lobbies).toMatch(/utilityButtonClassNames[\s\S]*?chromeUnitClassNames\('inner-text-button'/);

    expect(settingsControls.match(/<InnerText(?:Nav)?Button\b/g)).toHaveLength(3);
    expect(settingsControls).not.toMatch(/<(?:button|NavButton)\b[^>]*settings-chrome-button/);
  });

  it('registers selectable levels and settings option rows as inner boxes', () => {
    // SettingsRow no longer hand-tags the unit. It composes the shared InnerChromeBox, which is
    // what registers `inner-box` and carries the borrowed-fill plumbing the Editor column uses.
    // A row that is a MEMBER of a SettingsGroup takes no frame — the group's box is already the
    // frame and already wears the marble — so the class list is built before the element and the
    // unframed branch returns a plain section instead.
    expect(settingsControls).toMatch(/function SettingsRow[\s\S]*?`settings-row [\s\S]*?<InnerChromeBox/);
    expect(settingsControls).toContain('if (!framed) return <section className={classes} role={role}>{body}</section>;');
    expect(chromeBox).toContain('data-chrome-unit="inner-box"');
    expect(playMenu.match(/<ActionList\b/g)).toHaveLength(2);
    expect(playMenu).toContain('className: `campaign-level-row ${!unlocked ? \'is-disabled\' : \'\'}`.trim()');
    expect(editorLevelRow).toContain('<ActionListRow item={{');
    expect(actionList).toContain('<InnerChromeBox');
    expect(actionList).toContain('settings-row action-list-row');
    expect(actionList).toContain('className={`settings-row-thumb');
    expect(playMenu).not.toContain('<section className="settings-row"');
    expect(playMenu).toContain('<SettingsRow title="No standalone levels"');
    expect(playMenu).not.toMatch(/\.settings-row\s*\+\s*\.settings-row/);

    expect(cssBlock('.settings-row')).not.toMatch(/border-image|baseline-stone-blue/);
    expect(cssBlock('.settings-row-thumb')).not.toMatch(/border-image|panel\.png/);
  });
});
