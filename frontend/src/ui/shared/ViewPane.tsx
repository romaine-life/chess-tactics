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

/**
 * Smallest two-decimal zoom whose centred transformed content covers every viewport corner.
 * The polygon uses the same board-centred coordinate system as `.tileset-generated-board`;
 * pan is screen-space because the shared board transform applies it before scale.
 */
export function minimumZoomToCoverViewport({
  viewport,
  polygon,
  pan = { x: 0, y: 0 },
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
    { x: (corner.x - pan.x) / zoom, y: (corner.y - pan.y) / zoom },
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
  onAssetClick?: (assetId: string) => void;
  children: ReactNode;
}): ReactElement {
  const stageRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; assetId?: string } | null>(null);
  const didDragRef = useRef(false);
  const [resolvedMinZoom, setResolvedMinZoom] = useState(minZoom);
  const resolvedMaxZoom = Math.max(maxZoom, resolvedMinZoom);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const updateMinimum = (): void => {
      const next = coverPolygon
        ? minimumZoomToCoverViewport({
            viewport: { width: stage.clientWidth, height: stage.clientHeight },
            polygon: coverPolygon,
            pan,
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
  }, [coverPolygon, maxZoom, minZoom, pan]);

  useLayoutEffect(() => {
    onMinimumZoomChange?.(resolvedMinZoom);
    if (zoom < resolvedMinZoom) onZoomChange(resolvedMinZoom);
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
    onPanChange({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
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
    onZoomChange(clamp(Number((zoom + direction * 0.05).toFixed(2)), resolvedMinZoom, resolvedMaxZoom));
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
