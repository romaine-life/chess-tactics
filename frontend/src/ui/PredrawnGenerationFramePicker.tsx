import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  centeredPlayableBoardFramingBounds,
  initialPredrawnGenerationFrame,
  normalizePredrawnGenerationFrame,
  predrawnGenerationBoundsFromCentered,
  predrawnGenerationFrameBoardPan,
  predrawnGenerationFrameContaining,
  predrawnGenerationRequiredBounds,
  resolvedBoardCameraBounds,
  validatePredrawnGenerationFrame,
  type EditorBoard,
  type PredrawnGenerationFrame,
} from '@chess-tactics/board-render';
import { boardForTopSurfaceArtExport, StudioReadOnlyBoard } from '../render/StudioReadOnlyBoard';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import {
  predrawnGenerationFrameReadout,
  samePredrawnGenerationFrame,
  type PredrawnGenerationFrameStatus,
} from './predrawnGenerationFrameStatus';
import { ChromeButton } from './shared/ChromeButton';
import { Stepper } from './shared/Stepper';

const MIN_FRAME_WIDTH = 320;
const MAX_FRAME_WIDTH = 8192;

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  frame: PredrawnGenerationFrame;
};

function quantizedFrameWidth(value: number): number {
  return Math.max(MIN_FRAME_WIDTH, Math.min(MAX_FRAME_WIDTH, Math.round(value / 16) * 16));
}

/** Change scene scale while keeping the same canonical projected point at the frame centre. */
export function resizePredrawnGenerationFrame(
  frame: PredrawnGenerationFrame,
  width: number,
): PredrawnGenerationFrame {
  const nextWidth = quantizedFrameWidth(width);
  const nextHeight = nextWidth / 16 * 9;
  const centerX = frame.x + frame.width / 2;
  const centerY = frame.y + frame.height / 2;
  return {
    version: 1,
    x: Math.round(centerX - nextWidth / 2),
    y: Math.round(centerY - nextHeight / 2),
    width: nextWidth,
    height: nextHeight,
  };
}

