// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runScreen = readFileSync(new URL('./RunScreen.tsx', import.meta.url), 'utf8');
const runArmyWorkspace = readFileSync(new URL('./RunArmyWorkspace.tsx', import.meta.url), 'utf8');
const runWorkspace = readFileSync(new URL('./RunWorkspace.tsx', import.meta.url), 'utf8');
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
    expect(sharedShell).toContain('return installPlayCanvas(shell)');
    expect(runScreen).toContain('<SkirmishShell');
    expect(runScreen).toContain('readyToCompose={false}');
    expect(runScreen).not.toContain("classList.add('skirmish-active')");
    expect(runScreen).toContain('controlsContent={<RunMetaControls run={run} view={view} onNavigate={onNavigate} />}');
    expect(metaControls).toContain('<section className="run-meta-controls" aria-label="Run controls">');
    expect(metaControls).toContain('Sell Units');
    expect(metaControls).toContain('Reset Shop');
    expect(metaControls).toContain('Continue to next Battle');
    expect(metaControls).not.toContain('data-ui-sfx="gold-sell"');
    expect(metaControls).not.toContain('<OuterChromeBox');
    expect(metaControls).not.toContain('data-chrome-unit="outer-panel"');
    expect(runArmyWorkspace).toContain('data-ui-sfx={status === \'available\' ? \'gold-sell\' : undefined}');
    expect(skirmishHud).toContain('chromeConsumer="skirmish-hud"');
    expect(skirmishHud).toContain('{controlsContent === undefined ? (');
    expect(runScreen).not.toContain('function RunShell');
    expect(runScreen).not.toContain('function RunControlsRail');
    expect(runScreen).not.toContain('chromeConsumer="run-controls"');
    expect(styleCss).not.toContain('.run-controls-panel');
    expect(styleCss).toMatch(/\.run-workspace\s*\{[\s\S]*?grid-column:\s*1;[\s\S]*?grid-row:\s*2;/);
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
    const bundleCard = runScreen.match(
      /export function RunBundleCard\b[\s\S]*?\r?\n}\r?\n\r?\nfunction RunTitleBarStatus/,
    )?.[0] ?? '';

    expect(bundleCard).toContain("data-ui-sfx={mode === 'shop' ? 'card-purchase' : undefined}");
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

  it('shows every bundle unit with the same installed sprites used by the board', () => {
    const bundleCard = runScreen.match(
      /export function RunBundleCard\b[\s\S]*?\r?\n}\r?\n\r?\nfunction RunTitleBarStatus/,
    )?.[0] ?? '';

    expect(bundleCard).toContain('bundle.pieces.map((piece, index)');
    expect(runScreen).toContain("const PLAYER_BUNDLE_FACING = 'south' as const;");
    expect(bundleCard).toContain('pieceSpritePath(piece, PLAYER_BUNDLE_PALETTE, PLAYER_BUNDLE_FACING)');
    expect(bundleCard).toContain('className="run-bundle-board-piece"');
    expect(bundleCard).not.toContain('UnitPortrait');
    expect(bundleCard).not.toContain('run-bundle-quantity');
  });
});
