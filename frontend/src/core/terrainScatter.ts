// Procedural terrain scatter for the Level Editor. Carves an area — the whole board or a selected
// patch — into a user-defined list of terrain REGIONS. Each region in the panel becomes exactly
// ONE contiguous area on the board, sized by its SHARE of the space. So N regions ⇒ N regions on
// the board (the selector tool then finds exactly the regions you defined). Deterministic in
// `seed` (shared core/rng), so a board reproduces exactly.
//
//   1. BUDGET — turn each region's share into an integer tile budget via largest-remainder
//               (Hamilton) apportionment, so the budgets sum exactly to the area's cell count.
//               A `randomnessBuffer` is slack that jitters the targets each seed.
//   2. SEED   — drop one seed per region, spread apart by farthest-point sampling.
//   3. GROW   — grow all regions outward at once until each reaches its budget (capacity-limited
//               multi-source region growing). `wiggle` blends compact borders (grow nearest the
//               seed) vs. rough, organic borders (grow at a random frontier). Every region stays a
//               single connected blob; leftover cells are absorbed by an adjacent region.
//
// Two regions of the SAME terrain are independent contiguous blobs that may abut (reading as one
// organic area) — that's expected and fine. The output is a row-major TileFamilyId[] (length
// columns*rows) — feed it straight to solveSocketBoard() to autotile.

import { createRng, type Rng } from './rng';
import { defaultTerrainFamily } from './tileSockets';
import type { TileFamilyId } from './tileSockets';

export interface ScatterSection {
  terrain: TileFamilyId;
  /** Target share of the area, in [0, 100]. A 0-share region is omitted. Duplicates allowed. */
  share: number;
}

export interface ScatterTerrainOptions {
  columns: number;
  rows: number;
  /** The terrain regions to carve the area into. Must be non-empty to generate anything. */
  sections: readonly ScatterSection[];
  /** Slack budget (0..100) not pinned to shares; randomly perturbs the region sizes per seed. */
  randomnessBuffer: number;
  /** Border roughness in [0, 1]: 0 = compact/smooth region borders, 1 = rough/organic. */
  wiggle: number;
  seed: number;
  /** Row-major cell indices to (re)generate. Omit ⇒ the whole board. */
  region?: ReadonlySet<number>;
  /** Existing family per cell (row-major). Out-of-region cells keep this. May be undefined. */
  baseMap?: readonly (TileFamilyId | undefined)[];
}

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Round real-valued quotas to integers that sum EXACTLY to `total` (largest-remainder / Hamilton
 * apportionment): floor every quota, then hand the leftover units to the largest fractional
 * remainders. Guarantees Σ result === total for any non-negative quotas.
 */
export function largestRemainder(quotas: readonly number[], total: number): number[] {
  const floors = quotas.map((q) => Math.floor(Math.max(0, q)));
  const used = floors.reduce((a, b) => a + b, 0);
  let leftover = Math.max(0, Math.round(total) - used);
  const byRemainder = quotas
    .map((q, i) => ({ i, frac: Math.max(0, q) - Math.floor(Math.max(0, q)) }))
    .sort((a, b) => b.frac - a.frac);
  const out = floors.slice();
  for (let k = 0; leftover > 0 && byRemainder.length > 0; k += 1, leftover -= 1) {
    out[byRemainder[k % byRemainder.length].i] += 1;
  }
  return out;
}

/**
 * Per-region integer tile budgets summing to `totalCells`. Each region's effective weight is its
 * share plus a random slice of the `randomnessBuffer`, so the buffer perturbs region sizes each
 * seed while the whole thing still fills the area exactly.
 */
function sectionBudgets(
  sections: readonly ScatterSection[],
  randomnessBuffer: number,
  totalCells: number,
  rng: Rng,
): number[] {
  const buffer = Math.max(0, randomnessBuffer);
  const jitter = sections.map(() => rng.next());
  const jitterSum = jitter.reduce((a, b) => a + b, 0) || 1;
  const effective = sections.map((s, i) => Math.max(0, s.share) + buffer * (jitter[i] / jitterSum));
  const effectiveSum = effective.reduce((a, b) => a + b, 0);
  if (effectiveSum <= 0) {
    return largestRemainder(sections.map(() => totalCells / sections.length), totalCells);
  }
  return largestRemainder(effective.map((e) => (e / effectiveSum) * totalCells), totalCells);
}

/** Pick `count` seeds from `target` spread apart by farthest-point sampling (first seed random). */
function farthestSeeds(target: readonly number[], columns: number, count: number, rng: Rng): number[] {
  const seeds = [target[rng.int(target.length)]];
  while (seeds.length < count) {
    let best = target[0];
    let bestDist = -1;
    for (const cell of target) {
      const x = cell % columns;
      const y = (cell / columns) | 0;
      let nearest = Infinity;
      for (const s of seeds) {
        const d = Math.abs((s % columns) - x) + Math.abs(((s / columns) | 0) - y);
        if (d < nearest) nearest = d;
      }
      if (nearest > bestDist) {
        bestDist = nearest;
        best = cell;
      }
    }
    seeds.push(best);
  }
  return seeds;
}

/**
 * Grow one contiguous region per budget from spread-apart seeds until each reaches its budget, then
 * absorb any unclaimed cells into an adjacent region. Returns the region index (0-based, aligned to
 * `budgets`) per cell, row-major; -1 outside the target set. Every region is a single connected blob.
 */
