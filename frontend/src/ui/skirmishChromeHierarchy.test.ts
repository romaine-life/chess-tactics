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
const portraitPreload = readFileSync(new URL('../art/preload.ts', import.meta.url), 'utf8');
const runBattleUndoButton = readFileSync(new URL('./RunBattleUndoButton.tsx', import.meta.url), 'utf8');

const buttonBlocks = (source: string): string[] => source.match(/<(?:button|ChromeButton)\b[\s\S]*?<\/(?:button|ChromeButton)>/g) ?? [];
const navButtonBlocks = (source: string): string[] => source.match(/<(?:NavButton|ChromeNavButton)\b[\s\S]*?<\/(?:NavButton|ChromeNavButton)>/g) ?? [];

function buttonUsing(fragment: string): string {
  const block = buttonBlocks(skirmishHud).find((candidate) => candidate.includes(fragment));
  expect(block, `expected Skirmish HUD button using ${fragment}`).toBeDefined();
  return block!;
}

function navButtonUsing(fragment: string): string {
  const block = navButtonBlocks(skirmishHud).find((candidate) => candidate.includes(fragment));
  expect(block, `expected Skirmish HUD NavButton using ${fragment}`).toBeDefined();
  return block!;
}

function expectChromeUnit(block: string, unit: string): void {
  expect(block.includes(`data-chrome-unit="${unit}"`) || block.includes(`unit="${unit}"`)).toBe(true);
  expect(block).toMatch(new RegExp(`chromeUnitClassNames\\(\\s*'${unit}'`));
}

