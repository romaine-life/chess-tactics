// The standalone Level Editor (/level-editor, /edit). Split out of TilePreview.tsx so
// it ships its own small lazy chunk instead of dragging the entire design Studio:
// the heavy library studios + manifests live in TilePreview.tsx and are never
// imported here. Shared board core (tile families, the animation clock, the facing
// compass, the per-frame src) comes from ./studioBoard.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { boardLabCellPosition } from '../render/BoardLabBoard';
import { DoodadSprite } from '../render/BoardDoodad';
import { TileGrid, type TileGridCell } from '../render/TileGrid';
import { KitScroll } from './KitScroll';
import { ViewPane } from './shared/ViewPane';
import { TitleBarSlot } from './shell/TitleBarSlot';
import { Stepper } from './shared/Stepper';
import { Toggle } from './shared/Toggle';
import { BoardSizePanel } from './shared/BoardSizePanel';
import { doodadAsset, DOODAD_ASSETS, type DoodadAsset } from './doodadCatalog';
import { readBoardParam, encodeBoard } from './boardCode';
import { DEFAULT_BACKGROUND_SET } from '../art/backgroundSets';
import {
  MISSING_DIRECTION_SPRITE,
  hasDirectionSprite,
  rookDirections,
  unitAssets,
  type Direction,
  type Faction,
  type UnitAsset,
} from './unitCatalog';
import {
  assetFrameSrc,
  studioFamilies,
  useAnimationClock,
  FacingCompass,
  type StudioAsset,
  type StudioFamily,
} from './studioBoard';
import { featureFrameSrc, featureThumbSrc } from '../art/tileset';
import { featureMaskAt, roadEdgeKey, FEATURE_DIRS, ROAD_MATERIALS, ROAD_MATERIAL_LABELS, DEFAULT_ROAD_MATERIAL, type FeatureKind, type RoadMaterial } from '../core/featureAutotile';
import { type TileFamilyId } from '../core/tileSockets';
import { GroundCoverLayer } from '../render/GroundCoverLayer';
import { groundCoverSet, rollGroundCover, type GroundCover, type GroundCoverDensity } from '../core/groundCover';

type BoardUnitPlacement = {
  unitId: string;
  direction: Direction;
  faction: Faction;
};

