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
  clampPredrawnGenerationFrame,
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
/**
 * Slack the crop leaves inside its clipping slot. Enough for its own frame line to survive on all
 * four sides, and enough of a gutter that the crop reads as a bounded picture sitting in the dialog
 * rather than as the dialog's own background — which is what a flush edge looked like.
 */
const FRAME_LINE_ROOM = 28;
/** Scene around the player's farthest view, as a multiple of it. Roomy is the default. */
const SNUG_ROOM = 1;
const ROOMY_ROOM = 1.5;
const WIDE_ROOM = 2.25;

/** Grow (or shrink) a rectangle about its own centre. */
export function expandBounds(
  bounds: { minX: number; minY: number; width: number; height: number },
  factor: number,
): { minX: number; minY: number; width: number; height: number } {
  const width = bounds.width * factor;
  const height = bounds.height * factor;
  return {
    minX: bounds.minX + (bounds.width - width) / 2,
    minY: bounds.minY + (bounds.height - height) / 2,
    width,
    height,
  };
}

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
}: {
  board: EditorBoard;
  initialFrame?: PredrawnGenerationFrame;
  applicationStatus: PredrawnGenerationFrameStatus;
  onApply: (frame: PredrawnGenerationFrame) => void;
  onClose: () => void;
}): ReactElement {
  const sourceBoard = useMemo(() => boardForTopSurfaceArtExport(board), [board]);
  const requiredBounds = useMemo(() => predrawnGenerationRequiredBounds(sourceBoard), [sourceBoard]);
  const fittedFrame = useMemo(() => initialPredrawnGenerationFrame(sourceBoard), [sourceBoard]);
  // The tightest legal fit IS this level's minimum width: below it no position on the board can hold
  // the required art, so zooming past it strands the owner in a crop that can never be applied and
  // whose outlines can never all be brought inside — pulling one edge in pushes the opposite out.
  const minFrameWidth = fittedFrame.width;
  const clampFrame = useCallback(
    (next: PredrawnGenerationFrame) => clampPredrawnGenerationFrame(sourceBoard, next),
    [sourceBoard],
  );
  const resizeTo = (current: PredrawnGenerationFrame, width: number): PredrawnGenerationFrame => (
    clampFrame(resizePredrawnGenerationFrame(current, Math.max(minFrameWidth, width)))
  );
  // The Board page's camera boundary in this frame's coordinates: the box a player can actually
  // reach at maximum zoom-out, so art inside it is what must exist. It contains the level's own
  // opening/thumbnail composition by construction (normalizeBoardCameraBounds guarantees it), which
  // is why there is no separate opening-view preset — that crop is always a subset of this one and
  // would always leave part of the reachable region outside the reference.
  const cameraBounds = useMemo(
    () => predrawnGenerationBoundsFromCentered(board, resolvedBoardCameraBounds(board)),
    [board],
  );
  // Room is the whole point of this crop: the model paints what it is shown, so a picture that stops
  // at the player's reach gives it nothing to compose with and the board comes back cramped. Every
  // preset is therefore "the player's view, plus this much scene around it".
  const roomFrame = useCallback(
    (room: number) => predrawnGenerationFrameContaining(sourceBoard, expandBounds(cameraBounds, room)),
    [cameraBounds, sourceBoard],
  );
  const roomFrames = useMemo(() => ({
    snug: roomFrame(SNUG_ROOM),
    roomy: roomFrame(ROOMY_ROOM),
    wide: roomFrame(WIDE_ROOM),
  }), [roomFrame]);
  const editorFrame = useMemo(
    () => normalizePredrawnGenerationFrame(initialFrame) ?? roomFrames.roomy,
    [roomFrames, initialFrame],
  );
  const [frame, setFrame] = useState(editorFrame);
  const [stageSize, setStageSize] = useState({ width: 1280, height: 720 });
  const [paintedLayers, setPaintedLayers] = useState(0);
  const [paintError, setPaintError] = useState<string>();
  const stageSlotRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const validation = useMemo(() => validatePredrawnGenerationFrame(sourceBoard, frame), [frame, sourceBoard]);
  // A crop tighter than the camera boundary is legal, but it leaves reachable world unpainted — and
  // the boundary outline then runs off the crop edge, which reads as a broken box unless it is said
  // out loud. Only the deliberately tightest preset and hand-cropping can reach that state.
  const cameraOutsideCrop = cameraBounds.minX < frame.x
    || cameraBounds.minY < frame.y
    || cameraBounds.minX + cameraBounds.width > frame.x + frame.width
    || cameraBounds.minY + cameraBounds.height > frame.y + frame.height;
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
        detail: `This crop has not been applied to the working copy.${cameraOutsideCrop ? ' It is tighter than the player can see, so part of what they reach will have no painted art behind it.' : ''}`,
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
    // Leave room for the stage's own 1px frame line. It is painted outside the element, so sizing
    // the stage to the full slot lets the clipping slot shave whichever edges are flush — the crop
    // then reads as an unbordered black field on those sides.
    const measure = (): void => {
      const width = Math.min(slot.clientWidth - FRAME_LINE_ROOM, (slot.clientHeight - FRAME_LINE_ROOM) * 16 / 9);
      setStageSize({ width, height: width * 9 / 16 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(slot);
    return () => observer.disconnect();
  }, []);

  const zoomBy = (factor: number): void => {
    setFrame((current) => resizeTo(current, current.width * factor));
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
    // Clamped, so the drag stops at the boundary rather than walking required art out of the crop.
    setFrame(clampFrame({
      ...drag.frame,
      x: Math.round(drag.frame.x - (event.clientX - drag.startX) / displayScale),
      y: Math.round(drag.frame.y - (event.clientY - drag.startY) / displayScale),
    }));
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
  // How much scene this crop shows beyond the player's farthest view, which is the thing being
  // chosen here. Negative means the crop cuts into what the player can reach.
  const roomBeyondView = Math.round((frame.width / cameraBounds.width - 1) * 100);
  const presets: Array<{ id: string; label: string; title: string; frame: PredrawnGenerationFrame }> = [
    {
      id: 'snug',
      label: 'Snug',
      title: 'Stops at the player\'s farthest view. No scenery beyond it for the model to compose with.',
      frame: roomFrames.snug,
    },
    {
      id: 'roomy',
      label: 'Roomy',
      title: 'Half again as much scene as the player can reach. The default, and the safe choice.',
      frame: roomFrames.roomy,
    },
    {
      id: 'wide',
      label: 'Wide',
      title: 'Over twice the player\'s reach. Most scenery for the model, smallest board in the picture.',
      frame: roomFrames.wide,
    },
    {
      id: 'minimum',
      label: 'Minimum',
      title: 'The tightest crop this level allows. Cuts into what the player can reach.',
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
            <h2 id="predrawn-generation-frame-title">How much scene the AI gets to paint</h2>
            <p>This 16:9 crop is the picture handed to the model, and the model paints what it is shown. The wider you set it, the more room the painted board has around it; a crop that stops at the player&rsquo;s view comes back cramped. Pick a preset, then drag or set an exact width.</p>
          </div>
          <ChromeButton unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            onClick={onClose}
          >Close</ChromeButton>
        </header>

        <div className="predrawn-generation-frame-toolbar">
          <div
            className="predrawn-generation-frame-size"
            role="group"
            aria-label="Generation frame width"
            title={`${minFrameWidth}px is the tightest crop that can hold this level's required art.`}
          >
            <span className="predrawn-generation-frame-size-label">Width</span>
            <Stepper
              suffix="px"
              decreaseLabel="Crop tighter"
              increaseLabel="Show more scenery"
              onDecrease={() => zoomBy(0.9)}
              onIncrease={() => zoomBy(1.1)}
              edit={{
                value: frame.width,
                min: minFrameWidth,
                format: (value) => String(value),
                parse: (raw) => {
                  const parsed = Number(raw.trim().replace(/px$/i, ''));
                  return raw.trim() && Number.isFinite(parsed) ? parsed : null;
                },
                onCommit: (value) => setFrame((current) => resizeTo(current, value)),
                ariaLabel: 'Generation frame width in pixels',
              }}
            />
            <span
              className="predrawn-generation-frame-readout"
              data-testid="predrawn-generation-frame-room"
            >× {frame.height} · {roomBeyondView >= 0 ? `+${roomBeyondView}% scene` : `${roomBeyondView}% — cuts in`}</span>
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
            ><span className="le-camera-boundary-label">Player can see to here</span></div>
            <div
              className="predrawn-generation-frame-required-outline"
              data-testid="predrawn-generation-frame-required-outline"
              style={requiredOutline}
              aria-hidden="true"
            ><span className="predrawn-generation-frame-outline-label">The level itself — must be in shot</span></div>
            {/* The crop is the field these two boxes sit in, so it needs naming most of all: with
                only an edge line to go on it reads as the dialog's background, not as the picture. */}
            <span className="predrawn-generation-frame-crop-label" aria-hidden="true">
              This whole area is the picture
            </span>
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
