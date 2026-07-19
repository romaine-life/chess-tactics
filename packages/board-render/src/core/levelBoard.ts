// Converters between the durable `Level` document and the Level Editor's in-memory
// `EditorBoard`. The editor paints in terms of Studio tile ids / unit ids / doodads /
// roads-rivers; the saved `Level` is the canonical schema the game reads. Two functions
// bridge them, kept here (core) so neither the editor nor the game owns the mapping.
//
//  - `levelToEditorBoard` re-seeds the editor from a saved level: it prefers the
//    lossless `boardCode` (round-trips doodads/cover/features/facing), falling back to
//    deriving a board from `layers` for legacy levels that predate boardCode.
//  - `editorBoardToLevel` serializes the painted board into a valid `Level`, stamping the
//    `boardCode` so the next open is exact, and projecting terrain/units into `layers` so
//    the game (which reads `layers`, not `boardCode`) plays the authored board.

import type { Level, LevelEconomy, LevelEvents, LevelUnit, ObjectiveType, Roster, TimeControl, VictoryRules, Zone } from './level';
import { BOARD_COLS, BOARD_ROWS, LEVEL_FORMAT_VERSION } from './level';
import type { PlacedProp } from './props';
import type { Piece, Side, TerrainCell, TerrainType, UnitFacing } from './types';
import type { TileFamilyId } from './tileSockets';
import { decodeBoard, encodeBoard, zoneCellMapFromEntries, zoneEntriesFromCellMap, type EditorBoard, type EditorZoneEntry } from '../ui/boardCode';
import { parseEdgeKey, isOrthogonalPair, isNorthWestBoundaryWallEdge, defaultFenceMaterial } from './featureAutotile';
import { studioFamilies } from '../ui/studioBoard';
import { isUnitPalette } from './pieces';
import { unitFamilyForId, type Faction } from '../ui/unitCatalog';

// Family → terrain material, mirroring game/setup.ts. The six tile families map 1:1 onto
// the playable terrain materials; any unmapped (decorative) family falls back to grass.
const FAMILY_TO_TERRAIN: Record<TileFamilyId, TerrainType> = {
  grass: 'grass',
  stone: 'stone',
  water: 'water',
  dirt: 'dirt',
  pebble: 'pebble',
  sand: 'sand',
};

// Terrain the editor can REPRESENT (and thus round-trip), so the save-time guard need not
// preserve it from the pre-save level: the six tile families above, PLUS `road` — which the
// editor expresses through its feature-overlay layer (not a tile brush), mapped both ways in
// the converters below, and `void` — which the editor expresses as an intentionally missing
// tile. Terrain with neither a tile family nor a feature — bridge, cliff, rock — stays outside
// this set: it renders as a grass placeholder and is preserved on save rather than flattened
// (an INV7 data-loss on legacy officials that predate boardCode).
const EDITOR_EXPRESSIBLE_TERRAIN = new Set<TerrainType>([...Object.values(FAMILY_TO_TERRAIN), 'road', 'void']);

function pointInBoard(x: number, y: number, cols: number, rows: number): boolean {
  return x >= 0 && y >= 0 && x < cols && y < rows;
}

function fenceTouchesBoard(edge: string, cols: number, rows: number): boolean {
  const p = parseEdgeKey(edge);
  if (!p || !isOrthogonalPair(p.ax, p.ay, p.bx, p.by)) return false;
  return pointInBoard(p.ax, p.ay, cols, rows) || pointInBoard(p.bx, p.by, cols, rows);
}

// Side ↔ faction (team palette). The editor paints a faction; the level stores a side.
const SIDE_TO_FACTION: Record<'player' | 'enemy', Faction> = { player: 'navy-blue', enemy: 'crimson' };
const isFaction = (faction: string | null | undefined): faction is Faction =>
  isUnitPalette(faction);
const sideForFaction = (faction: string, playerFaction: string | null | undefined): Side =>
  playerFaction && faction === playerFaction ? 'player' : 'enemy';

/**
 * Project the editor's authored zone entries into `layers.zones`. Empty entries are preserved
 * because the editor's zone dropdown is explicitly controlled by the author; in-bounds tiles are
 * emitted in row-major order for stable, diff-friendly saves.
 */
