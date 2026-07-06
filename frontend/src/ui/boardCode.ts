// A compact, URL-safe encoding of a level-editor board, so a board can be shared/inspected
// via `/editor/level?board=<code>`. Round-trips the editor's in-memory layers (tiles, units,
// doodads, cover, and linear features — roads + rivers). Used both to LOAD a board on mount
// and to EXPORT the current one.
//
// Wire shape (keys kept short): { c:cols, r:rows, pf?:playerFaction, fd?:{faction:defaultDir},
//   f?:fillTileId, t?:{cell:tileId}, h?:[cell], u?:{cell:[unitId,dir,faction]},
//   d?:{cell:doodadId}, p?:{anchorCell:propId}, v?:{cell:density},
//   rd?:{cell:roadMaterial}, rv?:{cell:riverMaterial}, fe?:{edgeKey:fenceMaterial},
//   wl?:{edgeKey:wallMaterial},
//   rc?:[edgeKey], rx?:[edgeKey], zn?:[[zoneId,zoneType,[cell],name?,color?]], z?:{cell:zoneType},
//   gr?:generatedRegionUnits }. `f` fills every cell, then `t` overrides — so a "mostly one tile"
// board stays tiny; `h` punches intentional holes back out of that fill. The autotiling ribbon
// features split per kind on the wire (rd=roads, rv=rivers) and merge into one `features` map on
// decode. FENCES are edge-based, not per-cell: `fe` maps a shared-edge key (roadEdgeKey "x,y|x,y")
// to a fence material — same edge keying as `rc` (severed edges) and `rx` (forced outward exits).
// `wl` is a wall material map; valid wall placement is the northmost/westmost map perimeter.
// `zn` is the authored gameplay-zone list; `z` is the legacy collapsed view (cell -> type) kept
// for old links/clients. `gr` stores editor-only generated-region units: saved cell selections
// plus the Generate panel settings needed to rerun them. base64url of the JSON (no padding, +/ -> -_).
//
// FORWARD/BACK-COMPAT: `z`/`p`/`fe`/`wl` are emitted only when non-empty, so a board without them
// encodes byte-identically to a code that predates them, and an OLD code decodes them to empty.

import type { GroundCoverDensity } from '../core/groundCover';
import type { FeatureKind, FeatureMaterial, RoadMaterial, RiverMaterial, FenceMaterial, WallMaterial } from '../core/featureAutotile';
import { ZONE_COLORS, ZONE_TYPES, type ZoneColor, type ZoneType } from '../core/level';
import type { TileFamilyId } from '../core/tileSockets';
import { UNIT_FACINGS, UNIT_PALETTES, type UnitPalette } from '../core/pieces';
import type { UnitFacing } from '../core/types';

/**
 * One painted autotiling feature cell (road or river): which linear feature it carries and its
 * surface material. (Fences are NOT here — they are edge-based, stored in `EditorBoard.fences`.)
 */
export interface FeatureCell {
  kind: FeatureKind;
  material: FeatureMaterial;
}

export interface EditorZoneEntry {
  id: string;
  name?: string;
  color?: ZoneColor;
  type: ZoneType;
  tiles: string[];
}

export type BoardFactionDirections = Partial<Record<UnitPalette, UnitFacing>>;

export type BoardGeneratedRegionCover = {
  type: TileFamilyId;
  knobs: { amount: number; amountRandom: number; density: number; densityRandom: number };
};

export type BoardGeneratedRegionSection = {
  terrain: TileFamilyId;
  share: number;
  locked?: boolean;
  covers?: BoardGeneratedRegionCover[];
};

export interface BoardGeneratedRegion {
  id: string;
  name: string;
  /** Board cell keys ("x,y") that this generated-region unit owns. */
  cells: string[];
  /** Generate panel terrain rows captured for reruns. */
  sections: BoardGeneratedRegionSection[];
  /** Randomness buffer percentage, 0..60. */
  buffer: number;
  /** Edge roughness, 0..1. */
  wiggle: number;
}

