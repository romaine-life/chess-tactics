import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { TILE_TOP_HEIGHT } from '../art/projectionContract';
import { navigateApp } from './navigation';
import { ViewPane } from './shared/ViewPane';
import {
  MISSING_DIRECTION_SPRITE,
  activeUnitFamilies,
  directionCompassCells,
  familyLabels,
  footprintSizeFromScale,
  hasDirectionSprite,
  renderSizeForTileScale,
  rookDirectionLabel,
  rookDirections,
  UNIT_INSPECTION_TILE_SCALE,
  unitAssets,
  type Direction,
  type Faction,
  type PieceId,
  type UnitAsset,
  type UnitPlacementStyle,
} from './unitCatalog';

type TileContextId = 'grass' | 'stone' | 'water';

const grassTile = '/assets/tiles/canonical-true-iso/grass-clean-a.png';
const stoneTile = '/assets/tiles/canonical-true-iso/stone-clean-a.png';
const waterTile = '/assets/tiles/canonical-true-iso/water-clean-a.png';

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
const activeUnitCollectionFilters = unitCollectionFilters.filter(([filter]) => unitAssets.some((unit) => unitCollectionForAsset(unit) === filter));
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
  const queryScaleParam = params.get('unitScale');
  const legacySizeParam = params.get('unitSize');
  const queryScale = queryScaleParam === null ? undefined : Number(queryScaleParam);
  const legacySize = legacySizeParam === null ? undefined : Number(legacySizeParam);
  const familiesParam = params.get('families');
  const collectionsParam = params.get('collections');
  const queryFamilies = familiesParam === null ? undefined : familiesParam.split(',').filter(isPieceId);
  const queryCollections = collectionsParam === null ? undefined : collectionsParam.split(',').filter(isUnitCollectionFilter);
  const activeCollections = activeUnitCollectionFilters.map(([filter]) => filter);
  const normalizedFamilies = queryFamilies?.filter((family) => activeUnitFamilies.includes(family));
  const normalizedCollections = queryCollections?.filter((collection) => activeCollections.includes(collection));
  const initialScale =
    queryScale !== undefined && Number.isFinite(queryScale)
      ? clampUnitScale(queryScale)
      : legacySize !== undefined && Number.isFinite(legacySize)
        ? scaleFromLegacySize(unit, legacySize)
        : unit.defaultScale;

  return {
    unitId,
    mode: isUnitStudioMode(queryMode) ? queryMode : params.has('unit') || params.has('piece') ? 'view' : 'catalog',
    direction: 'south' as Direction,
    unitScale: initialScale,
    footprintVisible: params.get('footprint') === 'on',
    familyFilters: normalizedFamilies && normalizedFamilies.length > 0 ? normalizedFamilies : activeUnitFamilies,
    collectionFilters: normalizedCollections && normalizedCollections.length > 0 ? normalizedCollections : activeCollections,
  };
};
const clampUnitScale = (value: number) => Math.min(500, Math.max(25, value));
const scaleFromLegacySize = (unit: UnitAsset, size: number) =>
  clampUnitScale(Math.round((size / renderSizeForTileScale(unit, 100, UNIT_INSPECTION_TILE_SCALE)) * 100));
const DEFAULT_VIEW_ZOOM = 1.15;

const ResetIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M7 7h6a5 5 0 1 1-4.3 7.55" />
    <path d="M7 7V3L3 7l4 4V7Z" />
  </svg>
);