function zonesToLayers(
  entries: readonly EditorZoneEntry[] | undefined,
  cols: number,
  rows: number,
): Zone[] {
  return (entries ?? []).map((entry, index) => {
    const tiles: Array<[number, number]> = [];
    const seen = new Set<string>();
    for (const key of entry.tiles) {
      const [x, y] = key.split(',').map(Number);
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= cols || y < 0 || y >= rows) continue;
      const stableKey = `${x},${y}`;
      if (seen.has(stableKey)) continue;
      seen.add(stableKey);
      tiles.push([x, y]);
    }
    tiles.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const name = entry.name?.trim();
    return { id: entry.id.trim() || `zone-${index + 1}`, ...(name ? { name } : {}), ...(entry.color ? { color: entry.color } : {}), type: entry.type, tiles };
  });
}

/** Rebuild the editor's zone entries from `layers.zones` (used on legacy/no-boardCode paths, and
 * as a fallback for older board codes that only carried the collapsed `z` map). */
function zoneEntriesFromLayers(zones: Zone[] | undefined, cols: number, rows: number): EditorZoneEntry[] {
  const entries: EditorZoneEntry[] = [];
  let index = 0;
  for (const zone of zones ?? []) {
    const tiles: string[] = [];
    const seen = new Set<string>();
    for (const [x, y] of zone.tiles) {
      if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
      const key = `${x},${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tiles.push(key);
    }
    tiles.sort((a, b) => {
      const [ax, ay] = a.split(',').map(Number);
      const [bx, by] = b.split(',').map(Number);
      return ay - by || ax - bx;
    });
    index += 1;
    const name = zone.name?.trim();
    entries.push({ id: zone.id.trim() || `zone-${index}`, ...(name ? { name } : {}), ...(zone.color ? { color: zone.color } : {}), type: zone.type, tiles });
  }
  return entries;
}

// Resolve a Studio tile id to its family (so its terrain material is known). Exported so the
// thumbnail renderer (bakeBoardThumbnail) can derive a cell's terrain for ground-cover scatter.
export const familyOfTile = (tileId: string): TileFamilyId | undefined =>
  studioFamilies.find((family) => family.assets.some((asset) => asset.id === tileId))?.id;

// The default (first) tile id of a family — used when deriving a board from `layers`,
// which only knows the terrain material, not which specific tile was painted.
const defaultTileOfFamily = (family: TileFamilyId): string | undefined => {
  const fam = studioFamilies.find((f) => f.id === family);
  const tile = fam?.assets.find((asset) => asset.kind === 'tile') ?? fam?.assets[0];
  return tile?.id;
};

// Terrain material → a representative tile id, via its family. Unknown materials (none of
// the playable set maps to a decorative-only family) fall back to grass.
const TERRAIN_TO_FAMILY = (Object.entries(FAMILY_TO_TERRAIN) as Array<[TileFamilyId, TerrainType]>).reduce(
  (acc, [family, terrain]) => { acc[terrain] = family; return acc; },
  {} as Partial<Record<TerrainType, TileFamilyId>>,
);
const tileIdForTerrain = (terrain: TerrainType): string | undefined => {
  if (terrain === 'void') return undefined;
  const family = TERRAIN_TO_FAMILY[terrain] ?? 'grass';
  return defaultTileOfFamily(family);
};

// Board data stores the stable family id; art records never enter gameplay data.
const unitIdForType = (type: string): string | undefined => unitFamilyForId(type);
const typeOfUnitId = (unitId: string): LevelUnit['type'] | undefined =>
  unitFamilyForId(unitId) as LevelUnit['type'] | undefined;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export interface LevelMeta {
  id: string;
  name: string;
  notes?: string;
  objective?: ObjectiveType;
  // The legacy placement axis + its config, authored in the editor's RULES panel and written
  // straight onto the Level for compatibility. Setup spawn events in `events` own the actual
  // random deployment behavior on new saves.
  placement?: 'fixed' | 'random';
  roster?: { player: Roster; enemy: Roster };
  surviveTurns?: number;
  // The battle clock, authored in the RULES panel. Omitted ⇒ untimed (back-compat).
  timeControl?: TimeControl;
  // Authored win/lose lists (ADR-0064). Omitted ⇒ the `objective` preset defines the outcome
  // (the RULES panel's "Custom win/lose" toggle is off) — the same back-compat default as above.
  victory?: VictoryRules;
  // Authored non-victory events: setup spawns, pawn promotion triggers, and future event kinds.
  events?: LevelEvents;
  difficulty?: string;
  economy?: LevelEconomy;
  theme?: string;
  // The terrain of the level being edited, BEFORE this save. Used to preserve non-editor-
  // expressible terrain (road/bridge/cliff/rock) on cells the editor can only render as a grass
  // placeholder — without it, republishing a legacy official level (no boardCode) flattens those
  // surfaces to grass for every player (INV7 data-loss). Absent for a brand-new/blank board.
  previousTerrain?: TerrainCell[];
}

/**
 * Project live game pieces onto the editor-board units channel — the Game Lab
 * replay viewer swaps this per step over a `levelToEditorBoard` base so every
 * ply renders through the same read-only board the editors use. Only living
 * player/enemy combatants paint (rocks/prop colliders ride the level's own
 * cells/props channels); a promoted pawn paints as the queen it became.
 */
export function unitsForGamePieces(pieces: readonly Piece[]): EditorBoard['units'] {
  const units: EditorBoard['units'] = {};
  for (const p of pieces) {
    if (!p.alive || (p.side !== 'player' && p.side !== 'enemy')) continue;
    const unitId = unitIdForType(p.type);
    if (!unitId) continue;
    units[`${p.x},${p.y}`] = { unitId, direction: p.facing ?? 'south', faction: isFaction(p.palette) ? p.palette : SIDE_TO_FACTION[p.side] };
  }
  return units;
}

// Re-seed the editor from a saved level. The lossless `boardCode` is preferred (it carries
// doodads, ground cover, roads/rivers and exact unit facing); otherwise we derive a board
// from `layers`, which only knows terrain materials + unit placements.
export function levelToEditorBoard(level: Level): EditorBoard {
  if (level.boardCode) {
    const decoded = decodeBoard(level.boardCode);
    if (decoded) {
      const zoneEntries = decoded.zoneEntries?.length
        ? decoded.zoneEntries
        : zoneEntriesFromLayers(level.layers.zones, decoded.cols, decoded.rows);
      return { ...decoded, zoneEntries, zones: zoneCellMapFromEntries(zoneEntries) };
    }
  }

  const cols = clamp(level.board.cols, BOARD_COLS.min, BOARD_COLS.max);
  const rows = clamp(level.board.rows, BOARD_ROWS.min, BOARD_ROWS.max);

  const cells: EditorBoard['cells'] = {};
  const cover: EditorBoard['cover'] = {};
  const features: EditorBoard['features'] = {};
  const voidCells = new Set<string>();
  const fallbackTile = defaultTileOfFamily('grass');
  for (const cell of level.layers.terrain) {
    if (cell.x < 0 || cell.x >= cols || cell.y < 0 || cell.y >= rows) continue;
    const key = `${cell.x},${cell.y}`;
    if (cell.terrain === 'void') {
      voidCells.add(key);
      continue;
    }
    cells[key] = tileIdForTerrain(cell.terrain) ?? fallbackTile ?? '';
    if (cell.cover) cover[key] = cell.cover.density;
    // `road` is a game TerrainType but, in the editor, a feature overlay sitting on a (grass)
    // tile — surface it as a road feature so a legacy official's roads don't vanish into grass.
    if (cell.terrain === 'road') features[key] = { kind: 'road', material: 'cobble' };
  }
  // Fill any unauthored cell with grass so the whole board is paintable.
  if (fallbackTile) for (let y = 0; y < rows; y += 1) for (let x = 0; x < cols; x += 1) {
    const key = `${x},${y}`;
    if (!(key in cells) && !voidCells.has(key)) cells[key] = fallbackTile;
  }

  const units: EditorBoard['units'] = {};
  for (const unit of level.layers.units) {
    if (unit.x < 0 || unit.x >= cols || unit.y < 0 || unit.y >= rows) continue;
    const unitId = unitIdForType(unit.type);
    if (!unitId) continue;
    units[`${unit.x},${unit.y}`] = {
      unitId,
      direction: unit.facing ?? 'south',
      faction: isFaction(unit.palette) ? unit.palette : SIDE_TO_FACTION[unit.side === 'enemy' ? 'enemy' : 'player'],
    };
  }

  // Legacy fallback: a level with no boardCode still carries props in layers.props (the durable
  // game channel), so re-derive the editor's anchor-keyed props map from it.
  const props: EditorBoard['props'] = {};
  for (const p of level.layers.props ?? []) {
    if (p.x < 0 || p.x >= cols || p.y < 0 || p.y >= rows) continue;
    props[`${p.x},${p.y}`] = { propId: p.propId };
  }

  // Legacy fallback: rebuild authored zones from layers.zones. Out-of-bounds tiles are dropped
  // like units/props, but empty zone entries are preserved.
  const zoneEntries = zoneEntriesFromLayers(level.layers.zones, cols, rows);
  const zones = zoneCellMapFromEntries(zoneEntries);
  // Legacy fallback (no boardCode): layers.fences carries edge keys only — re-seed the editor's
  // edge→material map at the default material (the boardCode path above already round-tripped both).
  const fences: EditorBoard['fences'] = {};
  for (const edge of level.layers.fences ?? []) {
    if (!fenceTouchesBoard(edge, cols, rows)) continue;
    fences[edge] = defaultFenceMaterial();
  }
  const hasAuthoredPlayer = level.layers.units.some((unit) => unit.side === 'player');
  return {
    cols,
    rows,
    playerFaction: hasAuthoredPlayer ? SIDE_TO_FACTION.player : undefined,
    cells,
    units,
    doodads: {},
    props,
    cover,
    features,
    fences,
    fencePosts: {},
    walls: {},
    wallArt: {},
    featureCuts: {},
    featureExits: {},
    zoneEntries,
    zones,
  };
}

// Serialize the painted board into a valid `Level`. `boardCode` is stamped for a lossless
// re-open; `layers.terrain` / `layers.units` / `layers.zones` are projected so the game (which
// reads `layers`, not `boardCode`) plays the authored board — spawn pools and reach targets read
// real zones now (ADR-0050; the old `zones: []` hard-code is gone). The ADR-0050 mode fields
// (objective/placement/roster/surviveTurns) are written straight from `meta`. Decals stay empty
// (doodads ride in boardCode; decals mapping is Phase 4).
export function editorBoardToLevel(board: EditorBoard, meta: LevelMeta): Level {
  const cols = clamp(board.cols, BOARD_COLS.min, BOARD_COLS.max);
  const rows = clamp(board.rows, BOARD_ROWS.min, BOARD_ROWS.max);

  // Index the pre-save cells so terrain the editor cannot express (road/bridge/cliff/rock)
  // AND elevation (the editor has no height tool at all) can be carried through rather than
  // coerced to grass / flattened to 0 on republish (INV7 data-loss on legacy officials).
  const prevCell = new Map<string, TerrainCell>();
  for (const cell of meta.previousTerrain ?? []) prevCell.set(`${cell.x},${cell.y}`, cell);

  const terrain: TerrainCell[] = [];
  let maxElevation = 0;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const key = `${x},${y}`;
      const prev = prevCell.get(key);
      const tileId = board.cells[key];
      const family = tileId ? familyOfTile(tileId) : undefined;
      // Decorative / unknown families fall back to grass (a playable material).
      let cellTerrain: TerrainType = tileId ? (family ? FAMILY_TO_TERRAIN[family] ?? 'grass' : 'grass') : 'void';
      // A road feature overlay IS the cell's terrain in the game's schema — project it back to
      // `road` so roads painted (or loaded) in the editor reach layers.terrain, which the game
      // reads. Erasing the overlay leaves no road feature, so the cell reverts to its tile
      // (grass) — i.e. an admin can actually remove a road.
      if (tileId && board.features[key]?.kind === 'road') {
        cellTerrain = 'road';
      } else if (tileId && cellTerrain === 'grass' && prev && !EDITOR_EXPRESSIBLE_TERRAIN.has(prev.terrain)) {
        // Preserve terrain the editor can neither paint nor feature-map (bridge/cliff/rock) so a
        // republished legacy official keeps those surfaces instead of flattening them to grass.
        cellTerrain = prev.terrain;
      }
      // The editor has no elevation tool, so it can never change height — carry the prior cell's
      // elevation through unchanged rather than flattening every cell to 0 for all players.
      const elevation = prev?.elevation ?? 0;
      if (elevation > maxElevation) maxElevation = elevation;
      const cell: TerrainCell = { x, y, terrain: cellTerrain, elevation };
      const density = board.cover[key];
      if (density) cell.cover = { density };
      terrain.push(cell);
    }
  }

  const units: LevelUnit[] = [];
  for (const [key, placement] of Object.entries(board.units)) {
    const [x, y] = key.split(',').map(Number);
    if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
    const type = typeOfUnitId(placement.unitId);
    if (!type) continue;
    const side = sideForFaction(placement.faction, isFaction(board.playerFaction) ? board.playerFaction : undefined);
    units.push({ x, y, type, side, palette: isFaction(placement.faction) ? placement.faction : undefined, facing: placement.direction as UnitFacing });
  }

  // Dual-write props: the durable game channel (layers.props) AND the lossless boardCode 'p' map
  // (via encodeBoard below). The game reads layers.props; the editor re-opens from boardCode. The
  // anchor (the prop's min-corner) is the map key; out-of-bounds anchors are dropped on resize so
  // this is just a projection. (Footprint bounds are enforced at paint time, not re-checked here.)
  const props: PlacedProp[] = [];
  for (const [key, placement] of Object.entries(board.props ?? {})) {
    const [x, y] = key.split(',').map(Number);
    if (x < 0 || x >= cols || y < 0 || y >= rows) continue;
    props.push({ x, y, propId: placement.propId });
  }

  // Project authored zones into real `layers.zones` — spawn pools, reach targets and promotion
// entries are named regions; gameplay behavior comes from level events. Legacy boards without
// entries are grouped by their collapsed map.
  const zoneEntries = board.zoneEntries ?? zoneEntriesFromCellMap(board.zones, cols, rows);
  const zones = zonesToLayers(zoneEntries, cols, rows);

  // Edge barriers ride BOTH channels: layers.fences (edge keys — the durable blocked-edge list the
  // GAME reads for collision) AND boardCode `fe`/`wl` (edge→material, for editor/rendering).
  // Fence rails may touch any board edge. Walls are perimeter-only and only valid on the
  // northmost/westmost board edges. Wall art is visual-only and stays in boardCode `wa`.
  const fences: string[] = [];
  const blockedEdges = new Set(Object.keys(board.fences ?? {}));
  const validWalls: NonNullable<EditorBoard['walls']> = {};
  for (const [edge, material] of Object.entries(board.walls ?? {})) {
    if (!isNorthWestBoundaryWallEdge(edge, { cols, rows })) continue;
    validWalls[edge] = material;
    blockedEdges.add(edge);
  }
  for (const edge of blockedEdges) {
    if (!fenceTouchesBoard(edge, cols, rows)) continue;
    fences.push(edge);
  }

  const level: Level = {
    formatVersion: LEVEL_FORMAT_VERSION,
    id: meta.id,
    name: meta.name,
    notes: meta.notes ?? '',
    // heightLevels follows the preserved elevation (the editor can't change height) — never
    // hard-coded, else a republished elevated official would collapse to a flat board.
    board: { cols, rows, heightLevels: Math.max(1, maxElevation + 1) },
    objective: meta.objective ?? 'capture-all',
    difficulty: meta.difficulty ?? 'normal',
    economy: meta.economy ?? { startingFunds: 1200, incomePerTurn: 150 },
    theme: meta.theme ?? 'grassland',
    // The board code is the complete authored visual scene. Gameplay layers above are the
    // playable-rectangle projection; never strip scenic walls or other outer-board artwork from
    // the editor's lossless source merely because they do not participate in collision.
    boardCode: encodeBoard({ ...board, cols, rows }),
    layers: { terrain, decals: [], zones, units, props, fences },
  };
  // ADR-0050 mode fields ride as OPTIONAL keys: written only when meta supplies a non-default
  // value, so a level that never touched the RULES panel serializes without them (back-compat —
  // an absent field reads as fixed / no roster / DEFAULT_SURVIVE_TURNS). `objective` is required
  // and always written above; these three are the toggle + its config.
  if (meta.placement !== undefined) level.placement = meta.placement;
  if (meta.roster !== undefined) level.roster = meta.roster;
  if (meta.surviveTurns !== undefined) level.surviveTurns = meta.surviveTurns;
  if (meta.timeControl !== undefined) level.timeControl = meta.timeControl;
  if (meta.victory !== undefined) level.victory = meta.victory;
  if (meta.events !== undefined) level.events = meta.events;
  return level;
}