export interface EditorBoard {
  cols: number;
  rows: number;
  /** Palette faction the human player controls. Undefined/null means choose at play-load time. */
  playerFaction?: string | null;
  /** Per-faction default facing used when the level editor places new units. */
  factionDirections?: BoardFactionDirections;
  cells: Record<string, string>;
  units: Record<string, { unitId: string; direction: string; faction: string }>;
  doodads: Record<string, { doodadId: string }>;
  /** Multi-cell props (trees/houses), keyed by ANCHOR cell "x,y" -> {propId} (mirrors doodads). */
  props: Record<string, { propId: string }>;
  cover: Record<string, GroundCoverDensity>;
  /** Per-cell cover-set OVERRIDE (cell "x,y" -> cover family), decoupling ground cover from the
   * tile's terrain (e.g. grass tufts on a stone region). A cell absent here falls back to its own
   * tile terrain (the classic behaviour). Optional + back-compat (like `zones`). */
  coverTypes?: Record<string, TileFamilyId>;
  features: Record<string, FeatureCell>;
  /** Edge fences, keyed by the shared-edge key (roadEdgeKey "x,y|x,y") -> fence material.
   * Edge-based (a wall between two tiles), not per-cell — mirrors featureCuts/featureExits.
   * Optional + back-compat (like `zones`): a bare board literal omits it; `decodeBoard` always
   * returns it populated (empty for an old code). */
  fences?: Record<string, FenceMaterial>;
  /** Edge walls, keyed like fences, but valid only on the northmost/westmost map perimeter.
   * Saves as its own visual channel while `editorBoardToLevel` projects it into the same
   * durable blocked-edge list as fences. Optional + back-compat like `fences`. */
  walls?: Record<string, WallMaterial>;
  featureCuts: Record<string, true>;
  featureExits: Record<string, true>;
  /** Authored gameplay zone entries. Empty entries are allowed so the editor's zone dropdown can
   * preserve an author's chosen N even before any cells are painted. */
  zoneEntries?: EditorZoneEntry[];
  /** Legacy collapsed gameplay zones, keyed by cell "x,y" -> zone type. Kept as a compatibility
   * view for old board codes and renderer overlays; entries are the source of truth when present. */
  zones?: Record<string, ZoneType>;
  /** Editor-only generated-region units: saved selections + Generate panel settings. */
  generatedRegions?: BoardGeneratedRegion[];
}

const enc = (s: string): string => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s: string): string => atob(s.replace(/-/g, '+').replace(/_/g, '/'));
const nonEmpty = (o: object): boolean => Object.keys(o).length > 0;
const validFactions = new Set<string>(UNIT_PALETTES);
const validFacings = new Set<string>(UNIT_FACINGS);
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const clampNumber = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const validZoneTypes = new Set<string>(ZONE_TYPES);
const validZoneColors = new Set<string>(ZONE_COLORS);

function cellParts(key: string): [number, number] | null {
  const [xs, ys] = key.split(',');
  const x = Number(xs), y = Number(ys);
  return Number.isInteger(x) && Number.isInteger(y) ? [x, y] : null;
}

function inBoardKey(key: string, cols: number, rows: number): boolean {
  const p = cellParts(key);
  return !!p && p[0] >= 0 && p[0] < cols && p[1] >= 0 && p[1] < rows;
}

function sortCellKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const pa = cellParts(a) ?? [0, 0];
    const pb = cellParts(b) ?? [0, 0];
    return pa[1] - pb[1] || pa[0] - pb[0];
  });
}

function normalizeZoneEntries(entries: readonly EditorZoneEntry[] | undefined, cols: number, rows: number): EditorZoneEntry[] {
  const out: EditorZoneEntry[] = [];
  for (const [index, entry] of (entries ?? []).entries()) {
    if (!entry || typeof entry.id !== 'string' || !validZoneTypes.has(entry.type) || !Array.isArray(entry.tiles)) continue;
    const seen = new Set<string>();
    const tiles: string[] = [];
    for (const rawKey of entry.tiles) {
      const key = String(rawKey);
      if (seen.has(key) || !inBoardKey(key, cols, rows)) continue;
      seen.add(key);
      tiles.push(key);
    }
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : undefined;
    const color = entry.color && validZoneColors.has(entry.color) ? entry.color : undefined;
    out.push({ id: entry.id.trim() || `zone-${index + 1}`, ...(name ? { name } : {}), ...(color ? { color } : {}), type: entry.type, tiles: sortCellKeys(tiles) });
  }
  return out;
}

export function zoneCellMapFromEntries(entries: readonly EditorZoneEntry[] | undefined): Record<string, ZoneType> {
  const zones: Record<string, ZoneType> = {};
  for (const entry of entries ?? []) {
    if (!entry || !validZoneTypes.has(entry.type)) continue;
    for (const key of entry.tiles) zones[key] = entry.type;
  }
  return zones;
}

export function zoneEntriesFromCellMap(channel: Record<string, ZoneType> | undefined, cols: number, rows: number): EditorZoneEntry[] {
  if (!channel) return [];
  const byType = new Map<ZoneType, string[]>();
  for (const [key, type] of Object.entries(channel)) {
    if (!validZoneTypes.has(type) || !inBoardKey(key, cols, rows)) continue;
    const list = byType.get(type) ?? [];
    list.push(key);
    byType.set(type, list);
  }
  const entries: EditorZoneEntry[] = [];
  for (const type of ZONE_TYPES) {
    const tiles = byType.get(type);
    if (!tiles?.length) continue;
    entries.push({ id: `z-${type}`, type, tiles: sortCellKeys(tiles) });
  }
  return entries;
}