export function PredrawnGenerationFramePicker({
  board,
  initialFrame,
  applicationStatus,
  onApply,
  onClose,
  onReviewSave,
  reviewSaveLabel,
}: {
  board: EditorBoard;
  initialFrame?: PredrawnGenerationFrame;
  applicationStatus: PredrawnGenerationFrameStatus;
  onApply: (frame: PredrawnGenerationFrame) => void;
  onClose: () => void;
  onReviewSave: () => void;
  reviewSaveLabel: string;
}): ReactElement {
  const sourceBoard = useMemo(() => boardForTopSurfaceArtExport(board), [board]);
  const requiredBounds = useMemo(() => predrawnGenerationRequiredBounds(sourceBoard), [sourceBoard]);
  const fittedFrame = useMemo(() => initialPredrawnGenerationFrame(sourceBoard), [sourceBoard]);
  // The two rectangles the owner already authored elsewhere, in this frame's coordinates: the
  // board's own opening/thumbnail composition, and the Board page's camera boundary — the box a
  // player can actually reach at maximum zoom-out, so art inside it is what must exist.
  const openingBounds = useMemo(
    () => predrawnGenerationBoundsFromCentered(board, centeredPlayableBoardFramingBounds(board)),
    [board],
  );
  const cameraBounds = useMemo(
    () => predrawnGenerationBoundsFromCentered(board, resolvedBoardCameraBounds(board)),
    [board],
  );
  const openingFrame = useMemo(
    () => predrawnGenerationFrameContaining(sourceBoard, openingBounds),
    [openingBounds, sourceBoard],
  );
  const cameraFrame = useMemo(
    () => predrawnGenerationFrameContaining(sourceBoard, cameraBounds),
    [cameraBounds, sourceBoard],
  );
  // With nothing authored yet, open on the camera boundary. It contains the level's opening
  // composition by construction, so the crop still reads as the view a level loads at, and it is
  // the region a player can actually reach — opening on the smaller opening view left the boundary
  // hanging outside the crop with its top edge clipped away by the frame.
  const editorFrame = useMemo(
    () => normalizePredrawnGenerationFrame(initialFrame) ?? cameraFrame,
    [cameraFrame, initialFrame],
  );
  const [frame, setFrame] = useState(editorFrame);
  const [stageSize, setStageSize] = useState({ width: 1280, height: 720 });
  const [paintedLayers, setPaintedLayers] = useState(0);
  const [paintError, setPaintError] = useState<string>();
  const stageSlotRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const validation = useMemo(() => validatePredrawnGenerationFrame(sourceBoard, frame), [frame, sourceBoard]);
  const displayScale = stageSize.width > 0 ? stageSize.width / frame.width : 1;
  const nativeBoardPan = predrawnGenerationFrameBoardPan(sourceBoard, frame);
  const previewBoardPan = {
    x: nativeBoardPan.x * displayScale,
    y: nativeBoardPan.y * displayScale,
  };
  const exactFramePainted = paintedLayers === 3 && !paintError;
  const frameAppliedToEditor = samePredrawnGenerationFrame(
    frame,
    normalizePredrawnGenerationFrame(initialFrame),
  );
  const footerStatus = paintError
    ? {
        kind: 'error',
        title: 'Preview unavailable',
        detail: `The exact frame could not be painted: ${paintError}`,
      }
    : !exactFramePainted
    ? {
        kind: 'painting',
        title: 'Painting exact preview…',
        detail: 'Apply stays locked until both canonical canvas layers have painted.',
      }
    : !validation.ok
    ? {
        kind: 'error',
        title: 'Frame cannot be applied',
        detail: validation.errors.join(' '),
      }
    : !frameAppliedToEditor
    ? {
        kind: 'preview',
        title: `Preview only · ${predrawnGenerationFrameReadout(validation.frame)}`,
        detail: 'This crop has not been applied to the working copy.',
      }
    : applicationStatus;
  const applyLabel = paintError
    ? 'Preview unavailable'
    : !exactFramePainted
    ? 'Painting preview…'
    : !validation.ok
    ? 'Fix frame bounds'
    : frameAppliedToEditor
    ? 'Applied to working copy'
    : 'Apply to working copy';
  const acknowledgeTerrain = useCallback(() => setPaintedLayers((value) => value | 1), []);
  const acknowledgeScene = useCallback(() => setPaintedLayers((value) => value | 2), []);
  const failPaint = useCallback((error: unknown) => {
    setPaintError(error instanceof Error ? error.message : String(error));
  }, []);

  useLayoutEffect(() => {
    const slot = stageSlotRef.current;
    if (!slot) return undefined;
    const measure = (): void => {
      const width = Math.min(slot.clientWidth, slot.clientHeight * 16 / 9);
      setStageSize({ width, height: width * 9 / 16 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  const zoomBy = (factor: number): void => {
    setFrame((current) => resizePredrawnGenerationFrame(current, current.width * factor));
  };

  const startPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      frame,
    };
  };

  const movePan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || displayScale <= 0) return;
    setFrame({
      ...drag.frame,
      x: Math.round(drag.frame.x - (event.clientX - drag.startX) / displayScale),
      y: Math.round(drag.frame.y - (event.clientY - drag.startY) / displayScale),
    });
  };

  const endPan = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const wheelZoom = (event: ReactWheelEvent<HTMLDivElement>): void => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 0.9 : 1.1);
  };

  const outlineFor = (bounds: { minX: number; minY: number; width: number; height: number }) => ({
    left: (bounds.minX - frame.x) * displayScale,
    top: (bounds.minY - frame.y) * displayScale,
    width: bounds.width * displayScale,
    height: bounds.height * displayScale,
  });
  const requiredOutline = outlineFor(requiredBounds);
  const cameraOutline = outlineFor(cameraBounds);
  const presets: Array<{ id: string; label: string; title: string; frame: PredrawnGenerationFrame }> = [
    {
      id: 'opening',
      label: 'Level opening view',
      title: 'The composition this level loads at, and the one its thumbnail shows, widened to 16:9.',
      frame: openingFrame,
    },
    {
      id: 'camera',
      label: 'Camera boundary',
      title: 'The Board page camera boundary — everything a player can reach at maximum zoom-out.',
      frame: cameraFrame,
    },
    {
      id: 'required',
      label: 'Fit required art',
      title: 'The tightest legal crop around gameplay-authoritative art.',
      frame: fittedFrame,
    },
  ];

  return createPortal(
    <div
      className="confirm-scrim predrawn-generation-frame-scrim chrome-family-surface"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        data-testid="predrawn-generation-frame-picker"
        className="confirm-panel predrawn-generation-frame-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="predrawn-generation-frame-title"
      >
        <header className="predrawn-generation-frame-header">
          <div>
            <h2 id="predrawn-generation-frame-title">Choose the generation frame</h2>
            <p>Start from a preset, then drag the scene, type an exact width, or zoom until this 16:9 crop is the exact Image 1 you want to hand off. The tight box is required gameplay-authoritative art and must stay inside; the labelled box is the level’s camera boundary.</p>
          </div>
          <ChromeButton unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            onClick={onClose}
          >Close</ChromeButton>
        </header>

        <div className="predrawn-generation-frame-toolbar">
          <div className="predrawn-generation-frame-size" role="group" aria-label="Generation frame width">
            <span className="predrawn-generation-frame-size-label">Width</span>
            <Stepper
              suffix="px"
              decreaseLabel="Crop tighter"
              increaseLabel="Show more scenery"
              onDecrease={() => zoomBy(0.9)}
              onIncrease={() => zoomBy(1.1)}
              edit={{
                value: frame.width,
                min: MIN_FRAME_WIDTH,
                format: (value) => String(value),
                parse: (raw) => {
                  const parsed = Number(raw.trim().replace(/px$/i, ''));
                  return raw.trim() && Number.isFinite(parsed) ? parsed : null;
                },
                onCommit: (value) => setFrame((current) => resizePredrawnGenerationFrame(current, value)),
                ariaLabel: 'Generation frame width in pixels',
              }}
            />
            <span className="predrawn-generation-frame-readout">× {frame.height} · 16:9</span>
          </div>
          <div className="skirmish-view-row" role="group" aria-label="Generation frame presets">
            {presets.map((preset) => (
              <ChromeButton unit="inner-text-button"
                key={preset.id}
                data-testid={`predrawn-generation-frame-preset-${preset.id}`}
                className={chromeUnitClassNames(
                  'inner-text-button',
                  'le-seg-btn',
                  samePredrawnGenerationFrame(frame, preset.frame) && 'active',
                )}
                aria-pressed={samePredrawnGenerationFrame(frame, preset.frame)}
                title={preset.title}
                onClick={() => setFrame(preset.frame)}
              >{preset.label}</ChromeButton>
            ))}
            <ChromeButton unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              onClick={() => setFrame(editorFrame)}
            >Restore working-copy frame</ChromeButton>
          </div>
        </div>

        <div ref={stageSlotRef} className="predrawn-generation-frame-stage-slot">
          <div
            ref={stageRef}
            className={`predrawn-generation-frame-stage${exactFramePainted ? ' is-painted' : ''}`}
            style={{ width: `${stageSize.width}px`, height: `${stageSize.height}px` }}
            data-testid="predrawn-generation-frame-stage"
            data-ready={exactFramePainted ? 'true' : 'false'}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onContextMenu={(event) => event.preventDefault()}
            onWheel={wheelZoom}
          >
            <StudioReadOnlyBoard
              board={sourceBoard}
              boardZoom={displayScale}
              boardPan={previewBoardPan}
              ariaLabel="Owner-selected pre-drawn generation frame"
              hidden={{ tile: false, unit: true, doodad: false }}
              topSurfacesOnly
              onTerrainFirstFrame={acknowledgeTerrain}
              onSceneFirstFrame={acknowledgeScene}
              onFrameError={failPaint}
            />
            <div
              className="le-camera-boundary"
              data-testid="predrawn-generation-frame-camera-outline"
              style={cameraOutline}
              aria-hidden="true"
            ><span className="le-camera-boundary-label">Camera boundary</span></div>
            <div
              className="predrawn-generation-frame-required-outline"
              style={requiredOutline}
              aria-hidden="true"
            />
            {!exactFramePainted ? (
              <p className={`predrawn-generation-frame-loading${paintError ? ' is-error' : ''}`} role="status">
                {paintError ? `Could not paint this frame: ${paintError}` : 'Painting the exact frame…'}
              </p>
            ) : null}
          </div>
        </div>

        <footer className="predrawn-generation-frame-footer">
          <p
            role="status"
            aria-live="polite"
            data-testid="predrawn-generation-frame-application-status"
            data-state={footerStatus.kind}
            className={footerStatus.kind === 'error' || footerStatus.kind === 'blocked' ? 'is-error' : undefined}
          >
            <strong>{footerStatus.title}</strong>
            <span>{footerStatus.detail}</span>
          </p>
          <div className="confirm-actions">
            <ChromeButton unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              onClick={onClose}
            >{frameAppliedToEditor ? 'Done' : initialFrame ? 'Discard preview' : 'Cancel'}</ChromeButton>
            {frameAppliedToEditor ? (
              <ChromeButton unit="inner-text-button"
                data-testid="predrawn-generation-frame-review-save"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                onClick={onReviewSave}
              >{reviewSaveLabel}</ChromeButton>
            ) : null}
            <ChromeButton unit="inner-text-button"
              data-testid="predrawn-generation-frame-apply"
              className={chromeUnitClassNames(
                'inner-text-button',
                'le-seg-btn',
                validation.ok && exactFramePainted && !frameAppliedToEditor && 'active',
              )}
              disabled={!validation.ok || !exactFramePainted || frameAppliedToEditor}
              onClick={() => { if (validation.ok && exactFramePainted) onApply(validation.frame); }}
            >{applyLabel}</ChromeButton>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
