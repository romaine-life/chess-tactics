import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import {
  predrawnVisualFootprintClipStyleForCell,
  type EditorBoard,
  type PredrawnBoardCornerRegistration,
} from '@chess-tactics/board-render';
import { StudioReadOnlyBoard } from '../render/StudioReadOnlyBoard';
import { PredrawnMoveHighlightPaint } from '../render/PredrawnMoveHighlightPaint';
import {
  predrawnBoardCoverPolygon,
  runtimePredrawnBoardPlate,
} from '../render/PredrawnBoardLayer';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import type { PredrawnBoardArtifact } from './predrawnBoardArtifacts';
import { ViewPane } from './shared/ViewPane';

const MINIMUM_INSPECTION_ZOOM = 0.2;
const MAXIMUM_INSPECTION_ZOOM = 4;
const INSPECTION_ZOOM_STEP = 0.1;

function initialCyanPreviewCells(board: EditorBoard): Set<string> {
  if (board.cols < 1 || board.rows < 1) return new Set();
  const centerX = Math.max(0, Math.floor((board.cols - 1) / 2));
  const centerY = Math.max(0, Math.floor((board.rows - 1) / 2));
  return new Set([
    `${centerX},${centerY}`,
    `${Math.min(board.cols - 1, centerX + 1)},${centerY}`,
    `${centerX},${Math.min(board.rows - 1, centerY + 1)}`,
  ]);
}

function clampInspectionZoom(value: number, minimum: number): number {
  return Math.min(
    MAXIMUM_INSPECTION_ZOOM,
    Math.max(minimum, Number(value.toFixed(2))),
  );
}

/**
 * Full center-workspace instrument for judging a committed board-art transform.
 *
 * This is intentionally not a modal or nested framed preview. Its parent owns the shell takeover;
 * this component gives the board image the remaining workspace while keeping every review
 * overlay local and non-persistent.
 */
