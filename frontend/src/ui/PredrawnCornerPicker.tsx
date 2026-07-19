import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import { TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import {
  clampPredrawnGuide,
  normalizePredrawnGridCount,
  predrawnGuidesForBoard,
  predrawnRegistrationGridSize,
  predrawnSourceGridCoordinate,
  predrawnSourceGridPoint,
  savePredrawnBoardRegistrationLocally,
  serializePredrawnRegistrationHandoff,
  storedPredrawnBoardRegistration,
  uniformPredrawnGuides,
  type PredrawnBoundaryReference,
  type PredrawnBoardCornerRegistration,
  type PredrawnPoint,
} from '../render/PredrawnBoardLayer';
import { chromeUnitClassNames } from './chromeUnitRegistry';

export type PredrawnCornerName = 'north' | 'east' | 'south' | 'west';
export type PredrawnCornerPoints = Record<PredrawnCornerName, PredrawnPoint | undefined>;
type CornerPoints = PredrawnCornerPoints;
type RegistrationSaveState = 'idle' | 'pending' | 'saved' | 'error';
type HandoffCopyState = 'idle' | 'copied' | 'error';
type ActiveControl =
  | { kind: 'corner'; corner: PredrawnCornerName }
  | { kind: 'reference-corner'; corner: PredrawnCornerName }
  | { kind: 'column'; index: number }
  | { kind: 'row'; index: number }
  | { kind: 'move' };
type DragState = ActiveControl & {
  pointerId: number;
  startPoint?: PredrawnPoint;
  startCorners?: CornerPoints;
};

const CORNERS: readonly PredrawnCornerName[] = ['north', 'east', 'south', 'west'];
const CORNER_LABEL: Record<PredrawnCornerName, string> = {
  north: 'North',
  east: 'East',
  south: 'South',
  west: 'West',
};
const CORNER_SHORT: Record<PredrawnCornerName, string> = {
  north: 'N',
  east: 'E',
  south: 'S',
  west: 'W',
};

interface SourceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundedSourceCoordinate(value: number): number {
  return Number(value.toFixed(3));
}

/** Snap a placed refit grid to the exact accepted board projection at its current count. */
export function predrawnIdealGridSnap(
  points: PredrawnCornerPoints,
  sourceSize: { width: number; height: number },
  columns: number,
  rows: number,
): PredrawnCornerPoints | undefined {
  const placed = CORNERS.map((corner) => points[corner]);
  if (
    placed.some((point) => !point)
    || sourceSize.width <= 0
    || sourceSize.height <= 0
    || columns < 1
    || rows < 1
  ) return undefined;

  const current = placed as PredrawnPoint[];
  const ideal: Record<PredrawnCornerName, PredrawnPoint> = {
    north: [0, -TILE_STEP_Y],
    east: [columns * TILE_STEP_X, (columns - 1) * TILE_STEP_Y],
    south: [(columns - rows) * TILE_STEP_X, (columns + rows - 1) * TILE_STEP_Y],
    west: [-rows * TILE_STEP_X, (rows - 1) * TILE_STEP_Y],
  };
  const currentCenter: PredrawnPoint = [
    current.reduce((sum, point) => sum + point[0], 0) / current.length,
    current.reduce((sum, point) => sum + point[1], 0) / current.length,
  ];
  const idealPoints = CORNERS.map((corner) => ideal[corner]);
  const idealCenter: PredrawnPoint = [
    idealPoints.reduce((sum, point) => sum + point[0], 0) / idealPoints.length,
    idealPoints.reduce((sum, point) => sum + point[1], 0) / idealPoints.length,
  ];
  const idealOffsets = idealPoints.map(([x, y]) => [x - idealCenter[0], y - idealCenter[1]] as const);
  const currentOffsets = current.map(([x, y]) => [x - currentCenter[0], y - currentCenter[1]] as const);
  const denominator = idealOffsets.reduce((sum, [x, y]) => sum + x * x + y * y, 0);
  const numerator = idealOffsets.reduce(
    (sum, [x, y], index) => sum + x * currentOffsets[index][0] + y * currentOffsets[index][1],
    0,
  );
  const fallbackScale = Math.sqrt(
    currentOffsets.reduce((sum, [x, y]) => sum + x * x + y * y, 0) / denominator,
  );
  let scale = numerator > 0 ? numerator / denominator : fallbackScale;
  if (!Number.isFinite(scale) || scale <= 0) return undefined;

  const idealWidth = Math.max(...idealOffsets.map(([x]) => x)) - Math.min(...idealOffsets.map(([x]) => x));
  const idealHeight = Math.max(...idealOffsets.map(([, y]) => y)) - Math.min(...idealOffsets.map(([, y]) => y));
  scale = Math.min(scale, sourceSize.width / idealWidth, sourceSize.height / idealHeight);
  const scaledOffsets = idealOffsets.map(([x, y]) => [x * scale, y * scale] as const);
  const minOffsetX = Math.min(...scaledOffsets.map(([x]) => x));
  const maxOffsetX = Math.max(...scaledOffsets.map(([x]) => x));
  const minOffsetY = Math.min(...scaledOffsets.map(([, y]) => y));
  const maxOffsetY = Math.max(...scaledOffsets.map(([, y]) => y));
  const centerX = clamp(currentCenter[0], -minOffsetX, sourceSize.width - maxOffsetX);
  const centerY = clamp(currentCenter[1], -minOffsetY, sourceSize.height - maxOffsetY);

  return Object.fromEntries(CORNERS.map((corner, index) => [corner, [
    roundedSourceCoordinate(centerX + scaledOffsets[index][0]),
    roundedSourceCoordinate(centerY + scaledOffsets[index][1]),
  ] as PredrawnPoint])) as PredrawnCornerPoints;
}

/** Convert a pointer on the displayed source image into intrinsic source-image pixels. */
export function predrawnSourcePointForClient(
  rect: SourceRect,
  client: { x: number; y: number },
  source: { width: number; height: number },
): PredrawnPoint {
  if (rect.width <= 0 || rect.height <= 0 || source.width <= 0 || source.height <= 0) return [0, 0];
  return [
    roundedSourceCoordinate(clamp((client.x - rect.left) / rect.width, 0, 1) * source.width),
    roundedSourceCoordinate(clamp((client.y - rect.top) / rect.height, 0, 1) * source.height),
  ];
}

function pointsFromRegistration(
  registration: PredrawnBoardCornerRegistration | undefined,
  sourceWidth = registration?.sourceWidth ?? 0,
  sourceHeight = registration?.sourceHeight ?? 0,
): CornerPoints {
  if (!registration) return { north: undefined, east: undefined, south: undefined, west: undefined };
  const scaleX = sourceWidth > 0 ? sourceWidth / registration.sourceWidth : 1;
  const scaleY = sourceHeight > 0 ? sourceHeight / registration.sourceHeight : 1;
  const scale = ([x, y]: PredrawnPoint): PredrawnPoint => [
    roundedSourceCoordinate(x * scaleX),
    roundedSourceCoordinate(y * scaleY),
  ];
  return {
    north: scale(registration.north),
    east: scale(registration.east),
    south: scale(registration.south),
    west: scale(registration.west),
  };
}

function boundaryPointsFromRegistration(
  registration: PredrawnBoardCornerRegistration | undefined,
  sourceWidth = registration?.sourceWidth ?? 0,
  sourceHeight = registration?.sourceHeight ?? 0,
): CornerPoints {
  if (!registration?.boundaryReference) {
    return { north: undefined, east: undefined, south: undefined, west: undefined };
  }
  return pointsFromRegistration({
    ...registration,
    north: registration.boundaryReference.north,
    east: registration.boundaryReference.east,
    south: registration.boundaryReference.south,
    west: registration.boundaryReference.west,
  }, sourceWidth, sourceHeight);
}

function boundaryReferenceFromPoints(points: CornerPoints): PredrawnBoundaryReference | undefined {
  if (!CORNERS.every((corner) => points[corner])) return undefined;
  return {
    north: points.north!,
    east: points.east!,
    south: points.south!,
    west: points.west!,
  };
}

function pointLabel(point: PredrawnPoint | undefined): string {
  return point ? `${point[0]}, ${point[1]}` : 'Not set';
}

function registrationFromCalibration(
  points: CornerPoints,
  sourceSize: { width: number; height: number },
  gridColumns: number,
  gridRows: number,
  columnGuides: readonly number[],
  rowGuides: readonly number[],
  boundaryPoints: CornerPoints,
): PredrawnBoardCornerRegistration | undefined {
  if (
    !sourceSize.width
    || !sourceSize.height
    || !CORNERS.every((corner) => points[corner])
    || !Number.isSafeInteger(gridColumns)
    || !Number.isSafeInteger(gridRows)
    || gridColumns < 1
    || gridColumns > 64
    || gridRows < 1
    || gridRows > 64
    || columnGuides.length !== gridColumns + 1
    || rowGuides.length !== gridRows + 1
  ) {
    return undefined;
  }
  return {
    sourceWidth: sourceSize.width,
    sourceHeight: sourceSize.height,
    north: points.north!,
    east: points.east!,
    south: points.south!,
    west: points.west!,
    gridColumns,
    gridRows,
    columnGuides: [...columnGuides],
    rowGuides: [...rowGuides],
    boundaryReference: boundaryReferenceFromPoints(boundaryPoints),
  };
}

export interface PredrawnGridStretchSummary {
  columnMinScale: number;
  columnMaxScale: number;
  rowMinScale: number;
  rowMaxScale: number;
  maximumDeviationPercent: number;
}

export function predrawnGridStretchSummary(
  columnGuides: readonly number[],
  rowGuides: readonly number[],
): PredrawnGridStretchSummary {
  const scales = (guides: readonly number[]): number[] => {
    const cellCount = Math.max(1, guides.length - 1);
    return guides.slice(1).map((value, index) => (value - guides[index]) * cellCount);
  };
  const columns = scales(columnGuides);
  const rows = scales(rowGuides);
  const all = [...columns, ...rows];
  return {
    columnMinScale: Math.min(...columns),
    columnMaxScale: Math.max(...columns),
    rowMinScale: Math.min(...rows),
    rowMaxScale: Math.max(...rows),
    maximumDeviationPercent: Math.max(...all.map((scale) => Math.abs(scale - 1))) * 100,
  };
}

function formatScale(value: number): string {
  return `${value.toFixed(2)}×`;
}

function activeControlLabel(control: ActiveControl): string {
  if (control.kind === 'corner') return `${CORNER_LABEL[control.corner]} corner`;
  if (control.kind === 'reference-corner') return `${CORNER_LABEL[control.corner]} boundary reference`;
  if (control.kind === 'column') return `column guide ${control.index}`;
  if (control.kind === 'row') return `row guide ${control.index}`;
  return 'whole grid';
}

export function PredrawnCornerPicker({
  src,
  initialRegistration,
  columns,
  rows,
  onChange,
  onClose,
}: {
  src: string;
  initialRegistration?: PredrawnBoardCornerRegistration;
  columns: number;
  rows: number;
  onChange: (registration: PredrawnBoardCornerRegistration) => void;
  onClose: () => void;
}): ReactElement {
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const normalizedForImage = useRef(false);
  const storedOpeningRegistration = useRef(storedPredrawnBoardRegistration(src));
  const openingRegistration = useRef(storedOpeningRegistration.current ?? initialRegistration);
  const openingGrid = useRef(predrawnRegistrationGridSize(openingRegistration.current, columns, rows));
  const openingGuides = useRef(predrawnGuidesForBoard(openingRegistration.current, columns, rows));
  const openingBoundaryPoints = useRef(boundaryPointsFromRegistration(openingRegistration.current));
  const [activeControl, setActiveControl] = useState<ActiveControl>({ kind: 'corner', corner: 'south' });
  const [placingCorner, setPlacingCorner] = useState<PredrawnCornerName | null>(
    openingRegistration.current ? null : 'south',
  );
  const [points, setPoints] = useState<CornerPoints>(() => pointsFromRegistration(openingRegistration.current));
  const [boundaryPoints, setBoundaryPoints] = useState<CornerPoints>(openingBoundaryPoints.current);
  const [gridColumns, setGridColumns] = useState(openingGrid.current.columns);
  const [gridRows, setGridRows] = useState(openingGrid.current.rows);
  const [columnGuides, setColumnGuides] = useState<number[]>(openingGuides.current.columnGuides);
  const [rowGuides, setRowGuides] = useState<number[]>(openingGuides.current.rowGuides);
  const [sourceSize, setSourceSize] = useState({
    width: openingRegistration.current?.sourceWidth ?? 0,
    height: openingRegistration.current?.sourceHeight ?? 0,
  });
  const [zoom, setZoom] = useState<'fit' | 0.5 | 0.75 | 1 | 1.5 | 2>('fit');
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState<RegistrationSaveState>(
    storedOpeningRegistration.current ? 'saved' : 'idle',
  );
  const [handoffCopyState, setHandoffCopyState] = useState<HandoffCopyState>('idle');
  const pointsRef = useRef(points);
  const boundaryPointsRef = useRef(boundaryPoints);
  const columnGuidesRef = useRef(columnGuides);
  const rowGuidesRef = useRef(rowGuides);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus?.();
    };
  }, [onClose]);

  const registration = useMemo(() => registrationFromCalibration(
    points,
    sourceSize,
    gridColumns,
    gridRows,
    columnGuides,
    rowGuides,
    boundaryPoints,
  ), [boundaryPoints, columnGuides, gridColumns, gridRows, points, rowGuides, sourceSize]);
  const complete = Boolean(registration);
  const boundaryReference = boundaryReferenceFromPoints(boundaryPoints);
  const stretch = useMemo(
    () => predrawnGridStretchSummary(columnGuides, rowGuides),
    [columnGuides, rowGuides],
  );

  const commitPoints = (nextPoints: CornerPoints): void => {
    pointsRef.current = nextPoints;
    setPoints(nextPoints);
    setSaveState('pending');
    setHandoffCopyState('idle');
  };

  const commitBoundaryPoints = (nextPoints: CornerPoints): void => {
    boundaryPointsRef.current = nextPoints;
    setBoundaryPoints(nextPoints);
    setSaveState('pending');
    setHandoffCopyState('idle');
  };

  const commitColumnGuides = (nextGuides: number[]): void => {
    columnGuidesRef.current = nextGuides;
    setColumnGuides(nextGuides);
    setSaveState('pending');
    setHandoffCopyState('idle');
  };

  const commitRowGuides = (nextGuides: number[]): void => {
    rowGuidesRef.current = nextGuides;
    setRowGuides(nextGuides);
    setSaveState('pending');
    setHandoffCopyState('idle');
  };

  const chooseCorner = (corner: PredrawnCornerName): void => {
    setActiveControl({ kind: 'corner', corner });
    setPlacingCorner(corner);
    overlayRef.current?.focus();
  };

  const saveRegistration = (): void => {
    const pending = registrationFromCalibration(
      pointsRef.current,
      sourceSize,
      gridColumns,
      gridRows,
      columnGuidesRef.current,
      rowGuidesRef.current,
      boundaryPointsRef.current,
    );
    if (!pending) {
      setSaveState('error');
      return;
    }
    const readBack = savePredrawnBoardRegistrationLocally(src, pending);
    if (!readBack) {
      setSaveState('error');
      return;
    }
    onChange(readBack);
    setSaveState('saved');
    setHandoffCopyState('idle');
  };

  const copyCodexHandoff = async (): Promise<void> => {
    const savedRegistration = storedPredrawnBoardRegistration(src);
    if (!savedRegistration || saveState !== 'saved') {
      setHandoffCopyState('error');
      return;
    }
    const payload = serializePredrawnRegistrationHandoff(src, savedRegistration);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(payload);
      setHandoffCopyState('copied');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = payload;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      setHandoffCopyState(copied ? 'copied' : 'error');
    }
  };

  const pointForClient = (clientX: number, clientY: number): PredrawnPoint | null => {
    const stage = stageRef.current;
    if (!stage || !sourceSize.width || !sourceSize.height) return null;
    return predrawnSourcePointForClient(
      stage.getBoundingClientRect(),
      { x: clientX, y: clientY },
      sourceSize,
    );
  };

  const moveCornerToClient = (corner: PredrawnCornerName, clientX: number, clientY: number): void => {
    const point = pointForClient(clientX, clientY);
    if (!point) return;
    commitPoints({ ...pointsRef.current, [corner]: point });
  };

  const placeActiveCorner = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (!placingCorner || dragRef.current) return;
    moveCornerToClient(placingCorner, event.clientX, event.clientY);
    setPlacingCorner(null);
    overlayRef.current?.focus();
  };

  const beginDrag = (event: ReactPointerEvent<SVGElement | HTMLSpanElement>, control: ActiveControl): void => {
    event.preventDefault();
    event.stopPropagation();
    setPlacingCorner(null);
    setActiveControl(control);
    const startPoint = pointForClient(event.clientX, event.clientY) ?? undefined;
    dragRef.current = {
      ...control,
      pointerId: event.pointerId,
      startPoint,
      startCorners: control.kind === 'move' ? { ...pointsRef.current } : undefined,
    };
    overlayRef.current?.setPointerCapture(event.pointerId);
    overlayRef.current?.focus();
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = pointForClient(event.clientX, event.clientY);
    if (!point) return;
    if (drag.kind === 'corner') {
      commitPoints({ ...pointsRef.current, [drag.corner]: point });
      return;
    }
    if (drag.kind === 'reference-corner') {
      commitBoundaryPoints({ ...boundaryPointsRef.current, [drag.corner]: point });
      return;
    }
    if (drag.kind === 'move' && drag.startPoint && drag.startCorners) {
      const opening = CORNERS.map((corner) => drag.startCorners![corner]).filter(Boolean) as PredrawnPoint[];
      if (opening.length !== CORNERS.length) return;
      const requestedX = point[0] - drag.startPoint[0];
      const requestedY = point[1] - drag.startPoint[1];
      const deltaX = clamp(
        requestedX,
        -Math.min(...opening.map(([x]) => x)),
        sourceSize.width - Math.max(...opening.map(([x]) => x)),
      );
      const deltaY = clamp(
        requestedY,
        -Math.min(...opening.map(([, y]) => y)),
        sourceSize.height - Math.max(...opening.map(([, y]) => y)),
      );
      const translated = Object.fromEntries(CORNERS.map((corner) => {
        const openingPoint = drag.startCorners![corner]!;
        return [corner, [
          roundedSourceCoordinate(openingPoint[0] + deltaX),
          roundedSourceCoordinate(openingPoint[1] + deltaY),
        ] as const];
      })) as CornerPoints;
      commitPoints(translated);
      return;
    }
    const pending = registrationFromCalibration(
      pointsRef.current,
      sourceSize,
      gridColumns,
      gridRows,
      columnGuidesRef.current,
      rowGuidesRef.current,
      boundaryPointsRef.current,
    );
    if (!pending) return;
    const coordinate = predrawnSourceGridCoordinate(pending, point);
    if (!coordinate) return;
    if (drag.kind === 'column') {
      const next = [...columnGuidesRef.current];
      next[drag.index] = clampPredrawnGuide(next, drag.index, coordinate[0]);
      commitColumnGuides(next);
    } else if (drag.kind === 'row') {
      const next = [...rowGuidesRef.current];
      next[drag.index] = clampPredrawnGuide(next, drag.index, coordinate[1]);
      commitRowGuides(next);
    }
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (overlayRef.current?.hasPointerCapture(event.pointerId)) overlayRef.current.releasePointerCapture(event.pointerId);
  };

  const translateAllCorners = (deltaX: number, deltaY: number): void => {
    if (!CORNERS.every((corner) => pointsRef.current[corner])) return;
    const next = Object.fromEntries(CORNERS.map((corner) => {
      const point = pointsRef.current[corner]!;
      return [corner, [
        clamp(point[0] + deltaX, 0, sourceSize.width),
        clamp(point[1] + deltaY, 0, sourceSize.height),
      ] as const];
    })) as CornerPoints;
    commitPoints(next);
  };

  const nudgeActiveControl = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const step = event.shiftKey ? 10 : 1;
    const direction = event.key;
    if (!direction.startsWith('Arrow')) return;
    if (activeControl.kind === 'corner') {
      const point = pointsRef.current[activeControl.corner];
      if (!point || !sourceSize.width || !sourceSize.height) return;
      const deltas: Record<string, PredrawnPoint> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      const move = deltas[direction];
      event.preventDefault();
      commitPoints({
        ...pointsRef.current,
        [activeControl.corner]: [
          clamp(point[0] + move[0], 0, sourceSize.width),
          clamp(point[1] + move[1], 0, sourceSize.height),
        ],
      });
      return;
    }
    if (activeControl.kind === 'reference-corner') {
      const point = boundaryPointsRef.current[activeControl.corner];
      if (!point || !sourceSize.width || !sourceSize.height) return;
      const deltas: Record<string, PredrawnPoint> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      const move = deltas[direction];
      event.preventDefault();
      commitBoundaryPoints({
        ...boundaryPointsRef.current,
        [activeControl.corner]: [
          clamp(point[0] + move[0], 0, sourceSize.width),
          clamp(point[1] + move[1], 0, sourceSize.height),
        ],
      });
      return;
    }
    if (activeControl.kind === 'move') {
      const deltas: Record<string, PredrawnPoint> = {
        ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
      };
      event.preventDefault();
      translateAllCorners(...deltas[direction]);
      return;
    }
    const normalizedStep = step / Math.max(sourceSize.width, sourceSize.height, 1);
    if (activeControl.kind === 'column' && (direction === 'ArrowLeft' || direction === 'ArrowRight')) {
      event.preventDefault();
      const next = [...columnGuidesRef.current];
      next[activeControl.index] = clampPredrawnGuide(
        next,
        activeControl.index,
        next[activeControl.index] + (direction === 'ArrowLeft' ? -normalizedStep : normalizedStep),
      );
      commitColumnGuides(next);
    } else if (activeControl.kind === 'row' && (direction === 'ArrowUp' || direction === 'ArrowDown')) {
      event.preventDefault();
      const next = [...rowGuidesRef.current];
      next[activeControl.index] = clampPredrawnGuide(
        next,
        activeControl.index,
        next[activeControl.index] + (direction === 'ArrowUp' ? -normalizedStep : normalizedStep),
      );
      commitRowGuides(next);
    }
  };

  const reset = (): void => {
    const nextPoints = pointsFromRegistration(openingRegistration.current, sourceSize.width, sourceSize.height);
    pointsRef.current = nextPoints;
    const nextBoundaryPoints = boundaryPointsFromRegistration(
      openingRegistration.current,
      sourceSize.width,
      sourceSize.height,
    );
    boundaryPointsRef.current = nextBoundaryPoints;
    columnGuidesRef.current = [...openingGuides.current.columnGuides];
    rowGuidesRef.current = [...openingGuides.current.rowGuides];
    setPoints(nextPoints);
    setBoundaryPoints(nextBoundaryPoints);
    setGridColumns(openingGrid.current.columns);
    setGridRows(openingGrid.current.rows);
    setColumnGuides([...openingGuides.current.columnGuides]);
    setRowGuides([...openingGuides.current.rowGuides]);
    setActiveControl({ kind: 'corner', corner: 'south' });
    setPlacingCorner(null);
    setSaveState('pending');
    setHandoffCopyState('idle');
  };

  const resetSpacing = (): void => {
    commitColumnGuides(uniformPredrawnGuides(gridColumns));
    commitRowGuides(uniformPredrawnGuides(gridRows));
  };

  const snapToIdealGrid = (): void => {
    const nextPoints = predrawnIdealGridSnap(pointsRef.current, sourceSize, gridColumns, gridRows);
    if (!nextPoints) return;
    commitPoints(nextPoints);
    commitColumnGuides(uniformPredrawnGuides(gridColumns));
    commitRowGuides(uniformPredrawnGuides(gridRows));
    setActiveControl({ kind: 'move' });
    setPlacingCorner(null);
  };

  const pinBoundaryReference = (): void => {
    if (!CORNERS.every((corner) => pointsRef.current[corner])) return;
    commitBoundaryPoints({ ...pointsRef.current });
  };

  const clearBoundaryReference = (): void => {
    commitBoundaryPoints({ north: undefined, east: undefined, south: undefined, west: undefined });
    if (activeControl.kind === 'reference-corner') setActiveControl({ kind: 'move' });
  };

  const changeGridColumns = (value: number): void => {
    const next = normalizePredrawnGridCount(value, gridColumns);
    if (next === gridColumns) return;
    setGridColumns(next);
    commitColumnGuides(uniformPredrawnGuides(next));
    if (activeControl.kind === 'column') setActiveControl({ kind: 'move' });
  };

  const changeGridRows = (value: number): void => {
    const next = normalizePredrawnGridCount(value, gridRows);
    if (next === gridRows) return;
    setGridRows(next);
    commitRowGuides(uniformPredrawnGuides(next));
    if (activeControl.kind === 'row') setActiveControl({ kind: 'move' });
  };

  const stageStyle = sourceSize.width && sourceSize.height
    ? {
        width: zoom === 'fit' ? '100%' : `${Math.round(sourceSize.width * zoom)}px`,
        aspectRatio: `${sourceSize.width} / ${sourceSize.height}`,
      } as CSSProperties
    : undefined;

  const gridLines = useMemo(() => {
    if (!registration) return null;
    const makeLine = (start: PredrawnPoint | undefined, end: PredrawnPoint | undefined) => (
      start && end ? { start, end } : null
    );
    return {
      fittedColumns: columnGuides.map((guide) => makeLine(
        predrawnSourceGridPoint(registration, guide, 0),
        predrawnSourceGridPoint(registration, guide, 1),
      )).filter(Boolean) as { start: PredrawnPoint; end: PredrawnPoint }[],
      fittedRows: rowGuides.map((guide) => makeLine(
        predrawnSourceGridPoint(registration, 0, guide),
        predrawnSourceGridPoint(registration, 1, guide),
      )).filter(Boolean) as { start: PredrawnPoint; end: PredrawnPoint }[],
      canonicalColumns: uniformPredrawnGuides(gridColumns).map((guide) => makeLine(
        predrawnSourceGridPoint(registration, guide, 0),
        predrawnSourceGridPoint(registration, guide, 1),
      )).filter(Boolean) as { start: PredrawnPoint; end: PredrawnPoint }[],
      canonicalRows: uniformPredrawnGuides(gridRows).map((guide) => makeLine(
        predrawnSourceGridPoint(registration, 0, guide),
        predrawnSourceGridPoint(registration, 1, guide),
      )).filter(Boolean) as { start: PredrawnPoint; end: PredrawnPoint }[],
      columnHandles: columnGuides.slice(1, -1).map((guide, index) => ({
        index: index + 1,
        point: predrawnSourceGridPoint(registration, guide, 0.18),
      })),
      rowHandles: rowGuides.slice(1, -1).map((guide, index) => ({
        index: index + 1,
        point: predrawnSourceGridPoint(registration, 0.82, guide),
      })),
      center: predrawnSourceGridPoint(registration, 0.5, 0.5),
    };
  }, [columnGuides, gridColumns, gridRows, registration, rowGuides]);

  return createPortal(
    <div
      className="confirm-scrim predrawn-corner-picker-scrim chrome-family-surface"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        data-testid="predrawn-corner-picker"
        tabIndex={-1}
        className="confirm-panel predrawn-corner-picker-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="predrawn-corner-picker-title"
      >
        <header className="predrawn-corner-picker-header">
          <div>
            <h2 id="predrawn-corner-picker-title">Calibrate the artwork refit grid</h2>
            <p>Set how many rows and columns the artwork contains, place its four boundary corners, then fit the cyan grid to its painted cells.</p>
          </div>
          <button
            type="button"
            data-chrome-unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
            onClick={onClose}
          >Close</button>
        </header>

        <div className="predrawn-corner-picker-toolbar">
          <div className="predrawn-corner-picker-corners" role="group" aria-label="Corner to place">
            {CORNERS.map((corner) => (
              <button
                key={corner}
                type="button"
                data-chrome-unit="inner-text-button"
                className={chromeUnitClassNames(
                  'inner-text-button',
                  'le-seg-btn',
                  activeControl.kind === 'corner' && activeControl.corner === corner && 'active',
                )}
                aria-pressed={activeControl.kind === 'corner' && activeControl.corner === corner}
                onClick={() => chooseCorner(corner)}
              >
                <strong>{CORNER_LABEL[corner]}</strong>
                <span>{pointLabel(points[corner])}</span>
              </button>
            ))}
          </div>
          <div className="predrawn-corner-picker-zoom" role="group" aria-label="Source image zoom">
            {(['fit', 0.5, 0.75, 1, 1.5, 2] as const).map((value) => (
              <button
                key={value}
                type="button"
                data-chrome-unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', zoom === value && 'active')}
                aria-pressed={zoom === value}
                onClick={() => setZoom(value)}
              >{value === 'fit' ? 'Fit' : `${value * 100}%`}</button>
            ))}
          </div>
        </div>

        <div className="predrawn-grid-calibration-bar">
          <div className="predrawn-grid-legend" aria-label="Grid legend">
            <span data-kind="fitted">Fitted grid</span>
            <span data-kind="canonical">Equal-spacing reference</span>
            <span data-kind="boundary">Pinned boundary</span>
          </div>
          <div className="predrawn-grid-size-controls" role="group" aria-label="Artwork refit target dimensions">
            <label>
              <span>Refit columns</span>
              <input
                data-testid="predrawn-grid-columns"
                type="number"
                min={1}
                max={64}
                step={1}
                value={gridColumns}
                onChange={(event) => {
                  if (event.currentTarget.value) changeGridColumns(Number(event.currentTarget.value));
                }}
              />
            </label>
            <span aria-hidden="true">×</span>
            <label>
              <span>Refit rows</span>
              <input
                data-testid="predrawn-grid-rows"
                type="number"
                min={1}
                max={64}
                step={1}
                value={gridRows}
                onChange={(event) => {
                  if (event.currentTarget.value) changeGridRows(Number(event.currentTarget.value));
                }}
              />
            </label>
            <small>Level remains {columns} × {rows}</small>
          </div>
          <output data-testid="predrawn-grid-stretch-summary">
            Refit {gridColumns} × {gridRows} · Columns {formatScale(stretch.columnMinScale)}–{formatScale(stretch.columnMaxScale)} · Rows {formatScale(stretch.rowMinScale)}–{formatScale(stretch.rowMaxScale)} · Max correction {stretch.maximumDeviationPercent.toFixed(1)}%
          </output>
          <div className="predrawn-grid-calibration-actions">
            <button
              type="button"
              data-testid="predrawn-boundary-pin"
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              disabled={!complete}
              onClick={pinBoundaryReference}
            >{boundaryReference ? 'Update boundary' : 'Pin boundary'}</button>
            <button
              type="button"
              data-testid="predrawn-boundary-clear"
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              disabled={!boundaryReference}
              onClick={clearBoundaryReference}
            >Clear boundary</button>
            <button
              type="button"
              data-testid="predrawn-grid-snap-ideal"
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              disabled={!complete}
              onClick={snapToIdealGrid}
            >Snap ideal grid</button>
            <button
              type="button"
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              onClick={resetSpacing}
            >Reset spacing</button>
          </div>
        </div>

        <div className="predrawn-corner-picker-viewport">
          <div
            ref={stageRef}
            className="predrawn-corner-picker-stage"
            style={stageStyle}
            onClick={placeActiveCorner}
          >
            <img
              src={src}
              alt="Untouched pre-drawn board source"
              draggable={false}
              onLoad={(event) => {
                const width = event.currentTarget.naturalWidth;
                const height = event.currentTarget.naturalHeight;
                setSourceSize({ width, height });
                setLoadError(false);
                if (!normalizedForImage.current) {
                  const normalizedPoints = pointsFromRegistration(openingRegistration.current, width, height);
                  const normalizedBoundaryPoints = boundaryPointsFromRegistration(
                    openingRegistration.current,
                    width,
                    height,
                  );
                  pointsRef.current = normalizedPoints;
                  boundaryPointsRef.current = normalizedBoundaryPoints;
                  setPoints(normalizedPoints);
                  setBoundaryPoints(normalizedBoundaryPoints);
                  normalizedForImage.current = true;
                }
              }}
              onError={() => setLoadError(true)}
            />
            {sourceSize.width && sourceSize.height ? (
              <div
                ref={overlayRef}
                data-testid="predrawn-corner-picker-stage"
                className="predrawn-corner-picker-overlay"
                tabIndex={0}
                role="application"
                aria-label={`Adjust ${activeControlLabel(activeControl)}. Drag handles or use arrow keys; hold Shift for ten-pixel corner movement.`}
                onKeyDown={nudgeActiveControl}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                {gridLines && !placingCorner ? (
                  <svg viewBox={`0 0 ${sourceSize.width} ${sourceSize.height}`} preserveAspectRatio="none" aria-hidden="true">
                    {boundaryReference ? (
                      <g className="predrawn-boundary-reference">
                        <polygon
                          points={CORNERS.map((corner) => boundaryReference[corner].join(',')).join(' ')}
                          vectorEffect="non-scaling-stroke"
                        />
                        {CORNERS.map((corner) => (
                          <circle
                            key={corner}
                            data-testid={`predrawn-boundary-${corner}`}
                            className={activeControl.kind === 'reference-corner' && activeControl.corner === corner ? 'active' : undefined}
                            cx={boundaryReference[corner][0]}
                            cy={boundaryReference[corner][1]}
                            r={7}
                            vectorEffect="non-scaling-stroke"
                            onPointerDown={(event) => beginDrag(event, { kind: 'reference-corner', corner })}
                          ><title>{`Adjust ${CORNER_LABEL[corner]} pinned boundary corner`}</title></circle>
                        ))}
                      </g>
                    ) : null}
                    <g className="predrawn-grid-reference-lines">
                      {[...gridLines.canonicalColumns, ...gridLines.canonicalRows].map((line, index) => (
                        <line key={index} x1={line.start[0]} y1={line.start[1]} x2={line.end[0]} y2={line.end[1]} vectorEffect="non-scaling-stroke" />
                      ))}
                    </g>
                    <g className="predrawn-grid-fitted-lines">
                      {[...gridLines.fittedColumns, ...gridLines.fittedRows].map((line, index) => (
                        <line key={index} x1={line.start[0]} y1={line.start[1]} x2={line.end[0]} y2={line.end[1]} vectorEffect="non-scaling-stroke" />
                      ))}
                    </g>
                    <g className="predrawn-grid-guide-handles predrawn-grid-column-handles">
                      {gridLines.columnHandles.map(({ index, point }) => point ? (
                        <circle
                          key={index}
                          data-testid={`predrawn-column-guide-${index}`}
                          cx={point[0]}
                          cy={point[1]}
                          r={8}
                          vectorEffect="non-scaling-stroke"
                          onPointerDown={(event) => beginDrag(event, { kind: 'column', index })}
                        ><title>{`Stretch column guide ${index}`}</title></circle>
                      ) : null)}
                    </g>
                    <g className="predrawn-grid-guide-handles predrawn-grid-row-handles">
                      {gridLines.rowHandles.map(({ index, point }) => point ? (
                        <rect
                          key={index}
                          data-testid={`predrawn-row-guide-${index}`}
                          x={point[0] - 7}
                          y={point[1] - 7}
                          width={14}
                          height={14}
                          rx={2}
                          vectorEffect="non-scaling-stroke"
                          onPointerDown={(event) => beginDrag(event, { kind: 'row', index })}
                        ><title>{`Stretch row guide ${index}`}</title></rect>
                      ) : null)}
                    </g>
                    {gridLines.center ? (
                      <g
                        className="predrawn-grid-move-handle"
                        data-testid="predrawn-grid-move-handle"
                        transform={`translate(${gridLines.center[0]} ${gridLines.center[1]})`}
                        onPointerDown={(event) => beginDrag(event, { kind: 'move' })}
                      >
                        <circle r={12} vectorEffect="non-scaling-stroke" />
                        <path d="M-7 0H7M0-7V7" vectorEffect="non-scaling-stroke" />
                        <title>Move the whole grid</title>
                      </g>
                    ) : null}
                  </svg>
                ) : null}
                {CORNERS.map((corner) => {
                  const point = points[corner];
                  if (!point || placingCorner === corner) return null;
                  return (
                    <span
                      key={corner}
                      data-testid={`predrawn-corner-${corner}`}
                      data-corner={corner}
                      className={`predrawn-corner-picker-marker ${activeControl.kind === 'corner' && activeControl.corner === corner ? 'active' : ''}`.trim()}
                      style={{ left: `${(point[0] / sourceSize.width) * 100}%`, top: `${(point[1] / sourceSize.height) * 100}%` }}
                      onPointerDown={(event) => beginDrag(event, { kind: 'corner', corner })}
                    >
                      <span className="predrawn-corner-picker-marker-label">{CORNER_SHORT[corner]}</span>
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
          {loadError ? <p className="predrawn-corner-picker-error" role="alert">The source image could not be loaded.</p> : null}
        </div>

        <footer className="predrawn-corner-picker-footer">
          <p
            className="predrawn-corner-picker-save-status"
            data-state={saveState}
            role={saveState === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            <strong>{activeControlLabel(activeControl)}</strong>.{' '}
            {placingCorner
              ? `${CORNER_LABEL[placingCorner]} placement armed — click its destination on the image.`
              : saveState === 'pending'
                ? 'CALIBRATION CHANGED — click SAVE REGISTRATION to apply the inverse warp.'
                : saveState === 'saved'
                  ? 'SAVED LOCALLY — the exact grid registration was read back and applied.'
                  : saveState === 'error'
                    ? 'LOCAL SAVE FAILED — registration was not saved.'
                    : 'Drag a handle to begin.'}
            {' '}Cyan circles stretch columns, squares stretch rows, the center cross moves the grid, and magenta handles edit the pinned boundary.
          </p>
          <div className="confirm-actions">
            <button
              type="button"
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              onClick={reset}
            >Restore opening calibration</button>
            <button
              type="button"
              data-testid="predrawn-registration-save"
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
              disabled={!complete || loadError}
              onClick={saveRegistration}
            >SAVE REGISTRATION</button>
            <button
              type="button"
              data-testid="predrawn-registration-copy-handoff"
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              disabled={saveState !== 'saved'}
              onClick={() => { void copyCodexHandoff(); }}
            >{handoffCopyState === 'copied'
                ? 'COPIED — PASTE IN CODEX'
                : handoffCopyState === 'error'
                  ? 'COPY FAILED'
                  : 'COPY CODEX HANDOFF'}</button>
            <button
              type="button"
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              disabled={!complete || saveState === 'pending' || saveState === 'error'}
              onClick={onClose}
            >Done</button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
