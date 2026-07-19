// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const skirmishHud = readFileSync(new URL('./SkirmishHud.tsx', import.meta.url), 'utf8');
const portraitEditor = readFileSync(new URL('./PortraitEditor.tsx', import.meta.url), 'utf8');
const stepper = readFileSync(new URL('./shared/Stepper.tsx', import.meta.url), 'utf8');
const chromeBox = readFileSync(new URL('./shared/ChromeBox.tsx', import.meta.url), 'utf8');
const appTitleBar = readFileSync(new URL('./shell/AppTitleBar.tsx', import.meta.url), 'utf8');
const chromeRuntime = readFileSync(new URL('./chromeFamilyRuntime.ts', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const skirmish = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');

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
  it('keeps the HUD content scroller vertical-only despite inner-atom overhang', () => {
    expect(styleCss).toMatch(/\.skirmish-hud-panel\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/);
  });

  it('does not expose board overdraw as empty horizontal page scroll', () => {
    expect(styleCss).toMatch(/@media \(max-width: 860px\)[\s\S]*?\.skirmish-screen\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/);
  });

  it('uses one typed control lane and one branched shell divider (ADR-0100/0104)', () => {
    expect(appTitleBar).toContain('chrome-family-surface chrome-rails-offscreen');
    expect(appTitleBar).not.toContain('chromeCorners');
    expect(appTitleBar).not.toContain('cornerPreviewClass');
    expect(appTitleBar).toContain('<span className="app-shell-outer-divider" aria-hidden="true" />');
    expect(appTitleBar).toContain('app-shell-rail-junction--persistent-divider');
    expect(appTitleBar).toMatch(/<div className="app-titlebar-control-lane">[^]*?app-titlebar-contribution-target[^]*?app-titlebar-persistent-divider[^]*?<HeaderAccountCluster/);
    expect(appTitleBar).not.toContain('app-titlebar-trailing-menu');
    expect(appTitleBar).toContain('app-shell-rail-junction--control-branch');
    expect(appTitleBar).toContain('app-shell-rail-junction--right-continuation');
    expect(styleCss).toMatch(/\.settings-header-frame\.app-titlebar\s*\{[\s\S]*?align-content:\s*stretch;/);
    expect(styleCss).toMatch(/\.app-titlebar-control-lane\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?block-size:\s*calc\(var\(--app-header-h\) - var\(--titlebar-rule-h\)\);[\s\S]*?gap:\s*var\(--titlebar-control-gap\);[\s\S]*?margin-block:\s*calc\(-1 \* var\(--ds-titlebar-inset\)\) 0;/);
    expect(styleCss).toMatch(/:root\s*\{\s*--skirmish-rail-w:\s*clamp\(176px, 30vw, 300px\);/);
    expect(styleCss).toMatch(/\.app-shell-titlebar\.settings-header-frame\s*\{[\s\S]*?--ds-titlebar-inset:\s*6px;[\s\S]*?padding-block:\s*var\(--ds-titlebar-inset\);/);
    expect(chromeRuntime).toContain('.app-shell-outer-divider::before');
    expect(chromeRuntime).toContain('.app-shell-rail-junction--persistent-divider');
    expect(chromeRuntime).toContain('anchor(--app-titlebar-persistent-divider left)');
    expect(chromeRuntime).toContain('right: calc(var(--skirmish-rail-w) - var(--le-chrome-outer-rail-w) / 2');
    expect(styleCss).toMatch(/\.app-titlebar-persistent-divider\s*\{[\s\S]*?anchor-name:\s*--app-titlebar-persistent-divider;/);
    expect(chromeRuntime).toContain('.app-shell-rail-junction--control-branch');
    expect(chromeRuntime).toContain('border-width: ${outerRailWidth}px ${outerRailWidth}px 0;');
    expect(chromeRuntime).toContain('border-width: 0 ${outerRailWidth}px ${outerRailWidth}px ${outerRailWidth}px !important;');
    expect(chromeRuntime).toContain('url("${outerFrame.atomOverlay.tl}"), url("${outerFrame.atomOverlay.tr}"), url("${outerFrame.atomOverlay.bl}")');
    expect(chromeRuntime).toContain('url("${outerFrame.atomOverlay.bl}"), url("${outerFrame.atomOverlay.br}")');
    expect(styleCss).toMatch(/\.settings-header-frame\s*\{[\s\S]*?--titlebar-control-gap:\s*var\(--ds-space-2\);[\s\S]*?column-gap:\s*var\(--titlebar-control-gap\)/);
    expect(styleCss).toMatch(/\.app-titlebar-control-lane\s*\{[\s\S]*?justify-self:\s*end;[\s\S]*?margin-inline-end:\s*calc\(var\(--titlebar-control-gap\) - var\(--titlebar-pad-inline\)\)/);
    expect(styleCss).toMatch(/\.app-titlebar-contributed-controls\s*\{[\s\S]*?gap:\s*var\(--titlebar-control-gap\)/);
  });

  it('registers every level-specific title-bar status box as inner chrome', () => {
    const centerSlot = skirmish.match(/<TitleBarSlot region="center">([\s\S]*?)<\/TitleBarSlot>/)?.[1] ?? '';
    expect(centerSlot.match(/<TitleBarStatus\b/g)).toHaveLength(3);
    expect(centerSlot).not.toMatch(/<div\b[^>]*skirmish-status-chip/);
    expect(skirmish).toContain("import { TitleBarStatus } from './shell/TitleBarControls';");
  });

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