describe('Skirmish chrome hierarchy', () => {
  it('keeps the HUD content scroller vertical-only despite inner-atom overhang', () => {
    expect(styleCss).toMatch(/\.skirmish-hud-panel\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/);
  });

  it('does not expose board overdraw as empty horizontal page scroll', () => {
    expect(styleCss).toMatch(/@media \(max-width: 860px\)[\s\S]*?\.skirmish-screen\s*\{[\s\S]*?overflow-x:\s*hidden;[\s\S]*?overflow-y:\s*auto;/);
  });

  it('reserves the fixed title bar before stacked mobile workspaces', () => {
    expect(styleCss).toMatch(/@media \(max-width: 860px\)[\s\S]*?\.skirmish-screen\s*\{[\s\S]*?grid-template-rows:\s*var\(--app-header-h\) minmax\(520px, 62vh\) auto;/);
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
    expect(styleCss).toMatch(/\.app-titlebar > \.app-titlebar-fill\s*\{[\s\S]*?calc\(var\(--le-outer-fill-box-bottom, 0px\) \+ 1px\)/);
  });

  it('registers every level-specific title-bar status box as inner chrome', () => {
    const titleStart = skirmish.indexOf('const skirmishTitleBarContent = playableSurfaceReady ? (');
    const titleEnd = skirmish.indexOf('const titleBarContent =', titleStart);
    const titleContent = titleStart >= 0 && titleEnd > titleStart ? skirmish.slice(titleStart, titleEnd) : '';
    expect(titleContent.match(/<TitleBarStatus\b/g)).toHaveLength(3);
    expect(titleContent).not.toMatch(/<div\b[^>]*skirmish-status-chip/);
    expect(skirmish).toMatch(/import \{[^}]*TitleBarStatus[^}]*\} from '\.\/shell\/TitleBarControls';/);
  });

  it('keeps the playtest return in the canonical typed title-bar control lane', () => {
    expect(skirmish).toContain('<TitleBarControlContribution');
    expect(skirmish).toContain('ariaLabel="Playtest navigation"');
    expect(skirmish).toContain("id: 'skirmish-return'");
    expect(skirmish).toContain('destination: returnHref');
    expect(skirmish).toContain("testId: 'skirmish-return'");
    expect(skirmish).not.toContain('skirmish-return-editor');
    expect(styleCss).not.toContain('.skirmish-return-editor');
  });

  it('uses the registered outer panel and explicit inner boxes', () => {
    expect(skirmishHud).toContain('<ShellControlsPanel');
    expect(skirmishHud).toContain('className={className}');
    expect(skirmishHud).toContain('titleActions={strategikonNavigation}');
    expect(skirmishHud).not.toContain('<OuterChromeBox');
    expect(chromeBox).toContain('chromeConsumer="shell-controls"');
    expect(chromeBox).toContain('data-shell-controls-panel=""');
    expect(chromeBox).toContain('title="Controls"');
    expect(skirmishHud).not.toContain('<h2>Controls</h2>');
    expect(chromeBox).toContain('data-chrome-unit="outer-panel"');
    expect(chromeBox).toContain("chromeUnitClassNames('outer-panel', 'le-outer-panel', className)");
    expect(chromeBox).toContain("titled ? 'le-outer-panel-content--titled' : ''");

    expect(portraitEditor).toContain('<InnerChromeBox className={classes}');
    expect(portraitEditor).toContain('if (!framed) return <div className={classes}');
    expect(skirmishHud).toContain('<InnerChromeBox className="unit-portrait unit-portrait--hud"');
    expect(skirmishHud).toContain('<InnerChromeBox className="skirmish-service-record">');

    expect(styleCss).not.toMatch(/\.unit-portrait\s*\{[^}]*border-image\s*:/);
    expect(styleCss).not.toMatch(/\.skirmish-service-record\s*\{[^}]*border-image\s*:/);
  });

  it('atomically replaces the portrait frame so crop geometry cannot leak across units', () => {
    expect(portraitEditor).toContain('key={frame.src}');
    expect(portraitEditor).toContain('displayedSrc === src');
    expect(portraitEditor).toContain("if (typeof image.decode === 'function') await image.decode()");
    expect(portraitEditor).toContain('decodeAndPromote(event.currentTarget, frame.src)');
    expect(portraitEditor.match(/requestAnimationFrame\(/g)).toHaveLength(1);
    expect(portraitEditor).toContain('onDisplayedSrcChange?.(readySrc)');
    expect(portraitEditor).toContain('<CroppedView src={requestedSrc} crop={crop} onDisplayedSrcChange={onDisplayedSrcChange} />');
    expect(portraitPreload).toContain("import { loadDecodedImage } from '../render/imageResources'");
    expect(portraitPreload).not.toContain('new Image()');
  });

  it('maps every Board View control to its existing semantic unit', () => {
    const zoomStepper = skirmishHud.match(/<Stepper\b[\s\S]*?\/>/)?.[0];
    expect(zoomStepper).toBeDefined();
    expect(zoomStepper).toContain('value={Math.round(zoom * 100)}');
    expect(zoomStepper).toContain('onDecrease={() => setZoom(zoom - 0.1)}');
    expect(zoomStepper).toContain('onIncrease={() => setZoom(zoom + 0.1)}');
    expect(stepper).toContain('unit="inner-minus-key"');
    expect(stepper).toContain("chromeUnitClassNames('inner-minus-key', 'settings-chrome-button'");
    expect(stepper).toContain('unit="inner-plus-key"');
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
    const returnBlock = navButtonUsing('data-testid="skirmish-return-scenario"');
    expectChromeUnit(returnBlock, 'inner-text-button');

    expectChromeUnit(buttonUsing('data-testid="restart-level"'), 'inner-tool-square');
    expectChromeUnit(buttonUsing('data-testid="new-skirmish"'), 'inner-tool-square');

    const resign = buttonUsing('data-testid="resign"');
    expectChromeUnit(resign, 'inner-text-button');
    expect(resign).toContain("'danger'");
    expect(styleCss).not.toMatch(/\.skirmish-resign-button[^\{]*\{[^}]*border-image(?:-source)?\s*:/);
  });

  it('renders paid Run Undo through one shared text-button and the canonical gold amount', () => {
    expect(skirmishHud).toContain('<RunBattleUndoButton testId="undo-run-move" />');
    expect(skirmish).toContain('<RunBattleUndoButton testId="undo-run-move-result" />');
    expect(runBattleUndoButton).toContain('unit="inner-text-button"');
    expect(runBattleUndoButton).toContain("chromeUnitClassNames('inner-text-button', 'app-header-button'");
    expect(runBattleUndoButton).toContain('valueTenths={RUN_BATTLE_UNDO_COST_TENTHS}');
    expect(runBattleUndoButton).toContain('data-ui-sfx="gold"');
    expect(runBattleUndoButton).toContain('disabled={!canUndo}');
    expect(runBattleUndoButton).toContain('undoLastPlayerMove();');
  });

  it('opens administrator controls inside the HUD without adding a sixth player tab', () => {
    const tabRegistry = skirmishHud.match(/const HUD_TABS:[\s\S]*?\];/)?.[0] ?? '';
    expect(tabRegistry).not.toContain("{ id: 'admin'");
    expect(skirmishHud).toContain('data-testid="open-battle-admin-controls"');
    expect(skirmishHud).toContain('presentation="battle"');
    expect(skirmishHud).toContain("onBattleArmed={() => setTab('unit')}");
    expect(skirmishHud.indexOf('data-testid="open-battle-admin-controls"'))
      .toBeGreaterThan(skirmishHud.indexOf('data-testid="resign"'));
    expectChromeUnit(buttonUsing('data-testid="open-battle-admin-controls"'), 'inner-text-button');
    expectChromeUnit(buttonUsing('data-testid="close-battle-admin-controls"'), 'inner-text-button');
  });

  it('consumes the immediate Win Battle intervention in the mounted Battle lifecycle', () => {
    expect(skirmish).toContain('const adminMode = useSkirmish((s) => s.adminMode);');
    expect(skirmish).toContain('const adminWinBattle = useSkirmish((s) => s.adminWinBattle);');
    expect(skirmish).toMatch(
      /useEffect\(\(\) => \{\s*if \(adminMode === 'win-battle'\) adminWinBattle\(\);\s*\}, \[adminMode, adminWinBattle\]\);/,
    );
  });

  it('maps tabs, promotion choices, and command-grid cells to existing units', () => {
    const promotion = buttonUsing('choosePromotion(type)');
    const tab = buttonUsing('setTab(t.id)');
    const commandKey = buttonUsing('runSkirmishShortcut(key, false, skirmishViewStore, skirmishStore)');

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
