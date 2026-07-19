import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type WheelEvent,
} from 'react';

type ViewPaneKind = 'tile' | 'transition' | 'board' | 'unit';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const COVER_SEARCH_MAX_ZOOM = 16;

export interface ViewPanePoint {
  x: number;
  y: number;
}

export interface ViewPaneViewportSize {
  width: number;
  height: number;
}

export function zoomAfterMinimumChange({
  zoom,
  minimum,
  automaticFloorZoom,
}: {
  zoom: number;
  minimum: number;
  automaticFloorZoom: number | null;
}): { zoom: number; automaticFloorZoom: number | null } {
  const followsAutomaticFloor = automaticFloorZoom !== null
    && Math.abs(zoom - automaticFloorZoom) < 1e-9;
  if (zoom < minimum || followsAutomaticFloor) {
    return { zoom: minimum, automaticFloorZoom: minimum };
  }
  return { zoom, automaticFloorZoom: null };
}

function polygonSignedArea(polygon: readonly ViewPanePoint[]): number {
  return polygon.reduce((sum, point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function convexPolygonContains(
  polygon: readonly ViewPanePoint[],
  point: ViewPanePoint,
  orientation: number,
): boolean {
  return polygon.every((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    const cross = (end.x - start.x) * (point.y - start.y)
      - (end.y - start.y) * (point.x - start.x);
    return orientation * cross >= -1e-7;
  });
}

function viewportCoveredAtPan({
  viewport,
  polygon,
  zoom,
  pan,
}: {
  viewport: { width: number; height: number };
  polygon: readonly ViewPanePoint[];
  zoom: number;
  pan: ViewPanePoint;
}): boolean {
  if (polygon.length < 3 || zoom <= 0) return false;
  const area = polygonSignedArea(polygon);
  if (Math.abs(area) < 1e-7) return false;
  const orientation = area > 0 ? 1 : -1;
  const viewportCorners = [
    { x: -viewport.width / 2, y: -viewport.height / 2 },
    { x: viewport.width / 2, y: -viewport.height / 2 },
    { x: viewport.width / 2, y: viewport.height / 2 },
    { x: -viewport.width / 2, y: viewport.height / 2 },
  ];
  return viewportCorners.every((corner) => convexPolygonContains(
    polygon,
    { x: (corner.x - pan.x) / zoom, y: (corner.y - pan.y) / zoom },
    orientation,
  ));
}

/** Stops a pan on the first transformed art edge that reaches the viewport. */
export function constrainPanToCoverViewport({
  viewport,
  polygon,
  zoom,
  from,
  to,
}: {
  viewport: { width: number; height: number };
  polygon: readonly ViewPanePoint[];
  zoom: number;
  from: ViewPanePoint;
  to: ViewPanePoint;
}): ViewPanePoint {
  const covers = (pan: ViewPanePoint): boolean => viewportCoveredAtPan({ viewport, polygon, zoom, pan });
  if (covers(to)) return to;
  const start = covers(from) ? from : { x: 0, y: 0 };
  if (!covers(start)) return from;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const middle = (low + high) / 2;
    const candidate = {
      x: start.x + (to.x - start.x) * middle,
      y: start.y + (to.y - start.y) * middle,
    };
    if (covers(candidate)) low = middle;
    else high = middle;
  }
  return {
    x: start.x + (to.x - start.x) * low,
    y: start.y + (to.y - start.y) * low,
  };
}

/**
 * Smallest two-decimal zoom whose centred transformed content covers every viewport corner.
 * The polygon uses the same board-centred coordinate system as `.tileset-generated-board`;
 * The floor is centered and independent of pan. Pan is constrained separately at the art edge.
 */
export function minimumZoomToCoverViewport({
  viewport,
  polygon,
  minZoom,
  maxZoom,
}: {
  viewport: { width: number; height: number };
  polygon: readonly ViewPanePoint[];
  pan?: ViewPanePoint;
  minZoom: number;
  maxZoom: number;
}): number {
  const lower = Math.min(maxZoom, Math.max(0.01, minZoom));
  const upper = Math.max(lower, maxZoom);
  if (
    polygon.length < 3
    || viewport.width <= 0
    || viewport.height <= 0
    || !Number.isFinite(viewport.width)
    || !Number.isFinite(viewport.height)
    || polygon.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
  ) return lower;
  const area = polygonSignedArea(polygon);
  if (Math.abs(area) < 1e-7) return lower;
  const orientation = area > 0 ? 1 : -1;
  if (!convexPolygonContains(polygon, { x: 0, y: 0 }, orientation)) return upper;
  const viewportCorners = [
    { x: -viewport.width / 2, y: -viewport.height / 2 },
    { x: viewport.width / 2, y: -viewport.height / 2 },
    { x: viewport.width / 2, y: viewport.height / 2 },
    { x: -viewport.width / 2, y: viewport.height / 2 },
  ];
  const covers = (zoom: number): boolean => viewportCorners.every((corner) => convexPolygonContains(
    polygon,
    { x: corner.x / zoom, y: corner.y / zoom },
    orientation,
  ));
  if (covers(lower)) return lower;
  if (!covers(upper)) return upper;
  let low = lower;
  let high = upper;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const middle = (low + high) / 2;
    if (covers(middle)) high = middle;
    else low = middle;
  }
  return Math.min(upper, Math.ceil((high - 1e-9) * 100) / 100);
}

export function ViewPane({
  kind,
  ariaLabel,
  zoom,
  pan,
  minZoom,
  maxZoom,
  onZoomChange,
  onPanChange,
  coverPolygon,
  onMinimumZoomChange,
  onViewportSizeChange,
  onAssetClick,
  children,
}: {
  kind: ViewPaneKind;
  ariaLabel: string;
  zoom: number;
  pan: { x: number; y: number };
  minZoom: number;
  maxZoom: number;
  onZoomChange: (zoom: number) => void;
  onPanChange: (pan: { x: number; y: number }) => void;
  /** Convex content boundary that must continue covering the entire viewport. */
  coverPolygon?: readonly ViewPanePoint[];
  /** Reports the viewport-derived floor so external steppers clamp identically to the wheel. */
  onMinimumZoomChange?: (zoom: number) => void;
  /** Reports the live drawable viewport used by projection-aware editor actions. */
  onViewportSizeChange?: (size: ViewPaneViewportSize) => void;
  onAssetClick?: (assetId: string) => void;
  children: ReactNode;
}): ReactElement {
  const stageRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; assetId?: string } | null>(null);
  const automaticFloorZoomRef = useRef<number | null>(null);
  const lastViewportSizeRef = useRef<ViewPaneViewportSize | null>(null);
  const didDragRef = useRef(false);
  const [resolvedMinZoom, setResolvedMinZoom] = useState(minZoom);
  const resolvedMaxZoom = Math.max(maxZoom, resolvedMinZoom);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const updateMinimum = (): void => {
      const viewport = { width: stage.clientWidth, height: stage.clientHeight };
      const previousViewport = lastViewportSizeRef.current;
      if (
        !previousViewport
        || previousViewport.width !== viewport.width
        || previousViewport.height !== viewport.height
      ) {
        lastViewportSizeRef.current = viewport;
        onViewportSizeChange?.(viewport);
      }
      const next = coverPolygon
        ? minimumZoomToCoverViewport({
            viewport,
            polygon: coverPolygon,
            minZoom,
            maxZoom: Math.max(maxZoom, COVER_SEARCH_MAX_ZOOM),
          })
        : minZoom;
      setResolvedMinZoom((current) => Math.abs(current - next) < 1e-9 ? current : next);
    };
    updateMinimum();
    const observer = new ResizeObserver(updateMinimum);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [coverPolygon, maxZoom, minZoom, onViewportSizeChange]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !coverPolygon) return;
    const constrained = constrainPanToCoverViewport({
      viewport: { width: stage.clientWidth, height: stage.clientHeight },
      polygon: coverPolygon,
      zoom,
      from: { x: 0, y: 0 },
      to: pan,
    });
    if (Math.abs(constrained.x - pan.x) >= 1e-7 || Math.abs(constrained.y - pan.y) >= 1e-7) {
      onPanChange(constrained);
    }
  }, [coverPolygon, onPanChange, pan, zoom]);

  useLayoutEffect(() => {
    onMinimumZoomChange?.(resolvedMinZoom);
    const next = zoomAfterMinimumChange({
      zoom,
      minimum: resolvedMinZoom,
      automaticFloorZoom: automaticFloorZoomRef.current,
    });
    automaticFloorZoomRef.current = next.automaticFloorZoom;
    if (Math.abs(next.zoom - zoom) >= 1e-9) onZoomChange(next.zoom);
  }, [onMinimumZoomChange, onZoomChange, resolvedMinZoom, zoom]);

  const startPan = (event: PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const tileElement = (event.target as HTMLElement).closest<HTMLElement>('[data-asset-id]');
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
      assetId: tileElement?.dataset.assetId,
    };
    didDragRef.current = false;
  };

  const movePan = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) {
      didDragRef.current = true;
    }
    const candidate = {
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    };
    const stage = stageRef.current;
    onPanChange(stage && coverPolygon
      ? constrainPanToCoverViewport({
          viewport: { width: stage.clientWidth, height: stage.clientHeight },
          polygon: coverPolygon,
          zoom,
          from: pan,
          to: candidate,
        })
      : candidate);
  };

  const endPan = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!didDragRef.current && drag.assetId) {
      onAssetClick?.(drag.assetId);
    }
    window.setTimeout(() => {
      didDragRef.current = false;
    }, 0);
  };

  const zoomPane = (event: WheelEvent<HTMLElement>) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextZoom = clamp(Number((zoom + direction * 0.05).toFixed(2)), resolvedMinZoom, resolvedMaxZoom);
    const stage = stageRef.current;
    if (stage && coverPolygon) {
      onPanChange(constrainPanToCoverViewport({
        viewport: { width: stage.clientWidth, height: stage.clientHeight },
        polygon: coverPolygon,
        zoom: nextZoom,
        from: { x: 0, y: 0 },
        to: pan,
      }));
    }
    onZoomChange(nextZoom);
  };

  return (
    <section
      ref={stageRef}
      className={`tileset-view-stage is-${kind}`}
      aria-label={ariaLabel}
      data-min-zoom={resolvedMinZoom}
      data-max-zoom={resolvedMaxZoom}
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onContextMenu={(event) => event.preventDefault()}
      onWheel={zoomPane}
    >
      <div
        className="tileset-view-art-layer"
        style={{ '--view-zoom': zoom, '--view-pan-x': `${pan.x}px`, '--view-pan-y': `${pan.y}px` } as CSSProperties}
      >
        {children}
      </div>
    </section>
  );
}