// Unified editable board: every Studio view renders through this. It's a full
// clickable grid seeded from whatever was loaded (a tile, a transition, a
// generated board). The `tool` decides what a click does — select (highlight),
// brush (stamp), or erase. Purely in-memory, so it resets when a new view loads.
function StudioEditableBoard({
  cols,
  rows,
  cells: placed,
  units: placedUnits,
  doodads: placedDoodads,
  features: placedFeatures = {},
  resolveAsset,
  resolveUnit,
  resolveDoodad,
  tool,
  selectedCell,
  showFootprint,
  boardZoom,
  boardPan,
  animationFrame,
  onPaint,
  onErase,
  onSelect,
  overlay,
  hidden,
}: {
  cols: number;
  rows: number;
  cells: Record<string, string>;
  units: Record<string, BoardUnitPlacement>;
  doodads: Record<string, { doodadId: string }>;
  /** Linear-feature overlays (road; rivers later) keyed by "x,y" -> {kind, material, mask}. */
  features?: Record<string, { kind: FeatureKind; material: RoadMaterial; mask: number }>;
  resolveAsset: (id: string) => StudioAsset | undefined;
  resolveUnit: (id: string) => UnitAsset | undefined;
  resolveDoodad: (id: string) => DoodadAsset | undefined;
  tool: 'select' | 'brush' | 'erase';
  selectedCell: { x: number; y: number } | null;
  showFootprint: boolean;
  boardZoom: number;
  boardPan: { x: number; y: number };
  animationFrame: number;
  onPaint: (x: number, y: number) => void;
  onErase: (x: number, y: number) => void;
  onSelect: (x: number, y: number) => void;
  overlay?: ReactNode;
  /** Per-layer visibility — a true value hides that layer's elements on the board. */
  hidden?: { tile: boolean; unit: boolean; doodad: boolean };
}): ReactElement {
  const paintingRef = useRef(false);
  const stopPainting = () => { paintingRef.current = false; };
  const applyTool = (x: number, y: number) => {
    if (tool === 'brush') onPaint(x, y);
    else if (tool === 'erase') onErase(x, y);
    else onSelect(x, y);
  };

  // The editor is an adapter over the shared TileGrid core (the same one the
  // game's BoardLabBoard uses). It only supplies per-cell content: the tile art,
  // the placed unit, the selection ring, and the paint/erase/select hit target.
  const cells: TileGridCell[] = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const key = `${x},${y}`;
      const assetId = placed[key];
      const asset = assetId ? resolveAsset(assetId) : undefined;
      const isSelected = selectedCell?.x === x && selectedCell?.y === y;
      cells.push({
        key,
        x,
        y,
        className: `tileset-placement-cell ${asset ? '' : 'is-empty'} ${isSelected ? 'is-selected' : ''}`.trim(),
        children: (
          <>
            {asset && !hidden?.tile ? <img src={assetFrameSrc(asset, animationFrame)} alt="" draggable={false} /> : null}
            {placedFeatures[key] ? (
              <img
                className="tileset-feature-overlay"
                src={featureFrameSrc(placedFeatures[key].kind, placedFeatures[key].material, placedFeatures[key].mask)}
                alt=""
                draggable={false}
              />
            ) : null}
            {isSelected ? <span className="tileset-cell-ring" aria-hidden="true" /> : null}
            <span
              className="tileset-cell-hit"
              onPointerDown={(event) => {
                if (event.button === 2) return; // right-click erases via onContextMenu
                event.stopPropagation(); // don't let the ViewPane start a pan while editing
                if (tool !== 'select') paintingRef.current = true;
                applyTool(x, y);
              }}
              onPointerEnter={() => { if (paintingRef.current) applyTool(x, y); }}
              onContextMenu={(event) => { event.preventDefault(); onErase(x, y); }}
            />
          </>
        ),
      });
    }
  }

  // Units + doodads render at GRID level via the SHARED seat (.board-unit-seat) and the
  // shared <DoodadSprite> — exactly like the game board (SkirmishBoard) — instead of inside
  // cells. One seating, both boards; it can't drift. Doodad back/front bracket the unit by z.
  const overlaySprites: ReactNode[] = [];
  for (const key of new Set([...Object.keys(placedUnits), ...Object.keys(placedDoodads)])) {
    const [cx, cy] = key.split(',').map(Number);
    const { left, top, zIndex } = boardLabCellPosition({ x: cx, y: cy });
    const doodadEntry = placedDoodads[key] ? resolveDoodad(placedDoodads[key].doodadId) : undefined;
    if (doodadEntry && !hidden?.doodad) {
      overlaySprites.push(<DoodadSprite key={`dd-${key}`} doodad={{ x: cx, y: cy, type: doodadEntry.id }} />);
      // The doodad stands UP above its foot cell, but the shared sprite is pointer-events:none,
      // so clicking the visible prop body falls through to the cell behind it — erase/select
      // would miss the doodad. This Studio-only hit target sits over the prop and routes the
      // tool to the doodad's OWN cell. It's transparent in brush mode so painting still flows
      // to the tiles underneath; it only catches clicks while erasing or selecting.
      overlaySprites.push(
        <span
          key={`dd-hit-${key}`}
          className="tileset-doodad-hit"
          style={{ position: 'absolute', left, top, zIndex: zIndex + 20002, width: 54, height: 88, transform: 'translate(-50%, -75%)', pointerEvents: tool === 'brush' ? 'none' : 'auto' }}
          onPointerDown={(event) => {
            if (event.button === 2) return;
            event.stopPropagation();
            if (tool !== 'select') paintingRef.current = true;
            applyTool(cx, cy);
          }}
          onContextMenu={(event) => { event.preventDefault(); onErase(cx, cy); }}
        />,
      );
    }
    const unitPlacement = placedUnits[key];
    const unitAsset = unitPlacement ? resolveUnit(unitPlacement.unitId) : undefined;
    if (unitAsset && unitPlacement && !hidden?.unit) {
      const sprite = hasDirectionSprite(unitAsset, unitPlacement.direction)
        ? unitAsset.sprite(unitPlacement.faction, unitPlacement.direction)
        : MISSING_DIRECTION_SPRITE;
      overlaySprites.push(
        <div key={`u-${key}`} className={`board-unit-seat is-${unitAsset.family}`} style={{ left, top, zIndex: zIndex + 20000 }}>
          <img src={sprite} alt="" draggable={false} />
        </div>,
      );
    }
  }

  return (
    <TileGrid
      cells={cells}
      className={`tileset-placement-board is-tool-${tool}`}
      ariaLabel="Editable tile board"
      showFootprint={showFootprint}
      boardZoom={boardZoom}
      boardPan={boardPan}
      onPointerUp={stopPainting}
      onPointerLeave={stopPainting}
    >
      {overlay}
      {overlaySprites}
    </TileGrid>
  );
}

// ---------------------------------------------------------------------------
// Level Editor (front-of-house). The functional Studio Lab board, re-dressed as
// a literal sibling of the Skirmish page: it reuses the real .skirmish-screen /
// .skirmish-war-room / .skirmish-field / .skirmish-board-frame / .skirmish-hud /
// .skirmish-card chrome (so it IS the same game), with the proven
// StudioEditableBoard inside, and the editor controls in .skirmish-card rail
// sections. M1 = the shell + tile painting; units/doodads/persistence land in
// later milestones. The Studio Lab (TilesetStudio) is untouched — this duplicates
// its board logic for now; a shared hook will dedupe them once it has settled.
// ---------------------------------------------------------------------------
const LE_COLS = 10;
const LE_ROWS = 10;
const leGrassFamily = studioFamilies.find((family) => family.id === 'grass') ?? studioFamilies[0];
const leDefaultTile = leGrassFamily.assets.find((asset) => asset.kind === 'tile') ?? leGrassFamily.assets[0];
const leTileGroups = studioFamilies.map((family) => ({ family, tiles: family.assets.filter((asset) => asset.kind === 'tile') }));
const leAllTiles = studioFamilies.flatMap((family) => family.assets);
const leFamilyOfTile = (id: string): StudioFamily | undefined => studioFamilies.find((family) => family.assets.some((asset) => asset.id === id));
const leSeedBoard = (): Record<string, string> => {
  const cells: Record<string, string> = {};
  for (let y = 0; y < LE_ROWS; y += 1) for (let x = 0; x < LE_COLS; x += 1) cells[`${x},${y}`] = leDefaultTile.id;
  return cells;
};
const LE_SIDE_FACTION = { player: 'navy-blue', enemy: 'crimson' } as const;

