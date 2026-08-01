import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from 'react';
import {
  BOARD_CAMERA_TECHNICAL_MINIMUM_ZOOM,
  cameraToContainBounds,
  centeredPlayableBoardFramingBounds,
  effectiveBoardCameraCoverPolygon,
  isPredrawnBackgroundActive,
  viewportForMaximumOpeningAspect,
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

/** Resolve the level camera box, intersected with accepted immutable pixels when AI is active. */
export function boardCameraCoverPolygon(board: EditorBoard): { x: number; y: number }[] {
  const acceptedArtPolygon = isPredrawnBackgroundActive(board) && board.surface
    ? predrawnBoardCoverPolygon(
        runtimePredrawnBoardPlate(board.surface),
        Array.from({ length: board.rows }, (_, y) =>
          Array.from({ length: board.cols }, (__, x) => ({ x, y }))).flat(),
      )
    : undefined;
  return effectiveBoardCameraCoverPolygon(board, acceptedArtPolygon);
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
  openingViewportAspectCap,
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
  /** Wider live panes reveal peripheral world without changing the canonical opening zoom. */
  openingViewportAspectCap?: number;
  resetRevision?: number;
}): { markViewInteraction: () => void; resetView: () => void } {
  const userAdjustedRef = useRef(false);
  const lastViewKeyRef = useRef(viewKey);
  const appliedSignatureRef = useRef('');
  const lastResetRevisionRef = useRef(resetRevision);

  const openingCamera = useMemo((): BoardViewCamera | null => {
    if (!viewport) return null;
    return cameraToContainBounds({
      viewport: openingViewportAspectCap === undefined
        ? viewport
        : viewportForMaximumOpeningAspect(viewport, openingViewportAspectCap),
      bounds: centeredPlayableBoardFramingBounds(board),
      minZoom: minimumZoom,
      maxZoom: maximumZoom,
    });
  }, [
    board.cols,
    board.rows,
    maximumZoom,
    minimumZoom,
    openingViewportAspectCap,
    viewport,
  ]);

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

/**
 * Non-interactive contained board view for reference surfaces (e.g. the Enchiridion's unit
 * cards). Same canonical renderer and framing math as FramedReadOnlyBoardView, but it owns no
 * pan/zoom input — a stack of these must never steal the page's wheel scroll — so the camera
 * simply re-contains the playable board whenever the host box resizes.
 */
export function StaticReadOnlyBoardView({
  board,
  ariaLabel,
  className = '',
  maxZoom = 1,
  renderCellOverlay,
}: {
  board: EditorBoard;
  ariaLabel: string;
  className?: string;
  /** Containment cap so small boards don't scale past canonical 1× art. */
  maxZoom?: number;
  renderCellOverlay?: ComponentProps<typeof StudioReadOnlyBoard>['renderCellOverlay'];
}): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<ViewPaneViewportSize | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const measure = () => setViewport((current) => {
      const next = { width: host.clientWidth, height: host.clientHeight };
      return current && current.width === next.width && current.height === next.height
        ? current
        : next;
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const camera = useMemo((): BoardViewCamera | null => {
    if (!viewport) return null;
    return cameraToContainBounds({
      viewport,
      bounds: centeredPlayableBoardFramingBounds(board),
      minZoom: 0.05,
      maxZoom,
    });
  }, [board.cols, board.rows, maxZoom, viewport]);

  return (
    <div ref={hostRef} className={`static-readonly-board-view ${className}`.trim()}>
      {camera ? (
        <StudioReadOnlyBoard
          board={board}
          boardZoom={camera.zoom}
          boardPan={camera.pan}
          ariaLabel={ariaLabel}
          renderCellOverlay={renderCellOverlay}
        />
      ) : null}
    </div>
  );
}

/** Canonical self-contained live preview/replay surface. */
export function FramedReadOnlyBoardView({
  board,
  viewKey,
  ariaLabel,
  baseMinZoom = BOARD_CAMERA_TECHNICAL_MINIMUM_ZOOM,
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
    () => boardCameraCoverPolygon(board),
    [board.backgroundMode, board.cameraBounds, board.cols, board.rows, board.surface],
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
