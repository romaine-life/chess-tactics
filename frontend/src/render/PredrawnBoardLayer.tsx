import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import {
  boardLabMetrics,
  clampPredrawnGuide,
  normalizePredrawnGridCount,
  parsePredrawnBoardRegistration,
  predrawnBoardCellDimensions,
  predrawnBoardHasApplicableRectification,
  predrawnBoardHomography,
  predrawnBoardPlacement,
  predrawnGuidesForBoard,
  predrawnRectifiedSourcePoint,
  predrawnRegistrationGridSize,
  predrawnSourceGridCoordinate,
  predrawnSourceGridPoint,
  projectPredrawnPoint,
  rectifyPredrawnFramePixels,
  resolvedLiveMediaUrl,
  serializePredrawnBoardPreviewRegistration,
  serializePredrawnRegistrationHandoff,
  uniformPredrawnGuides,
  validPredrawnGuides,
  type PredrawnBoardHomography,
  type PredrawnBoardCornerRegistration,
  type PredrawnBoardSurface,
  type PredrawnBoundaryReference,
  type PredrawnPoint,
} from '@chess-tactics/board-render';

export {
  clampPredrawnGuide,
  normalizePredrawnGridCount,
  predrawnGuidesForBoard,
  predrawnRegistrationGridSize,
  serializePredrawnBoardPreviewRegistration,
  serializePredrawnRegistrationHandoff,
  uniformPredrawnGuides,
  validPredrawnGuides,
  predrawnBoardHomography,
  predrawnRectifiedSourcePoint,
  predrawnSourceGridCoordinate,
  predrawnSourceGridPoint,
  projectPredrawnPoint,
};
export type {
  PredrawnBoardCornerRegistration,
  PredrawnBoardHomography,
  PredrawnBoundaryReference,
  PredrawnPoint,
};

export interface PredrawnBoardPlate {
  surface: Omit<PredrawnBoardSurface, 'slot'>;
  src: string;
  registration?: PredrawnBoardCornerRegistration;
}

interface RegistrationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREDRAWN_REGISTRATION_STORAGE_PREFIX = 'chess-tactics:predrawn-registration:v1:';

export function predrawnBoardRegistrationStorageKey(src: string): string {
  return `${PREDRAWN_REGISTRATION_STORAGE_PREFIX}${src}`;
}

function browserRegistrationStorage(): RegistrationStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/** Synchronously persist an owner-picked candidate registration in this browser. */
export function storePredrawnBoardRegistration(
  src: string,
  registration: PredrawnBoardCornerRegistration,
  storage = browserRegistrationStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(predrawnBoardRegistrationStorageKey(src), JSON.stringify({
      version: 4,
      registration: serializePredrawnBoardPreviewRegistration(registration),
    }));
    return true;
  } catch {
    return false;
  }
}

/** Read the last registration written for this exact candidate source. */
export function storedPredrawnBoardRegistration(
  src: string,
  storage = browserRegistrationStorage(),
): PredrawnBoardCornerRegistration | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(predrawnBoardRegistrationStorageKey(src));
    if (!raw) return undefined;
    const record = JSON.parse(raw) as { version?: unknown; registration?: unknown };
    if (
      record.version !== 1
      && record.version !== 2
      && record.version !== 3
      && record.version !== 4
    ) return undefined;
    if (typeof record.registration !== 'string') return undefined;
    return parsePredrawnBoardRegistration(record.registration);
  } catch {
    return undefined;
  }
}

/** Write and synchronously prove that this browser retained the exact registration. */
export function savePredrawnBoardRegistrationLocally(
  src: string,
  registration: PredrawnBoardCornerRegistration,
  storage = browserRegistrationStorage(),
): PredrawnBoardCornerRegistration | undefined {
  if (!storage || !storePredrawnBoardRegistration(src, registration, storage)) return undefined;
  const readBack = storedPredrawnBoardRegistration(src, storage);
  if (
    !readBack
    || serializePredrawnBoardPreviewRegistration(readBack)
      !== serializePredrawnBoardPreviewRegistration(registration)
  ) return undefined;
  return readBack;
}

