// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainMenu = readFileSync(new URL('./MainMenu.tsx', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const playMenu = readFileSync(new URL('./PlayMenu.tsx', import.meta.url), 'utf8');
const settings = readFileSync(new URL('./Settings.tsx', import.meta.url), 'utf8');
const editor = readFileSync(new URL('./CampaignEditor.tsx', import.meta.url), 'utf8');
const lobbies = readFileSync(new URL('./Lobbies.tsx', import.meta.url), 'utf8');
const settingsControls = readFileSync(new URL('./shared/SettingsControls.tsx', import.meta.url), 'utf8');

function expectTaggedLegacyControls(source: string, legacyClass: string, helper = 'chromeUnitClassNames('): void {
  const tags = source.match(new RegExp(`<(?:button|NavButton|div)\\b[\\s\\S]*?${legacyClass}[\\s\\S]*?>`, 'g')) ?? [];
  expect(tags.length, `expected controls using ${legacyClass}`).toBeGreaterThan(0);
  for (const tag of tags) {
    expect(tag, `${legacyClass} bypasses registered inner chrome`).toContain('data-chrome-unit=');
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

    expect(modeTab).toContain('data-chrome-unit="inner-box"');
    expect(modeTab).toContain("chromeUnitClassNames('inner-box', 'settings-tab main-menu-mode-tab'");
    expect(modeTab).not.toMatch(/className=\{`settings-tab main-menu-mode-tab/);
  });

  it('owns the main-menu icon footprint without changing shared settings tabs', () => {
    expect(styleCss).toMatch(/\.settings-tab\.main-menu-mode-tab\s*\{[\s\S]*?--settings-tab-icon-size:\s*44px;[\s\S]*?overflow:\s*hidden;/);
    expect(styleCss).toMatch(/\.main-menu-mode-tab \.settings-tab-icon\s*\{[\s\S]*?overflow:\s*visible;[\s\S]*?position:\s*relative;/);
    expect(styleCss).toMatch(/\.main-menu-mode-tab \.settings-tab-icon img\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?left:\s*50%;[\s\S]*?top:\s*calc\(50% - \.5px\);[\s\S]*?transform:\s*translate\(calc\(-50% \+ 0px\), -50%\);/);
  });

  it('rejects legacy button boxes anywhere in a menu destination', () => {
    for (const source of [mainMenu, playMenu, settings, editor]) expectTaggedLegacyControls(source, 'settings-tab main-menu-mode-tab');
    expectTaggedLegacyControls(playMenu, 'ce-link-button');
    expectTaggedLegacyControls(editor, 'ce-link-button');
    expectTaggedLegacyControls(lobbies, 'utility-button', 'utilityButtonClassNames(');
    expect(lobbies).toMatch(/utilityButtonClassNames[\s\S]*?chromeUnitClassNames\('inner-text-button'/);

    expect(settingsControls).toContain("chromeUnitClassNames('inner-text-button'");
    expect(settingsControls.match(/data-chrome-unit="inner-text-button"/g)).toHaveLength(3);
  });

  it('registers selectable levels and settings option rows as inner boxes', () => {
    expect(settingsControls).toMatch(/function SettingsRow[\s\S]*?data-chrome-unit="inner-box"[\s\S]*?chromeUnitClassNames\('inner-box', 'settings-row'/);
    expect(playMenu).toMatch(/className=\{chromeUnitClassNames\('inner-box', 'settings-row campaign-level-row'/);
    expect(editor).toMatch(/data-chrome-unit="inner-box"[\s\S]*?className=\{chromeUnitClassNames\('inner-box', 'settings-row ce-editor-level-row'/);
    expect(playMenu).not.toContain('<section className="settings-row"');
    expect(playMenu.match(/data-chrome-unit="inner-box" className=\{chromeUnitClassNames\('inner-box', 'settings-row'\)\}/g)?.length).toBeGreaterThan(0);
    expect(playMenu.match(/data-chrome-unit="inner-box" className=\{chromeUnitClassNames\('inner-box', 'settings-row-thumb'\)\}/g)?.length).toBe(3);
    expect(editor).toContain("data-chrome-unit=\"inner-box\" className={chromeUnitClassNames('inner-box', 'settings-row-thumb')}");

    expect(cssBlock('.settings-row')).not.toMatch(/border-image|baseline-stone-blue/);
    expect(cssBlock('.settings-row-thumb')).not.toMatch(/border-image|panel\.png/);
  });
});