export function PredrawnWarpInspector({
  artifact,
  board,
  reviewGridRegistration,
  canCalibrateMoveHighlights,
  calibrateMoveHighlightsDisabledReason,
  canDiscard,
  discarding,
  discardDisabledReason,
  error,
  onCalibrateMoveHighlights,
  onDiscard,
  onClose,
}: {
  artifact: PredrawnBoardArtifact;
  board: EditorBoard;
  reviewGridRegistration?: PredrawnBoardCornerRegistration;
  canCalibrateMoveHighlights: boolean;
  calibrateMoveHighlightsDisabledReason?: string;
  canDiscard: boolean;
  discarding: boolean;
  discardDisabledReason?: string;
  error?: string;
  onCalibrateMoveHighlights: () => void;
  onDiscard: () => void;
  onClose: () => void;
}): ReactElement {
  const workspaceRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const returnFocusRef = useRef<{
    element: HTMLElement | null;
    testId?: string;
  }>(typeof document === 'undefined'
    ? { element: null }
    : {
        element: document.activeElement as HTMLElement | null,
        testId: (document.activeElement as HTMLElement | null)?.dataset.testid,
      });
  const [paintedLayers, setPaintedLayers] = useState(0);
  const [paintError, setPaintError] = useState<string>();
  const [showRegisteredGrid, setShowRegisteredGrid] = useState(true);
  const [showCyanPreview, setShowCyanPreview] = useState(true);
  const [viewZoom, setViewZoom] = useState(0.55);
  const [viewMinimumZoom, setViewMinimumZoom] = useState(0.55);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [cyanPreviewCells, setCyanPreviewCells] = useState<Set<string>>(
    () => initialCyanPreviewCells(board),
  );

  const previewBoard = useMemo<EditorBoard>(() => ({
    ...board,
    backgroundMode: 'ai',
    surface: artifact.surface,
  }), [artifact.surface, board]);
  const playableCells = useMemo(
    () => Array.from(
      { length: board.rows },
      (_, y) => Array.from({ length: board.cols }, (__, x) => ({ x, y })),
    ).flat(),
    [board.cols, board.rows],
  );
  const coverPolygon = useMemo(
    () => predrawnBoardCoverPolygon(
      runtimePredrawnBoardPlate(artifact.surface),
      playableCells,
    ),
    [artifact.surface, playableCells],
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    workspaceRef.current?.focus();
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.requestAnimationFrame(() => {
        const captured = returnFocusRef.current;
        if (captured.element?.isConnected) {
          captured.element.focus();
          return;
        }
        if (!captured.testId) return;
        const replacement = Array.from(
          document.querySelectorAll<HTMLElement>('[data-testid]'),
        ).find((candidate) => candidate.dataset.testid === captured.testId);
        replacement?.focus();
      });
    };
  }, []);

  useEffect(() => {
    setPaintedLayers(0);
    setPaintError(undefined);
    setCyanPreviewCells(initialCyanPreviewCells(board));
  }, [artifact.id, board.cols, board.rows]);

  const acknowledgeTerrain = useCallback(() => setPaintedLayers((value) => value | 1), []);
  const acknowledgeScene = useCallback(() => setPaintedLayers((value) => value | 2), []);
  const failPaint = useCallback((cause: unknown) => {
    setPaintError(cause instanceof Error
      ? cause.message
      : 'The live board inspection could not be painted.');
  }, []);

  const fitView = (): void => {
    setViewZoom(viewMinimumZoom);
    setViewPan({ x: 0, y: 0 });
  };
  const changeZoom = (delta: number): void => {
    setViewZoom((current) => clampInspectionZoom(current + delta, viewMinimumZoom));
  };
  const discardUnavailableReason = discardDisabledReason
    ?? (artifact.stage === 'warped'
      ? 'This warped board cannot be discarded right now.'
      : 'This mask cannot be discarded right now.');
  const calibrateUnavailableReason = calibrateMoveHighlightsDisabledReason
    ?? 'Cyan-highlight fitting is unavailable right now.';

  return (
    <section
      ref={workspaceRef}
      className="le-predrawn-workspace-inspector"
      data-testid="predrawn-warp-inspector"
      data-artifact-stage={artifact.stage}
      data-painted-layers={paintedLayers}
      tabIndex={-1}
      aria-labelledby="predrawn-warp-inspector-title"
    >
      <header className="le-predrawn-workspace-inspector-head">
        <div>
          <span className="skirmish-eyebrow">Board Art Pipeline · Precision review</span>
          <h2 id="predrawn-warp-inspector-title">
            {artifact.stage === 'warped' ? 'Inspect warped board' : 'Inspect board with occlusion mask'}
          </h2>
          <p>
            {artifact.surface.frameWidth} × {artifact.surface.frameHeight} px · Units hidden ·
            Grid and cyan are live inspection overlays only. Cyan previews the shared tile-highlight footprint.
          </p>
        </div>
        <button
          type="button"
          data-chrome-unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
          onClick={onClose}
        >Close</button>
      </header>

      <div className="le-predrawn-workspace-inspector-toolbar">
        <div
          className="le-predrawn-workspace-inspector-overlays"
          role="group"
          aria-label="Board inspection overlays"
        >
          <button
            type="button"
            data-testid="predrawn-warp-inspector-grid"
            data-chrome-unit="inner-text-button"
            className={chromeUnitClassNames(
              'inner-text-button',
              'le-seg-btn',
              showRegisteredGrid && 'active',
            )}
            aria-pressed={showRegisteredGrid}
            title="Show the registered review grid using the row and column count saved by the grid-fitting step."
            onClick={() => setShowRegisteredGrid((value) => !value)}
          >Registered grid</button>
          <button
            type="button"
            data-testid="predrawn-warp-inspector-cyan"
            data-chrome-unit="inner-text-button"
            className={chromeUnitClassNames(
              'inner-text-button',
              'le-seg-btn',
              showCyanPreview && 'active',
            )}
            aria-pressed={showCyanPreview}
            title="Preview the exact tile-highlight footprint in cyan. Click authored playable cells to change the sample."
            onClick={() => setShowCyanPreview((value) => !value)}
          >Cyan move preview</button>
        </div>
        <div
          className="le-predrawn-workspace-inspector-zoom"
          role="group"
          aria-label="Board inspection zoom"
        >
          <button
            type="button"
            data-testid="predrawn-warp-inspector-fit"
            data-chrome-unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            title="Fit the artwork to the available workspace and reset its pan."
            onClick={fitView}
          >Fit artwork</button>
          <button
            type="button"
            data-testid="predrawn-warp-inspector-zoom-out"
            data-chrome-unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            aria-label="Zoom out"
            title="Zoom out."
            disabled={viewZoom <= viewMinimumZoom}
            onClick={() => changeZoom(-INSPECTION_ZOOM_STEP)}
          >−</button>
          <output aria-label="Current inspection zoom">{Math.round(viewZoom * 100)}%</output>
          <button
            type="button"
            data-testid="predrawn-warp-inspector-zoom-in"
            data-chrome-unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            aria-label="Zoom in"
            title="Zoom in."
            disabled={viewZoom >= MAXIMUM_INSPECTION_ZOOM}
            onClick={() => changeZoom(INSPECTION_ZOOM_STEP)}
          >+</button>
        </div>
      </div>

      <div className="le-predrawn-workspace-inspector-viewport">
        <ViewPane
          kind="board"
          ariaLabel={`${artifact.title} inspection viewport`}
          zoom={viewZoom}
          pan={viewPan}
          minZoom={MINIMUM_INSPECTION_ZOOM}
          maxZoom={MAXIMUM_INSPECTION_ZOOM}
          onZoomChange={setViewZoom}
          onPanChange={setViewPan}
          coverPolygon={coverPolygon}
          onMinimumZoomChange={setViewMinimumZoom}
        >
          <StudioReadOnlyBoard
            key={`${artifact.id}:${artifact.surface.schemaVersion === 3
              ? artifact.surface.moveHighlightProfile.profileSha256
              : 'uncalibrated'}`}
            board={previewBoard}
            boardZoom={viewZoom}
            boardPan={viewPan}
            hidden={{ tile: false, unit: true, doodad: false }}
            ariaLabel={`Live board inspection of ${artifact.title}`}
            showGrid={showRegisteredGrid}
            reviewGridRegistration={reviewGridRegistration}
            renderCellOverlay={showCyanPreview
              ? (cell) => {
                  const highlighted = cyanPreviewCells.has(cell.key);
                  const visualFootprintStyle = predrawnVisualFootprintClipStyleForCell(
                    artifact.surface,
                    cell.key,
                  );
                  return (
                    <button
                      type="button"
                      className={`skirmish-board-cell-hit${highlighted ? ' is-move' : ''}`}
                      style={visualFootprintStyle as CSSProperties | undefined}
                      aria-label={`${highlighted ? 'Remove' : 'Add'} cyan move preview at ${cell.x}, ${cell.y}`}
                      aria-pressed={highlighted}
                      title="Toggle cyan move preview on this authored playable cell."
                      onPointerDown={(event) => {
                        if (event.button === 0) event.stopPropagation();
                      }}
                      onClick={() => {
                        setCyanPreviewCells((current) => {
                          const next = new Set(current);
                          if (next.has(cell.key)) next.delete(cell.key);
                          else next.add(cell.key);
                          return next;
                        });
                      }}
                    >
                      <PredrawnMoveHighlightPaint />
                    </button>
                  );
                }
              : undefined}
            onTerrainFirstFrame={acknowledgeTerrain}
            onSceneFirstFrame={acknowledgeScene}
            onFrameError={failPaint}
          />
        </ViewPane>
        {paintError ? (
          <span className="le-predrawn-workspace-inspector-paint-status is-error" role="alert">
            Inspection failed · {paintError}
          </span>
        ) : paintedLayers !== 3 ? (
          <span className="le-predrawn-workspace-inspector-paint-status" role="status">
            Painting full-size board inspection…
          </span>
        ) : null}
      </div>

      <footer className="le-predrawn-workspace-inspector-footer">
        <div className="le-predrawn-workspace-inspector-guidance">
          <strong>
            {artifact.stage === 'warped'
              ? artifact.surface.schemaVersion === 3
                ? 'Tile highlights are fitted to this warp'
                : 'Fit tile highlights before creating a board with an occlusion mask'
              : 'Board with occlusion mask'}
          </strong>
          {artifact.stage === 'warped' ? (
            <>
              <span>
                Fit the visual highlight footprints without changing gameplay cells, or discard this
                result to return to its exact saved grid and generate another warped board in
                this same slot.
              </span>
              {!canCalibrateMoveHighlights ? <small>{calibrateUnavailableReason}</small> : null}
              {!canDiscard ? <small>{discardUnavailableReason}</small> : null}
            </>
          ) : (
            <>
              <span>
                Discard only this mask to keep the warped board, saved grid, and visual-highlight calibration,
                then reopen the mask editor in this same slot.
              </span>
              {!canDiscard ? <small>{discardUnavailableReason}</small> : null}
            </>
          )}
          {error ? (
            <small className="le-predrawn-workspace-inspector-error" role="alert">{error}</small>
          ) : null}
        </div>
        <div className="le-predrawn-workspace-inspector-footer-actions">
          <span>Drag to pan · wheel to zoom · click playable cells to move the cyan sample</span>
          {artifact.stage === 'warped' ? (
            <>
              <button
                type="button"
                data-testid="predrawn-warp-inspector-fit-move-highlights"
                data-chrome-unit="inner-text-button"
                className={chromeUnitClassNames(
                  'inner-text-button',
                  'le-seg-btn',
                  artifact.surface.schemaVersion === 3 ? undefined : 'active',
                )}
                disabled={!canCalibrateMoveHighlights || discarding}
                title={canCalibrateMoveHighlights
                  ? 'Open the full tile-highlight workspace for this exact warped board.'
                  : calibrateUnavailableReason}
                onClick={onCalibrateMoveHighlights}
              >
                {artifact.surface.schemaVersion === 3
                  ? 'Edit tile highlights'
                  : 'Fit tile highlights'}
              </button>
              <button
                type="button"
                data-testid="predrawn-warp-inspector-discard"
                data-chrome-unit="inner-text-button"
                className={chromeUnitClassNames(
                  'inner-text-button',
                  'le-seg-btn',
                  'le-predrawn-workspace-inspector-discard',
                )}
                disabled={!canDiscard || discarding}
                title={canDiscard
                  ? 'Discard this warped result and reopen its saved grid in the same slot.'
                  : discardUnavailableReason}
                onClick={onDiscard}
              >{discarding ? 'Discarding warped board…' : 'Discard & adjust grid'}</button>
            </>
          ) : (
            <button
              type="button"
              data-testid="predrawn-warp-inspector-discard-mask"
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames(
                'inner-text-button',
                'le-seg-btn',
                'le-predrawn-workspace-inspector-discard',
              )}
              disabled={!canDiscard || discarding}
              title={canDiscard
                ? 'Remove only this mask from the slot and reopen the mask editor on the same warped board.'
                : discardUnavailableReason}
              onClick={onDiscard}
            >{discarding ? 'Discarding mask…' : 'Discard mask & edit again'}</button>
          )}
        </div>
      </footer>
    </section>
  );
}
