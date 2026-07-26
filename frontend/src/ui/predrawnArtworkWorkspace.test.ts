// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('./PredrawnBackgroundVersionsPanel.tsx', import.meta.url), 'utf8');

describe('pre-drawn artwork workspace', () => {
  it('uses a dedicated shell workspace while preserving the mounted board', () => {
    expect(editor).toContain("{ id: 'artwork', label: 'AI Artwork' }");
    expect(editor).toContain("className={`skirmish-board-frame${eventsOpen || predrawnArtworkWorkspaceOpen ? ' is-workspace-covered' : ''}`}");
    expect(editor).toContain("inert={eventsOpen || predrawnArtworkWorkspaceOpen ? true : undefined}");
    expect(editor).toContain("{predrawnArtworkWorkspaceOpen && !eventsOpen ? (");
    expect(editor).toContain('<LevelEditorShellWorkspace');
    expect(editor).toContain('data-testid="level-artwork-workspace"');
    expect(editor).toContain('<PredrawnBackgroundVersionsPanel');
    expect(editor).toContain(") : predrawnArtworkWorkspaceOpen ? (");
    expect(editor).toContain('className="skirmish-card le-artwork-rail-summary"');
  });

  it('keeps generation-frame input and immutable versions together, not in Board controls', () => {
    const workspaceStart = editor.indexOf("{predrawnArtworkWorkspaceOpen && !eventsOpen ? (");
    const eventsStart = editor.indexOf('{eventsOpen ? (', workspaceStart);
    const workspace = editor.slice(workspaceStart, eventsStart);
    const boardControlsStart = editor.indexOf("{layer === 'board' ? (");
    const boardControlsEnd = editor.indexOf("{layer !== 'status'", boardControlsStart);
    const boardControls = editor.slice(boardControlsStart, boardControlsEnd);

    expect(workspaceStart).toBeGreaterThan(-1);
    expect(workspace).toContain('data-testid="open-predrawn-generation-frame"');
    expect(workspace).toContain('data-testid="open-predrawn-reference"');
    expect(workspace).toContain('<PredrawnBackgroundVersionsPanel');
    expect(boardControls).not.toContain('PredrawnBackgroundVersionsPanel');
    expect(boardControls).not.toContain('open-predrawn-generation-frame');
  });

  it('presents each transform as one artifact and has no independent mask selector', () => {
    expect(panel).toContain("selectedArtifact.stage === 'generated'");
    expect(panel).toContain('Generate warped board');
    expect(panel).toContain("selectedArtifact.stage === 'warped'");
    expect(panel).toContain('Generate occlusion-ready board');
    expect(panel).toContain("selectedArtifact.stage === 'occlusion-ready'");
    expect(panel).toContain('Set this board version');
    expect(panel).toContain('predrawnBoardSurfaceForArtifact(selectedArtifact)');
    expect(panel).toContain('<StudioReadOnlyBoard');
    expect(panel).toContain('hidden={{ tile: false, unit: true, doodad: false }}');
    expect(panel).toContain('onTerrainFirstFrame={acknowledgeTerrain}');
    expect(panel).toContain('onSceneFirstFrame={acknowledgeScene}');
    expect(panel).toContain('onFrameError={failPaint}');
    expect(panel).toContain('!selectedPreviewReady');
    expect(panel).toContain("followsPrevious ? '→' : parentArtifact ? '↳' : '•'");
    expect(panel).toContain('loading="lazy"');
    expect(panel).toContain("rejection.reason !== 'archived'");
    expect(panel).toContain('predrawnBoardArtifactStoredChildren(versions, selectedArtifact)');
    expect(panel).not.toContain('Upload raw PNG');
    expect(panel).not.toContain('aria-label="Occlusion version"');
    expect(panel).not.toContain('selectedOcclusionId');
  });
});
