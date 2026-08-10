// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const skirmishHud = readFileSync(new URL('./SkirmishHud.tsx', import.meta.url), 'utf8');
const pawnPromotionPicker = readFileSync(new URL('./PawnPromotionPicker.tsx', import.meta.url), 'utf8');
const portraitEditor = readFileSync(new URL('./PortraitEditor.tsx', import.meta.url), 'utf8');
const stepper = readFileSync(new URL('./shared/Stepper.tsx', import.meta.url), 'utf8');
const chromeBox = readFileSync(new URL('./shared/ChromeBox.tsx', import.meta.url), 'utf8');
const appTitleBar = readFileSync(new URL('./shell/AppTitleBar.tsx', import.meta.url), 'utf8');
const chromeRuntime = readFileSync(new URL('./chromeFamilyRuntime.ts', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const skirmish = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');
const battleClockChip = readFileSync(new URL('./BattleClockChip.tsx', import.meta.url), 'utf8');
const titleBarControls = readFileSync(new URL('./shell/TitleBarControls.tsx', import.meta.url), 'utf8');
const portraitPreload = readFileSync(new URL('../art/preload.ts', import.meta.url), 'utf8');
const runBattleUndoButton = readFileSync(new URL('./RunBattleUndoButton.tsx', import.meta.url), 'utf8');
const runArmyWorkspace = readFileSync(new URL('./RunArmyWorkspace.tsx', import.meta.url), 'utf8');
const chromeUnitRegistry = readFileSync(new URL('./chromeUnitRegistry.ts', import.meta.url), 'utf8');

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
    // Turn plate and objective are Skirmish's own; the middle chip is the ONE shared
    // battle clock, so the Run's bar shows the same readout from the same component.
    // Every one of the three is a BOXED tooltip: a frame in the persistent bar costs
    // width, and what earns it is being a single target that names itself.
    expect(titleContent.match(/<TitleBarStatusTip\b/g)).toHaveLength(2);
    expect(titleContent).toContain('<BattleClockChip />');
    expect(battleClockChip).toContain('<TitleBarStatusTip');
    expect(titleContent).not.toMatch(/<TitleBarStatus\b[^T]/);
    expect(skirmish).not.toContain("from '../core/clock'");
    expect(titleContent).not.toMatch(/<div\b[^>]*skirmish-status-chip/);
    expect(skirmish).toMatch(/import \{[^}]*TitleBarStatusTip[^}]*\} from '\.\/shell\/TitleBarControls';/);
    // The box IS the trigger, so the tip hangs off the frame's own rect.
    expect(titleBarControls).toMatch(/trigger=\{\([\s\S]*?<TitleBarStatus as="span"/);
  });

  it('shows elapsed time instead of a static infinity for an untimed Battle', () => {
    expect(battleClockChip).toContain('data-testid="untimed-battle-clock"');
    expect(battleClockChip).toContain('formatElapsedClockMs(elapsedReadoutMs)');
    expect(battleClockChip).toContain('skirmish-status-chip skirmish-clock');
    // An untimed Battle shows the count alone: a label under it said only what the
    // absent countdown already says, and the tip carries "no time control".
    expect(battleClockChip).not.toContain('No limit');
    expect(battleClockChip).toContain('This Battle has no time control.');
    // The chip reads the mounted session store, so a portalled title bar reports the
    // Battle actually on screen rather than a time its host had to thread through.
    expect(battleClockChip).toContain('useSkirmish((s) => s.clock)');
    expect(battleClockChip).toContain('useSkirmish((s) => s.battleElapsed)');
    expect(battleClockChip).not.toContain('useSkirmish.getState');
    expect(battleClockChip).not.toContain('skirmish-clock-unlimited');
    expect(battleClockChip).not.toContain('>∞<');
    expect(styleCss).not.toContain('.skirmish-clock-unlimited');
    expect(skirmish).toContain("window.addEventListener('pagehide', bankBeforeUnload)");
    expect(skirmish).toContain('persistMatch(skirmishStore.getState())');
  });

  it('keeps the playtest return in the canonical typed title-bar control lane', () => {
    expect(skirmish).toContain('<TitleBarControlContribution');
    expect(skirmish).toContain('ariaLabel="Playtest navigation"');
    expect(skirmish).toContain("id: 'skirmish-return'");
    expect(skirmish).toContain('destination: returnHref');
    expect(skirmish).toContain("testId: 'skirmish-return'");
    expect(skirmish).toContain("? 'Back to Deployment Lab'");
    expect(skirmish).toContain("? 'Return to this configured Deployment Lab case.'");
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

  it('paints every Controls-panel trigger with the leaf material and phases repeated ones', () => {
    // The material is read off the registry and applied to the panel, so a control the panel
    // only borrows — a Stepper key, an admin action, a Run lifecycle button — cannot arrive
    // wearing the structural field, and the same component elsewhere is left alone.
    expect(chromeUnitRegistry).toContain("material: ChromeUnitMaterial;");
    expect(chromeUnitRegistry).toContain('export function chromeUnitMaterialSelectors');
    // ADR-0556 generalized the panel's own rule to one host attribute every adopted surface
    // carries, so the panel declares adoption instead of the runtime naming it.
    expect(chromeRuntime).toContain('function leafSurfaceHostCss');
    expect(chromeRuntime).toMatch(/chromeUnitMaterialSelectors\('leaf'\)/);
    expect(chromeRuntime).toContain("const CHROME_LEAF_HOST_ATTR = 'data-chrome-leaf-surface'");
    expect(chromeRuntime).toMatch(/\$\{CHROME_FAMILY_SURFACE_SELECTOR\} \$\{CHROME_LEAF_HOST_SELECTOR\}/);
    expect(chromeRuntime).toContain('namedChromeFillSurfacePaint(CHROME_LEAF_FILL_SURFACE)');
    expect(chromeBox).toContain('data-chrome-leaf-surface=""');

    // A box that names its own installed surface is excluded from the role field rather than
    // out-specified by it, so the two can never trade places on a selector edit. An adopted
    // host's leaves are excluded the same way — winning that rule on source order alone is
    // what let #881's third `:not()` blank this panel a day later (ADR-0556).
    expect(chromeRuntime).toContain(':not(.has-backdrop):not([data-chrome-fill-surface])');
    expect(chromeRuntime).toContain(':not(${CHROME_LEAF_HOST_INHERITED_SELECTOR})');

    // Repeated collections phase their wood from the index their own data already has.
    expect(skirmishHud).toContain('HUD_TABS.map((t, index) =>');
    expect(skirmishHud).toContain('style={leafSurfacePhase(index)}');
    expect(skirmishHud).toContain('SHORTCUT_KEY_ROWS.flat().map((key, index) =>');
    expect(skirmishHud).toContain('const surfacePhase = leafSurfacePhase(index);');
    expect(stepper).toContain('style={leafSurfacePhase(0)}');
    expect(stepper).toContain('style={leafSurfacePhase(1)}');
    expect(styleCss).not.toMatch(/\.skirmish-(?:hud-tabs|view-row|grid)[^}]*:nth-child/);
  });

  it('keeps a unit portrait wearing its installed scene inside the house chrome', () => {
    // The scene comes from the catalog with the bust, so the ONE portrait renderer resolves it
    // from the piece; a call site that forgot to pass it is what put roster thumbnails on flat
    // fill beside profile portraits that had one.
    expect(portraitEditor).toContain("const resolvedBackdrop = backdrop === undefined ? defaultBackgroundSet().portraits[piece] : backdrop;");
    expect(skirmishHud).not.toContain('focusedPortraitBackdrop');
    expect(runArmyWorkspace).not.toContain('backdrop={defaultBackgroundSet()');

    // ...and the guard against raw-CSS surface paint no longer strips it back off.
    expect(styleCss).toMatch(/\.inner-box:not\(\.has-backdrop\)\s*\{\s*\r?\n\s*background-color: transparent;\s*\r?\n\s*background-image: none;/);
    const frameBlock = styleCss.match(/\.chrome-family-surface\) \.inner-box \{[\s\S]*?\}/)?.[0] ?? '';
    expect(frameBlock).toContain('border-image-source');
    expect(frameBlock).not.toContain('background-image');
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

  it('renders paid Run Undo through one shared text-button without offering it on victory', () => {
    expect(skirmishHud).toContain("game.winner !== 'player' && game.winner !== 'enemy'");
    expect(skirmishHud).toContain('<RunBattleUndoButton testId="undo-run-move" />');
    expect(skirmish).toContain("game.winner === 'draw' ? <RunBattleUndoButton testId=\"undo-run-move-result\" style={leafSurfacePhase(0)} /> : null");
    expect(runBattleUndoButton).toContain('unit="inner-text-button"');
    expect(runBattleUndoButton).toContain("chromeUnitClassNames('inner-text-button', 'app-header-button'");
    expect(runBattleUndoButton).toContain('valueTenths={RUN_BATTLE_UNDO_COST_TENTHS}');
    expect(runBattleUndoButton).toContain('data-ui-sfx="gold"');
    expect(runBattleUndoButton).toContain('disabled={!canUndo}');
    expect(runBattleUndoButton).toContain('undoLastPlayerMove();');
  });

  it('keeps a defeated Run result inside the viewport with retry and explicit exits', () => {
    const result = skirmish.match(
      /const runBattleResult = [\s\S]*?\n  \) : null;/,
    )?.[0] ?? '';

    expect(result).toContain('className="campaign-result campaign-result--viewport"');
    expect(result).not.toContain('aria-modal="true"');
    expect(result).toContain('testId="retry-run-battle-result"');
    expect(result).toContain('data-testid="new-run-after-defeat"');
    expect(result).toContain('to={PLAY_RUN_NEW_SELECTOR_HREF}');
    expect(result).toContain('data-testid="main-menu-after-defeat"');
    expect(result).toContain('to="/"');
    expect(styleCss).toMatch(/\.campaign-result--viewport\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?z-index:\s*1;/);
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
    const promotion = buttonBlocks(pawnPromotionPicker).find((candidate) => candidate.includes('onChoose(type)'));
    const tab = buttonUsing('setTab(t.id)');
    const commandKey = buttonUsing('runSkirmishShortcut(key, false, skirmishViewStore, skirmishStore)');

    expect(promotion, 'expected anchored Pawn promotion choice').toBeDefined();
    expectChromeUnit(promotion!, 'inner-asset-swatch');
    expect(pawnPromotionPicker).toContain('<InnerChromeBox');
    expect(pawnPromotionPicker).toContain('fillRole="outer"');
    expect(pawnPromotionPicker).toContain('data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}');
    expect(pawnPromotionPicker).toContain('aria-label="Pawn promotion"');
    expect(pawnPromotionPicker).toContain('onPointerDown={(event) => event.stopPropagation()}');
    expect(pawnPromotionPicker).not.toContain('autoFocus');
    expect(skirmishHud).not.toContain('aria-label="Pawn promotion"');
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
