import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';
import {
  minimumBoardCameraBounds,
  normalizeBoardCameraBounds,
  type BoardCameraBounds,
} from '@chess-tactics/board-render';

export type CameraBoundaryHandle = 'move' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

const HANDLE_LABELS: Record<CameraBoundaryHandle, string> = {
  move: 'Move camera boundary',
  n: 'Resize camera boundary from top',
  ne: 'Resize camera boundary from top right',
  e: 'Resize camera boundary from right',
  se: 'Resize camera boundary from bottom right',
  s: 'Resize camera boundary from bottom',
  sw: 'Resize camera boundary from bottom left',
  w: 'Resize camera boundary from left',
  nw: 'Resize camera boundary from top left',
};

const RESIZE_HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function cameraBoundsAfterDrag({
  board,
  bounds,
  handle,
  deltaX,
  deltaY,
}: {
  board: { cols: number; rows: number };
  bounds: BoardCameraBounds;
  handle: CameraBoundaryHandle;
  deltaX: number;
  deltaY: number;
}): BoardCameraBounds {
  const required = minimumBoardCameraBounds(board);
  if (handle === 'move') {
    const minDeltaX = required.minX + required.width - (bounds.minX + bounds.width);
    const maxDeltaX = required.minX - bounds.minX;
    const minDeltaY = required.minY + required.height - (bounds.minY + bounds.height);
    const maxDeltaY = required.minY - bounds.minY;
    return {
      ...bounds,
      minX: bounds.minX + clamp(deltaX, minDeltaX, maxDeltaX),
      minY: bounds.minY + clamp(deltaY, minDeltaY, maxDeltaY),
    };
  }

  const candidate = { ...bounds };
  const right = bounds.minX + bounds.width;
  const bottom = bounds.minY + bounds.height;
  if (handle.includes('w')) {
    candidate.minX = Math.min(bounds.minX + deltaX, required.minX);
    candidate.width = right - candidate.minX;
  }
  if (handle.includes('e')) {
    const nextRight = Math.max(right + deltaX, required.minX + required.width);
    candidate.width = nextRight - candidate.minX;
  }
  if (handle.includes('n')) {
    candidate.minY = Math.min(bounds.minY + deltaY, required.minY);
    candidate.height = bottom - candidate.minY;
  }
  if (handle.includes('s')) {
    const nextBottom = Math.max(bottom + deltaY, required.minY + required.height);
    candidate.height = nextBottom - candidate.minY;
  }
  return normalizeBoardCameraBounds(candidate, board) ?? bounds;
}

function sameBounds(a: BoardCameraBounds, b: BoardCameraBounds): boolean {
  return a.minX === b.minX
    && a.minY === b.minY
    && a.width === b.width
    && a.height === b.height;
}

export function CameraBoundaryOverlay({
  board,
  bounds,
  editorZoom,
  editable,
  onCommit,
}: {
  board: { cols: number; rows: number };
  bounds: BoardCameraBounds;
  editorZoom: number;
  editable: boolean;
  onCommit: (bounds: BoardCameraBounds) => void;
}): ReactElement {
  const [draft, setDraft] = useState(bounds);
  const draftRef = useRef(bounds);
  const dragRef = useRef<{
    pointerId: number;
    handle: CameraBoundaryHandle;
    clientX: number;
    clientY: number;
    bounds: BoardCameraBounds;
  } | null>(null);

  useEffect(() => {
    if (dragRef.current) return;
    draftRef.current = bounds;
    setDraft(bounds);
  }, [bounds.height, bounds.minX, bounds.minY, bounds.width]);

  const updateDraft = (
    handle: CameraBoundaryHandle,
    start: BoardCameraBounds,
    deltaX: number,
    deltaY: number,
  ): BoardCameraBounds => {
    const next = cameraBoundsAfterDrag({ board, bounds: start, handle, deltaX, deltaY });
    draftRef.current = next;
    setDraft(next);
    return next;
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, handle: CameraBoundaryHandle): void => {
    if (!editable || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      handle,
      clientX: event.clientX,
      clientY: event.clientY,
      bounds: draftRef.current,
    };
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const zoom = Math.max(0.01, editorZoom);
    updateDraft(
      drag.handle,
      drag.bounds,
      (event.clientX - drag.clientX) / zoom,
      (event.clientY - drag.clientY) / zoom,
    );
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const zoom = Math.max(0.01, editorZoom);
    updateDraft(
      drag.handle,
      drag.bounds,
      (event.clientX - drag.clientX) / zoom,
      (event.clientY - drag.clientY) / zoom,
    );
    dragRef.current = null;
    if (!sameBounds(draftRef.current, bounds)) onCommit(draftRef.current);
  };

  const cancelDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    draftRef.current = bounds;
    setDraft(bounds);
  };

  const adjustWithKeyboard = (
    event: KeyboardEvent<HTMLButtonElement>,
    handle: CameraBoundaryHandle,
  ): void => {
    if (!editable || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 24 : 4;
    const deltaX = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const deltaY = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    const next = updateDraft(handle, draftRef.current, deltaX, deltaY);
    if (!sameBounds(next, bounds)) onCommit(next);
  };

  const style = {
    left: `calc(${draft.minX}px - var(--board-origin-left, 0px))`,
    top: `calc(${draft.minY}px - var(--board-origin-top, 0px))`,
    width: `${draft.width}px`,
    height: `${draft.height}px`,
    '--camera-boundary-control-scale': 1 / Math.max(0.01, editorZoom),
  } as CSSProperties;

  const handleButton = (handle: CameraBoundaryHandle): ReactElement => (
    <button
      key={handle}
      type="button"
      className={`le-camera-boundary-handle is-${handle}`}
      data-camera-handle={handle}
      aria-label={HANDLE_LABELS[handle]}
      onPointerDown={(event) => startDrag(event, handle)}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={cancelDrag}
      onKeyDown={(event) => adjustWithKeyboard(event, handle)}
    />
  );

  return (
    <div
      className={`le-camera-boundary${editable ? ' is-editable' : ''}`}
      data-testid="level-camera-boundary"
      data-camera-min-x={draft.minX}
      data-camera-min-y={draft.minY}
      data-camera-width={draft.width}
      data-camera-height={draft.height}
      style={style}
      role={editable ? 'group' : 'img'}
      aria-label="Camera boundary"
    >
      <span className="le-camera-boundary-label">Camera boundary</span>
      {editable ? (
        <>
          {handleButton('move')}
          {RESIZE_HANDLES.map(handleButton)}
        </>
      ) : null}
    </div>
  );
}
