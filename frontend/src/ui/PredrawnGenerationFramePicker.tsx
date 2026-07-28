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
  initialPredrawnGenerationFrame,
  normalizePredrawnGenerationFrame,
  predrawnGenerationFrameBoardPan,
  predrawnGenerationRequiredBounds,
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
  const editorFrame = useMemo(
    () => normalizePredrawnGenerationFrame(initialFrame) ?? fittedFrame,
    [fittedFrame, initialFrame],
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

  const requiredOutline = {
    left: (requiredBounds.minX - frame.x) * displayScale,
    top: (requiredBounds.minY - frame.y) * displayScale,
    width: requiredBounds.width * displayScale,
    height: requiredBounds.height * displayScale,
  };

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
            <p>Drag the scene and zoom until this 16:9 crop is the exact Image 1 you want to hand off. The cyan box is required gameplay-authoritative art and must stay inside.</p>
          </div>
          <button
            type="button"
            data-chrome-unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            onClick={onClose}
          >Close</button>
        </header>

        <div className="predrawn-generation-frame-toolbar">
          <div className="skirmish-view-row" role="group" aria-label="Generation frame zoom">
            <button
              type="button"
              data-chrome-unit="inner-minus-key"
              className={chromeUnitClassNames('inner-minus-key', 'le-seg-btn', 'le-icon-btn')}
              onClick={() => zoomBy(1.1)}
              aria-label="Show more scenery"
            >−</button>
            <span className="predrawn-generation-frame-readout">{frame.width} × {frame.height}</span>
            <button
              type="button"
              data-chrome-unit="inner-plus-key"
              className={chromeUnitClassNames('inner-plus-key', 'le-seg-btn', 'le-icon-btn')}
              onClick={() => zoomBy(0.9)}
              aria-label="Crop tighter"
            >+</button>
          </div>
          <div className="skirmish-view-row">
            <button
              type="button"
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              onClick={() => setFrame(fittedFrame)}
            >Fit required art</button>
            <button
              type="button"
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              onClick={() => setFrame(editorFrame)}
            >Restore working-copy frame</button>
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
            <button
              type="button"
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              onClick={onClose}
            >{frameAppliedToEditor ? 'Done' : initialFrame ? 'Discard preview' : 'Cancel'}</button>
            {frameAppliedToEditor ? (
              <button
                type="button"
                data-testid="predrawn-generation-frame-review-save"
                data-chrome-unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
                onClick={onReviewSave}
              >{reviewSaveLabel}</button>
            ) : null}
            <button
              type="button"
              data-testid="predrawn-generation-frame-apply"
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames(
                'inner-text-button',
                'le-seg-btn',
                validation.ok && exactFramePainted && !frameAppliedToEditor && 'active',
              )}
              disabled={!validation.ok || !exactFramePainted || frameAppliedToEditor}
              onClick={() => { if (validation.ok && exactFramePainted) onApply(validation.frame); }}
            >{applyLabel}</button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
