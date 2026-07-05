// A compact, URL-safe encoding of a level-editor board, so a board can be shared/inspected
// via `/editor/level?board=<code>`. Round-trips the editor's in-memory layers (tiles, units,
// doodads, cover, and linear features — roads + rivers). Used both to LOAD a board on mount
// and to EXPORT the current one.
//
// Wire shape (keys kept short): { c:cols, r:rows, pf?:playerFaction, f?:fillTileId, t?:{cell:tileId}, h?:[cell],
//   u?:{cell:[unitId,dir,faction]}, d?:{cell:doodadId}, p?:{anchorCell:propId}, v?:{cell:density},
//   rd?:{cell:roadMaterial}, rv?:{cell:riverMaterial}, fe?:{edgeKey:fenceMaterial},
//   rc?:[edgeKey], rx?:[edgeKey], z?:{cell:zoneType} }. `f` fills every
// cell, then `t` overrides — so a "mostly one tile" board stays tiny; `h` punches intentional holes
// back out of that fill. The autotiling ribbon features split per kind on the wire (rd=roads,
// rv=rivers) and merge into one `features` map on decode. FENCES are edge-based, not per-cell:
// `fe` maps a shared-edge key (roadEdgeKey "x,y|x,y") to a fence material — same edge keying as
// `rc` (severed edges) and `rx` (forced outward exits). `z` is the gameplay-zone channel
// (ADR-0050): each painted cell -> its zone type. base64url of the JSON (no padding, +/ -> -_).
//
// FORWARD/BACK-COMPAT: `z`/`p`/`fe` are emitted only when non-empty, so a board without them
// encodes byte-identically to a code that predates them, and an OLD code decodes them to empty.

import type { GroundCoverDensity } from '../core/groundCover';
import type { FeatureKind, FeatureMaterial, RoadMaterial, RiverMaterial, FenceMaterial } from '../core/featureAutotile';
import type { ZoneType } from '../core/level';

/**
 * One painted autotiling feature cell (road or river): which linear feature it carries and its
 * surface material. (Fences are NOT here — they are edge-based, stored in `EditorBoard.fences`.)
 */
export interface FeatureCell {
  kind: FeatureKind;
  material: FeatureMaterial;
}