// The 4-edge connection control for a selected road tile. Mirrors the iso diamond:
// each clickable edge is one cardinal neighbour (grid N/E/S/W = the screen NE/SE/SW/NW
// edges). Joined edges read solid cyan, severed read dashed amber, edges with no road
// neighbour are dim and inert. Clicking toggles the SHARED edge, so both tiles re-cap.
function RoadConnections({
  cell,
  roads,
  cuts,
  onToggle,
}: {
  cell: { x: number; y: number };
  roads: Record<string, RoadMaterial>;
  cuts: Record<string, true>;
  onToggle: (edge: string) => void;
}): ReactElement {
  // Diamond geometry (viewBox 128x96): apex, right, bottom, left vertices.
  const V = { apex: [64, 14], right: [114, 48], bottom: [64, 82], left: [14, 48] } as const;
  const EDGE_GEO: Record<string, readonly [readonly [number, number], readonly [number, number]]> = {
    N: [V.apex, V.right],
    E: [V.right, V.bottom],
    S: [V.bottom, V.left],
    W: [V.left, V.apex],
  };
  return (
    <svg className="le-roadconn" viewBox="0 0 128 96" role="group" aria-label="Road connections for the selected tile">
      <polygon points={`${V.apex} ${V.right} ${V.bottom} ${V.left}`} fill="rgba(8,20,28,.55)" stroke="rgba(82,142,170,.35)" strokeWidth="1" />
      {FEATURE_DIRS.map((dir) => {
        const nx = cell.x + dir.dx;
        const ny = cell.y + dir.dy;
        const hasNeighbor = roads[`${nx},${ny}`] !== undefined;
        const edge = roadEdgeKey(cell.x, cell.y, nx, ny);
        const severed = cuts[edge] === true;
        const [[x1, y1], [x2, y2]] = EDGE_GEO[dir.edge];
        const state = !hasNeighbor ? 'none' : severed ? 'cut' : 'joined';
        const stroke = state === 'joined' ? 'var(--skirmish-cyan, #38d7ff)' : state === 'cut' ? '#f0a23a' : 'rgba(120,150,165,.35)';
        const label = `${state === 'joined' ? 'Sever' : state === 'cut' ? 'Rejoin' : 'No road'} ${dir.edge} connection`;
        return (
          <g
            key={dir.edge}
            className={`le-roadconn-edge is-${state}`}
            role={hasNeighbor ? 'button' : undefined}
            aria-label={hasNeighbor ? label : undefined}
            tabIndex={hasNeighbor ? 0 : undefined}
            onClick={hasNeighbor ? () => onToggle(edge) : undefined}
            onKeyDown={hasNeighbor ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(edge); } } : undefined}
          >
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="20" strokeLinecap="round" />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth="6" strokeLinecap="round" strokeDasharray={state === 'cut' ? '5 5' : undefined} />
          </g>
        );
      })}
    </svg>
  );
}

