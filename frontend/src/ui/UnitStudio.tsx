import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { navigateApp } from './navigation';
import { ViewPane } from './shared/ViewPane';

type Faction = 'blue' | 'red' | 'neutral';
type PieceId = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
type Direction = 'south' | 'south-east' | 'east' | 'north-east' | 'north' | 'north-west' | 'west' | 'south-west';
type TileContextId = 'grass' | 'stone' | 'water';
type FootprintShape = 'square' | 'circle';
type UnitPlacementStyle = CSSProperties & {
  '--tile-anchor-x': string;
  '--tile-anchor-y': string;
  '--unit-anchor-x': string;
  '--unit-anchor-y': string;
  '--unit-size': string;
  '--unit-footprint-size': string;
};

type UnitAsset = {
  id: string;
  family: PieceId;
  label: string;
  badge: string;
  preview: string;
  read: string;
  status: string;
  directions?: Direction[];
  factionMode: 'fixed' | 'palette';
  defaultSize: number;
  unitAnchorX?: string;
  unitAnchorY?: string;
  sprite: (faction: Faction, direction: Direction) => string;
};

const familyLabels: Record<PieceId, string> = {
  pawn: 'Pawn',
  rook: 'Rook',
  knight: 'Knight',
  bishop: 'Bishop',
  queen: 'Queen',
  king: 'King',
};

const rookDirections: Direction[] = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const rookDirectionLabel: Record<Direction, string> = {
  south: 'S',
  'south-east': 'SE',
  east: 'E',
  'north-east': 'NE',
  north: 'N',
  'north-west': 'NW',
  west: 'W',
  'south-west': 'SW',
};
const rookDirectionName: Record<Direction, string> = {
  south: 'South',
  'south-east': 'South-east',
  east: 'East',
  'north-east': 'North-east',
  north: 'North',
  'north-west': 'North-west',
  west: 'West',
  'south-west': 'South-west',
};
const directionCompassCells: Array<Direction | 'center'> = [
  'west',
  'north-west',
  'north',
  'south-west',
  'center',
  'north-east',
  'south',
  'south-east',
  'east',
];

const spriteFor = (piece: PieceId, faction: Faction) => `/assets/units/${piece}/${faction}/south.png`;
const rookVariantSprite = (variant: string) => (_faction: Faction, direction: Direction) => `/assets/units/rook/${variant}/${direction}.png`;
const paletteSprite = (piece: PieceId) => (faction: Faction) => spriteFor(piece, faction);
// Tentative rook candidates: each is its own catalog entry with all 8
// board-calibrated directions, and does not touch the production rook above.
const rookCandidateSprite = (slug: string) => (_faction: Faction, direction: Direction) => `/assets/units/rook/candidate-${slug}/${direction}.png`;
type RookCandidate = { slug: string; name: string; read: string };
const rookCandidates: RookCandidate[] = [
  { slug: 'old-keep', name: 'Old Keep', read: 'Stacked four-tier base, merlon battlements, vertical plank gate' },
  { slug: 'sentinel', name: 'Sentinel', read: 'Pared-down two-step base, merlon top, cleaner silhouette' },
  { slug: 'bastion', name: 'Bastion', read: 'Cantilevered battlement box overhanging the shaft, closed walls' },
  { slug: 'gatewatch', name: 'Gatewatch', read: 'Open side notches with gate-front and rear wall; facing reads at a glance' },
  { slug: 'masonkeep', name: 'Masonkeep', read: 'One carved stone mass: cavity grime, worn light edges, subtle seams' },
  { slug: 'breachhold', name: 'Breachhold', read: 'Running-bond ashlar with four distinct per-pillar battle failures' },
  { slug: 'ruinwall', name: 'Ruinwall', read: 'Rough-hewn rock surface with a single sheared corner pillar' },
];
const rookCandidateAssets: UnitAsset[] = rookCandidates.map((candidate) => ({
  id: `rook-candidate-${candidate.slug}`,
  family: 'rook',
  label: `Rook · ${candidate.name}`,
  badge: 'Candidate · 8 directions',
  preview: `/assets/units/rook/candidate-${candidate.slug}/south.png`,
  read: candidate.read,
  status: 'tentative candidate',
  directions: rookDirections,
  factionMode: 'fixed',
  defaultSize: 96,
  unitAnchorY: '78%',
  sprite: rookCandidateSprite(candidate.slug),
}));

