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
const COVER_EPSILON = 1e-7;

export interface ViewPanePoint {
  x: number;
  y: number;
}

export interface ViewPaneViewportSize {
  width: number;
  height: number;
}

export function clientDeltaToLocal(
  delta: number,
  localExtent: number,
  renderedExtent: number,
): number {
  if (localExtent <= 0 || renderedExtent <= 0) return delta;
  return delta * (localExtent / renderedExtent);
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

interface PanHalfPlane {
  a: number;
  b: number;
  threshold: number;
}

function viewportCorners(viewport: ViewPaneViewportSize): ViewPanePoint[] {
  return [
    { x: -viewport.width / 2, y: -viewport.height / 2 },
    { x: viewport.width / 2, y: -viewport.height / 2 },
    { x: viewport.width / 2, y: viewport.height / 2 },
    { x: -viewport.width / 2, y: viewport.height / 2 },
  ];
}

/**
 * Screen-space pan positions for which every viewport corner remains inside the transformed
 * accepted-art polygon. This is the polygon's Minkowski erosion by the viewport rectangle.
 */
function feasiblePanRegion({
  viewport,
  polygon,
  zoom,
}: {
  viewport: ViewPaneViewportSize;
  polygon: readonly ViewPanePoint[];
  zoom: number;
}): ViewPanePoint[] {
  if (
    polygon.length < 3
    || zoom <= 0
    || viewport.width <= 0
    || viewport.height <= 0
    || !Number.isFinite(viewport.width)
    || !Number.isFinite(viewport.height)
    || polygon.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
  ) return [];
  const area = polygonSignedArea(polygon);
  if (Math.abs(area) < COVER_EPSILON) return [];
  const orientation = area > 0 ? 1 : -1;
  const corners = viewportCorners(viewport);
  const anchorCorner = corners[0];
  const anchorPanBounds = polygon.map((point) => ({
    x: anchorCorner.x - point.x * zoom,
    y: anchorCorner.y - point.y * zoom,
  }));
  const xs = anchorPanBounds.map((point) => point.x);
  const ys = anchorPanBounds.map((point) => point.y);
  let region: ViewPanePoint[] = [
    { x: Math.min(...xs), y: Math.min(...ys) },
    { x: Math.max(...xs), y: Math.min(...ys) },
    { x: Math.max(...xs), y: Math.max(...ys) },
    { x: Math.min(...xs), y: Math.max(...ys) },
  ];

  const halfPlanes: PanHalfPlane[] = polygon.map((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    const edgeX = end.x - start.x;
    const edgeY = end.y - start.y;
    const edgeAtStart = edgeX * start.y - edgeY * start.x;
    const minimumCornerTerm = Math.min(...corners.map((corner) => (
      orientation * (
        edgeX * corner.y
        - edgeY * corner.x
        - zoom * edgeAtStart
      )
    )));
    return {
      a: orientation * edgeY,
      b: -orientation * edgeX,
      threshold: -minimumCornerTerm,
    };
  });

  for (const halfPlane of halfPlanes) {
    if (!region.length) break;
    const clipped: ViewPanePoint[] = [];
    for (let index = 0; index < region.length; index += 1) {
      const previous = region[(index + region.length - 1) % region.length];
      const current = region[index];
      const previousValue = halfPlane.a * previous.x + halfPlane.b * previous.y;
      const currentValue = halfPlane.a * current.x + halfPlane.b * current.y;
      const previousInside = previousValue >= halfPlane.threshold - COVER_EPSILON;
      const currentInside = currentValue >= halfPlane.threshold - COVER_EPSILON;
      if (previousInside !== currentInside) {
        const denominator = currentValue - previousValue;
        if (Math.abs(denominator) > COVER_EPSILON) {
          const t = (halfPlane.threshold - previousValue) / denominator;
          clipped.push({
            x: previous.x + (current.x - previous.x) * t,
            y: previous.y + (current.y - previous.y) * t,
          });
        }
      }
      if (currentInside) clipped.push(current);
    }
    region = clipped;
  }
  return region;
}

function closestPointOnSegment(
  point: ViewPanePoint,
  start: ViewPanePoint,
  end: ViewPanePoint,
): ViewPanePoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= COVER_EPSILON) return start;
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return { x: start.x + dx * t, y: start.y + dy * t };
}

