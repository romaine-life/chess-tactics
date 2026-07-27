export type PredrawnPoint = readonly [x: number, y: number];

export interface PredrawnBoardHomography {
  h11: number;
  h12: number;
  h13: number;
  h21: number;
  h22: number;
  h23: number;
  h31: number;
  h32: number;
}

function solveLinearSystem(rows: number[][], values: number[]): number[] | undefined {
  const size = values.length;
  const augmented = rows.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return undefined;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

export function homographyForPredrawnPoints(
  sources: readonly PredrawnPoint[],
  targets: readonly PredrawnPoint[],
): PredrawnBoardHomography | undefined {
  if (sources.length !== 4 || targets.length !== 4) return undefined;
  const rows: number[][] = [];
  const values: number[] = [];
  sources.forEach(([x, y], index) => {
    const [targetX, targetY] = targets[index];
    rows.push([x, y, 1, 0, 0, 0, -targetX * x, -targetX * y]);
    values.push(targetX);
    rows.push([0, 0, 0, x, y, 1, -targetY * x, -targetY * y]);
    values.push(targetY);
  });
  const solved = solveLinearSystem(rows, values);
  if (!solved) return undefined;
  const [h11, h12, h13, h21, h22, h23, h31, h32] = solved;
  const homography = { h11, h12, h13, h21, h22, h23, h31, h32 };
  const residual = sources.reduce((max, point, index) => {
    const projected = projectPredrawnPoint(homography, point);
    if (!projected) return Infinity;
    return Math.max(max, Math.hypot(
      projected[0] - targets[index][0],
      projected[1] - targets[index][1],
    ));
  }, 0);
  return residual <= 1e-5 ? homography : undefined;
}

export function projectPredrawnPoint(
  homography: PredrawnBoardHomography,
  [x, y]: PredrawnPoint,
): PredrawnPoint | undefined {
  const denominator = homography.h31 * x + homography.h32 * y + 1;
  if (Math.abs(denominator) < 1e-10) return undefined;
  const projected: PredrawnPoint = [
    (homography.h11 * x + homography.h12 * y + homography.h13) / denominator,
    (homography.h21 * x + homography.h22 * y + homography.h23) / denominator,
  ];
  return projected.every(Number.isFinite) ? projected : undefined;
}