function growRegions(
  target: readonly number[],
  columns: number,
  rows: number,
  budgets: readonly number[],
  wiggle: number,
  rng: Rng,
): Int32Array {
  const n = columns * rows;
  const regionOf = new Int32Array(n).fill(-1);
  const inTarget = new Uint8Array(n);
  for (const i of target) inTarget[i] = 1;

  const count = Math.min(budgets.length, target.length);
  const seeds = farthestSeeds(target, columns, count, rng);
  const size = new Array<number>(count).fill(0);
  const frontier: number[][] = Array.from({ length: count }, () => []);
  const pushNeighbours = (r: number, cell: number): void => {
    const x = cell % columns;
    const y = (cell / columns) | 0;
    for (const [dx, dy] of ORTHOGONAL) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      const ni = ny * columns + nx;
      if (inTarget[ni] && regionOf[ni] === -1) frontier[r].push(ni);
    }
  };
  seeds.forEach((s, r) => {
    regionOf[s] = r;
    size[r] = 1;
    pushNeighbours(r, s);
  });

  // Pop one growable cell for region r: drop already-claimed entries, then pick a random frontier
  // cell (wiggle) or the one nearest the seed (compact). Returns -1 if the region can't grow.
  const popFrontier = (r: number): number => {
    const fr = frontier[r];
    let w = 0;
    for (let k = 0; k < fr.length; k += 1) if (regionOf[fr[k]] === -1) fr[w++] = fr[k];
    fr.length = w;
    if (w === 0) return -1;
    let idx = 0;
    if (rng.next() < wiggle) {
      idx = rng.int(w);
    } else {
      const sx = seeds[r] % columns;
      const sy = (seeds[r] / columns) | 0;
      let bestDist = Infinity;
      for (let k = 0; k < w; k += 1) {
        const c = fr[k];
        const d = Math.abs((c % columns) - sx) + Math.abs(((c / columns) | 0) - sy);
        if (d < bestDist) { bestDist = d; idx = k; }
      }
    }
    const cell = fr[idx];
    fr[idx] = fr[fr.length - 1];
    fr.pop();
    return cell;
  };

  let active = Array.from({ length: count }, (_, r) => r).filter((r) => size[r] < budgets[r]);
  while (active.length > 0) {
    const next: number[] = [];
    for (const r of active) {
      const cell = popFrontier(r);
      if (cell < 0) continue;
      regionOf[cell] = r;
      size[r] += 1;
      pushNeighbours(r, cell);
      if (size[r] < budgets[r]) next.push(r);
    }
    active = next;
  }

  // Absorb any cells left unclaimed (a region capped before reaching them) into an adjacent region.
  let changed = true;
  while (changed) {
    changed = false;
    for (const i of target) {
      if (regionOf[i] !== -1) continue;
      const x = i % columns;
      const y = (i / columns) | 0;
      for (const [dx, dy] of ORTHOGONAL) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
        const r = regionOf[ny * columns + nx];
        if (r >= 0) {
          regionOf[i] = r;
          changed = true;
          break;
        }
      }
    }
  }
  return regionOf;
}

/**
 * Generate the terrain map AND the section-index map (both row-major, length columns*rows).
 * `terrain[i]` is the family; `sectionOf[i]` is the index into `sections` that owns cell i (-1
 * outside the target set) — callers use it to apply per-section settings like cover. Out-of-region
 * cells keep their `baseMap` family; the target is carved into one contiguous region per section,
 * each sized by its share. Deterministic in `seed`.
 */
export function scatterTerrainDetailed(opts: ScatterTerrainOptions): { terrain: TileFamilyId[]; sectionOf: Int32Array } {
  const { columns, rows, sections, randomnessBuffer, wiggle, seed, region, baseMap } = opts;
  const n = columns * rows;
  const fallback: TileFamilyId = sections[0]?.terrain ?? defaultTerrainFamily().id;
  const terrain: TileFamilyId[] = new Array(n);
  const sectionOf = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i += 1) terrain[i] = baseMap?.[i] ?? fallback;
  if (sections.length === 0) return { terrain, sectionOf };

  const target: number[] = region
    ? [...region].filter((i) => i >= 0 && i < n)
    : Array.from({ length: n }, (_, i) => i);
  if (target.length === 0) return { terrain, sectionOf };

  const rng = createRng(seed >>> 0);
  const budgets = sectionBudgets(sections, randomnessBuffer, target.length, rng);
  // Only regions with a positive budget become areas; align seeds/growth to those sections.
  const active: number[] = [];
  for (let s = 0; s < sections.length; s += 1) if (budgets[s] > 0) active.push(s);
  if (active.length === 0) {
    for (const i of target) { terrain[i] = sections[0].terrain; sectionOf[i] = 0; }
    return { terrain, sectionOf };
  }
  const regionOf = growRegions(target, columns, rows, active.map((s) => budgets[s]), Math.max(0, Math.min(1, wiggle)), rng);
  for (const i of target) {
    const r = regionOf[i];
    if (r >= 0 && r < active.length) {
      terrain[i] = sections[active[r]].terrain;
      sectionOf[i] = active[r];
    }
  }
  return { terrain, sectionOf };
}

/** Convenience: just the terrain family map (see scatterTerrainDetailed). */
export function scatterTerrain(opts: ScatterTerrainOptions): TileFamilyId[] {
  return scatterTerrainDetailed(opts).terrain;
}
