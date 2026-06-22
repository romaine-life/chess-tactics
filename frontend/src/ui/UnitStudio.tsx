import { type CSSProperties, useEffect, useState } from 'react';
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

const rookDirections: Direction[] = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
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
const directionCompassCells: Array<Direction | 'center'> = [
  'north-west',
  'north',
  'north-east',
  'west',
  'center',
  'east',
  'south-west',
  'south',
  'south-east',
];

const spriteFor = (piece: PieceId, faction: Faction) => `/assets/units/${piece}/${faction}/south.png`;
const rookVariantSprite = (variant: string) => (_faction: Faction, direction: Direction) => `/assets/units/rook/${variant}/${direction}.png`;
// Wooden-knight candidate: a board-calibrated Blender render of the carved
// Staunton OBJ, restyled navy to sit in the unit family (8 fixed directions).
const knightWoodenSprite = (_faction: Faction, direction: Direction) => `/assets/units/knight/candidate-wooden/${direction}.png`;
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
    id: 'knight-wooden',
    family: 'knight',
    label: 'Knight · Wooden',
    badge: 'Candidate · 8 directions',
    preview: '/assets/units/knight/candidate-wooden/south.png',
    read: 'Carved Staunton warhorse from a turned-wood model, restyled navy (board-calibrated render)',
    status: 'tentative candidate',
    directions: rookDirections,
    factionMode: 'fixed',
    defaultSize: 88,
    unitAnchorY: '76%',
    sprite: knightWoodenSprite,
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
const unitFromLegacyQuery = () => {
  const params = new URLSearchParams(window.location.search);
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
const clampUnitSize = (value: number) => Math.min(1200, Math.max(24, value));
const clampFootprintSize = (value: number) => Math.min(320, Math.max(24, value));

export function UnitStudio() {
  const [unitId, setUnitId] = useState(unitFromLegacyQuery);
  const [faction, setFaction] = useState<Faction>('blue');
  const [zoom, setZoom] = useState(1.15);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [unitSize, setUnitSize] = useState(() => {
    const querySize = Number(new URLSearchParams(window.location.search).get('unitSize'));
    return Number.isFinite(querySize) ? clampUnitSize(querySize) : 84;
  });
  const [footprintVisible, setFootprintVisible] = useState(() => new URLSearchParams(window.location.search).get('footprint') !== 'off');
  const [footprintShape, setFootprintShape] = useState<FootprintShape>(() => {
    const queryShape = new URLSearchParams(window.location.search).get('footprintShape');
    return isFootprintShape(queryShape) ? queryShape : 'square';
  });
  const [footprintSize, setFootprintSize] = useState(() => {
    const querySize = Number(new URLSearchParams(window.location.search).get('footprintSize'));
    return Number.isFinite(querySize) ? clampFootprintSize(querySize) : 96;
  });
  const [unitVisible, setUnitVisible] = useState(true);
  const [tileContext, setTileContext] = useState<TileContextId>('grass');
  const [direction, setDirection] = useState<Direction>(() => {
    const queryDirection = new URLSearchParams(window.location.search).get('direction');
    return isDirection(queryDirection) ? queryDirection : 'south';
  });
  const selectedUnit = unitAssets.find((unit) => unit.id === unitId) ?? unitAssets[0];
  const directionAvailable = hasDirectionSprite(selectedUnit, direction);
  const selectedSprite = directionAvailable ? selectedUnit.sprite(faction, direction) : MISSING_DIRECTION_SPRITE;
  const selectedTile = tileContexts.find((item) => item.id === tileContext) ?? tileContexts[0];
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
    shell?.classList.add('unit-studio-active');
    return () => shell?.classList.remove('unit-studio-active');
  }, []);

  const selectUnit = (nextUnitId: string) => {
    const nextUnit = unitAssets.find((unit) => unit.id === nextUnitId);
    if (!nextUnit) return;
    setUnitId(nextUnitId);
    if (!nextUnit.directions?.includes(direction)) setDirection('south');
    setUnitSize(nextUnit.defaultSize);
    const params = new URLSearchParams(window.location.search);
    params.set('unit', nextUnitId);
    params.set('piece', nextUnit.family);
    params.delete('source');
    params.set('direction', nextUnit.directions?.includes(direction) ? direction : 'south');
    params.set('unitSize', String(nextUnit.defaultSize));
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  const selectDirection = (nextDirection: Direction) => {
    setDirection(nextDirection);
    const params = new URLSearchParams(window.location.search);
    params.set('direction', nextDirection);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  const rotateDirection = () => {
    const directionIndex = rookDirections.indexOf(direction);
    const nextDirection = rookDirections[(directionIndex + 1) % rookDirections.length];
    selectDirection(nextDirection);
  };

  const selectUnitSize = (nextSize: number) => {
    const clampedSize = clampUnitSize(nextSize);
    setUnitSize(clampedSize);
    const params = new URLSearchParams(window.location.search);
    params.set('unitSize', String(clampedSize));
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  const selectFootprintSize = (nextSize: number) => {
    const clampedSize = clampFootprintSize(nextSize);
    setFootprintSize(clampedSize);
    const params = new URLSearchParams(window.location.search);
    params.set('footprintSize', String(clampedSize));
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  const selectFootprintShape = (nextShape: FootprintShape) => {
    setFootprintShape(nextShape);
    const params = new URLSearchParams(window.location.search);
    params.set('footprintShape', nextShape);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  const toggleFootprint = () => {
    setFootprintVisible((current) => {
      const nextValue = !current;
      const params = new URLSearchParams(window.location.search);
      params.set('footprint', nextValue ? 'on' : 'off');
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
      return nextValue;
    });
  };

  return (
    <main className="unit-studio-page">
      <header className="unit-studio-header">
        <div className="unit-studio-brand">
          <a className="unit-studio-product" href="/" aria-label="Back to main menu">
            <strong>Chess Tactics</strong>
            <span>Tactical chess, infinite possibilities.</span>
          </a>
          <div className="unit-studio-title">
            <p>Unit Studio</p>
            <h1>{familyLabels[selectedUnit.family]}</h1>
            <span>Review chess-piece units on the same tile scale as the board.</span>
          </div>
        </div>
        <nav className="unit-studio-actions" aria-label="Unit studio navigation">
          <a href="/tileset-studio">Tilesets</a>
          <a href="/settings">Settings</a>
        </nav>
      </header>

      <section className="unit-studio-shell" aria-label="Unit art workbench">
        <aside className="unit-studio-rail" aria-label="Unit library">
          <h2>Unit Catalog</h2>
          {unitAssets.map((unit) => (
            <button
              type="button"
              className={unit.id === selectedUnit.id ? 'is-active' : ''}
              key={unit.id}
              onClick={() => selectUnit(unit.id)}
            >
              <img src={unit.preview} alt="" draggable={false} />
              <span>
                <strong>{unit.label}</strong>
                <em>{unit.badge}</em>
              </span>
            </button>
          ))}
        </aside>

        <section className="unit-studio-main" aria-label="Selected unit">
          <div className="unit-studio-panel-head">
            <div>
              <p>Tile View</p>
              <h2>{selectedUnit.label} on {selectedTile.label}</h2>
            </div>
            <span>{rookDirectionLabel[direction]} facing{directionAvailable ? '' : ' · placeholder'} · {selectedUnit.status}</span>
          </div>

          <div className="unit-studio-workbench">
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

            <aside className="unit-studio-detail" aria-label="Unit view controls">
              <h3>Controls</h3>
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
          </div>
        </section>
      </section>
    </main>
  );
}
