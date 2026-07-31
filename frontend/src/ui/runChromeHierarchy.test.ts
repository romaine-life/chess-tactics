// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runScreen = readFileSync(new URL('./RunScreen.tsx', import.meta.url), 'utf8');
const runArmyWorkspace = readFileSync(new URL('./RunArmyWorkspace.tsx', import.meta.url), 'utf8');
const runWorkspaceStages = readFileSync(new URL('./RunWorkspaceStages.tsx', import.meta.url), 'utf8');
const titleBarPortal = readFileSync(new URL('./shell/TitleBarPortalContext.tsx', import.meta.url), 'utf8');
const runWorkspace = readFileSync(new URL('./RunWorkspace.tsx', import.meta.url), 'utf8');
const runUnitInspectionScene = readFileSync(new URL('./RunUnitInspectionScene.tsx', import.meta.url), 'utf8');
const runCardScene = readFileSync(new URL('./RunCardScene.tsx', import.meta.url), 'utf8');
const runBundleCard = readFileSync(new URL('./RunBundleCard.tsx', import.meta.url), 'utf8');
const runRelics = readFileSync(new URL('./RunRelics.tsx', import.meta.url), 'utf8');
const runSelfInspection = readFileSync(new URL('./RunSelfInspection.tsx', import.meta.url), 'utf8');
const skirmish = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');
const skirmishHud = readFileSync(new URL('./SkirmishHud.tsx', import.meta.url), 'utf8');
const chromeBox = readFileSync(new URL('./shared/ChromeBox.tsx', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('Run chrome hierarchy', () => {
  it('uses the Battle-owned shell and HUD while replacing only Controls contents', () => {
    const metaControls = runScreen.match(
      /function RunMetaControls\b[\s\S]*?\r?\n}\r?\n\r?\nfunction DraftPanel/,
    )?.[0] ?? '';
    const sharedShell = skirmish.match(
      /export function SkirmishShell\b[\s\S]*?\r?\n}\r?\n\r?\nexport function Skirmish/,
    )?.[0] ?? '';

    expect(skirmish).toContain('export function SkirmishShell');
    expect(skirmish).toContain('<SkirmishHud {...hudProps} controlsContent={controlsContent} />');
    expect(skirmish).toMatch(/export function Skirmish\b[\s\S]*?return \(\s*<SkirmishShell/);
    expect(sharedShell).toContain('<PaintedSurfaceBoundary');
    expect(sharedShell).toContain('surface="gameplay-hud"');
    expect(sharedShell).toContain('readyToCompose={readyToCompose}');
    expect(runScreen).toContain('<SkirmishShell');
    expect(runScreen).toContain('readyToCompose={hydrated}');
    expect(runScreen).not.toContain("classList.add('skirmish-active')");
    expect(runScreen).toContain("<RunMetaControls run={shellRun} view={view} onNavigate={navigateRunView} showAbandon={shellRun.phase !== 'victory'} />");
    expect(metaControls).toContain('<section className="run-meta-controls" aria-label="Run controls">');
    expect(metaControls).toContain('Sell Units');
    expect(metaControls).toContain('<span className="skirmish-eyebrow">Self inspection</span>');
    expect(metaControls).toContain('<RunSelfInspectionControls');
    expect(runSelfInspection).toContain('Army');
    expect(runSelfInspection).toContain('Relics');
    expect(runSelfInspection).toContain("url.searchParams.set('view', view)");
    expect(runScreen).toContain('runSelfInspectionViewFromSearch(');
    expect(runScreen).toContain('runSelfInspectionHref(window.location.href, nextInspectionView)');
    expect(metaControls).toContain('Reset Shop');
    expect(metaControls).toContain('Continue to next Battle');
    expect(metaControls).not.toContain('data-ui-sfx="gold-sell"');
    expect(metaControls).not.toContain('<OuterChromeBox');
    expect(metaControls).not.toContain('data-chrome-unit="outer-panel"');
    expect(runArmyWorkspace).toContain('data-ui-sfx={status === \'available\' ? \'gold-sell\' : undefined}');
    expect(runArmyWorkspace).not.toContain('chromeConsumer="run-army-ledger"');
    expect(runArmyWorkspace).not.toContain('chromeConsumer="run-army-profile"');
    expect(runArmyWorkspace).toContain('<RunWorkspace');
    expect(runArmyWorkspace).toContain('className="run-self-inspection-workspace run-army-workspace run-army-ledger"');
    expect(runRelics).toContain('className="run-self-inspection-workspace run-relics-workspace"');
    expect(skirmishHud).toContain('chromeConsumer="skirmish-hud"');
    expect(skirmishHud).toContain('{controlsContent === undefined ? (');
    expect(runScreen).not.toContain('function RunShell');
    expect(runScreen).not.toContain('function RunControlsRail');
    expect(runScreen).not.toContain('chromeConsumer="run-controls"');
    expect(styleCss).not.toContain('.run-controls-panel');
    expect(styleCss).toMatch(/\.run-phase-workspace\s*\{[\s\S]*?grid-column:\s*1;[\s\S]*?grid-row:\s*2;/);
  });

  it('keeps one persistent Run shell and choreographs in-place phase changes', () => {
    // Every non-Battle Run destination lives in a single mounted SkirmishShell; a phase
    // change must never rebuild the shell (that blanks the screen to the world
    // background), only swap the staged workspace beneath it.
    expect(runScreen.match(/<SkirmishShell/g)).toHaveLength(1);
    expect(runScreen).toContain('<RunWorkspaceStages stageKey={stageKey} placeholderKeys={RUN_STAGE_PLACEHOLDERS}>');
    expect(runScreen).not.toContain('readyToCompose={false}');

    // The staged swap keeps the previous workspace visible and inert while the incoming
    // one composes under the shared complete-frame discipline, then fades in over it.
    expect(runWorkspaceStages).toContain("from './shell/PaintedSurfaceBoundary'");
    expect(runWorkspaceStages).toContain('waitForRenderedImage');
    expect(runWorkspaceStages).toContain('renderedCssImageUrls');
    expect(runWorkspaceStages).toContain('afterTwoPaintOpportunities');
    expect(runWorkspaceStages).toContain(".querySelector('.painted-surface.is-loading')");
    expect(runWorkspaceStages).toContain('className="run-stage is-departing"');
    expect(runWorkspaceStages).toContain('inert aria-hidden="true"');
    expect(styleCss).toMatch(/\.run-stage\s*\{[\s\S]*?grid-column:\s*1;[\s\S]*?grid-row:\s*1;/);
    expect(styleCss).toMatch(/\.run-stage\.is-preparing\s*\{[\s\S]*?visibility:\s*hidden;/);
    expect(styleCss).toMatch(/\.run-stage\.is-arriving\s*\{[\s\S]*?surface-complete-reveal/);

    // The persistent title bar creates route-owned portal hosts only at scene commit,
    // after a destination screen has already mounted; the slot lookup must therefore
    // watch for the host instead of sampling once and staying empty (missing Run
    // status chips on the muster screen).
    expect(titleBarPortal).toContain('MutationObserver');
    expect(titleBarPortal).toContain('observer.observe(document.body, { childList: true, subtree: true })');
  });

  it('replaces the complete left shell workspace for Army and Relics while preserving the covered phase', () => {
    expect(runScreen).toContain('function RunPhaseWorkspace');
    expect(runScreen).toContain("className={`run-phase-primary${covered ? ' is-workspace-covered' : ''}`}");
    expect(runScreen).toContain('inert={covered ? true : undefined}');
    expect(runScreen).toContain('aria-hidden={covered ? true : undefined}');
    expect(runScreen).toContain("view === 'relics'");
    expect(runScreen).toContain('<RunRelicsWorkspace relicIds={shellRun.relics} />');
    expect(skirmish).toContain("className={`skirmish-field${strategikonOpen || runWorkspace ? ' is-workspace-covered' : ''}`}");
    expect(skirmish).toContain('inert={strategikonOpen || runWorkspace ? true : undefined}');
    expect(skirmish).toContain('aria-hidden={strategikonOpen || runWorkspace ? true : undefined}');
    expect(skirmish).toContain('{runSelfInspectionOpen ? null : <RunRelicStrip relicIds={relicIds} />}');
    expect(skirmish).toMatch(/className=\{`skirmish-war-room[\s\S]*?\{runWorkspace\}[\s\S]*?<\/section>/);
    expect(styleCss).toMatch(/\.run-phase-primary\.is-workspace-covered,[\s\S]*?\.skirmish-field\.is-workspace-covered\s*\{[\s\S]*?visibility:\s*hidden;/);
  });

  it('keeps Run abandonment at the bottom of Controls and distinct from Battle resignation', () => {
    expect(runScreen).toContain('function useRunAbandon');
    expect(runScreen).toContain("title: 'Abandon this Run?'");
    expect(runScreen).toContain("tone: 'danger'");
    expect(runScreen).toContain('navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false })');
    expect(runScreen).toContain('data-testid="abandon-run"');
    expect(skirmishHud).toContain('onAbandonRun?: (() => void) | null');
    expect(skirmishHud).toContain('<span className="skirmish-eyebrow">Run</span>');
    expect(skirmishHud).toContain('data-testid="resign"');
    expect(runScreen).not.toContain('TitleBarControlContribution');
  });

  it('gives shop bundle purchases one dedicated card cue without changing draft feedback', () => {
    expect(runBundleCard).toContain("data-ui-sfx={mode === 'shop' ? 'card-purchase' : undefined}");
  });

  it('fills the shell-owned playfield for every non-Battle Run destination', () => {
    const playerRunSources = `${runScreen}\n${runArmyWorkspace}`;
    const runWorkspaceRule = styleCss.match(/\.run-workspace\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(runWorkspace).toContain('export function RunWorkspace');
    expect(runWorkspace).toContain('<main className={`run-workspace ${className}`.trim()}>');
    expect(runWorkspace).toContain('<ShellWorkspace');
    expect(runWorkspace).toContain('className="run-shell-workspace"');
    expect(chromeBox).toContain('export function ShellWorkspace');
    for (const testId of [
      'run-draft-workspace',
      'run-deployment-workspace',
      'run-shop-workspace',
      'run-victory-workspace',
      'run-army-ledger-workspace',
      'run-army-profile-workspace',
      'run-sell-workspace',
      'run-loading-workspace',
      'run-empty-workspace',
    ]) {
      expect(playerRunSources).toContain(`data-testid="${testId}"`);
    }
    for (const retiredConsumer of [
      'run-draft',
      'run-deployment',
      'run-shop',
      'run-victory',
      'run-army-ledger',
      'run-army-profile',
      'run-sell-units',
      'run-empty',
    ]) {
      expect(playerRunSources).not.toContain(`chromeConsumer="${retiredConsumer}"`);
    }
    expect(playerRunSources).not.toContain('<OuterChromeBox');
    expect(playerRunSources).not.toContain('<OuterChromeHeader');
    expect(playerRunSources).not.toContain('<select');
    expect(playerRunSources).not.toContain('type="checkbox"');
    expect(runScreen).toContain('<HouseSelect');
    expect(runArmyWorkspace).toContain('<HouseSelect');
    expect(runWorkspaceRule).toContain('position: relative');
    expect(runWorkspaceRule).not.toMatch(/\b(?:padding|gap)\s*:/);
    expect(styleCss).toContain('.run-shell-workspace-content');
    expect(styleCss).toContain('.run-screen.has-relics .run-shell-workspace-content');
    expect(styleCss).not.toContain('.run-workspace--full');
    expect(styleCss).not.toContain('.run-screen.has-relics .run-workspace');
  });

  it('draws every bundle card as a seeded board-scene vignette with an authored name', () => {
    // The vignette musters every bundle piece with its canonical installed board
    // sprite through the shared read-only renderer (ADR-0225 continues to hold).
    expect(runBundleCard).toContain('<RunCardScene bundle={bundle}');
    expect(runCardScene).toContain('<StudioReadOnlyBoard');
    expect(runCardScene).toContain("const CARD_FACING = 'south' as const;");
    expect(runCardScene).toContain('camera = RUN_CARD_SCENE_CAMERA');
    expect(runCardScene).toContain('boardPan={camera.pan}');
    expect(runBundleCard).toContain('runCardName(bundle)');
    expect(runBundleCard).toContain('className="run-bundle-card-name"');
    expect(runBundleCard).toContain('className="run-bundle-card-contents"');
    expect(runBundleCard).not.toContain('UnitPortrait');
    expect(runBundleCard).not.toContain('run-bundle-quantity');
    expect(runBundleCard).not.toContain('pieceSpritePath');
    expect(runScreen).toContain("import { RunBundleCard } from './RunBundleCard';");
    expect(styleCss).toMatch(/\.run-bundle-card\s*\{[\s\S]*?aspect-ratio:\s*5 \/ 7;/);
    expect(styleCss).toMatch(/\.run-card-scene-viewport\s*\{[\s\S]*?overflow:\s*hidden;/);
  });

  it('uses one divided Army ledger grid with readable metadata and value hierarchy', () => {
    expect(runArmyWorkspace).toContain('<DividedInnerChromeBox');
    expect(runArmyWorkspace).toContain('className="run-army-ledger-grid"');
    expect(runArmyWorkspace).toContain("columns={['var(--run-army-row-block-size, 158px)', 'minmax(0, 1fr)', '112px']}");
    expect(runArmyWorkspace).toContain('contentRef={ledgerRef}');
    expect(runArmyWorkspace).toContain('<ChromeDividedGridRow');
    expect(runArmyWorkspace).not.toContain('<ChromeDivider');
    expect(runArmyWorkspace).not.toContain('<KitScroll');
    expect(runArmyWorkspace).not.toContain('data-chrome-unit="inner-list-row"');
    expect(runArmyWorkspace).not.toContain('data-chrome-frame-layout="overlay"');
    expect(runArmyWorkspace).not.toContain('ChromeFrameOverlay');
    expect(runArmyWorkspace).toContain('className="run-army-ledger-portrait unit-portrait--divided"');
    expect(runArmyWorkspace).toContain('framed={false}');
    expect(styleCss).toMatch(/\.chrome-divided-grid\s*\{[\s\S]*?--chrome-divided-grid-scroll-gutter:/);
    expect(styleCss).toMatch(/\.chrome-divided-grid\s*\{[\s\S]*?--chrome-divided-grid-inline-apron-start:[\s\S]*?--le-inner-divider-atom-left-overhang/);
    expect(styleCss).toMatch(/\.chrome-divided-grid__scroll\s*\{[\s\S]*?margin-inline-start:\s*calc\(-1 \* var\(--chrome-divided-grid-inline-apron-start\)\)/);
    expect(styleCss).toMatch(/\.chrome-divided-grid__scroll > \.kit-scroll-content\s*\{[\s\S]*?padding-inline:\s*var\(--chrome-divided-grid-inline-apron-start\) 0;/);
    expect(styleCss).toMatch(/\.chrome-divided-grid__vertical-rail\s*\{[\s\S]*?align-self:\s*stretch;[\s\S]*?margin-block:\s*calc\(-1 \* var\(--chrome-divided-grid-reach\)\)/);
    expect(styleCss).not.toContain('--run-army-ledger-apron');
    expect(styleCss).not.toContain('.run-army-ledger-scroll-divider');
    expect(styleCss).not.toContain('.run-army-ledger-portrait-divider');
    expect(styleCss).not.toContain('.run-army-ledger-value-divider');
    expect(styleCss).toMatch(/\.run-army-ledger-grid\s*\{[\s\S]*?--run-army-row-block-size:\s*158px;/);
    expect(styleCss).toMatch(/\.run-army-ledger-row\s*\{[\s\S]*?all:\s*unset;/);
    expect(styleCss).toMatch(/\.run-army-ledger-portrait\s*\{[\s\S]*?block-size:\s*100%;[\s\S]*?inline-size:\s*100%;/);
    expect(styleCss).toMatch(/\.run-army-ledger-copy > small,[\s\S]*?font:\s*var\(--ds-weight-regular\)\s+var\(--ds-text-md\)/);
    expect(styleCss).toMatch(/\.run-army-ledger-value > small\s*\{[\s\S]*?var\(--ds-text-md\)/);
    expect(styleCss).toMatch(/\.run-army-ledger-value > strong\s*\{[\s\S]*?var\(--ds-text-xl\)/);
  });

  it('uses a canonical tile-backed board scene instead of enlarging a portrait in the unit profile', () => {
    const profile = runArmyWorkspace.match(
      /if \(selected\) \{[\s\S]*?\r?\n  \}\r?\n\r?\n  return \(/,
    )?.[0] ?? '';

    expect(profile).toContain('<RunUnitInspectionScene unit={selected} />');
    expect(profile).not.toContain('<RunArmyPortrait');
    expect(runUnitInspectionScene).toContain('<StudioReadOnlyBoard');
    expect(runUnitInspectionScene).toContain('board={plan.board}');
    expect(runUnitInspectionScene).toContain('boardPan={RUN_UNIT_INSPECTION_CAMERA.pan}');
    expect(runUnitInspectionScene).toContain('coverSeed={plan.coverSeed}');
    expect(runUnitInspectionScene).not.toContain('UnitPortrait');
    expect(runUnitInspectionScene).toContain('className="run-army-profile-scene-viewport"');
    expect(styleCss).toMatch(/\.run-army-profile-body\s*\{[\s\S]*?overflow:\s*visible;/);
    expect(styleCss).toMatch(/\.run-army-profile-scene\s*\{[\s\S]*?position:\s*relative;/);
    expect(styleCss).toMatch(/\.run-army-profile-scene-viewport\s*\{[\s\S]*?overflow:\s*hidden;[\s\S]*?position:\s*absolute;/);
    expect(styleCss).not.toContain('.run-army-profile-portrait');
  });
});