// Tentative non-rook pieces (Claude first pass), each its own 8-direction entry,
// separate from the production palette sprites above.
const pieceCandidateSprite = (piece: PieceId) => (_faction: Faction, direction: Direction) =>
  `/assets/units/${piece}/candidate-claude/${direction}.png`;
const pieceCandidates: Array<{ piece: PieceId; name: string; read: string }> = [
  { piece: 'king', name: 'King', read: 'Turned body with structural cross finial' },
  { piece: 'queen', name: 'Queen', read: 'Turned body with carved coronet of points' },
  { piece: 'bishop', name: 'Bishop', read: 'Turned body with diagonal mitre slit' },
  { piece: 'pawn', name: 'Pawn', read: 'Great-helm shell with cross visor' },
  { piece: 'knight', name: 'Knight', read: 'Armored warhorse head — chamfron + crinet — on a turned base (CC-BY source)' },
];
const pieceCandidateAssets: UnitAsset[] = pieceCandidates.map((candidate) => ({
  id: `${candidate.piece}-candidate-claude`,
  family: candidate.piece,
  label: `${candidate.name} · Claude`,
  badge: 'Candidate · 8 directions',
  preview: `/assets/units/${candidate.piece}/candidate-claude/south.png`,
  read: candidate.read,
  status: 'tentative candidate',
  directions: rookDirections,
  factionMode: 'fixed',
  defaultSize: 92,
  unitAnchorY: '80%',
  sprite: pieceCandidateSprite(candidate.piece),
}));

// Shown when a unit has no sprite for the chosen facing — a placeholder, never a
// disabled control. Directions are always selectable.
const MISSING_DIRECTION_SPRITE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
      "<path d='M80 26 L144 80 L80 134 L16 80 Z' fill='none' stroke='#8fb8ff' stroke-width='3' stroke-dasharray='6 6' opacity='0.4'/>" +
      "<text x='80' y='96' font-size='42' text-anchor='middle' fill='#8fb8ff' opacity='0.5' font-family='sans-serif'>?</text>" +
      '</svg>',
  );

const hasDirectionSprite = (unit: UnitAsset, dir: Direction) =>
  unit.directions ? unit.directions.includes(dir) : dir === 'south';

const unitAssets: UnitAsset[] = [
  {
    id: 'pawn-production',
    family: 'pawn',
    label: 'Pawn',
    badge: 'Production south',
    preview: spriteFor('pawn', 'blue'),
    read: 'Compact pawn with front shield',
    status: 'current south sprite',
    factionMode: 'palette',
    defaultSize: 76,
    sprite: paletteSprite('pawn'),
  },
  {
    id: 'rook-blender-v4-calibrated',
    family: 'rook',
    label: 'Rook',
    badge: '8 directions · calibrated',
    preview: '/assets/units/rook/blender-render-v4-calibrated/south.png',
    read: 'Board-calibrated castle rook with exact eight-direction rotations',
    status: 'current default candidate',
    directions: rookDirections,
    factionMode: 'fixed',
    defaultSize: 84,
    unitAnchorX: '49.9%',
    unitAnchorY: '71.753%',
    sprite: rookVariantSprite('blender-render-v4-calibrated'),
  },
  ...rookCandidateAssets,
  {
    id: 'knight-production',
    family: 'knight',
    label: 'Knight',
    badge: 'Production south',
    preview: spriteFor('knight', 'blue'),
    read: 'Horse-head chess marker',
    status: 'current south sprite',
    factionMode: 'palette',
    defaultSize: 76,
    sprite: paletteSprite('knight'),
  },
  {
    id: 'bishop-production',
    family: 'bishop',
    label: 'Bishop',
    badge: 'Production south',
    preview: spriteFor('bishop', 'blue'),
    read: 'Tall bishop cap profile',
    status: 'current south sprite',
    factionMode: 'palette',
    defaultSize: 76,
    sprite: paletteSprite('bishop'),
  },
  {
    id: 'queen-production',
    family: 'queen',
    label: 'Queen',
    badge: 'Production south',
    preview: spriteFor('queen', 'blue'),
    read: 'Crown and narrow royal body',
    status: 'current south sprite',
    factionMode: 'palette',
    defaultSize: 76,
    sprite: paletteSprite('queen'),
  },
  {
    id: 'king-production',
    family: 'king',
    label: 'King',
    badge: 'Production south',
    preview: spriteFor('king', 'blue'),
    read: 'Cross crown chess identity',
    status: 'current south sprite',
    factionMode: 'palette',
    defaultSize: 76,
    sprite: paletteSprite('king'),
  },
  ...pieceCandidateAssets,
];