export function UnitStudio() {
  const initialRoute = useMemo(() => readUnitStudioRoute(), []);
  const [studioMode, setStudioMode] = useState<UnitStudioMode>(initialRoute.mode);
  const [unitId, setUnitId] = useState(initialRoute.unitId);
  const [faction, setFaction] = useState<Faction>('blue');
  const [zoom, setZoom] = useState(DEFAULT_VIEW_ZOOM);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [unitScale, setUnitScale] = useState(initialRoute.unitScale);
  const [footprintVisible, setFootprintVisible] = useState(initialRoute.footprintVisible);
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
  const unitRenderSize = renderSizeForTileScale(selectedUnit, unitScale, UNIT_INSPECTION_TILE_SCALE);
  const unitFootprintSize = footprintSizeFromScale(selectedUnit, unitScale);
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
    '--tile-anchor-y': `${TILE_TOP_HEIGHT}px`,
    '--unit-anchor-x': selectedUnit.unitAnchorX ?? '50%',
    '--unit-anchor-y': selectedUnit.unitAnchorY ?? '92%',
    '--unit-size': `${unitRenderSize}px`,
    '--unit-footprint-size': `${unitFootprintSize}px`,
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
    params.set('unitScale', String(unitScale));
    params.set('footprint', footprintVisible ? 'on' : 'off');
    params.set('families', selectedFamilyFilters.join(','));
    params.set('collections', selectedCollectionFilters.join(','));
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [footprintVisible, selectedCollectionFilters, selectedFamilyFilters, selectedUnit.family, selectedUnit.id, studioMode, unitScale]);

  const selectUnit = (nextUnitId: string) => {
    const nextUnit = unitAssets.find((unit) => unit.id === nextUnitId);
    if (!nextUnit) return;
    const params = new URLSearchParams({
      family: 'grass',
      mode: 'lab',
      lab: 'unit',
      collection: 'base',
      asset: 'grass-clean-a',
      pair: 'grass-stone',
      board: 'generated',
      scope: 'family',
      size: 'small',
      seed: '4217',
      brush: 'unit',
      unit: nextUnit.id,
    });
    navigateApp(`/tileset-studio?${params.toString()}`);
  };

  const selectDirection = (nextDirection: Direction) => {
    setDirection(nextDirection);
  };

  const rotateDirection = () => {
    const directionIndex = rookDirections.indexOf(direction);
    const nextDirection = rookDirections[(directionIndex + 1) % rookDirections.length];
    selectDirection(nextDirection);
  };

  const selectUnitScale = (nextScale: number) => {
    const clampedScale = clampUnitScale(nextScale);
    setUnitScale(clampedScale);
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
  const openBoardLab = (unitToPlace = selectedUnit.id) => {
    const params = new URLSearchParams();
    params.set('family', 'grass');
    params.set('mode', 'lab');
    params.set('lab', 'unit');
    params.set('collection', 'base');
    params.set('asset', 'grass-clean-a');
    params.set('pair', 'grass-stone');
    params.set('board', 'generated');
    params.set('scope', 'mixed');
    params.set('size', 'small');
    params.set('seed', '4217');
    params.set('brush', 'unit');
    params.set('unit', unitToPlace);
    navigateApp(`/tileset-studio?${params.toString()}`);
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
              {studioMode === 'catalog' ? 'Browse chess-piece units with the same catalog/view workflow as tiles.' : selectedUnit.status}
            </p>
          </div>
        </div>
        <nav className="tileset-studio-actions" aria-label="Unit studio navigation">
          <span className="tileset-mode-tabs" aria-label="Asset category">
            <button type="button" onClick={() => navigateApp('/tileset-studio')} title="Browse terrain tiles.">
              Tiles
            </button>
            <button type="button" className="is-active" onClick={() => setStudioMode('catalog')} title="Browse chess-piece units.">
              Units
            </button>
            <button type="button" onClick={() => openBoardLab()} title="Open the shared terrain and unit board lab.">
              Board Lab
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
                              setSelectedFamilyFilters(activeUnitFamilies);
                              setSelectedCollectionFilters(activeUnitCollectionFilters.map(([filter]) => filter));
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
                        {activeUnitFamilies.map((piece) => (
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
                        {activeUnitCollectionFilters.map(([filter, label]) => (
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
                          <span className="tileset-card-actions">
                            <span
                              className="tileset-card-action"
                              role="button"
                              tabIndex={0}
                              title={`Place ${unit.label} on the board`}
                              aria-label={`Place ${unit.label} on the board`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openBoardLab(unit.id);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  openBoardLab(unit.id);
                                }
                              }}
                            >
                              +
                            </span>
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
                <p>{selectedTile.label} tile</p>
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
                    {footprintVisible ? <span className={`unit-studio-footprint is-${selectedUnit.footprint.shape}`} aria-hidden="true" /> : null}
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
              <div className="unit-studio-zoom">
                <span>View Zoom</span>
                <div className="unit-studio-slider-row">
                  <input
                    type="range"
                    min="0.75"
                    max="1.85"
                    step="0.05"
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                  />
                  <button type="button" className="unit-studio-icon-button" aria-label="Reset view zoom" onClick={() => setZoom(DEFAULT_VIEW_ZOOM)}>
                    <ResetIcon />
                  </button>
                </div>
              </div>
              <div className="unit-studio-zoom">
                <span>Unit Scale</span>
                <div className="unit-studio-slider-row">
                  <input
                    type="range"
                    min="25"
                    max="500"
                    step="1"
                    value={unitScale}
                    onChange={(event) => selectUnitScale(Number(event.target.value))}
                  />
                  <button
                    type="button"
                    className="unit-studio-icon-button"
                    aria-label={`Reset unit scale to ${selectedUnit.defaultScale}%`}
                    onClick={() => selectUnitScale(selectedUnit.defaultScale)}
                  >
                    <ResetIcon />
                  </button>
                </div>
                <input
                  type="number"
                  min="25"
                  step="1"
                  value={unitScale}
                  onChange={(event) => selectUnitScale(Number(event.target.value))}
                  aria-label="Unit scale percent"
                />
                <em>{unitScale}%</em>
              </div>
              <div className="unit-studio-control-group" aria-label="Unit footprint">
                <strong>Footprint</strong>
                <button type="button" className={footprintVisible ? 'is-active' : ''} onClick={toggleFootprint}>
                  {footprintVisible ? 'Footprint On' : 'Footprint Off'}
                </button>
                <div className="unit-studio-footprint-readout">
                  <span>{selectedUnit.footprint.shape}</span>
                  <em>{unitFootprintSize}px target</em>
                </div>
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
                      <span>Rotate</span>
                      <strong>Piece</strong>
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
                <div><dt>Scale</dt><dd>{unitScale}%</dd></div>
                <div><dt>Render Box</dt><dd>{unitRenderSize}px</dd></div>
                <div><dt>Footprint</dt><dd>{`${selectedUnit.footprint.shape} · ${unitFootprintSize}px`}</dd></div>
                <div>
                  <dt>Source Footprint</dt>
                  <dd>{`${selectedUnit.footprint.sourceFootprintPx}px / ${selectedUnit.footprint.sourceCanvasPx}px`}</dd>
                </div>
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
