// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('./PredrawnBackgroundVersionsPanel.tsx', import.meta.url), 'utf8');
const inspector = readFileSync(new URL('./PredrawnWarpInspector.tsx', import.meta.url), 'utf8');
const moveHighlightEditor = readFileSync(new URL('./PredrawnMoveHighlightEditor.tsx', import.meta.url), 'utf8');
const sourcePanel = readFileSync(new URL('./PredrawnSourceArtworkPanel.tsx', import.meta.url), 'utf8');
const attempts = readFileSync(new URL('./predrawnCreationAttempts.ts', import.meta.url), 'utf8');
const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('Level Artwork controls and workspaces', () => {
  it('leaves the board visible on the base Level Artwork layer and covers it only for a chosen workspace', () => {
    expect(editor).toContain("{ id: 'level-artwork', label: 'Level Artwork' }");
    expect(editor).toContain('const [levelArtworkWorkspace, setLevelArtworkWorkspace]');

    const boardFrameStart = editor.indexOf('className={`skirmish-board-frame');
    const boardFrameGate = editor.slice(boardFrameStart, boardFrameStart + 450);
    expect(boardFrameStart).toBeGreaterThan(-1);
    expect(boardFrameGate).toContain('levelArtworkWorkspace');
    expect(boardFrameGate).not.toContain("layer === 'level-artwork'");
    expect(editor).toContain("layer === 'level-artwork' ? (");
    expect(editor).toContain('<h2>Scene Art</h2>');
    expect(editor).toContain('data-testid="artwork-free-placement-surface"');
  });

  it('opens source management and pipeline work as separate route-driven center workspaces', () => {
    expect(editor).toContain("layer === 'level-artwork' && levelArtworkWorkspace");
    expect(editor).toContain("levelArtworkWorkspace === 'source'");
    expect(editor).toContain('data-artwork-workspace={levelArtworkWorkspace}');
    expect(editor).toContain('<PredrawnSourceArtworkPanel');
    expect(editor).toContain('<PredrawnBackgroundVersionsPanel');
    expect(editor).toContain('AI Generation References');
    expect(editor).toContain('Board Art Pipeline');
    expect(editor).toContain('data-testid="level-artwork-workspace"');
  });

  it('keeps the Level Artwork process separate from the Placed Art brushes', () => {
    expect(editor).toContain("{ id: 'placed-art', label: 'Placed Art' }");
    expect(editor).toContain('aria-label="Placed art type"');
    expect(editor).toContain("['artwork', 'Scene Art']");
    expect(editor).toContain("['doodad', 'Doodads']");
    expect(editor).toContain("['prop', 'Props']");
    expect(editor).not.toContain("{ id: 'doodad', label: 'Doodad' }");
    expect(editor).not.toContain("{ id: 'prop', label: 'Prop' }");
  });

  it('offers a persistent Legacy/AI level-background choice without forgetting the AI selection', () => {
    expect(editor).toContain('backgroundMode');
    expect(editor).toContain('Legacy tileset');
    expect(editor).toContain('AI artwork');
    expect(editor).toContain('currentVersionedPredrawnSurface');
    expect(editor).toContain('setPredrawnVersionSurface');
  });

  it('fails closed on stale selection activation and requires write authority for mode changes', () => {
    const modeMutation = editor.match(
      /const setLevelBackgroundMode = \(mode: BoardBackgroundMode\): void => \{([\s\S]*?)\n  \};/,
    )?.[1] ?? '';
    expect(modeMutation).toContain('if (!editorSessionCanWrite)');
    expect(modeMutation).toContain("predrawnSelectionValidation.kind !== 'valid'");
    expect(editor).toContain('data-selection-validity={predrawnSelectionValidation.kind}');
    expect(editor).toContain('disabled={!editorSessionCanWrite || predrawnSelectionValidation.kind');
    expect(editor).toContain("predrawnBackgroundActive={boardBackgroundModeState === 'ai'");
  });
});