function cleanFactionDirections(value: unknown): BoardFactionDirections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: BoardFactionDirections = {};
  for (const [faction, direction] of Object.entries(value as Record<string, unknown>)) {
    if (!validFactions.has(faction) || !validFacings.has(String(direction))) continue;
    out[faction as UnitPalette] = direction as UnitFacing;
  }
  return out;
}

/** Pick the tile id covering the most cells, so it can be the cheap `f` fill base. */
function dominantTile(cells: Record<string, string>): string | undefined {
  const counts = new Map<string, number>();
  for (const id of Object.values(cells)) counts.set(id, (counts.get(id) ?? 0) + 1);
  let best: string | undefined, n = 0;
  for (const [id, c] of counts) if (c > n) { n = c; best = id; }
  return best;
}

function isInBoundsCellKey(key: string, cols: number, rows: number): boolean {
  const [xRaw, yRaw] = key.split(',');
  const x = Number(xRaw);
  const y = Number(yRaw);
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < cols && y < rows;
}

function encodeGeneratedRegions(regions: BoardGeneratedRegion[] | undefined, cols: number, rows: number): unknown[] {
  if (!regions?.length) return [];
  return regions
    .map((region) => {
      const cells = [...new Set(region.cells.filter((key) => isInBoundsCellKey(key, cols, rows)))];
      if (!cells.length) return null;
      return {
        i: region.id,
        n: region.name,
        c: cells,
        s: region.sections.map((section) => [
          section.terrain,
          section.share,
          section.locked ? 1 : 0,
          (section.covers ?? []).map((cover) => [
            cover.type,
            cover.knobs.amount,
            cover.knobs.amountRandom,
            cover.knobs.density,
            cover.knobs.densityRandom,
          ]),
        ]),
        b: region.buffer,
        w: region.wiggle,
      };
    })
    .filter(Boolean) as unknown[];
}