const grassTile = '/assets/tiles/canonical-accepted/grass-clean-a.png';
const stoneTile = '/assets/tiles/canonical-accepted/stone-clean-a.png';
const waterTile = '/assets/tiles/canonical-accepted/water-clean-a.png';

const factionLabels: Record<Faction, string> = {
  blue: 'Blue',
  red: 'Red',
  neutral: 'Neutral',
};

const tileContexts: Array<{ id: TileContextId; label: string; src: string }> = [
  { id: 'grass', label: 'Grass', src: grassTile },
  { id: 'stone', label: 'Stone', src: stoneTile },
  { id: 'water', label: 'Water', src: waterTile },
];

const isPieceId = (value: string | null): value is PieceId => value === 'pawn' || value === 'rook' || value === 'knight' || value === 'bishop' || value === 'queen' || value === 'king';
const isUnitAssetId = (value: string | null): value is string => unitAssets.some((unit) => unit.id === value);
const isDirection = (value: string | null): value is Direction => rookDirections.some((direction) => direction === value);
const isFootprintShape = (value: string | null): value is FootprintShape => value === 'square' || value === 'circle';
type UnitStudioMode = 'catalog' | 'view';
type UnitCollectionFilter = 'production' | 'candidates';
const unitCollectionFilters: Array<[UnitCollectionFilter, string]> = [
  ['production', 'Production'],
  ['candidates', 'Candidates'],
];
const isUnitStudioMode = (value: string | null): value is UnitStudioMode => value === 'catalog' || value === 'view';
const isUnitCollectionFilter = (value: string | null): value is UnitCollectionFilter => value === 'production' || value === 'candidates';
const unitCollectionForAsset = (unit: UnitAsset): UnitCollectionFilter =>
  unit.id.includes('candidate') || unit.badge.toLowerCase().includes('candidate') ? 'candidates' : 'production';
const unitFromLegacyQuery = (params = new URLSearchParams(window.location.search)) => {
  const queryUnit = params.get('unit');
  if (isUnitAssetId(queryUnit)) return queryUnit;

  const querySource = params.get('source');
  if (querySource && params.get('piece') === 'rook') return 'rook-blender-v4-calibrated';

  const queryPiece = params.get('piece');
  if (isPieceId(queryPiece)) {
    return unitAssets.find((unit) => unit.family === queryPiece)?.id ?? unitAssets[0].id;
  }

  return unitAssets[0].id;
};
const readUnitStudioRoute = () => {
  const params = new URLSearchParams(window.location.search);
  const unitId = unitFromLegacyQuery(params);
  const unit = unitAssets.find((item) => item.id === unitId) ?? unitAssets[0];
  const queryMode = params.get('mode');
  const queryDirection = params.get('direction');
  const queryShape = params.get('footprintShape');
  const querySizeParam = params.get('unitSize');
  const queryFootprintSizeParam = params.get('footprintSize');
  const querySize = querySizeParam === null ? undefined : Number(querySizeParam);
  const queryFootprintSize = queryFootprintSizeParam === null ? undefined : Number(queryFootprintSizeParam);
  const familiesParam = params.get('families');
  const collectionsParam = params.get('collections');
  const queryFamilies = familiesParam === null ? undefined : familiesParam.split(',').filter(isPieceId);
  const queryCollections = collectionsParam === null ? undefined : collectionsParam.split(',').filter(isUnitCollectionFilter);

  return {
    unitId,
    mode: isUnitStudioMode(queryMode) ? queryMode : params.has('unit') || params.has('piece') ? 'view' : 'catalog',
    direction: isDirection(queryDirection) ? queryDirection : 'south',
    unitSize: querySize !== undefined && Number.isFinite(querySize) ? clampUnitSize(querySize) : unit.defaultSize,
    footprintVisible: params.get('footprint') !== 'off',
    footprintShape: isFootprintShape(queryShape) ? queryShape : 'square',
    footprintSize: queryFootprintSize !== undefined && Number.isFinite(queryFootprintSize) ? clampFootprintSize(queryFootprintSize) : 96,
    familyFilters: queryFamilies ?? [...new Set(unitAssets.map((item) => item.family))],
    collectionFilters: queryCollections ?? unitCollectionFilters.map(([filter]) => filter),
  };
};
const clampUnitSize = (value: number) => Math.min(1200, Math.max(24, value));
const clampFootprintSize = (value: number) => Math.min(320, Math.max(24, value));

