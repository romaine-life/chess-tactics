// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const skirmishHud = readFileSync(new URL('./SkirmishHud.tsx', import.meta.url), 'utf8');
const portraitEditor = readFileSync(new URL('./PortraitEditor.tsx', import.meta.url), 'utf8');
const stepper = readFileSync(new URL('./shared/Stepper.tsx', import.meta.url), 'utf8');
const chromeBox = readFileSync(new URL('./shared/ChromeBox.tsx', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

const buttonBlocks = (source: string): string[] => source.match(/<button\b[\s\S]*?<\/button>/g) ?? [];

function buttonUsing(fragment: string): string {
  const block = buttonBlocks(skirmishHud).find((candidate) => candidate.includes(fragment));
  expect(block, `expected Skirmish HUD button using ${fragment}`).toBeDefined();
  return block!;
}

function expectChromeUnit(block: string, unit: string): void {
  expect(block).toContain(`data-chrome-unit="${unit}"`);
  expect(block).toMatch(new RegExp(`chromeUnitClassNames\\(\\s*'${unit}'`));
}

describe('Skirmish chrome hierarchy', () => {
  it('uses the registered outer panel and explicit inner boxes', () => {
    expect(skirmishHud).toContain('<OuterChromeBox');
    expect(skirmishHud).toContain('chromeConsumer="skirmish-hud"');
    expect(skirmishHud).toContain('className={`skirmish-hud ${className}`.trim()}');
    expect(skirmishHud).toContain('<OuterChromeHeader title="Controls">');
    expect(skirmishHud).not.toContain('<h2>Controls</h2>');
    expect(chromeBox).toContain('data-chrome-unit="outer-panel"');
    expect(chromeBox).toContain("chromeUnitClassNames('outer-panel', 'le-outer-panel', className)");
    expect(chromeBox).toContain("titled ? 'le-outer-panel-content--titled' : ''");

    expect(portraitEditor).toMatch(/<InnerChromeBox className=\{`unit-portrait/);
    expect(skirmishHud).toContain('<InnerChromeBox className="unit-portrait unit-portrait--hud"');
    expect(skirmishHud).toContain('<InnerChromeBox className="skirmish-service-record">');

    expect(styleCss).not.toMatch(/\.unit-portrait\s*\{[^}]*border-image\s*:/);
    expect(styleCss).not.toMatch(/\.skirmish-service-record\s*\{[^}]*border-image\s*:/);
  });

  it('maps every Board View control to its existing semantic unit', () => {
    const zoomStepper = skirmishHud.match(/<Stepper\b[\s\S]*?\/>/)?.[0];
    expect(zoomStepper).toBeDefined();
    expect(zoomStepper).toContain('value={Math.round(zoom * 100)}');
    expect(zoomStepper).toContain('onDecrease={() => setZoom(zoom - 0.1)}');
    expect(zoomStepper).toContain('onIncrease={() => setZoom(zoom + 0.1)}');
    expect(stepper).toContain('data-chrome-unit="inner-minus-key"');
    expect(stepper).toContain("chromeUnitClassNames('inner-minus-key', 'settings-chrome-button'");
    expect(stepper).toContain('data-chrome-unit="inner-plus-key"');
    expect(stepper).toContain("chromeUnitClassNames('inner-plus-key', 'settings-chrome-button'");
    expect(skirmishHud).not.toContain('skirmish-zoom-readout');
    expectChromeUnit(buttonUsing('onClick={resetView}'), 'inner-text-button');

    for (const overlay of ['showMoves', 'showEnemyAttacks', 'showBlocked', 'showPromotionZones', 'showGrid']) {
      const block = buttonUsing(`toggleOverlay('${overlay}')`);
      expectChromeUnit(block, 'inner-text-button');
      expect(block).toContain("&& 'active'");
    }
  });

  it('maps scenario actions to existing text-button and tool-square units', () => {
    const returnBlock = skirmishHud.match(/<NavButton\b[\s\S]*?<\/NavButton>/)?.[0];
    expect(returnBlock).toBeDefined();
    expectChromeUnit(returnBlock!, 'inner-text-button');

    expectChromeUnit(buttonUsing('data-testid="restart-level"'), 'inner-tool-square');
    expectChromeUnit(buttonUsing('data-testid="new-skirmish"'), 'inner-tool-square');

    const resign = buttonUsing('data-testid="resign"');
    expectChromeUnit(resign, 'inner-text-button');
    expect(resign).toContain("'danger'");
    expect(styleCss).not.toMatch(/\.skirmish-resign-button[^\{]*\{[^}]*border-image(?:-source)?\s*:/);
  });

  it('maps tabs, promotion choices, and command-grid cells to existing units', () => {
    const promotion = buttonUsing('choosePromotion(type)');
    const tab = buttonUsing('setTab(t.id)');
    const commandKey = buttonUsing('runSkirmishShortcut(key)');

    expectChromeUnit(promotion, 'inner-asset-swatch');
    expectChromeUnit(tab, 'inner-text-button');
    expect(tab).toContain("tab === t.id && 'active'");
    expectChromeUnit(commandKey, 'inner-text-button');
    expect(commandKey).toContain("active && 'active is-active'");

    expect(skirmishHud).toMatch(/<span key=\{key\} data-chrome-unit="inner-text-button" className=\{chromeUnitClassNames\('inner-text-button', 'app-header-button', 'skirmish-grid-key', 'is-empty'\)\}/);
    expect(styleCss).not.toMatch(/\.skirmish-hud-tab\s*\{[^}]*border-image\s*:/);
    expect(styleCss).not.toMatch(/\.skirmish-hud \.app-header-button\s*\{/);
  });

  it('keeps the genuinely missing editable-field class behind the owner approval gate', () => {
    expect(stepper).toContain('<span className="settings-stepper-field">');
    expect(stepper).not.toMatch(/data-chrome-unit="inner-field"/);
  });
});
