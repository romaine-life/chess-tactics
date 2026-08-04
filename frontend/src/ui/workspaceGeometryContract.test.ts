// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chromeBox = readFileSync(new URL('./shared/ChromeBox.tsx', import.meta.url), 'utf8');
const runWorkspace = readFileSync(new URL('./RunWorkspace.tsx', import.meta.url), 'utf8');
const runArmyWorkspace = readFileSync(new URL('./RunArmyWorkspace.tsx', import.meta.url), 'utf8');
const strategikon = readFileSync(new URL('./Strategikon.tsx', import.meta.url), 'utf8');
const levelEditorConsumers = readFileSync(new URL('./LevelEditorChromeConsumers.tsx', import.meta.url), 'utf8');
const levelEditor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const packageJson = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
const geometryGate = readFileSync(new URL('../../scripts/check-workspace-geometry.mjs', import.meta.url), 'utf8');

describe('shell surface ownership contract (ADR-0297)', () => {
  it('constructs the attached body and its content container inside ShellWorkspace for every family', () => {
    expect(chromeBox).not.toContain('export function ShellWorkspaceBody');
    expect(chromeBox).toContain('data-shell-workspace-body=""');
    expect(chromeBox).toContain('className="shell-workspace-body"');
    expect(chromeBox).toContain('data-shell-workspace-content=""');
    expect(chromeBox).toContain("data-shell-workspace-content-edge={edgeAttached ? '' : undefined}");
    expect(chromeBox).toContain('className={`shell-workspace-body-content ${bodyClassName}`.trim()}');
    expect(runWorkspace).toContain('bodyClassName={`run-shell-workspace-content ${scene.contentClassName ?? \'\'}`.trim()}');
    expect(strategikon).toContain('bodyClassName="strategikon-content"');
    expect(levelEditorConsumers).toContain('bodyClassName="le-events-workspace-content"');
    expect(levelEditor).toContain('bodyClassName="le-artwork-workspace-content"');
    for (const caller of [runWorkspace, strategikon, levelEditorConsumers, levelEditor]) {
      expect(caller).not.toContain('ShellWorkspaceBody');
    }
  });

  it('constructs Controls and retained viewport state inside their owning objects', () => {
    expect(chromeBox).toContain('export function ShellControlsPanel');
    expect(chromeBox).toContain('data-shell-controls-panel=""');
    expect(chromeBox).toContain('title="Controls"');
    expect(chromeBox).toContain('export function ShellViewportSwap');
    expect(chromeBox).toContain('data-shell-workspace-covered={covered ? \'\' : undefined}');
    expect(chromeBox).toContain('inert={covered ? true : undefined}');
    expect(chromeBox).toContain('aria-hidden={covered ? true : undefined}');
  });

  it('owns one Controls-facing edge and leaves only host start/block insets tunable', () => {
    expect(style).toMatch(/\.shell-workspace-body\s*\{[\s\S]*?padding-block:\s*var\(--shell-workspace-body-inset-block, 0px\);[\s\S]*?padding-inline-start:\s*var\(--shell-workspace-body-inset-start, 0px\);[\s\S]*?padding-inline-end:\s*0;/);
    expect(style).toMatch(/\.shell-workspace-body-content\s*\{[\s\S]*?padding-inline-end:\s*var\(--shell-workspace-body-inset-start, 0px\);/);
    expect(style).toMatch(/\.shell-workspace-body-content\[data-shell-workspace-content-edge\]\s*\{[\s\S]*?padding-inline-end:\s*0;/);
    expect(style).not.toContain('--shell-workspace-body-inset-end');
    expect(style).not.toContain('--shell-workspace-content-inset-end');
    expect(style).not.toContain('.skirmish-screen.run-screen');
  });

  it('defaults ordinary workspaces to the inset lane and names only primary frame owners as edge attached', () => {
    expect(runWorkspace).toContain('edgeAttached={scene.edgeAttached ?? false}');
    expect(strategikon).toMatch(/<ShellWorkspace[\s\S]*?bodyClassName="strategikon-content"[\s\S]*?edgeAttached/);
    expect(runArmyWorkspace).toMatch(/<RunSceneViewport[\s\S]*?scene=\{\{[\s\S]*?contentClassName,[\s\S]*?edgeAttached: true/);
    expect(levelEditorConsumers).not.toContain('edgeAttached');
    expect(levelEditor).not.toMatch(/<ShellWorkspace[\s\S]*?className="le-artwork-workspace"[\s\S]*?edgeAttached/);
  });

  it('uses the shared content line instead of workflow-specific right-edge reserves', () => {
    expect(style).toMatch(/\.le-events-head\s*\{[^}]*padding-inline:\s*0;/);
    expect(style).toMatch(/\.le-md\s*\{[^}]*padding-inline:\s*0;/);
    expect(style).toMatch(/\.le-md-detail\s*\{[\s\S]*?padding-right:\s*var\(--le-inner-atom-right-overhang, 0px\);/);
    expect(style).toMatch(/\.le-artwork-workspace-head\s*\{[\s\S]*?padding-inline:\s*0;/);
    expect(style).toMatch(/\.le-artwork-workspace-scroll\s*\{[\s\S]*?padding-inline:\s*0;/);
    expect(style).not.toContain('padding-right: calc(4px + var(--le-inner-atom-right-overhang, 0px))');
    expect(style).not.toContain('padding-right: calc(6px + var(--le-inner-atom-right-overhang, 0px))');
  });

  it('registers a live browser geometry gate for the body and visible dock target', () => {
    expect(JSON.parse(packageJson).scripts['verify:workspace']).toBe('node scripts/check-workspace-geometry.mjs');
    expect(geometryGate).toContain('const controlsBoundary = sideBySide');
    expect(geometryGate).toContain("near(geometry.workspace.right, controlsBoundary, 'workspace to Controls boundary')");
    expect(geometryGate).toContain("near(geometry.body.right, controlsBoundary, 'shared workspace body to Controls boundary')");
    expect(geometryGate).toContain("near(geometry.content.right, controlsBoundary, 'shared workspace content container to Controls boundary')");
    expect(geometryGate).toContain("near(geometry.dock.right, controlsBoundary, 'primary dock target to Controls boundary')");
    expect(geometryGate).toContain("near(geometry.bodyPaddingInlineEnd, 0, 'shared workspace body inline-end padding')");
    expect(geometryGate).toContain("geometry.contentEdgeAttached ? 0 : geometry.bodyPaddingInlineStart");
    expect(geometryGate).toContain('for (const targetGeometry of geometry.aligned)');
  });
});
