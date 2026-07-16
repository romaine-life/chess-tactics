import { roadEdgeKey } from './featureAutotile';

/** First scenic tile ring around the playable rectangle, including all four corner tiles. */
export function playableBorderRoadKeys(cols: number, rows: number): string[] {
  const keys: string[] = [];
  for (let x = -1; x <= cols; x += 1) keys.push(`${x},-1`, `${x},${rows}`);
  for (let y = 0; y < rows; y += 1) keys.push(`-1,${y}`, `${cols},${y}`);
  return keys;
}

/** Closed fence loop on the seam between playable cells and the first scenic tile ring. */
export function playableBorderFenceEdges(cols: number, rows: number): string[] {
  const edges: string[] = [];
  for (let x = 0; x < cols; x += 1) {
    edges.push(roadEdgeKey(x, 0, x, -1), roadEdgeKey(x, rows - 1, x, rows));
  }
  for (let y = 0; y < rows; y += 1) {
    edges.push(roadEdgeKey(0, y, -1, y), roadEdgeKey(cols - 1, y, cols, y));
  }
  return edges;
}