export interface EditorBoard {
  cols: number;
  rows: number;
  /** Palette faction the human player controls. Undefined/null means choose at play-load time. */
  playerFaction?: string | null;
  cells: Record<string, string>;
  units: Record<string, { unitId: string; direction: string; faction: string }>;
  doodads: Record<string, { doodadId: string }>;
  /** Multi-cell props (trees/houses), keyed by ANCHOR cell "x,y" -> {propId} (mirrors doodads). */
  props: Record<string, { propId: string }>;
  cover: Record<string, GroundCoverDensity>;
  features: Record<string, FeatureCell>;
  /** Edge fences, keyed by the shared-edge key (roadEdgeKey "x,y|x,y") -> fence material.
   * Edge-based (a wall between two tiles), not per-cell — mirrors featureCuts/featureExits.
   * Optional + back-compat (like `zones`): a bare board literal omits it; `decodeBoard` always
   * returns it populated (empty for an old code). */
  fences?: Record<string, FenceMaterial>;
  featureCuts: Record<string, true>;
  featureExits: Record<string, true>;
  /** Gameplay zones (ADR-0050), keyed by cell "x,y" -> zone type. The editor paints
   * player-spawn / enemy-spawn / objective; the full ZoneType set is stored so the channel
   * stays lossless if the schema's other zone types (enemy-threat, falling-rock) are painted.
   * Optional + back-compat (like `props` before it): a pre-zones board literal simply omits it,
   * and `decodeBoard` always returns it populated (empty for an old code). */
  zones?: Record<string, ZoneType>;
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
  const totalCells = Math.max(0, b.cols * b.rows);
  const paintedCells = Object.keys(b.cells).length;
  const fillCandidate = dominantTile(b.cells);
  // Sparse boards are often intentional gaps. Only use the fill shortcut once painted cells are
  // the majority; otherwise the explicit sparse `t` map is smaller and preserves holes naturally.
  const fill = fillCandidate && paintedCells > totalCells / 2 ? fillCandidate : undefined;
  const t: Record<string, string> = {};
  for (const [k, id] of Object.entries(b.cells)) if (id !== fill) t[k] = id;
  const h: string[] = [];
  if (fill) for (let y = 0; y < b.rows; y += 1) for (let x = 0; x < b.cols; x += 1) {
    const key = `${x},${y}`;
    if (!(key in b.cells)) h.push(key);
  }
  const wire: Record<string, unknown> = { c: b.cols, r: b.rows };
  if (b.playerFaction) wire.pf = b.playerFaction;
  if (fill) wire.f = fill;
  if (nonEmpty(t)) wire.t = t;
  if (h.length) wire.h = h;
  if (nonEmpty(b.units)) wire.u = Object.fromEntries(Object.entries(b.units).map(([k, v]) => [k, [v.unitId, v.direction, v.faction]]));
  if (nonEmpty(b.doodads)) wire.d = Object.fromEntries(Object.entries(b.doodads).map(([k, v]) => [k, v.doodadId]));
  // Props mirror doodads on the wire: anchor cell -> bare propId. Emitted only when nonEmpty so a
  // prop-free board encodes byte-identically to a pre-props board.
  if (b.props && nonEmpty(b.props)) wire.p = Object.fromEntries(Object.entries(b.props).map(([k, v]) => [k, v.propId]));
  if (nonEmpty(b.cover)) wire.v = b.cover;
  // Split the autotiling ribbon features by kind so each map's values are bare materials
  // (rd=roads, rv=rivers). Fences ride separately in `fe` (edge-keyed), below.
  const rd: Record<string, RoadMaterial> = {};
  const rv: Record<string, RiverMaterial> = {};
  for (const [k, f] of Object.entries(b.features)) {
    if (f.kind === 'river') rv[k] = f.material as RiverMaterial;
    else rd[k] = f.material as RoadMaterial;
  }
  if (nonEmpty(rd)) wire.rd = rd;
  if (nonEmpty(rv)) wire.rv = rv;
  // Fences: an edge-key -> material map (emitted only when non-empty, back-compat like `z`/`p`).
  if (b.fences && nonEmpty(b.fences)) wire.fe = b.fences;
  if (nonEmpty(b.featureCuts)) wire.rc = Object.keys(b.featureCuts);
  if (nonEmpty(b.featureExits)) wire.rx = Object.keys(b.featureExits);
  // Zones ride as a bare {cell:zoneType} map — emitted only when non-empty so a zone-free board
  // is byte-identical to a pre-zones code (same discipline as `p`/props).
  if (b.zones && nonEmpty(b.zones)) wire.z = b.zones;
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
    if (Array.isArray(w.h)) for (const key of w.h) delete cells[String(key)];
    const units: EditorBoard['units'] = {};
    if (w.u) for (const [k, a] of Object.entries(w.u as Record<string, [string, string, string]>)) units[k] = { unitId: a[0], direction: a[1], faction: a[2] };
    const doodads: EditorBoard['doodads'] = {};
    if (w.d) for (const [k, id] of Object.entries(w.d as Record<string, string>)) doodads[k] = { doodadId: id };
    const props: EditorBoard['props'] = {};
    if (w.p) for (const [k, id] of Object.entries(w.p as Record<string, string>)) props[k] = { propId: id };
    const featureCuts: Record<string, true> = {};
    if (Array.isArray(w.rc)) for (const e of w.rc) featureCuts[e] = true;
    const featureExits: Record<string, true> = {};
    if (Array.isArray(w.rx)) for (const e of w.rx) featureExits[e] = true;
    // Merge the per-kind wire maps back into one features map (rd=roads, rv=rivers).
    const features: Record<string, FeatureCell> = {};
    if (w.rd) for (const [k, m] of Object.entries(w.rd as Record<string, RoadMaterial>)) features[k] = { kind: 'road', material: m };
    if (w.rv) for (const [k, m] of Object.entries(w.rv as Record<string, RiverMaterial>)) features[k] = { kind: 'river', material: m };
    // Fences: edge-key -> material (an OLD code without `fe` yields an empty map — back-compat).
    const fences: Record<string, FenceMaterial> = {};
    if (w.fe) for (const [k, m] of Object.entries(w.fe as Record<string, FenceMaterial>)) fences[k] = m;
    // Zones: an OLD code has no `z`, so this defaults to an empty map — the back-compat contract.
    const zones: EditorBoard['zones'] = {};
    if (w.z) for (const [k, type] of Object.entries(w.z as Record<string, ZoneType>)) zones[k] = type;
    return {
      cols, rows, playerFaction: typeof w.pf === 'string' ? w.pf : undefined, cells, units, doodads, props,
      cover: (w.v ?? {}) as Record<string, GroundCoverDensity>,
      features,
      fences,
      featureCuts,
      featureExits,
      zones,
    };
  } catch {
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Accept either a full `/editor/level?board=...` URL, a query string, or the raw board code. */
export function decodeBoardLinkInput(input: string): EditorBoard | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let code: string | null = null;
  try {
    const url = new URL(trimmed, typeof window === 'undefined' ? 'http://local.test' : window.location.origin);
    code = url.searchParams.get('board');
  } catch {
    // Fall through to query-string/raw-code parsing below.
  }
  if (!code) {
    const query = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed.includes('?') ? trimmed.slice(trimmed.indexOf('?') + 1) : trimmed;
    const params = new URLSearchParams(query);
    code = params.get('board') ?? (trimmed.startsWith('board=') ? params.get('board') : trimmed);
  }
  return code ? decodeBoard(code) : null;
}

/** Decode the `?board=` URL param at editor mount, if present and valid. */
export function readBoardParam(): EditorBoard | null {
  if (typeof window === 'undefined') return null;
  const code = new URLSearchParams(window.location.search).get('board');
  return code ? decodeBoard(code) : null;
}
