// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runScreen = readFileSync(new URL('./RunScreen.tsx', import.meta.url), 'utf8');
const runArmyWorkspace = readFileSync(new URL('./RunArmyWorkspace.tsx', import.meta.url), 'utf8');
const skirmish = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');
const skirmishHud = readFileSync(new URL('./SkirmishHud.tsx', import.meta.url), 'utf8');
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
    expect(runArmyWorkspace).toContain('chromeConsumer="run-army-ledger"');
    expect(runArmyWorkspace).toContain('chromeConsumer="run-sell-units"');
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
