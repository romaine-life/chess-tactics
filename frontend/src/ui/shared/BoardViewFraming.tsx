import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  cameraToContainBounds,
  centeredPlayableBoardFramingBounds,
  isPredrawnBackgroundActive,
  type EditorBoard,
} from '@chess-tactics/board-render';
import { StudioReadOnlyBoard } from '../../render/StudioReadOnlyBoard';
import {
  predrawnBoardCoverPolygon,
  runtimePredrawnBoardPlate,
} from '../../render/PredrawnBoardLayer';
import { ViewPane, type ViewPaneViewportSize } from './ViewPane';

export interface BoardViewCamera {
  zoom: number;
  pan: { x: number; y: number };
}

/** Resolve the accepted immutable raster boundary for ordinary board-facing viewers. */
export function acceptedBoardCoverPolygon(board: EditorBoard): { x: number; y: number }[] | undefined {
  if (!isPredrawnBackgroundActive(board) || !board.surface) return undefined;
  const cells = Array.from({ length: board.rows }, (_, y) =>
    Array.from({ length: board.cols }, (__, x) => ({ x, y }))).flat();
  return predrawnBoardCoverPolygon(runtimePredrawnBoardPlate(board.surface), cells);
}

/**
 * Keep an untouched view on the canonical board-owned opening composition. User interaction
 * releases that following behavior; a new board identity or explicit reset restores it.
 */
export function useBoardCameraFraming({
  board,
  viewKey,
  viewport,
  minimumZoom,
  maximumZoom,
  zoom,
  setZoom,
  setPan,
  onOpeningCameraChange,
  resetRevision = 0,
}: {
  board: Pick<EditorBoard, 'cols' | 'rows'>;
  viewKey: string;
  viewport: ViewPaneViewportSize | null;
  minimumZoom: number;
  maximumZoom: number;
  zoom: number;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  onOpeningCameraChange?: (camera: BoardViewCamera) => void;
  resetRevision?: number;
}): { markViewInteraction: () => void; resetView: () => void } {
  const userAdjustedRef = useRef(false);
  const lastViewKeyRef = useRef(viewKey);
  const appliedSignatureRef = useRef('');
  const lastResetRevisionRef = useRef(resetRevision);

  const openingCamera = useMemo((): BoardViewCamera | null => {
    if (!viewport) return null;
    return cameraToContainBounds({
      viewport,
      bounds: centeredPlayableBoardFramingBounds(board),
      minZoom: minimumZoom,
      maxZoom: maximumZoom,
    });
  }, [board.cols, board.rows, maximumZoom, minimumZoom, viewport]);

  const applyOpening = useCallback(() => {
    if (!openingCamera) return;
    setZoom(openingCamera.zoom);
    setPan(openingCamera.pan);
  }, [openingCamera, setPan, setZoom]);

  useLayoutEffect(() => {
    if (lastViewKeyRef.current !== viewKey) {
      lastViewKeyRef.current = viewKey;
      userAdjustedRef.current = false;
      appliedSignatureRef.current = '';
    }
    if (lastResetRevisionRef.current !== resetRevision) {
      lastResetRevisionRef.current = resetRevision;
      userAdjustedRef.current = false;
      appliedSignatureRef.current = '';
    }
    if (!openingCamera || !viewport) return;
    onOpeningCameraChange?.(openingCamera);
    const signature = [
      viewKey,
      viewport.width,
      viewport.height,
      openingCamera.zoom,
      openingCamera.pan.x,
      openingCamera.pan.y,
    ].join(':');
    if (!userAdjustedRef.current && appliedSignatureRef.current !== signature) {
      appliedSignatureRef.current = signature;
      applyOpening();
    }
  }, [applyOpening, onOpeningCameraChange, openingCamera, resetRevision, viewKey, viewport]);

  const markViewInteraction = useCallback(() => {
    userAdjustedRef.current = true;
  }, []);
  const resetView = useCallback(() => {
    userAdjustedRef.current = false;
    appliedSignatureRef.current = '';
    applyOpening();
  }, [applyOpening]);

  // Keep the hook honest about controlled zoom changes without treating safety clamping as input.
  void zoom;
  return { markViewInteraction, resetView };
}

/** Canonical self-contained live preview/replay surface. */
export function FramedReadOnlyBoardView({
  board,
  viewKey,
  ariaLabel,
  baseMinZoom = 0.2,
  maxZoom = 2,
  emphasisZoom,
  onTerrainFirstFrame,
  onSceneFirstFrame,
  onFrameError,
}: {
  board: EditorBoard;
  viewKey: string;
  ariaLabel: string;
  baseMinZoom?: number;
  maxZoom?: number;
  /** Optional focused-review enlargement; it never weakens the accepted-art floor. */
  emphasisZoom?: number;
  onTerrainFirstFrame?: () => void;
  onSceneFirstFrame?: () => void;
  onFrameError?: (error: unknown) => void;
}): ReactElement {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [minimumZoom, setMinimumZoom] = useState(baseMinZoom);
  const [viewport, setViewport] = useState<ViewPaneViewportSize | null>(null);
  const coverPolygon = useMemo(
    () => acceptedBoardCoverPolygon(board),
    [board.backgroundMode, board.cols, board.rows, board.surface],
  );
  const { markViewInteraction } = useBoardCameraFraming({
    board,
    viewKey,
    viewport,
    minimumZoom,
    maximumZoom: Math.max(maxZoom, minimumZoom),
    zoom,
    setZoom,
    setPan,
  });

  useLayoutEffect(() => {
    if (emphasisZoom !== undefined) setZoom((current) => Math.max(current, emphasisZoom, minimumZoom));
  }, [emphasisZoom, minimumZoom]);

  return (
    <ViewPane
      kind="board"
      ariaLabel={ariaLabel}
      zoom={zoom}
      pan={pan}
      minZoom={baseMinZoom}
      maxZoom={maxZoom}
      onZoomChange={setZoom}
      onPanChange={setPan}
      coverPolygon={coverPolygon}
      onMinimumZoomChange={setMinimumZoom}
      onViewportSizeChange={setViewport}
      onViewInteraction={markViewInteraction}
    >
      <div className="tileset-view-board-content is-board">
        <StudioReadOnlyBoard
          board={board}
          boardZoom={zoom}
          boardPan={pan}
          ariaLabel={ariaLabel}
          onTerrainFirstFrame={onTerrainFirstFrame}
          onSceneFirstFrame={onSceneFirstFrame}
          onFrameError={onFrameError}
        />
      </div>
    </ViewPane>
  );
}
