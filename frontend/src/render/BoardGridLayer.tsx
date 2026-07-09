import { useMemo, type CSSProperties, type ReactElement } from 'react';
import { TILE_STEP_X, TILE_STEP_Y } from '../art/projectionContract';
import { boardLabCellPosition } from './boardProjection';

interface GridCell {
  x: number;
  y: number;
}

interface GridLinePlan {
  left: number;
  top: number;
  width: number;
  height: number;
  d: string;
}

const GRID_PAD_PX = 4;

function segmentKey(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const p1 = `${a.x},${a.y}`;
  const p2 = `${b.x},${b.y}`;
  return p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
}

function gridLinePlan(cells: readonly GridCell[]): GridLinePlan {
  if (cells.length === 0) return { left: 0, top: 0, width: 1, height: 1, d: '' };

  const edges = new Map<string, { a: { x: number; y: number }; b: { x: number; y: number } }>();
  const xs: number[] = [];
  const ys: number[] = [];

  for (const cell of cells) {
    const { left, top } = boardLabCellPosition(cell);
    const north = { x: left, y: top - TILE_STEP_Y };
    const east = { x: left + TILE_STEP_X, y: top };
    const south = { x: left, y: top + TILE_STEP_Y };
    const west = { x: left - TILE_STEP_X, y: top };
    const vertices = [north, east, south, west];
    for (const vertex of vertices) {
      xs.push(vertex.x);
      ys.push(vertex.y);
    }
    for (const [a, b] of [[north, east], [east, south], [south, west], [west, north]] as const) {
      const key = segmentKey(a, b);
      if (!edges.has(key)) edges.set(key, { a, b });
    }
  }

  const left = Math.floor(Math.min(...xs) - GRID_PAD_PX);
  const top = Math.floor(Math.min(...ys) - GRID_PAD_PX);
  const right = Math.ceil(Math.max(...xs) + GRID_PAD_PX);
  const bottom = Math.ceil(Math.max(...ys) + GRID_PAD_PX);
  const d = [...edges.values()]
    .map(({ a, b }) => `M${a.x - left} ${a.y - top}L${b.x - left} ${b.y - top}`)
    .join('');

  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top), d };
}

function gridSignature(cells: readonly GridCell[]): string {
  return cells.map((cell) => `${cell.x},${cell.y}`).join('|');
}

export function BoardGridLayer({ cells }: { cells: readonly GridCell[] }): ReactElement | null {
  const signature = useMemo(() => gridSignature(cells), [cells]);
  const plan = useMemo(() => gridLinePlan(cells), [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!plan.d) return null;

  const style = {
    left: `${plan.left}px`,
    top: `${plan.top}px`,
    width: `${plan.width}px`,
    height: `${plan.height}px`,
  } as CSSProperties;

  return (
    <svg
      className="tileset-board-grid-layer"
      viewBox={`0 0 ${plan.width} ${plan.height}`}
      width={plan.width}
      height={plan.height}
      style={style}
      aria-hidden="true"
    >
      <path d={plan.d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