function closestPointOnPanRegion(region: readonly ViewPanePoint[], point: ViewPanePoint): ViewPanePoint {
  if (region.length === 0) return point;
  if (region.length === 1) return region[0];
  let closest = region[0];
  let closestDistanceSquared = Number.POSITIVE_INFINITY;
  for (let index = 0; index < region.length; index += 1) {
    const candidate = closestPointOnSegment(point, region[index], region[(index + 1) % region.length]);
    const dx = candidate.x - point.x;
    const dy = candidate.y - point.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < closestDistanceSquared) {
      closest = candidate;
      closestDistanceSquared = distanceSquared;
    }
  }
  return closest;
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
  if (Math.abs(area) < COVER_EPSILON) return false;
  const orientation = area > 0 ? 1 : -1;
  return viewportCorners(viewport).every((corner) => convexPolygonContains(
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
  const region = feasiblePanRegion({ viewport, polygon, zoom });
  if (!region.length) return from;
  const start = covers(from) ? from : closestPointOnPanRegion(region, from);
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
 * Smallest safety-precision zoom at which the viewport can fit anywhere inside the accepted art.
 * This is deliberately finer than the human-facing wheel/stepper increment: rounding a small
 * preview to that control precision can collapse a valid zoom-out range. The polygon uses the
 * same board-centred coordinate system as `.tileset-generated-board`; current pan does not affect
 * the stable floor. Pan is reclamped separately when zoom changes.
 */
export function minimumZoomToCoverViewport({
  viewport,
  polygon,
  minZoom,
  maxZoom,
}: {
  viewport: { width: number; height: number };
  polygon: readonly ViewPanePoint[];
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
  const covers = (zoom: number): boolean => feasiblePanRegion({ viewport, polygon, zoom }).length > 0;
  if (covers(lower)) return lower;
  if (!covers(upper)) return upper;
  let low = lower;
  let high = upper;
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const middle = (low + high) / 2;
    if (covers(middle)) high = middle;
    else low = middle;
  }
  // Start from the first six-decimal candidate above the infeasible side of the search, then
  // verify it. Exact decimal boundaries therefore stay exact; a candidate that is still just
  // below the geometric limit advances by one safety-precision unit.
  const safetyScale = 1_000_000;
  const candidate = Math.ceil(low * safetyScale) / safetyScale;
  return Math.min(upper, covers(candidate) ? candidate : candidate + 1 / safetyScale);
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
  onViewInteraction,
  onAssetClick,
  boardViewportMode = 'canonical',
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
  /** Reports intentional user camera movement; automatic floor/reclamp updates do not call it. */
  onViewInteraction?: () => void;
  onAssetClick?: (assetId: string) => void;
  /** Play fills its live board allocation; fixed previews retain the canonical aspect. */
  boardViewportMode?: 'canonical' | 'fill';
  children: ReactNode;
}): ReactElement {
  const stageRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    localWidth: number;
    localHeight: number;
    renderedWidth: number;
    renderedHeight: number;
    assetId?: string;
  } | null>(null);
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
      from: pan,
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
    const stage = stageRef.current;
    const rendered = stage?.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
      localWidth: stage?.clientWidth ?? 0,
      localHeight: stage?.clientHeight ?? 0,
      renderedWidth: rendered?.width ?? 0,
      renderedHeight: rendered?.height ?? 0,
      assetId: tileElement?.dataset.assetId,
    };
    didDragRef.current = false;
  };

  const movePan = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - drag.startX) > 4 || Math.abs(event.clientY - drag.startY) > 4) {
      if (!didDragRef.current) onViewInteraction?.();
      didDragRef.current = true;
    }
    const candidate = {
      x: drag.originX + clientDeltaToLocal(
        event.clientX - drag.startX,
        drag.localWidth,
        drag.renderedWidth,
      ),
      y: drag.originY + clientDeltaToLocal(
        event.clientY - drag.startY,
        drag.localHeight,
        drag.renderedHeight,
      ),
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
    onViewInteraction?.();
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextZoom = clamp(Number((zoom + direction * 0.05).toFixed(2)), resolvedMinZoom, resolvedMaxZoom);
    const stage = stageRef.current;
    if (stage && coverPolygon) {
      onPanChange(constrainPanToCoverViewport({
        viewport: { width: stage.clientWidth, height: stage.clientHeight },
        polygon: coverPolygon,
        zoom: nextZoom,
        from: pan,
        to: pan,
      }));
    }
    onZoomChange(nextZoom);
  };

  const stage = (
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

  // Ordinary board viewers retain the canonical 4:3 board window (ADR-0192/ADR-0259).
  // Full-canvas owners such as Play and the Level Editor opt into `fill`: their surrounding
  // workspace is already the authoritative measured, clipped, and interactive viewport
  // (ADR-0201/ADR-0278). Non-board viewers retain the dimensions of their inspected asset.
  return kind === 'board' && boardViewportMode === 'canonical' ? (
    <div className="board-view-pane-seat">
      {stage}
    </div>
  ) : stage;
}