describe('AI generation references', () => {
  it('captures the saved level background as an immutable, unit-free and cover-free AI input', () => {
    expect(sourcePanel).toContain('canonicalBoard');
    expect(sourcePanel).toContain('canonicalReady');
    expect(sourcePanel).toContain('boardForPredrawnSourceArtwork(canonicalBoard)');
    expect(sourcePanel).toContain('hidden={{ tile: false, unit: true, doodad: false }}');
    expect(sourcePanel).toContain("kind: 'source'");
    expect(sourcePanel).toContain('Create reference from saved level');
    expect(sourcePanel).toContain('Saved generation references');
    expect(sourcePanel).toContain('Copy generation reference');
    expect(sourcePanel).toContain('Start manual AI handoff');
  });

  it('keeps the source manager busy until pipeline-slot creation actually finishes', () => {
    expect(editor).toContain('onStartAttempt={startArtworkAttempt}');
    expect(editor).not.toContain('onStartAttempt={(sourceVersionId) => { void startArtworkAttempt(sourceVersionId); }}');
    expect(sourcePanel).toContain('await onStartAttempt(selected.id)');
  });

  it('can use either the saved Legacy tileset or the saved AI artwork as another source', () => {
    expect(sourcePanel).toContain('boardBackgroundMode(canonicalBoard)');
    expect(sourcePanel).toContain("topSurfacesOnly={backgroundMode === 'legacy'}");
    expect(sourcePanel).not.toContain('surface: undefined');
  });

  it('does not reuse pixel-equivalent sources across distinct canonical revisions', () => {
    expect(editor).toContain('canonicalRevision={editorDocument.saved_revision}');
    expect(sourcePanel).toContain('canonicalRevision: number');
    expect(sourcePanel).toMatch(/canonicalLevelSignature,\s+canonicalRevision,\s+backgroundMode/);
    expect(sourcePanel).not.toContain('const existing = sources.find');
  });
});

