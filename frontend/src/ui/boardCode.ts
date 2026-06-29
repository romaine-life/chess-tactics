// A compact, URL-safe encoding of a level-editor board, so a board can be shared/inspected
// via `/level-editor?board=<code>`. Round-trips the editor's in-memory layers (tiles, units,
// doodads, cover, roads). Used both to LOAD a board on mount and to EXPORT the current one.
//
// Wire shape (keys kept short): { c:cols, r:rows, f?:fillTileId, t?:{cell:tileId},
//   u?:{cell:[unitId,dir,faction]}, d?:{cell:doodadId}, v?:{cell:density},
//   rd?:{cell:roadMaterial}, rc?:[edgeKey] }. `f` fills every cell, then `t` overrides — so a
// "mostly one tile" board stays tiny. base64url of the JSON (no padding, +/ -> -_).

import type { GroundCoverDensity } from '../core/groundCover';
import type { RoadMaterial } from '../core/featureAutotile';

export interface EditorBoard {
  cols: number;
  rows: number;
  cells: Record<string, string>;
  units: Record<string, { unitId: string; direction: string; faction: string }>;
  doodads: Record<string, { doodadId: string }>;
  cover: Record<string, GroundCoverDensity>;
  roads: Record<string, RoadMaterial>;
  roadCuts: Record<string, true>;
}

const enc = (s: string): string => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s: string): string => atob(s.replace(/-/g, '+').replace(/_/g, '/'));
const nonEmpty = (o: object): boolean => Object.keys(o).length > 0;

/** Pick the tile id covering the most cells, so it can be the cheap `f` fill base. */
function dominantTile(cells: Record<string, string>): string | undefined {
  const counts = new Map<string, number>();
  for (const id of Object.values(cells)) counts.set(id, (counts.get(id) ?? 0) + 1);
  let best: string | undefined, n = 0;
  for (const [id, c] of counts) if (c > n) { n = c; best = id; }
  return best;
}

export function encodeBoard(b: EditorBoard): string {
  const fill = dominantTile(b.cells);
  const t: Record<string, string> = {};
  for (const [k, id] of Object.entries(b.cells)) if (id !== fill) t[k] = id;
  const wire: Record<string, unknown> = { c: b.cols, r: b.rows };
  if (fill) wire.f = fill;
  if (nonEmpty(t)) wire.t = t;
  if (nonEmpty(b.units)) wire.u = Object.fromEntries(Object.entries(b.units).map(([k, v]) => [k, [v.unitId, v.direction, v.faction]]));
  if (nonEmpty(b.doodads)) wire.d = Object.fromEntries(Object.entries(b.doodads).map(([k, v]) => [k, v.doodadId]));
  if (nonEmpty(b.cover)) wire.v = b.cover;
  if (nonEmpty(b.roads)) wire.rd = b.roads;
  if (nonEmpty(b.roadCuts)) wire.rc = Object.keys(b.roadCuts);
  return enc(JSON.stringify(wire));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function decodeBoard(code: string): EditorBoard | null {
  try {
    const w = JSON.parse(dec(code)) as any;
    const cols = w.c | 0, rows = w.r | 0;
    if (cols < 1 || rows < 1 || cols > 64 || rows > 64) return null;
    const cells: Record<string, string> = {};
    if (w.f) for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) cells[`${x},${y}`] = w.f;
    if (w.t) Object.assign(cells, w.t);
    const units: EditorBoard['units'] = {};
    if (w.u) for (const [k, a] of Object.entries(w.u as Record<string, [string, string, string]>)) units[k] = { unitId: a[0], direction: a[1], faction: a[2] };
    const doodads: EditorBoard['doodads'] = {};
    if (w.d) for (const [k, id] of Object.entries(w.d as Record<string, string>)) doodads[k] = { doodadId: id };
    const roadCuts: Record<string, true> = {};
    if (Array.isArray(w.rc)) for (const e of w.rc) roadCuts[e] = true;
    return {
      cols, rows, cells, units, doodads,
      cover: (w.v ?? {}) as Record<string, GroundCoverDensity>,
      roads: (w.rd ?? {}) as Record<string, RoadMaterial>,
      roadCuts,
    };
  } catch {
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Decode the `?board=` URL param at editor mount, if present and valid. */
export function readBoardParam(): EditorBoard | null {
  if (typeof window === 'undefined') return null;
  const code = new URLSearchParams(window.location.search).get('board');
  return code ? decodeBoard(code) : null;
}