function decodeGeneratedRegions(value: unknown, cols: number, rows: number): BoardGeneratedRegion[] {
  if (!Array.isArray(value)) return [];
  const out: BoardGeneratedRegion[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const rec = raw as Record<string, unknown>;
    const id = typeof rec.i === 'string' && rec.i.trim() ? rec.i : `region-${out.length + 1}`;
    const name = typeof rec.n === 'string' && rec.n.trim() ? rec.n : `Region ${out.length + 1}`;
    const cells = Array.isArray(rec.c)
      ? [...new Set(rec.c.map(String).filter((key) => isInBoundsCellKey(key, cols, rows)))]
      : [];
    if (!cells.length) continue;
    const sections: BoardGeneratedRegionSection[] = [];
    if (Array.isArray(rec.s)) {
      for (const rawSection of rec.s) {
        if (!Array.isArray(rawSection)) continue;
        const covers: BoardGeneratedRegionCover[] = [];
        if (Array.isArray(rawSection[3])) {
          for (const rawCover of rawSection[3]) {
            if (!Array.isArray(rawCover)) continue;
            covers.push({
              type: String(rawCover[0]) as TileFamilyId,
              knobs: {
                amount: clampNumber(rawCover[1], 0.6, 0, 1),
                amountRandom: clampNumber(rawCover[2], 0.3, 0, 1),
                density: clampNumber(rawCover[3], 0.4, 0, 1),
                densityRandom: clampNumber(rawCover[4], 0.3, 0, 1),
              },
            });
          }
        }
        const section: BoardGeneratedRegionSection = {
          terrain: String(rawSection[0]) as TileFamilyId,
          share: Math.max(0, Math.min(100, Math.round(Number(rawSection[1]) || 0))),
          covers,
        };
        if (rawSection[2] === 1 || rawSection[2] === true) section.locked = true;
        sections.push(section);
      }
    }
    out.push({
      id,
      name,
      cells,
      sections: sections.length ? sections : [{ terrain: 'grass' as TileFamilyId, share: 100, covers: [] }],
      buffer: Math.round(clampNumber(rec.b, 0, 0, 60)),
      wiggle: clamp01(clampNumber(rec.w, 0.5, 0, 1)),
    });
  }
  return out;
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
  const fd = cleanFactionDirections(b.factionDirections);
  if (nonEmpty(fd)) wire.fd = fd;
  if (fill) wire.f = fill;
  if (nonEmpty(t)) wire.t = t;
  if (h.length) wire.h = h;
  if (nonEmpty(b.units)) wire.u = Object.fromEntries(Object.entries(b.units).map(([k, v]) => [k, [v.unitId, v.direction, v.faction]]));
  if (nonEmpty(b.doodads)) wire.d = Object.fromEntries(Object.entries(b.doodads).map(([k, v]) => [k, v.doodadId]));
  // Props mirror doodads on the wire: anchor cell -> bare propId. Emitted only when nonEmpty so a
  // prop-free board encodes byte-identically to a pre-props board.
  if (b.props && nonEmpty(b.props)) wire.p = Object.fromEntries(Object.entries(b.props).map(([k, v]) => [k, v.propId]));
  if (nonEmpty(b.cover)) wire.v = b.cover;
  // Cover-set overrides ride a separate channel, emitted only when non-empty so a board that never
  // decouples cover from terrain encodes byte-identically to a pre-override code.
  if (b.coverTypes && nonEmpty(b.coverTypes)) wire.ct = b.coverTypes;
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
  // Walls: edge-key -> material map. Separate from fences visually, but gameplay blocks the
  // same edge when the board is projected to a Level.
  if (b.walls && nonEmpty(b.walls)) wire.wl = b.walls;
  if (nonEmpty(b.featureCuts)) wire.rc = Object.keys(b.featureCuts);
  if (nonEmpty(b.featureExits)) wire.rx = Object.keys(b.featureExits);
  // Zones ride primarily as entries so same-type zones and empty authored zones survive a reopen.
  // A collapsed `z` map is also emitted when cells exist so older code can still render/consume
  // a best-effort zone overlay. Zone-free boards still omit both keys.
  const zoneEntries = normalizeZoneEntries(b.zoneEntries ?? zoneEntriesFromCellMap(b.zones, b.cols, b.rows), b.cols, b.rows);
  const zones = zoneCellMapFromEntries(zoneEntries);
  if (zoneEntries.length) wire.zn = zoneEntries.map((z) => {
    const name = z.name?.trim();
    const color = z.color && validZoneColors.has(z.color) ? z.color : undefined;
    return name || color ? [z.id, z.type, z.tiles, name ?? '', color ?? ''] : [z.id, z.type, z.tiles];
  });
  if (nonEmpty(zones)) wire.z = zones;
  const gr = encodeGeneratedRegions(b.generatedRegions, b.cols, b.rows);
  if (gr.length) wire.gr = gr;
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
    const factionDirections = cleanFactionDirections(w.fd);
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
    // Walls: edge-key -> material (an OLD code without `wl` yields an empty map — back-compat).
    const walls: Record<string, WallMaterial> = {};
    if (w.wl) for (const [k, m] of Object.entries(w.wl as Record<string, WallMaterial>)) walls[k] = m;
    // Zones: `zn` carries authored entries; old codes only have `z`, which is grouped back into
    // one entry per type so the editor still opens them in the new dropdown model.
    let zoneEntries: EditorZoneEntry[] = [];
    if (Array.isArray(w.zn)) {
      zoneEntries = normalizeZoneEntries(
        (w.zn as Array<[unknown, unknown, unknown, unknown?, unknown?]>).map(([id, type, tiles, name, color]) => ({
          id: String(id ?? ''),
          name: typeof name === 'string' ? name : undefined,
          color: typeof color === 'string' ? color as ZoneColor : undefined,
          type: type as ZoneType,
          tiles: Array.isArray(tiles) ? tiles.map(String) : [],
        })),
        cols,
        rows,
      );
    }
    const legacyZones: EditorBoard['zones'] = {};
    if (w.z) {
      for (const [k, type] of Object.entries(w.z as Record<string, ZoneType>)) {
        if (validZoneTypes.has(type) && inBoardKey(k, cols, rows)) legacyZones[k] = type;
      }
    }
    if (!zoneEntries.length && nonEmpty(legacyZones)) zoneEntries = zoneEntriesFromCellMap(legacyZones, cols, rows);
    const zones = zoneCellMapFromEntries(zoneEntries);
    const generatedRegions = decodeGeneratedRegions(w.gr, cols, rows);
    return {
      cols, rows, playerFaction: typeof w.pf === 'string' ? w.pf : undefined, factionDirections, cells, units, doodads, props,
      cover: (w.v ?? {}) as Record<string, GroundCoverDensity>,
      coverTypes: (w.ct ?? {}) as Record<string, TileFamilyId>,
      features,
      fences,
      walls,
      featureCuts,
      featureExits,
      zoneEntries,
      zones,
      generatedRegions,
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