describe('creation attempts', () => {
  it('shows a Generation Reference only for manual handoff slots and one processing stage per result', () => {
    expect(panel).toContain('Pipeline slots');
    expect(panel).toContain('Selected pipeline slot stages');
    expect(panel).toContain('selectedAttempt?.sourceArtwork && !selectedAttemptUsesPipelineSource');
    expect(panel).toContain("(['generated', 'warped', 'occlusion-ready'] as const)");
    expect(panel).toContain('Raw pipeline source');
    expect(panel).toContain('Generate warped board');
    expect(panel).toContain('Edit occlusion mask');
    expect(panel).toContain('Create board with occlusion mask');
    expect(panel).toContain("'Board with occlusion mask'");
    expect(panel).not.toContain('Occlusion-ready board');
    expect(panel).toContain('<PredrawnOcclusionEditor');
    expect(panel).toContain('generatePredrawnRasterSelectionOcclusion');
    expect(panel).not.toContain('generatePredrawnOcclusionDepthRaster');
    expect(panel).toContain('Set this board version');
    expect(panel).toContain('data-testid="set-predrawn-background-blocker"');
    expect(panel).toContain('Set unavailable');
    expect(panel).toContain('selectedSetDisabledReason');
    expect(panel).toContain('Set will unlock automatically when its artwork and live-scene layers have painted.');
    expect(panel).toContain('<StudioReadOnlyBoard');
    expect(panel).toContain('hidden={{ tile: false, unit: true, doodad: false }}');
  });

  it('gives committed derived pixels a focused full-workspace grid and cyan inspection instrument', () => {
    expect(panel).toContain('<PredrawnWarpInspector');
    expect(panel).toContain('data-testid="inspect-predrawn-board-full-size"');
    expect(panel).toContain('>Inspect full size</button>');
    expect(panel).toContain('className="le-predrawn-version-manager is-inspecting"');
    expect(panel).toContain('setInspectedArtifactId(version.id)');
    expect(inspector).toContain('data-testid="predrawn-warp-inspector"');
    expect(inspector).toContain('className="le-predrawn-workspace-inspector"');
    expect(inspector).not.toContain('createPortal');
    expect(inspector).not.toContain('role="dialog"');
    expect(inspector).toContain('<ViewPane');
    expect(inspector).toContain('predrawnBoardCoverPolygon');
    expect(inspector).toContain('Registered grid');
    expect(inspector).toContain('Cyan move preview');
    expect(inspector).toContain('Fit artwork');
    expect(inspector).toContain('showGrid={showRegisteredGrid}');
    expect(inspector).toContain('reviewGridRegistration={reviewGridRegistration}');
    expect(inspector).toContain("className={`skirmish-board-cell-hit${highlighted ? ' is-move' : ''}`}");
    expect(inspector).toContain('predrawnVisualFootprintClipStyleForCell(');
    expect(inspector).toContain('style={visualFootprintStyle as CSSProperties | undefined}');
    expect(inspector).toContain('<PredrawnMoveHighlightPaint />');
    expect(editor).toContain('predrawnVisualFootprintClipStyleForCell(predrawnPlate?.surface, key)');
    expect(editor).toContain('style={visualFootprintStyle as CSSProperties | undefined}');
    expect(editor).toContain('<PredrawnMoveHighlightPaint />');
    expect(moveHighlightEditor).toContain('<PredrawnMoveHighlightPaint />');
    expect(inspector).toContain('hidden={{ tile: false, unit: true, doodad: false }}');
    const inspectorRule = style.match(/\.le-predrawn-workspace-inspector\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(inspectorRule).toContain('grid-template-rows: auto auto minmax(0, 1fr) auto');
    expect(inspectorRule).toContain('height: 100%');
    expect(style).toMatch(/\.le-artwork-workspace-scroll:has\(> \.le-predrawn-version-manager\.is-inspecting\)/);
    expect(style).toMatch(/\.le-predrawn-artifact-live-preview\s*\{[^}]*pointer-events:\s*none/);
  });

  it('keeps the 16:9 artifact preview inside its own grid track when metadata grows taller', () => {
    const detailRule = style.match(/\.le-predrawn-artifact-detail\s*\{([^}]*)\}/)?.[1] ?? '';
    const previewRule = style.match(/\.le-predrawn-artifact-preview\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(detailRule).toContain('align-items: start');
    expect(previewRule).toContain('align-self: start');
    expect(previewRule).toContain('width: 100%');
  });

  it('gives tile-highlight fitting additive tile selection, outer-border bars, and pixel steppers', () => {
    expect(moveHighlightEditor).toContain('return createPortal(');
    expect(moveHighlightEditor).toContain('predrawn-move-highlight-editor-scrim');
    expect(moveHighlightEditor).toContain('predrawn-move-highlight-editor-panel');
    expect(moveHighlightEditor).toContain('role="dialog"');
    expect(moveHighlightEditor).toContain('aria-modal="true"');
    expect(moveHighlightEditor).toContain('Cyan is the high-contrast preview.');
    expect(moveHighlightEditor).toContain('clip every square-local');
    expect(moveHighlightEditor).toContain('selection logic stay unchanged');
    expect(panel).toContain('const moveHighlightEditorPortal = moveHighlightEditorArtifact');
    expect(panel.match(/\{moveHighlightEditorPortal\}/g)).toHaveLength(2);
    expect(moveHighlightEditor).toContain('const previousFocus = document.activeElement');
    expect(moveHighlightEditor).toContain('const scrimRef = useRef<HTMLDivElement>(null)');
    expect(moveHighlightEditor).toContain('Array.from(document.body.children)');
    expect(moveHighlightEditor).toContain("element.setAttribute('inert', '')");
    expect(moveHighlightEditor).toContain("element.removeAttribute('inert')");
    expect(moveHighlightEditor).toContain("event.key !== 'Tab'");
    expect(moveHighlightEditor).toContain('MOVE_HIGHLIGHT_EDITOR_FOCUSABLE_SELECTOR');
    expect(moveHighlightEditor).toContain('previousFocus?.focus?.()');
    expect(moveHighlightEditor).toContain('<span>Move axis</span>');
    expect(moveHighlightEditor).toContain('data-testid={`predrawn-move-highlight-axis-${constraint}`}');
    expect(moveHighlightEditor).toContain("['free', 'Free']");
    expect(moveHighlightEditor).toContain("['x', 'X only']");
    expect(moveHighlightEditor).toContain("['y', 'Y only']");
    expect(moveHighlightEditor).toContain('shift a selected outer border along artwork X');
    expect(moveHighlightEditor).not.toContain('preserve Y exactly');
    expect(moveHighlightEditor).toContain('predrawn-move-highlight-nudge-left');
    expect(moveHighlightEditor).toContain('predrawn-move-highlight-nudge-up');
    expect(moveHighlightEditor).toContain('predrawn-move-highlight-nudge-down');
    expect(moveHighlightEditor).toContain('predrawn-move-highlight-nudge-right');
    expect(moveHighlightEditor).toContain('predrawnMoveHighlightNativePixelDelta');
    expect(moveHighlightEditor).toContain('predrawnMoveHighlightCellsAfterNudge({');
    expect(moveHighlightEditor).toContain('onClick={() => nudgeActiveTargetByPixels(-1, 0)}');
    expect(moveHighlightEditor).toContain('onClick={() => nudgeActiveTargetByPixels(0, -1)}');
    expect(moveHighlightEditor).toContain('<DirectionArrowIcon degrees={270} />');
    expect(moveHighlightEditor).toContain('<DirectionArrowIcon degrees={0} />');
    expect(moveHighlightEditor).toContain('<DirectionArrowIcon degrees={180} />');
    expect(moveHighlightEditor).toContain('<DirectionArrowIcon degrees={90} />');
    expect(moveHighlightEditor).not.toContain('>←</button>');
    expect(moveHighlightEditor).not.toContain('>↑</button>');
    expect(moveHighlightEditor).not.toContain('>↓</button>');
    expect(moveHighlightEditor).not.toContain('>→</button>');
    expect(moveHighlightEditor).toContain('predrawnMoveHighlightSelectionAfterClick(');
    expect(moveHighlightEditor).toContain('onClick={(event) => selectCell(index, event.shiftKey)}');
    expect(moveHighlightEditor).toContain('Shift+click adds or removes it from the selection.');
    expect(moveHighlightEditor).toContain('predrawnMoveHighlightBoundaryBar(');
    expect(moveHighlightEditor).toContain('predrawnMoveHighlightCellsAfterBoundaryNudge({');
    expect(moveHighlightEditor).toContain('data-testid={`predrawn-move-highlight-${name}-edge-${key}`}');
    expect(moveHighlightEditor).toContain('data-boundary-edge={name}');
    expect(moveHighlightEditor).toContain('tabIndex={boundaryBar[0] === key ? 0 : -1}');
    expect(moveHighlightEditor).toContain("activeTarget?.kind === 'edge'");
    expect(moveHighlightEditor).toContain('activeBoundaryBar.includes(key)');
    expect(moveHighlightEditor).toContain('footprintEdgeButtonStyle(footprint, typedEdge)');
    expect(moveHighlightEditor).toContain("selectedCellKeys.length > 1 ? 'Reset selected' : 'Reset tile'");
    expect(panel).toContain('Fit every square-local highlight to its painted cell');
    expect(panel).toContain('Fit tile highlights');
    expect(moveHighlightEditor).toContain('onPointerCancel={cancelHandleDrag}');
    expect(moveHighlightEditor).toContain('replaceCells(drag.before)');
    const precisionRows = style.match(/\.le-predrawn-move-highlight-editor\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(precisionRows).toContain('grid-template-rows: auto auto auto minmax(0, 1fr) auto');
    const editorPanel = style.match(/\.predrawn-move-highlight-editor-panel\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(editorPanel).toContain('height: min(94dvh, 1080px)');
    expect(editorPanel).toContain('width: min(96vw, 1920px)');
    const edgeControl = style.match(/\.predrawn-move-highlight-edge\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(edgeControl).toContain('height: 8px');
    expect(edgeControl).toContain('pointer-events: auto');
  });

  it('discards a rejected warp and reopens its exact grid in the same pipeline slot', () => {
    expect(inspector).toContain('data-testid="predrawn-warp-inspector-discard"');
    expect(inspector).toContain('Discard & adjust grid');
    expect(inspector).toContain('generate another');
    expect(inspector).toContain('same slot');
    expect(inspector).not.toContain('Tweak grid in new attempt');
    expect(inspector).not.toContain('A new attempt');
    expect(panel).toContain('data-testid="discard-predrawn-warp"');
    expect(panel).toContain('discardPredrawnGenerationAttemptWarp({');
    expect(panel).toContain('predrawnDirectRegistrationForBackground(inspectedArtifact.backgroundVersion)');
    expect(panel).toContain('predrawnDirectRegistrationForBackground(targetWarp)');
    expect(panel).toContain('expectedRevision: targetAttempt.attempt.row_revision');
    expect(panel).toContain('expectedWarpedVersionId: targetWarp.id');
    expect(panel).toContain('setSelectedArtifactId(result.attempt.generated_version_id');
    expect(panel).toContain('setRegistration(rejectedRegistration)');
    expect(panel).toContain('setPickerOpen(true)');
    expect(panel).toContain('setInspectedArtifactId(null)');
    expect(panel).toContain('data-testid="discard-predrawn-warp-feedback"');
    expect(panel).toContain('Discard this warped board?');
    expect(panel).toContain('{discardWarpConfirmDialog}');
    expect(panel).toContain('currentSurface?.backgroundVersionId === warp.id');
    expect(panel).toContain('canonicalSurface?.backgroundVersionId === warp.id');
    expect(panel).toContain("warp.status === 'published'");
    expect(panel).not.toContain('reviseInspectedGrid');
  });

  it('discards only the terminal mask and reopens mask editing on the preserved warp', () => {
    expect(panel).toContain('data-testid="discard-predrawn-occlusion"');
    expect(inspector).toContain('data-testid="predrawn-warp-inspector-discard-mask"');
    expect(panel).toContain('Discard mask & edit again');
    expect(inspector).toContain('Discard mask & edit again');
    expect(panel).toContain('discardPredrawnGenerationAttemptOcclusion({');
    expect(panel).toContain('expectedRevision: current.attemptRevision');
    expect(panel).toContain('expectedOcclusionVersionId: current.occlusionVersionId');
    expect(panel).toContain('documentRevision: current.documentRevision');
    expect(panel).toContain('onDocumentUpdated(result)');
    expect(panel).toContain('upsertVersion(result.detached_version)');
    expect(panel).toContain('setSelectedArtifactId(current.warpedArtifactId)');
    expect(panel).toContain('setOcclusionEditorRoute(current.warpedArtifactId)');
    expect(panel).toContain('The warped board, its saved grid, and its visual-highlight calibration will stay.');
    expect(panel).toContain('If the working copy uses this mask, it will fall back to the same warped board without a mask.');
    expect(panel).toContain('data-testid="discard-predrawn-occlusion-feedback"');
    expect(panel).toContain('workingCopySyncState === \'pending\' || workingCopySyncState === \'saving\'');
    expect(panel).toContain('Resolve the cloud autosave interruption before discarding this mask.');
    expect(panel).toContain('{discardOcclusionConfirmDialog}');
    expect(panel).not.toContain('setMoveHighlightProfile(undefined)');
  });

  it('keys each warp generation to the slot processing revision while preserving pending-upload replay', () => {
    expect(panel).toContain('selectedAttempt.warpedPending?.operation.attemptProcessingRevision');
    expect(panel).toContain('Number.isSafeInteger(selectedAttempt.attempt.processing_revision)');
    expect(panel).toContain('attemptProcessingRevision,');
    expect(panel).toContain('`${selectedAttempt.attempt.id}:${attemptProcessingRevision}`');
  });

  it('makes the manual clipboard boundary explicit without conflating either side of it', () => {
    expect(panel).toContain('Manual Codex handoff');
    expect(panel).toContain('data-testid="copy-generation-reference"');
    expect(panel).not.toContain('copy-pipeline-source');
    expect(panel).toContain('data-testid="paste-generated-board"');
    expect(panel).toContain('data-testid="clipboard-handoff-status"');
    expect(panel).toContain('predrawnPngFromPasteEvent');
    expect(panel).toContain("'manual-clipboard-handoff'");
    expect(panel).toContain("'owner-upload'");
    expect(panel).toContain('Use existing Codex-painted board');
    expect(panel).toContain("selectedAttempt?.attempt.origin === 'source'");
    expect(panel).toContain('&& generatedSlotResumable ? <section');
  });

  it('binds an asynchronous pasted preview to the slot that initiated the paste', () => {
    expect(panel).toContain('attemptId: string;');
    expect(panel).toContain('createPredrawnPngIngressGuard(selectedAttemptId)');
    expect(panel).toContain('pngIngressGuard.isCurrent(operation)');
    expect(panel).toContain('stagedPipelineSource.attemptId !== selectedAttempt?.attempt.id');
    expect(panel).toContain('{stagedPipelineSource');
    expect(panel).toContain('stagedPipelineSource.attemptId === selectedAttempt?.attempt.id');
    expect(panel).toContain('pngIngressGuard.dispose()');
    expect(panel).toContain('URL.revokeObjectURL(previewUrl)');
  });

  it('routes clipboard paste, native Ctrl+V, and chosen files through preview and confirmation', () => {
    expect(panel).toContain('event.clipboardData?.items');
    expect(panel).toContain('event.clipboardData?.files');
    expect(panel).toContain('previewPipelineSourceFromFile(file)');
    expect(panel).toContain("await previewPipelineSource(file, operation, 'owner-upload', file.name)");
    expect(panel).toContain('commitStagedPipelineSource');
    expect(panel).toContain('stagedPipelineSource.originalFileName');
    expect(panel).not.toContain("importRawBlob(file, 'owner-upload'");
  });

  it('disables every handoff ingress and commit while another operation or writer gate blocks it', () => {
    expect(panel).toContain('disabled={Boolean(handoffBusy)}');
    expect(panel).toContain(
      'disabled={!canWrite || !selectedAttemptCanProcess || !generatedSlotResumable || Boolean(busy) || Boolean(handoffBusy)}',
    );
  });

  it('requires a new attempt for alternatives instead of exposing arbitrary stage branches', () => {
    expect(panel).not.toContain('Start manual AI handoff');
    expect(sourcePanel).toContain('Start manual AI handoff');
    expect(panel).toContain('data-testid="start-attempt-from-pipeline-source"');
    expect(panel).toContain('Pipeline Source for a new attempt');
    expect(panel).toContain('selectedNewPipelineSource');
    expect(panel).toContain('setSelectedArtifactId(attempt.generated_version_id ?? pipelineSource.id)');
    expect(panel).not.toContain('createAttemptFromSelectedPipelineSource');
    expect(panel).not.toContain('pipelineSourceAttemptId');
    expect(panel).not.toContain('Start new attempt from this image');
    expect(panel).toContain('This attempt already has a saved Pipeline Source.');
    expect(panel).toContain('Archive slot');
    expect(panel).not.toContain('predrawnBoardArtifactStoredChildren');
    expect(panel).not.toContain('aria-label="Occlusion version"');
    expect(panel).not.toContain('selectedOcclusionId');
    expect(attempts).toContain('attempt.generated_version_id');
    expect(attempts).toContain('attempt.warped_version_id');
    expect(attempts).toContain('attempt.occlusion_version_id');
  });

  it('offers saved Pipeline Sources before any slot is selected or created', () => {
    const picker = panel.indexOf('aria-label="Create pipeline attempt from a saved Pipeline Source"');
    const slotList = panel.indexOf('aria-label="Pipeline slots"');
    expect(picker).toBeGreaterThan(-1);
    expect(slotList).toBeGreaterThan(picker);
    expect(panel).toContain("const pipelineSources = versions.filter((version) => (");
    expect(panel).toContain("version.kind === 'raw'");
    expect(panel).toContain('version.pipeline_source_eligible');
    expect(panel).toContain('environmentGeometryMatches(environmentGeometryFromVersion(version), currentEnvironmentGeometry)');
    expect(panel).toContain('disabled={!canWrite || !selectedNewPipelineSource || Boolean(busy)}');
    expect(panel).toContain('data-testid="pipeline-attempt-feedback"');
    const createAttemptHandler = panel.slice(
      panel.indexOf('const createAttemptFromPipelineSource'),
      panel.indexOf('const importRawBlob'),
    );
    expect(createAttemptHandler).toContain('setAttemptCreationFeedback({ tone: \'error\', message });');
    expect(createAttemptHandler).not.toContain('if (onMutationError(cause)) return;');
    const archiveOwnership = attempts.slice(
      attempts.indexOf('export function predrawnAttemptArchivePolicy'),
      attempts.indexOf('/** Present legacy stored Source Artwork labels'),
    );
    expect(archiveOwnership).not.toContain('generated_version_id');
    expect(archiveOwnership).toContain('warped_version_id');
    expect(archiveOwnership).toContain('occlusion_version_id');
  });

  it('archives dormant Legacy selections explicitly while protecting active AI and published use', () => {
    expect(editor).toContain('workingBackgroundMode={boardBackgroundMode(currentEditorBoard)}');
    expect(editor).toContain('canonicalBackgroundMode={canonicalEditorBoard');
    expect(editor).toContain('boardBackgroundMode(canonicalEditorBoard)');
    expect(panel).toContain('predrawnAttemptArchivePolicy({');
    expect(panel).toContain('const selectedAttemptArchiveAction = predrawnAttemptArchiveAction({');
    expect(attempts).toContain('input.policy.blockedByWorkingSelection');
    expect(attempts).toContain('input.policy.blockedByCanonicalSelection');
    expect(attempts).toContain('input.policy.blockedByPublishedVersion');
    expect(panel).toContain('const archiveConfirmationTitle = selectedAttemptForgetsDormantSelection');
    expect(panel).toContain('Archive slot and forget its AI selection?');
    expect(panel).toContain('The visible Legacy tileset will not change.');
    expect(panel).toContain('data-testid="archive-pipeline-slot"');
    expect(panel).toContain('data-testid="archive-pipeline-slot-state"');
    expect(panel).toContain('data-testid="archive-pipeline-slot-feedback"');
    expect(panel).toContain("data-state={selectedAttemptArchiveState}");
    expect(panel).toContain('disabled={!selectedAttemptArchiveAction.ready}');
    expect(attempts).toContain('Archiving will forget this slot’s remembered AI selection; Legacy art will not change.');
    expect(attempts).toContain('This slot supplies the working Level’s active AI background.');
    expect(attempts).toContain('This slot contains published artwork history and cannot be archived.');
    expect(attempts).toContain('Wait for cloud autosave to finish before archiving.');
    expect(attempts).toContain("input.workingCopySyncState !== 'saved'");
    expect(panel).toContain('tone: \'danger\'');
    expect(panel).toContain('{archiveConfirmDialog}');
    expect(panel).toContain('documentRevision,');
    expect(panel).toContain('onDocumentUpdated(archived)');
    expect(editor).toContain('documentRevision={editorDocument.revision}');
    expect(editor).toContain('onDocumentUpdated={mountAcknowledgedPredrawnWorkspaceMutation}');
    expect(editor).toContain('useCampaigns.getState().replaceLevel(result.canonical_level)');
    expect(editor).toContain('mountAcknowledgedWorkingCopy(result.document)');
    expect(editor).toContain('if (isEditorDocumentConflict(error))');

    const revisionScopeStart = editor.indexOf(
      'const mountAcknowledgedPredrawnWorkspaceMutation',
    );
    const revisionScopeEnd = editor.indexOf(
      'const handlePredrawnVersionMutationError',
      revisionScopeStart,
    );
    const revisionScope = editor.slice(revisionScopeStart, revisionScopeEnd);
    expect(revisionScope).toContain("result.document.workspace_kind === 'official'");
    expect(revisionScope).toContain(
      'useCampaigns.getState().setOfficialWorkspaceRevision(result.workspace_revision)',
    );
    expect(revisionScope).toContain(
      'useCampaigns.getState().setUserWorkspaceRevision(result.workspace_revision)',
    );
  });
});