export function LevelEditor(): ReactElement {
  const animationFrame = useAnimationClock(true, 8, 150);
  // The Studio routes here with ?from=studio (show a "back to catalog" link) and optionally
  // ?kind=tile|unit|doodad&brush=<id> to pre-arm the brush you clicked in the catalog. Read
  // once at mount; reached from the main menu these are all absent and we open on tiles.
  const studioArm = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const kindParam = params.get('kind');
    const kind: 'tile' | 'unit' | 'doodad' | undefined =
      kindParam === 'unit' || kindParam === 'doodad' || kindParam === 'tile' ? kindParam : undefined;
    return {
      fromStudio: params.get('from') === 'studio',
      kind,
      brush: params.get('brush') ?? undefined,
    };
  }, []);
  const cameFromStudio = studioArm.fromStudio;
  // Optional `?board=<code>` deep-link: decode a whole board to start from (see boardCode.ts).
  const loadedBoard = useMemo(() => readBoardParam(), []);
  const [boardCells, setBoardCells] = useState<Record<string, string>>(() => loadedBoard?.cells ?? leSeedBoard());
  const [boardCols, setBoardCols] = useState(loadedBoard?.cols ?? LE_COLS);
  const [boardRows, setBoardRows] = useState(loadedBoard?.rows ?? LE_ROWS);
  const [tool, setTool] = useState<'select' | 'brush' | 'erase'>('brush');
  const [brushId, setBrushId] = useState<string>(studioArm.kind === 'tile' && studioArm.brush ? studioArm.brush : leDefaultTile.id);
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | null>(null);
  const [showFootprint, setShowFootprint] = useState(true);
  const [viewZoom, setViewZoom] = useState(1);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const [brushKind, setBrushKind] = useState<'tile' | 'unit' | 'doodad' | 'cover' | 'road'>(studioArm.kind ?? 'tile');
  const [layer, setLayer] = useState<'board' | 'tile' | 'unit' | 'doodad' | 'cover' | 'road'>(studioArm.kind ?? 'tile');
  const [boardUnits, setBoardUnits] = useState<Record<string, BoardUnitPlacement>>((loadedBoard?.units as Record<string, BoardUnitPlacement>) ?? {});
  const [boardDoodads, setBoardDoodads] = useState<Record<string, { doodadId: string }>>(loadedBoard?.doodads ?? {});
  // Ground cover is a per-tile FEATURE (density), not a doodad: which tiles grow vegetation
  // and how thick. Tufts are rolled deterministically from this density (see core/groundCover).
  const [boardCover, setBoardCover] = useState<Record<string, GroundCoverDensity>>(loadedBoard?.cover ?? {});
  const [coverBrushDensity, setCoverBrushDensity] = useState<GroundCoverDensity>('sparse');
  const [coverSeed, setCoverSeed] = useState(1234);
  // Roads are a LINEAR feature (a ribbon you draw), not a per-cell terrain material:
  // store each painted cell's road MATERIAL, then derive its connection mask from its
  // neighbours so the renderer picks straight/corner/T/cross. See core/featureAutotile.ts.
  const [boardRoads, setBoardRoads] = useState<Record<string, RoadMaterial>>(loadedBoard?.roads ?? {});
  const [roadMaterial, setRoadMaterial] = useState<RoadMaterial>(DEFAULT_ROAD_MATERIAL);
  // Manually SEVERED road connections, keyed by the shared edge between two cells
  // (roadEdgeKey, order-independent). A cut overrides auto-connect for BOTH tiles.
  const [boardRoadCuts, setBoardRoadCuts] = useState<Record<string, true>>(loadedBoard?.roadCuts ?? {});
  const [unitBrushId, setUnitBrushId] = useState<string>(studioArm.kind === 'unit' && studioArm.brush ? studioArm.brush : unitAssets[0].id);
  const [doodadBrushId, setDoodadBrushId] = useState<string>(studioArm.kind === 'doodad' && studioArm.brush ? studioArm.brush : DOODAD_ASSETS[0].id);
  const [unitBrushDirection, setUnitBrushDirection] = useState<Direction>('south');
  const [unitSide, setUnitSide] = useState<'player' | 'enemy'>('player');

  // Go full-bleed like Skirmish (is-immersive): #root owns the whole viewport so the
  // editor sits under only the persistent app-shell title bar, with no inset/gap.
  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('is-immersive');
    return () => shell?.classList.remove('is-immersive');
  }, []);

  const resolveAsset = (id: string): StudioAsset | undefined => leAllTiles.find((asset) => asset.id === id);
  const brushAsset = resolveAsset(brushId) ?? leDefaultTile;
  const resolveUnitAsset = (id: string): UnitAsset | undefined => unitAssets.find((unit) => unit.id === id);
  const unitBrushAsset = resolveUnitAsset(unitBrushId) ?? unitAssets[0];
  const unitFaction: Faction = LE_SIDE_FACTION[unitSide];
  // Facing sets the brush direction AND rotates the unit selected on the board (in place).
  const setUnitFacing = (dir: Direction): void => {
    setUnitBrushDirection(dir);
    setBoardUnits((prev) => {
      const key = selectedCell ? `${selectedCell.x},${selectedCell.y}` : null;
      if (!key || !prev[key]) return prev;
      return { ...prev, [key]: { ...prev[key], direction: dir } };
    });
  };
  // Center hub: spin one step clockwise (rookDirections is N→NE→E…→NW), skipping directions this unit lacks.
  const rotateFacingCw = (): void => {
    const n = rookDirections.length;
    const start = rookDirections.indexOf(unitBrushDirection);
    for (let step = 1; step <= n; step += 1) {
      const next = rookDirections[(start + step) % n];
      if (hasDirectionSprite(unitBrushAsset, next)) { setUnitFacing(next); return; }
    }
  };
  const resolveDoodadAsset = (id: string): DoodadAsset | undefined => doodadAsset(id);
  const doodadBrushAsset = resolveDoodadAsset(doodadBrushId) ?? DOODAD_ASSETS[0];
  // HARD terrain gate (mirrors the Studio): a doodad only lands on a tile of its home terrain.
  const doodadFitsTile = (doodad: DoodadAsset, tileId: string | undefined): boolean => {
    const terrain = tileId ? leFamilyOfTile(tileId)?.id : undefined;
    return terrain !== undefined && doodad.terrains.includes(terrain);
  };

  // Derive the per-cell road connection mask from the painted set, live. Cheap (one
  // pass over the road cells) and the source of truth is the painted set, so the
  // ribbon re-knits itself whenever a cell is added or removed.
  const roadFeatures = useMemo(() => {
    const present = new Set(Object.keys(boardRoads));
    const isSevered = (edge: string): boolean => boardRoadCuts[edge] === true;
    const out: Record<string, { kind: FeatureKind; material: RoadMaterial; mask: number }> = {};
    for (const key of present) {
      const [x, y] = key.split(',').map(Number);
      out[key] = { kind: 'road', material: boardRoads[key], mask: featureMaskAt(present, x, y, isSevered) };
    }
    return out;
  }, [boardRoads, boardRoadCuts]);

  const eraseKey = <T,>(setter: (updater: (prev: Record<string, T>) => Record<string, T>) => void, key: string): void =>
    setter((prev) => { if (!(key in prev)) return prev; const next = { ...prev }; delete next[key]; return next; });
  const paintCell = (x: number, y: number): void => {
    const key = `${x},${y}`;
    if (brushKind === 'road') {
      setBoardRoads((prev) => (prev[key] === roadMaterial ? prev : { ...prev, [key]: roadMaterial }));
      return;
    }
    if (brushKind === 'unit') {
      setBoardUnits((prev) => ({ ...prev, [key]: { unitId: unitBrushAsset.id, direction: unitBrushDirection, faction: unitFaction } }));
      return;
    }
    if (brushKind === 'doodad') {
      // A doodad only lands on a tile of its home terrain; painting elsewhere is a no-op.
      if (!doodadFitsTile(doodadBrushAsset, boardCells[key])) return;
      setBoardDoodads((prev) => ({ ...prev, [key]: { doodadId: doodadBrushAsset.id } }));
      return;
    }
    if (brushKind === 'cover') {
      // Cover grows only on a tile whose terrain has a cover set (grass for now).
      const terrain = boardCells[key] ? leFamilyOfTile(boardCells[key])?.id : undefined;
      if (!terrain || !groundCoverSet(terrain as TileFamilyId)) return;
      setBoardCover((prev) => ({ ...prev, [key]: coverBrushDensity }));
      return;
    }
    setBoardCells((prev) => ({ ...prev, [key]: brushAsset.id }));
  };
  const eraseCell = (x: number, y: number): void => {
    const key = `${x},${y}`;
    if (brushKind === 'road') {
      eraseKey(setBoardRoads, key);
      setBoardRoadCuts((prev) => {
        const next: Record<string, true> = {};
        let changed = false;
        for (const edge of Object.keys(prev)) {
          if (edge.split('|').includes(key)) changed = true; // a cut touching the erased cell
          else next[edge] = true;
        }
        return changed ? next : prev;
      });
      return;
    }
    if (brushKind === 'unit') return eraseKey(setBoardUnits, key);
    if (brushKind === 'doodad') return eraseKey(setBoardDoodads, key);
    if (brushKind === 'cover') return eraseKey(setBoardCover, key);
    eraseKey(setBoardCells, key);
  };
  const clearBoard = (): void => { setBoardCells({}); setBoardUnits({}); setBoardDoodads({}); setBoardCover({}); setBoardRoads({}); setBoardRoadCuts({}); setSelectedCell(null); };
  const fillBoard = (mode: 'empty' | 'all'): void =>
    setBoardCells((prev) => {
      const next: Record<string, string> = mode === 'all' ? {} : { ...prev };
      for (let y = 0; y < boardRows; y += 1) for (let x = 0; x < boardCols; x += 1) {
        const key = `${x},${y}`;
        if (mode === 'all' || !(key in next)) next[key] = brushAsset.id;
      }
      return next;
    });
  // Export the whole board as a /level-editor?board=<code> link (round-trips via boardCode.ts).
  const copyBoardLink = (): void => {
    const code = encodeBoard({ cols: boardCols, rows: boardRows, cells: boardCells, units: boardUnits, doodads: boardDoodads, cover: boardCover, roads: boardRoads, roadCuts: boardRoadCuts });
    void navigator.clipboard?.writeText(`${window.location.origin}/level-editor?board=${code}`);
  };
  const selectCell = (x: number, y: number): void => setSelectedCell({ x, y });
  const adjustZoom = (delta: number): void => setViewZoom((z) => Math.min(4, Math.max(0.4, Number((z + delta).toFixed(2)))));
  // Resize the board. Growing exposes new empty (paintable) cells; shrinking prunes any
  // tiles/units — and a now-offboard selection — whose coordinates fall outside the new
  // bounds, so nothing keeps rendering or counting off the edge of the board.
  const resizeBoard = (nextCols: number, nextRows: number): void => {
    const within = (key: string): boolean => {
      const [cx, cy] = key.split(',').map(Number);
      return cx < nextCols && cy < nextRows;
    };
    const prune = <T,>(map: Record<string, T>): Record<string, T> => {
      const next: Record<string, T> = {};
      let dropped = false;
      for (const key of Object.keys(map)) { if (within(key)) next[key] = map[key]; else dropped = true; }
      return dropped ? next : map;
    };
    setBoardCells((prev) => prune(prev));
    setBoardUnits((prev) => prune(prev));
    setBoardDoodads((prev) => prune(prev));
    setBoardCover((prev) => prune(prev));
    setBoardRoads((prev) => prune(prev));
    // Cuts are keyed by edge ("a|b"); keep only edges whose BOTH endpoints survive.
    setBoardRoadCuts((prev) => {
      const next: Record<string, true> = {};
      let dropped = false;
      for (const edge of Object.keys(prev)) {
        const [p1, p2] = edge.split('|');
        if (within(p1) && within(p2)) next[edge] = true;
        else dropped = true;
      }
      return dropped ? next : prev;
    });
    setSelectedCell((sel) => (sel && (sel.x >= nextCols || sel.y >= nextRows) ? null : sel));
    setBoardCols(nextCols);
    setBoardRows(nextRows);
  };

  const paintedCount = Object.keys(boardCells).length;
  const unitCount = Object.keys(boardUnits).length;
  const doodadCount = Object.keys(boardDoodads).length;
  const selectedTileId = selectedCell ? boardCells[`${selectedCell.x},${selectedCell.y}`] : undefined;
  const selectedAsset = selectedTileId ? resolveAsset(selectedTileId) : undefined;
  const selectedUnit = selectedCell ? boardUnits[`${selectedCell.x},${selectedCell.y}`] : undefined;
  const selectedUnitAsset = selectedUnit ? resolveUnitAsset(selectedUnit.unitId) : undefined;
  const selectedDoodad = selectedCell ? boardDoodads[`${selectedCell.x},${selectedCell.y}`] : undefined;
  const selectedDoodadAsset = selectedDoodad ? resolveDoodadAsset(selectedDoodad.doodadId) : undefined;
  const coverCount = Object.keys(boardCover).length;
  // Resolve the painted cover into concrete tufts (once, here — not per render). Re-roll
  // bumps coverSeed to reshuffle every cell's scatter while keeping the same densities.
  const coverCells = useMemo(() => {
    const list: Array<{ x: number; y: number; terrain: TileFamilyId; groundCover: GroundCover }> = [];
    for (const [key, density] of Object.entries(boardCover)) {
      const [x, y] = key.split(',').map(Number);
      const tileId = boardCells[key];
      const terrain = tileId ? (leFamilyOfTile(tileId)?.id as TileFamilyId | undefined) : undefined;
      if (!terrain || !groundCoverSet(terrain)) continue;
      list.push({ x, y, terrain, groundCover: { density, tufts: rollGroundCover(terrain, x, y, coverSeed, density) } });
    }
    return list;
  }, [boardCover, boardCells, coverSeed]);
  const selectedRoad = selectedCell ? boardRoads[`${selectedCell.x},${selectedCell.y}`] : undefined;
  const toggleRoadCut = (edge: string): void =>
    setBoardRoadCuts((prev) => { const next = { ...prev }; if (next[edge]) delete next[edge]; else next[edge] = true; return next; });
  const screenStyle = { '--skirmish-world-bg': `url("${DEFAULT_BACKGROUND_SET.world}")` } as CSSProperties;

  return (
    <div className="skirmish-screen level-editor-screen" data-testid="level-editor" style={screenStyle}>
        {/* The title bar lives in the app shell now; the editor paints its live
            save-state + actions into it via portals (state stays in this component). */}
        <TitleBarSlot region="center">
          <div className="le-topbar-stats" aria-label="Level status">
            <span className="le-level-name">Untitled level</span>
            <span className="le-save-state is-dirty">Unsaved</span>
          </div>
        </TitleBarSlot>
        <TitleBarSlot region="right">
          <nav className="le-topbar-actions" aria-label="Editor actions">
            {cameFromStudio ? <a className="app-header-button le-back-catalog" href="/tileset-studio" title="Return to the Studio catalog">‹ Catalog</a> : null}
            <button type="button" className="app-header-button" disabled title="Validation arrives once the editor is hosted.">Test</button>
            <button type="button" className="app-header-button app-header-button-active" disabled title="Saving unlocks once the editor is hosted.">Save</button>
            <a className="app-header-button" href="/settings">Settings</a>
          </nav>
        </TitleBarSlot>

        <div className="skirmish-field">
          <div className="skirmish-board-frame">
            <ViewPane kind="board" ariaLabel="Level editor board" zoom={viewZoom} pan={viewPan} minZoom={0.4} maxZoom={4} onZoomChange={setViewZoom} onPanChange={setViewPan}>
              <div className="tileset-view-board-content is-board">
                <StudioEditableBoard
                  cols={boardCols}
                  rows={boardRows}
                  cells={boardCells}
                  units={boardUnits}
                  doodads={boardDoodads}
                  features={roadFeatures}
                  resolveAsset={resolveAsset}
                  resolveUnit={resolveUnitAsset}
                  resolveDoodad={resolveDoodadAsset}
                  tool={tool}
                  selectedCell={selectedCell}
                  showFootprint={showFootprint}
                  boardZoom={viewZoom}
                  boardPan={viewPan}
                  animationFrame={animationFrame}
                  onPaint={paintCell}
                  onErase={eraseCell}
                  onSelect={selectCell}
                  overlay={<GroundCoverLayer cells={coverCells} />}
                />
              </div>
            </ViewPane>
          </div>
        </div>

      <aside className="skirmish-hud" aria-label="Editor controls">
        <section className="skirmish-card">
          <h2>Layer</h2>
          <div className="le-seg">
            <button type="button" className={`le-seg-btn ${layer === 'board' ? 'active' : ''}`.trim()} onClick={() => { setLayer('board'); setTool('select'); }}>Board</button>
            <button type="button" className={`le-seg-btn ${layer === 'tile' ? 'active' : ''}`.trim()} onClick={() => { setLayer('tile'); setBrushKind('tile'); setTool('brush'); }}>Tile</button>
            <button type="button" className={`le-seg-btn ${layer === 'road' ? 'active' : ''}`.trim()} onClick={() => { setLayer('road'); setBrushKind('road'); setTool('brush'); }}>Road</button>
            <button type="button" className={`le-seg-btn ${layer === 'unit' ? 'active' : ''}`.trim()} onClick={() => { setLayer('unit'); setBrushKind('unit'); setTool('brush'); }}>Unit</button>
            <button type="button" className={`le-seg-btn ${layer === 'doodad' ? 'active' : ''}`.trim()} onClick={() => { setLayer('doodad'); setBrushKind('doodad'); setTool('brush'); }}>Doodad</button>
            <button type="button" className={`le-seg-btn ${layer === 'cover' ? 'active' : ''}`.trim()} onClick={() => { setLayer('cover'); setBrushKind('cover'); setTool('brush'); }}>Cover</button>
          </div>
        </section>

        <KitScroll className="le-hud-scroll">
        {layer === 'board' ? (
          <section className="skirmish-card">
            <h2>Board</h2>
            <BoardSizePanel cols={boardCols} rows={boardRows} onResize={resizeBoard} />
            <p className="le-board-note">Width × Height in tiles. Shrinking drops tiles &amp; units outside the new bounds.</p>
            <button type="button" className="le-seg-btn" style={{ width: '100%', marginTop: 8 }} onClick={copyBoardLink} title="Copy a /level-editor?board=… link that recreates this exact board.">Copy board link</button>
          </section>
        ) : (<>

        <section className="skirmish-card">
          <h2>Tool</h2>
          <div className="le-seg">
            <button type="button" className={`le-seg-btn ${tool === 'select' ? 'active' : ''}`.trim()} onClick={() => setTool('select')}><span className="le-ico ic-eyedropper" aria-hidden="true" />Select</button>
            <button type="button" className={`le-seg-btn ${tool === 'brush' ? 'active' : ''}`.trim()} onClick={() => setTool('brush')}><span className="le-ico ic-brush" aria-hidden="true" />Brush</button>
            <button type="button" className={`le-seg-btn ${tool === 'erase' ? 'active' : ''}`.trim()} onClick={() => setTool('erase')}><span className="le-ico ic-eraser" aria-hidden="true" />Erase</button>
          </div>
          <div className="le-brush-pick">
            <span className="le-brush-thumb">
              {brushKind === 'unit'
                ? <img src={unitBrushAsset.sprite(unitFaction, 'south')} alt="" draggable={false} />
                : brushKind === 'doodad'
                ? <img src={doodadBrushAsset.front} alt="" draggable={false} />
                : brushKind === 'road'
                ? <img src={featureThumbSrc('road', roadMaterial)} alt="" draggable={false} />
                : <img src={brushAsset.src} alt="" draggable={false} />}
            </span>
            <span className="le-brush-meta">
              <strong>{brushKind === 'unit' ? unitBrushAsset.label : brushKind === 'doodad' ? doodadBrushAsset.label : brushKind === 'cover' ? `${coverBrushDensity} grass` : brushKind === 'road' ? `${ROAD_MATERIAL_LABELS[roadMaterial]} road` : brushAsset.label}</strong>
              <span>Active brush · {brushKind === 'unit' ? `unit · ${unitSide}` : brushKind === 'doodad' ? 'doodad' : brushKind === 'cover' ? 'ground cover' : brushKind === 'road' ? 'feature · road' : 'tile'}</span>
            </span>
          </div>
        </section>

        {brushKind === 'cover' ? (
          <section className="skirmish-card">
            <h2>Cover density</h2>
            <div className="le-seg">
              <button type="button" className={`le-seg-btn ${coverBrushDensity === 'sparse' ? 'active' : ''}`.trim()} onClick={() => setCoverBrushDensity('sparse')}>Sparse</button>
              <button type="button" className={`le-seg-btn ${coverBrushDensity === 'filled' ? 'active' : ''}`.trim()} onClick={() => setCoverBrushDensity('filled')}>Filled</button>
            </div>
            <p className="le-board-note">Brush paints {coverBrushDensity} grass on grass tiles; Erase clears a tile. The tufts scatter from the density.</p>
            <button type="button" className="le-seg-btn" style={{ width: '100%', marginTop: 8 }} onClick={() => setCoverSeed((s) => s + 1)}>Re-roll scatter</button>
            <p className="le-board-note">{coverCount} tile{coverCount === 1 ? '' : 's'} with cover.</p>
          </section>
        ) : null}

        {brushKind === 'unit' ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Side</h2>
            <div className="le-seg">
              <button type="button" className={`le-seg-btn ${unitSide === 'player' ? 'active' : ''}`.trim()} onClick={() => setUnitSide('player')}>Player</button>
              <button type="button" className={`le-seg-btn ${unitSide === 'enemy' ? 'active' : ''}`.trim()} onClick={() => setUnitSide('enemy')}>Enemy</button>
            </div>
            <h2 className="le-card-subhead">Facing</h2>
            <FacingCompass
              direction={unitBrushDirection}
              onSelect={setUnitFacing}
              onRotate={rotateFacingCw}
              available={(d) => hasDirectionSprite(unitBrushAsset, d)}
            />
            <h2 className="le-card-subhead">Units</h2>
            <div className="le-swatches">
              {unitAssets.map((unit) => (
                <button
                  type="button"
                  key={unit.id}
                  className={`le-swatch ${unitBrushId === unit.id && tool !== 'erase' ? 'active' : ''}`.trim()}
                  title={unit.label}
                  onClick={() => { setUnitBrushId(unit.id); setBrushKind('unit'); setTool('brush'); }}
                >
                  <img src={unit.sprite(unitFaction, 'south')} alt="" draggable={false} />
                  <small>{unit.label}</small>
                </button>
              ))}
            </div>
          </section>
        ) : brushKind === 'doodad' ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Doodads</h2>
              <div className="le-swatches">
                {DOODAD_ASSETS.map((doodad) => (
                  <button
                    type="button"
                    key={doodad.id}
                    className={`le-swatch ${doodadBrushId === doodad.id && tool !== 'erase' ? 'active' : ''}`.trim()}
                    title={`${doodad.label} · ${doodad.terrains.join(', ')}`}
                    onClick={() => { setDoodadBrushId(doodad.id); setBrushKind('doodad'); setTool('brush'); }}
                  >
                    <img src={doodad.front} alt="" draggable={false} />
                    <small>{doodad.label}</small>
                  </button>
                ))}
              </div>
            <p className="le-board-note">Doodads only land on a tile of their home terrain.</p>
          </section>
        ) : brushKind === 'road' ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Road material</h2>
            <div className="le-swatches">
              {ROAD_MATERIALS.map((mat) => (
                <button
                  type="button"
                  key={mat}
                  className={`le-swatch ${roadMaterial === mat && tool !== 'erase' ? 'active' : ''}`.trim()}
                  title={ROAD_MATERIAL_LABELS[mat]}
                  onClick={() => { setRoadMaterial(mat); setBrushKind('road'); setLayer('road'); setTool('brush'); }}
                >
                  <img src={featureThumbSrc('road', mat)} alt="" draggable={false} />
                  <small>{ROAD_MATERIAL_LABELS[mat]}</small>
                </button>
              ))}
            </div>
            <p className="le-board-note">Drag to draw a road; each tile picks its own piece (straight, corner, junction) from its road neighbours. Roads of any material connect — the surface just changes per cell. Erase to cut; the ends re-cap.</p>
          </section>
        ) : brushKind === 'tile' ? (
          <section className="skirmish-card le-brush-panel">
            <h2>Palette</h2>
              {leTileGroups.map(({ family, tiles }) => (
                <div className="le-pal-group" key={family.id}>
                  <span className="le-pal-grouplabel">{family.label}</span>
                  <div className="le-swatches">
                    {tiles.map((tile) => (
                      <button
                        type="button"
                        key={tile.id}
                        className={`le-swatch ${brushId === tile.id && tool !== 'erase' ? 'active' : ''}`.trim()}
                        title={tile.label}
                        onClick={() => { setBrushId(tile.id); setTool('brush'); }}
                      >
                        <img src={tile.src} alt="" draggable={false} />
                        <small>{tile.label}</small>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </section>
        ) : null}

        {layer === 'road' && selectedCell && selectedRoad ? (
          <section className="skirmish-card">
            <h2>Road connections</h2>
            <RoadConnections cell={selectedCell} roads={boardRoads} cuts={boardRoadCuts} onToggle={toggleRoadCut} />
            <p className="le-board-note">Select a road tile, then click an edge to sever or rejoin it. A cut applies to both tiles, so the road caps off cleanly instead of always connecting.</p>
          </section>
        ) : null}

        <section className="skirmish-card">
          <h2>Fill</h2>
          <div className="le-seg">
            <button type="button" className="le-seg-btn" onClick={() => fillBoard('empty')} title="Fill blank cells with the current brush.">Empty</button>
            <button type="button" className="le-seg-btn" onClick={() => fillBoard('all')} title="Fill the whole board with the current brush.">Whole</button>
            <button type="button" className="le-seg-btn" onClick={clearBoard} title="Remove every tile from the board.">Clear</button>
          </div>
        </section>

        </>)}

        <section className="skirmish-card">
          <h2>View</h2>
          <div className="le-ctrlrow">
            <span className="le-ctrllabel">Footprint</span>
            <Toggle checked={showFootprint} label="Toggle footprint overlay" onChange={setShowFootprint} />
          </div>
          <div className="le-ctrlrow">
            <span className="le-ctrllabel">Zoom</span>
            <Stepper
              value={Math.round(viewZoom * 100)}
              suffix="%"
              decreaseLabel="Zoom out"
              increaseLabel="Zoom in"
              onDecrease={() => adjustZoom(-0.2)}
              onIncrease={() => adjustZoom(0.2)}
            />
          </div>
        </section>

        {(selectedUnitAsset || selectedDoodadAsset || selectedAsset || selectedCell) ? (
        <section className="skirmish-card le-details">
          <h2>Details · {selectedUnitAsset ? 'Unit' : selectedDoodadAsset ? 'Doodad' : selectedAsset ? 'Tile' : 'Cell'}</h2>
          {selectedUnitAsset && selectedUnit ? (
            <dl>
              <div><dt>Piece</dt><dd>{selectedUnitAsset.label}</dd></div>
              <div><dt>Side</dt><dd>{selectedUnit.faction === 'crimson' ? 'Enemy' : 'Player'}</dd></div>
              <div><dt>Facing</dt><dd>{selectedUnit.direction}</dd></div>
            </dl>
          ) : selectedDoodadAsset && selectedDoodad ? (
            <dl>
              <div><dt>Doodad</dt><dd>{selectedDoodadAsset.label}</dd></div>
              <div><dt>Terrain</dt><dd>{selectedDoodadAsset.terrains.join(', ')}</dd></div>
              <div><dt>Cell</dt><dd>{selectedCell?.x}, {selectedCell?.y}</dd></div>
            </dl>
          ) : selectedAsset ? (
            <dl>
              <div><dt>Type</dt><dd>{leFamilyOfTile(selectedAsset.id)?.label ?? '—'}</dd></div>
              <div><dt>Source</dt><dd>{selectedAsset.id}</dd></div>
              <div><dt>Cell</dt><dd>{selectedCell?.x}, {selectedCell?.y}</dd></div>
            </dl>
          ) : (
            <dl>
              <div><dt>Tiles</dt><dd>{paintedCount}</dd></div>
              <div><dt>Units</dt><dd>{unitCount}</dd></div>
              <div><dt>Doodads</dt><dd>{doodadCount}</dd></div>
            </dl>
          )}
        </section>
        ) : null}

        <div className="le-statusline">
          {selectedCell ? <>Cell <b>{selectedCell.x},{selectedCell.y}</b> · </> : null}<b>{paintedCount}</b> tiles · <b>{unitCount}</b> units · <b>{doodadCount}</b> doodads · {boardCols}×{boardRows}
        </div>
        </KitScroll>
      </aside>
    </div>
  );
}
