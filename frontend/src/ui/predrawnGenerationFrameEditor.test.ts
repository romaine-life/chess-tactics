// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const levelEditor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const picker = readFileSync(new URL('./PredrawnGenerationFramePicker.tsx', import.meta.url), 'utf8');
const reference = readFileSync(new URL('./PredrawnReference.tsx', import.meta.url), 'utf8');
const studioBoard = readFileSync(new URL('../render/StudioReadOnlyBoard.tsx', import.meta.url), 'utf8');
const sceneLayer = readFileSync(new URL('../render/BoardSceneLayer.tsx', import.meta.url), 'utf8');

describe('Level Editor pre-drawn generation frame handoff', () => {
  it('opens and closes the owner frame picker through reversible URL state', () => {
    const opening = levelEditor.match(
      /const openPredrawnGenerationFrame = \(\): void => \{([\s\S]*?)\n  \};/,
    )?.[1] ?? '';
    const closing = levelEditor.match(
      /const closePredrawnGenerationFrame = \(\): void => \{([\s\S]*?)\n  \};/,
    )?.[1] ?? '';
    const control = levelEditor.match(
      /<ChromeButton[\s\S]*?data-testid="open-predrawn-generation-frame"[\s\S]*?<\/ChromeButton>/,
    )?.[0] ?? '';

    expect(levelEditor).toContain("searchParams.get('generationFrame') === '1'");
    expect(opening).toContain("url.searchParams.set('generationFrame', '1')");
    expect(opening).toContain('setPredrawnGenerationFrameOpen(true)');
    expect(opening).toContain('if (!editorSessionCanWrite)');
    expect(closing).toContain("url.searchParams.delete('generationFrame')");
    expect(closing).toContain('setPredrawnGenerationFrameOpen(false)');
    expect(control).toContain('onClick={openPredrawnGenerationFrame}');
    expect(control).toContain('disabled={!editorSessionCanWrite}');
    expect(control).toContain("currentEditorBoard.predrawnGenerationFrame ? 'Edit viewing pane' : 'Choose viewing pane'");
  });

  it('applies the selected frame to the autosaved working editor without publishing', () => {
    const apply = levelEditor.match(
      /const applyPredrawnGenerationFrame = \(frame: PredrawnGenerationFrame\): void => \{([\s\S]*?)\n  \};/,
    )?.[1] ?? '';

    expect(levelEditor).toContain('() => initialBoard?.predrawnGenerationFrame');
    expect(levelEditor).toMatch(
      /const currentEditorBoard = useMemo<EditorBoard>[\s\S]*?predrawnGenerationFrame: boardPredrawnGenerationFrame/,
    );
    expect(apply).toContain('commitEditorBoard({');
    expect(apply).toContain('if (!editorSessionCanWrite)');
    expect(apply).toContain('...cloneEditorBoard(currentEditorBoardRef.current)');
    expect(apply).toContain('predrawnGenerationFrame: frame');
    expect(apply).toContain('It is being autosaved to the working copy.');
    expect(apply).not.toContain('saveLevel');
    expect(apply).not.toContain('closePredrawnGenerationFrame');
    expect(levelEditor).toMatch(
      /<PredrawnGenerationFramePicker[\s\S]*?initialFrame=\{currentEditorBoard\.predrawnGenerationFrame\}[\s\S]*?onApply=\{applyPredrawnGenerationFrame\}/,
    );
  });

  it('keeps post-apply state visible without routing artwork preparation to Publish', () => {
    expect(picker).toContain("'Apply to working copy'");
    expect(picker).toContain("'Applied to working copy'");
    expect(picker).toContain('data-testid="predrawn-generation-frame-application-status"');
    expect(picker).not.toContain('predrawn-generation-frame-review-save');
    expect(levelEditor).not.toContain('reviewPredrawnGenerationFrameSave');
    expect(levelEditor).not.toContain('Review & publish pane');
    expect(levelEditor).toContain('data-testid="predrawn-generation-frame-status"');
    expect(levelEditor).toContain('>Preview current input</ChromeNavButton>');
  });

  it('waits for both canonical canvas layers to paint before enabling either handoff path', () => {
    expect(picker).toContain("data-ready={exactFramePainted ? 'true' : 'false'}");
    expect(picker).toContain('onTerrainFirstFrame={acknowledgeTerrain}');
    expect(picker).toContain('onSceneFirstFrame={acknowledgeScene}');
    expect(picker).toContain('disabled={!validation.ok || !exactFramePainted || frameAppliedToEditor}');
    expect(reference).toContain('if (!sourcesReady || !terrainPainted || !scenePainted');
    expect(reference).toContain('onTerrainFirstFrame={acknowledgeTerrain}');
    expect(reference).toContain('onSceneFirstFrame={acknowledgeScene}');
    expect(studioBoard).toContain('onFirstFrame={onTerrainFirstFrame}');
    expect(studioBoard).toContain('onFirstFrame={onSceneFirstFrame}');
    expect(sceneLayer).toContain('onFirstFrame={onFirstFrame}');
  });

  it('shows the playable grid over the generation-frame preview', () => {
    const boardPreview = picker.match(/<StudioReadOnlyBoard[\s\S]*?\/>/)?.[0] ?? '';

    expect(boardPreview).toContain('showGrid');
    expect(studioBoard).toContain('{showGrid ? <BoardGridLayer cells={reviewGridCells} /> : null}');
  });
});