export function UnitStudio() {
  const initialRoute = useMemo(() => readUnitStudioRoute(), []);
  const [studioMode, setStudioMode] = useState<UnitStudioMode>(initialRoute.mode);
  const [unitId, setUnitId] = useState(initialRoute.unitId);
  const [faction, setFaction] = useState<Faction>('blue');
  const [zoom, setZoom] = useState(1.15);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [unitSize, setUnitSize] = useState(initialRoute.unitSize);
  const [footprintVisible, setFootprintVisible] = useState(initialRoute.footprintVisible);
  const [footprintShape, setFootprintShape] = useState<FootprintShape>(initialRoute.footprintShape);
  const [footprintSize, setFootprintSize] = useState(initialRoute.footprintSize);
  const [unitVisible, setUnitVisible] = useState(true);
  const [tileContext, setTileContext] = useState<TileContextId>('grass');
  const [direction, setDirection] = useState<Direction>(initialRoute.direction);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogZoom, setCatalogZoom] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedFamilyFilters, setSelectedFamilyFilters] = useState<PieceId[]>(initialRoute.familyFilters);
  const [selectedCollectionFilters, setSelectedCollectionFilters] = useState<UnitCollectionFilter[]>(initialRoute.collectionFilters);
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);
  const selectedUnit = unitAssets.find((unit) => unit.id === unitId) ?? unitAssets[0];
  const directionAvailable = hasDirectionSprite(selectedUnit, direction);
  const selectedSprite = directionAvailable ? selectedUnit.sprite(faction, direction) : MISSING_DIRECTION_SPRITE;
  const selectedTile = tileContexts.find((item) => item.id === tileContext) ?? tileContexts[0];
  const activeFamilyLabel =
    selectedFamilyFilters.length === 0
      ? 'No families'
      : selectedFamilyFilters.length === 1
        ? familyLabels[selectedFamilyFilters[0]]
        : `${selectedFamilyFilters.length} families`;
  const activeCollectionLabel =
    selectedCollectionFilters.length === 0
      ? 'No collections'
      : selectedCollectionFilters.map((filter) => unitCollectionFilters.find(([id]) => id === filter)?.[1]).filter(Boolean).join(' + ');
  const filteredUnits = unitAssets.filter((unit) => {
    if (!selectedFamilyFilters.includes(unit.family)) return false;
    if (!selectedCollectionFilters.includes(unitCollectionForAsset(unit))) return false;
    const query = catalogQuery.trim().toLowerCase();
    if (!query) return true;
    return [unit.label, unit.badge, unit.read, unit.status, unit.family].join(' ').toLowerCase().includes(query);
  });
  const unitPlacementStyle: UnitPlacementStyle = {
    '--tile-anchor-x': '50%',
    '--tile-anchor-y': '54px',
    '--unit-anchor-x': selectedUnit.unitAnchorX ?? '50%',
    '--unit-anchor-y': selectedUnit.unitAnchorY ?? '92%',
    '--unit-size': `${unitSize}px`,
    '--unit-footprint-size': `${footprintSize}px`,
  };

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('tileset-studio-active', 'unit-studio-active');
    return () => shell?.classList.remove('tileset-studio-active', 'unit-studio-active');
  }, []);

  useEffect(() => {
    if (!filterOpen) return;

    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && filterDropdownRef.current?.contains(target)) return;
      setFilterOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFilterOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [filterOpen]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('unit', selectedUnit.id);
    params.set('piece', selectedUnit.family);
    params.set('mode', studioMode);
    params.set('direction', direction);
    params.set('unitSize', String(unitSize));
    params.set('footprint', footprintVisible ? 'on' : 'off');
    params.set('footprintShape', footprintShape);
    params.set('footprintSize', String(footprintSize));
    params.set('families', selectedFamilyFilters.join(','));
    params.set('collections', selectedCollectionFilters.join(','));
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [direction, footprintShape, footprintSize, footprintVisible, selectedCollectionFilters, selectedFamilyFilters, selectedUnit.family, selectedUnit.id, studioMode, unitSize]);

  const selectUnit = (nextUnitId: string) => {
    const nextUnit = unitAssets.find((unit) => unit.id === nextUnitId);
    if (!nextUnit) return;
    setUnitId(nextUnitId);
    if (!nextUnit.directions?.includes(direction)) setDirection('south');
    setUnitSize(nextUnit.defaultSize);
    setStudioMode('view');
  };

  const selectDirection = (nextDirection: Direction) => {
    setDirection(nextDirection);
  };

  const rotateDirection = () => {
    const directionIndex = rookDirections.indexOf(direction);
    const nextDirection = rookDirections[(directionIndex + 1) % rookDirections.length];
    selectDirection(nextDirection);
  };

  const selectUnitSize = (nextSize: number) => {
    const clampedSize = clampUnitSize(nextSize);
    setUnitSize(clampedSize);
  };

  const selectFootprintSize = (nextSize: number) => {
    const clampedSize = clampFootprintSize(nextSize);
    setFootprintSize(clampedSize);
  };

  const selectFootprintShape = (nextShape: FootprintShape) => {
    setFootprintShape(nextShape);
  };

  const toggleFootprint = () => {
    setFootprintVisible((current) => {
      return !current;
    });
  };

  const toggleFamilyFilter = (nextFamily: PieceId) => {
    setSelectedFamilyFilters((current) => (current.includes(nextFamily) ? current.filter((item) => item !== nextFamily) : [...current, nextFamily]));
  };

  const toggleCollectionFilter = (nextCollection: UnitCollectionFilter) => {
    setSelectedCollectionFilters((current) =>
      current.includes(nextCollection) ? current.filter((item) => item !== nextCollection) : [...current, nextCollection],
    );
  };

  return (
    <main className="tileset-studio-page unit-studio-route">
      <header className="tileset-studio-header">
        <div className="tileset-studio-brand">
          <a className="tileset-studio-product" href="/" aria-label="Back to main menu">
            <strong>Chess Tactics</strong>
            <span>Tactical chess, infinite possibilities.</span>
          </a>
          <div className="tileset-studio-titleblock">
            <p className="tileset-studio-kicker">Unit Studio</p>
            <h1>{studioMode === 'catalog' ? 'Units' : selectedUnit.label}</h1>
            <p className="tileset-studio-subtitle">
              {studioMode === 'catalog' ? 'Browse chess-piece units with the same catalog/view workflow as tiles.' : `${rookDirectionName[direction]} facing · ${selectedUnit.status}`}
            </p>
          </div>
        </div>
        <nav className="tileset-studio-actions" aria-label="Unit studio navigation">
          <span className="tileset-mode-tabs" aria-label="Asset category">
            <button type="button" onClick={() => navigateApp('/tileset-studio')} title="Browse terrain tiles.">
              Tiles
            </button>
            <button type="button" className="is-active" title="Browse chess-piece units.">
              Units
            </button>
          </span>
          <span className="tileset-mode-tabs" aria-label="Unit studio mode">
            {(['catalog', 'view'] as UnitStudioMode[]).map((mode) => (
              <button key={mode} type="button" className={studioMode === mode ? 'is-active' : ''} onClick={() => setStudioMode(mode)}>
                {mode === 'catalog' ? 'Catalog' : 'View'}
              </button>
            ))}
          </span>
          <a href="/settings">Settings</a>
        </nav>
      </header>

      <section className={`tileset-studio-shell is-${studioMode} is-units`} aria-label="Unit studio">
        {studioMode === 'catalog' ? (
          <section className="tileset-studio-main">
            <div className="tileset-studio-toolbar">
              <div className="tileset-studio-title-row">
                <div className="tileset-catalog-heading">
                  <h2>Unit Catalog</h2>
                  <p className="tileset-filter-summary">{filteredUnits.length} units · {activeFamilyLabel} · {activeCollectionLabel}</p>
                </div>
                <label className="tileset-catalog-search">
                  <span>Search</span>
                  <input
                    type="search"
                    value={catalogQuery}
                    onChange={(event) => setCatalogQuery(event.target.value)}
                    placeholder="piece, read, status..."
                  />
                </label>
                <label className="tileset-catalog-zoom">
                  <span>Zoom</span>
                  <input
                    type="range"
                    min="0.75"
                    max="2"
                    step="0.05"
                    value={catalogZoom}
                    onChange={(event) => setCatalogZoom(Number(event.target.value))}
                  />
                </label>
                <div className="tileset-active-filters" aria-label="Active filters">
                  {selectedFamilyFilters.map((piece) => (
                    <button key={piece} type="button" onClick={() => toggleFamilyFilter(piece)} title={`Remove ${familyLabels[piece]} filter`}>
                      {familyLabels[piece]}
                    </button>
                  ))}
                  {selectedCollectionFilters.map((filter) => (
                    <button key={filter} type="button" onClick={() => toggleCollectionFilter(filter)} title={`Remove ${filter} filter`}>
                      {unitCollectionFilters.find(([id]) => id === filter)?.[1] ?? filter}
                    </button>
                  ))}
                </div>
                <div className="tileset-filter-dropdown" ref={filterDropdownRef}>
                  <button
                    type="button"
                    className={filterOpen ? 'is-active' : ''}
                    onClick={() => setFilterOpen((value) => !value)}
                    aria-expanded={filterOpen}
                    aria-controls="unit-filter-menu"
                  >
                    Filters
                  </button>
                  {filterOpen ? (
                    <div id="unit-filter-menu" className="tileset-filter-menu" role="dialog" aria-label="Unit filters">
                      <div className="tileset-filter-menu-header">
                        <strong>Filters</strong>
                        <span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFamilyFilters(Object.keys(familyLabels) as PieceId[]);
                              setSelectedCollectionFilters(unitCollectionFilters.map(([filter]) => filter));
                            }}
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFamilyFilters([]);
                              setSelectedCollectionFilters([]);
                            }}
                          >
                            Clear
                          </button>
                        </span>
                      </div>
                      <section className="tileset-filter-group" aria-label="Unit families">
                        <h3>Unit Family</h3>
                        {(Object.keys(familyLabels) as PieceId[]).map((piece) => (
                          <button
                            key={piece}
                            type="button"
                            className={`tileset-filter-option ${selectedFamilyFilters.includes(piece) ? 'is-active' : ''}`}
                            onClick={() => toggleFamilyFilter(piece)}
                          >
                            <span className="tileset-filter-mark" aria-hidden="true" />
                            <span className="tileset-filter-option-copy">
                              <strong>{familyLabels[piece]}</strong>
                              <span>{unitAssets.filter((unit) => unit.family === piece).length} units</span>
                            </span>
                          </button>
                        ))}
                      </section>
                      <section className="tileset-filter-group" aria-label="Unit collections">
                        <h3>Collection</h3>
                        {unitCollectionFilters.map(([filter, label]) => (
                          <button
                            key={filter}
                            type="button"
                            className={`tileset-filter-option ${selectedCollectionFilters.includes(filter) ? 'is-active' : ''}`}
                            onClick={() => toggleCollectionFilter(filter)}
                          >
                            <span className="tileset-filter-mark" aria-hidden="true" />
                            <span className="tileset-filter-option-copy">
                              <strong>{label}</strong>
                              <span>{filter === 'production' ? 'default game-facing units' : 'review and exploration units'}</span>
                            </span>
                          </button>
                        ))}
                      </section>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <section className="tileset-studio-tab-panel">
              <div className="tileset-asset-sections">
                <section className="tileset-asset-section" aria-label="Unit assets">
                  <h3>Units</h3>
                  <div className="tileset-studio-grid" aria-label="Filtered units">
                    {filteredUnits.map((unit) => (
                      <button
                        key={unit.id}
                        type="button"
                        className={`tileset-studio-card is-tile ${unit.id === selectedUnit.id ? 'is-selected' : ''}`}
                        onClick={() => selectUnit(unit.id)}
                        title={`Inspect ${unit.label}`}
                      >
                        <span className="tileset-studio-card-image unit-card-image" style={{ '--tile-zoom': catalogZoom } as CSSProperties}>
                          <img src={unit.preview} alt="" draggable={false} loading="eager" decoding="sync" />
                        </span>
                        <span className="tileset-studio-card-meta">
                          <span className="tileset-studio-card-text">
                            <strong>{unit.label}</strong>
                            <em>{unit.badge}</em>
                          </span>
                        </span>
                      </button>
                    ))}
                    {filteredUnits.length === 0 ? (
                      <div className="unit-catalog-empty">
                        <h3>No units match</h3>
                        <p>Change the family, collection, or search filters.</p>
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
            </section>
          </section>
        ) : (
          <section className="tileset-view-mode unit-view-mode" aria-label="Focused unit view">
            <div className="tileset-view-header">
              <button type="button" onClick={() => setStudioMode('catalog')}>
                Back to Catalog
              </button>
              <div>
                <p className="tileset-studio-kicker">Unit</p>
                <h2>{selectedUnit.label}</h2>
                <p>{selectedTile.label} tile · {rookDirectionName[direction]} facing{directionAvailable ? '' : ' · placeholder'}</p>
              </div>
            </div>

            <section className="unit-studio-art-frame" aria-label={`${selectedUnit.label} on ${selectedTile.label} tile`}>
              <ViewPane
                kind="unit"
                ariaLabel={`${selectedUnit.label} on ${selectedTile.label} tile viewport`}
                zoom={zoom}
                pan={pan}
                minZoom={0.75}
                maxZoom={1.85}
                onZoomChange={setZoom}
                onPanChange={setPan}
              >
                <div className="unit-studio-view-content">
                  <div className="unit-studio-tile-stack" style={unitPlacementStyle}>
                    <img className="unit-studio-context-tile" src={selectedTile.src} alt={`${selectedTile.label} tile`} draggable={false} />
                    {footprintVisible ? (
                      <span className={`unit-studio-footprint is-${footprintShape}`} aria-hidden="true" />
                    ) : null}
                    {unitVisible ? (
                      <img
                        className={`unit-studio-unit-preview is-${selectedUnit.family}`}
                        src={selectedSprite}
                        alt={`${factionLabels[faction]} ${selectedUnit.label.toLowerCase()} on ${selectedTile.label.toLowerCase()} tile`}
                        draggable={false}
                      />
                    ) : null}
                  </div>
                </div>
              </ViewPane>
            </section>

            <aside className="tileset-view-controls unit-studio-detail" aria-label="Unit view controls">
              <h2>Controls</h2>
              <div className="unit-studio-control-group" aria-label="Unit visibility">
                <button type="button" className={unitVisible ? 'is-active' : ''} onClick={() => setUnitVisible((value) => !value)}>
                  {unitVisible ? 'Unit On' : 'Unit Off'}
                </button>
                <button type="button" onClick={() => setPan({ x: 0, y: 0 })}>
                  Center View
                </button>
              </div>
              <label className="unit-studio-zoom">
                <span>View Zoom</span>
                <input
                  type="range"
                  min="0.75"
                  max="1.85"
                  step="0.05"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
              </label>
              <label className="unit-studio-zoom">
                <span>Unit Size</span>
                <input
                  type="range"
                  min="48"
                  max="360"
                  step="4"
                  value={unitSize}
                  onChange={(event) => selectUnitSize(Number(event.target.value))}
                />
                <input
                  type="number"
                  min="24"
                  step="4"
                  value={unitSize}
                  onChange={(event) => selectUnitSize(Number(event.target.value))}
                  aria-label="Unit size in pixels"
                />
                <em>{unitSize}px</em>
              </label>
              <div className="unit-studio-control-group" aria-label="Expected footprint">
                <strong>Footprint</strong>
                <button type="button" className={footprintVisible ? 'is-active' : ''} onClick={toggleFootprint}>
                  {footprintVisible ? 'Footprint On' : 'Footprint Off'}
                </button>
                <div className="unit-studio-factions">
                  {(['square', 'circle'] as FootprintShape[]).map((shape) => (
                    <button
                      type="button"
                      key={shape}
                      className={footprintShape === shape ? 'is-active' : ''}
                      disabled={!footprintVisible}
                      onClick={() => selectFootprintShape(shape)}
                    >
                      {shape === 'square' ? 'Square' : 'Circle'}
                    </button>
                  ))}
                </div>
                <label className="unit-studio-zoom">
                  <span>Expected Size</span>
                  <input
                    type="range"
                    min="40"
                    max="220"
                    step="4"
                    value={footprintSize}
                    disabled={!footprintVisible}
                    onChange={(event) => selectFootprintSize(Number(event.target.value))}
                  />
                  <em>{footprintSize}px</em>
                </label>
              </div>
              <div className="unit-studio-control-group" aria-label="Tile context">
                <strong>Tile</strong>
                {tileContexts.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={tileContext === item.id ? 'is-active' : ''}
                    onClick={() => setTileContext(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="unit-studio-control-group" aria-label="Facing direction">
                <strong>Facing</strong>
                <div className="unit-studio-compass" role="radiogroup" aria-label="Facing direction">
                  {directionCompassCells.map((item) => item === 'center' ? (
                    <button
                      type="button"
                      className="unit-studio-compass-center"
                      key="center"
                      onClick={rotateDirection}
                    >
                      <span>Facing</span>
                      <strong>{rookDirectionLabel[direction]}</strong>
                      <em>Rotate</em>
                    </button>
                  ) : (
                    <button
                      type="button"
                      key={item}
                      role="radio"
                      aria-checked={direction === item}
                      title={hasDirectionSprite(selectedUnit, item) ? rookDirectionLabel[item] : `${rookDirectionLabel[item]} — no sprite yet (placeholder)`}
                      className={`unit-studio-compass-button is-${item}${direction === item ? ' is-active' : ''}${hasDirectionSprite(selectedUnit, item) ? '' : ' is-missing'}`}
                      onClick={() => selectDirection(item)}
                    >
                      <span aria-hidden="true" />
                      <em>{rookDirectionLabel[item]}</em>
                    </button>
                  ))}
                </div>
              </div>
              <div className="unit-studio-control-group" aria-label="Faction">
                <strong>Faction</strong>
                <div className="unit-studio-factions">
                  {(Object.keys(factionLabels) as Faction[]).map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={faction === item ? 'is-active' : ''}
                      disabled={selectedUnit.factionMode === 'fixed'}
                      onClick={() => setFaction(item)}
                    >
                      {factionLabels[item]}
                    </button>
                  ))}
                </div>
              </div>
              <dl>
                <div><dt>Unit</dt><dd>{selectedUnit.label}</dd></div>
                <div><dt>Family</dt><dd>{familyLabels[selectedUnit.family]}</dd></div>
                <div><dt>Size</dt><dd>{unitSize}px</dd></div>
                <div><dt>Footprint</dt><dd>{footprintVisible ? `${footprintShape} · ${footprintSize}px` : 'Hidden'}</dd></div>
                <div><dt>Facing</dt><dd>{rookDirectionLabel[direction]}{directionAvailable ? '' : ' (placeholder)'}</dd></div>
                <div><dt>Status</dt><dd>{selectedUnit.status}</dd></div>
                <div><dt>Read</dt><dd>{selectedUnit.read}</dd></div>
              </dl>
            </aside>
          </section>
        )}
      </section>
    </main>
  );
}