/** Resolve the live-media version and persisted whole-plate registration for a saved board. */
export function runtimePredrawnBoardPlate(surface: PredrawnBoardSurface): PredrawnBoardPlate {
  return {
    surface,
    src: resolvedLiveMediaUrl(surface.slot),
    ...(surface.registration ? { registration: surface.registration } : {}),
  };
}

/**
 * Mount a registered development candidate in the real editor even before it has an accepted
 * live-media surface. The synthetic surface supplies source-frame dimensions only; it is never
 * written to the EditorBoard and therefore cannot become a packaged or runtime media pointer.
 */
export function predrawnBoardPlateForEditorReview(
  surface: PredrawnBoardSurface | undefined,
  src: string | null,
  registration: PredrawnBoardCornerRegistration | undefined,
): PredrawnBoardPlate | undefined {
  if (src && registration) {
    return {
      surface: surface ?? {
        kind: 'predrawn',
        frameWidth: registration.sourceWidth,
        frameHeight: registration.sourceHeight,
      },
      src,
      registration,
    };
  }
  return surface ? runtimePredrawnBoardPlate(surface) : undefined;
}

/**
 * A development-only candidate seam used by temporary board links. It is deliberately restricted
 * to same-origin Vite review files and cannot turn a saved level into an arbitrary remote image.
 */
export function predrawnBoardPreviewSrc(
  search: string,
  origin: string,
  dev = import.meta.env.DEV,
): string | null {
  if (!dev) return null;
  const raw = new URLSearchParams(search).get('predrawnPreview');
  if (!raw) return null;
  try {
    const url = new URL(raw, origin);
    if (url.origin !== origin || !url.pathname.startsWith('/tmp-shots/')) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/** Parse legacy corners, fitted guides, refit dimensions, and optional pinned boundary metadata. */
export function predrawnBoardPreviewRegistration(
  search: string,
  dev = import.meta.env.DEV,
): PredrawnBoardCornerRegistration | undefined {
  if (!dev) return undefined;
  const raw = new URLSearchParams(search).get('predrawnCorners');
  if (!raw) return undefined;
  return parsePredrawnBoardRegistration(raw);
}

/**
 * Grid cells shown while reviewing a registered candidate. The fitted target may deliberately
 * describe more painted rows/columns than the authored level so generation mistakes remain
 * visible after the picker closes. Gameplay cells and hit targets are not changed.
 */
export function predrawnReviewGridCells(
  cells: readonly { x: number; y: number }[],
  registration: PredrawnBoardCornerRegistration | undefined,
): { x: number; y: number }[] {
  if (!cells.length || !registration) return [...cells];
  const levelDimensions = predrawnBoardCellDimensions(cells);
  const refitDimensions = predrawnRegistrationGridSize(
    registration,
    levelDimensions.columns,
    levelDimensions.rows,
  );
  const minX = Math.min(...cells.map((cell) => cell.x));
  const minY = Math.min(...cells.map((cell) => cell.y));
  return Array.from({ length: refitDimensions.rows }, (_, row) =>
    Array.from({ length: refitDimensions.columns }, (__, column) => ({
      x: minX + column,
      y: minY + row,
    })),
  ).flat();
}

/**
 * Full painted-frame boundary in board-centred coordinates. ViewPane uses this exact transformed
 * polygon to derive the zoom floor that keeps a pre-drawn scene covering its viewport.
 */
export function predrawnBoardCoverPolygon(
  plate: PredrawnBoardPlate,
  cells: readonly { x: number; y: number }[],
): { x: number; y: number }[] {
  const metrics = boardLabMetrics(cells);
  const homography = plate.registration
    ? predrawnBoardHomography(plate.surface, cells, plate.registration)
    : undefined;
  if (homography) {
    const frameCorners: readonly PredrawnPoint[] = [
      [0, 0],
      [plate.surface.frameWidth, 0],
      [plate.surface.frameWidth, plate.surface.frameHeight],
      [0, plate.surface.frameHeight],
    ];
    const projected = frameCorners.map((point) => projectPredrawnPoint(homography, point));
    if (projected.every((point): point is PredrawnPoint => point !== undefined)) {
      return projected.map(([x, y]) => ({ x: x + metrics.originLeft, y: y + metrics.originTop }));
    }
  }
  const placement = predrawnBoardPlacement(plate.surface, cells);
  const left = placement.left + metrics.originLeft;
  const top = placement.top + metrics.originTop;
  return [
    { x: left, y: top },
    { x: left + placement.width, y: top },
    { x: left + placement.width, y: top + placement.height },
    { x: left, y: top + placement.height },
  ];
}

function drawRectifiedPlate(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  registration: PredrawnBoardCornerRegistration,
  width: number,
  height: number,
): boolean {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) return false;
  sourceContext.drawImage(image, 0, 0, width, height);
  const sourceImage = sourceContext.getImageData(0, 0, width, height);
  const outputImage = context.createImageData(width, height);
  outputImage.data.set(rectifyPredrawnFramePixels({
    width,
    height,
    data: sourceImage.data,
  }, registration));
  context.putImageData(outputImage, 0, 0);
  return true;
}

function PredrawnRectifiedCanvas({
  plate,
  style,
}: {
  plate: PredrawnBoardPlate & { registration: PredrawnBoardCornerRegistration };
  style: CSSProperties;
}): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const registrationKey = serializePredrawnBoardPreviewRegistration(plate.registration);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = plate.surface.frameWidth;
      canvas.height = plate.surface.frameHeight;
      try {
        setReady(drawRectifiedPlate(
          canvas,
          image,
          plate.registration,
          plate.surface.frameWidth,
          plate.surface.frameHeight,
        ));
      } catch {
        setReady(false);
      }
    };
    image.src = plate.src;
    return () => { cancelled = true; };
  }, [plate.src, plate.surface.frameHeight, plate.surface.frameWidth, registrationKey]);

  return (
    <canvas
      ref={canvasRef}
      className="predrawn-board-layer predrawn-board-layer-rectified"
      data-testid="predrawn-board-rectified-layer"
      aria-hidden="true"
      style={{ ...style, visibility: ready ? 'visible' : 'hidden' }}
    />
  );
}

export function PredrawnBoardLayer({
  plate,
  cells,
}: {
  plate: PredrawnBoardPlate;
  cells: readonly { x: number; y: number }[];
}): ReactElement {
  const homography = plate.registration
    ? predrawnBoardHomography(plate.surface, cells, plate.registration)
    : undefined;
  const placement = homography ? undefined : predrawnBoardPlacement(plate.surface, cells);
  const style = (homography ? {
    left: '0px',
    top: '0px',
    width: `${plate.surface.frameWidth}px`,
    height: `${plate.surface.frameHeight}px`,
    transform: `matrix3d(${[
      homography.h11, homography.h21, 0, homography.h31,
      homography.h12, homography.h22, 0, homography.h32,
      0, 0, 1, 0,
      homography.h13, homography.h23, 0, 1,
    ].join(',')})`,
    transformOrigin: '0 0',
  } : {
    left: `${placement!.left}px`,
    top: `${placement!.top}px`,
    width: `${placement!.width}px`,
    height: `${placement!.height}px`,
  }) as CSSProperties;
  const dimensions = predrawnBoardCellDimensions(cells);
  const rectified = Boolean(
    homography
    && plate.registration
    && predrawnBoardHasApplicableRectification(
      plate.registration,
      dimensions.columns,
      dimensions.rows,
    ),
  );

  return (
    <>
      <img
        className="predrawn-board-layer"
        data-testid="predrawn-board-layer"
        src={plate.src}
        alt=""
        aria-hidden="true"
        decoding="async"
        draggable={false}
        style={style}
      />
      {rectified ? (
        <PredrawnRectifiedCanvas
          plate={plate as PredrawnBoardPlate & { registration: PredrawnBoardCornerRegistration }}
          style={style}
        />
      ) : null}
    </>
  );
}
