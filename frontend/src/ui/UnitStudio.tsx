import { type CSSProperties, useEffect, useState } from 'react';

type Faction = 'blue' | 'red' | 'neutral';
type PieceId = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
type Direction = 'south' | 'south-east' | 'east' | 'north-east' | 'north' | 'north-west' | 'west' | 'south-west';
type TileContextId = 'grass' | 'stone' | 'water';
type UnitPlacementStyle = CSSProperties & {
  '--tile-anchor-x': string;
  '--tile-anchor-y': string;
  '--unit-anchor-x': string;
  '--unit-anchor-y': string;
  '--unit-size': string;
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

const spriteFor = (piece: PieceId, faction: Faction) => `/assets/units/${piece}/${faction}/south.png`;
const rookVariantSprite = (variant: string) => (_faction: Faction, direction: Direction) => `/assets/units/rook/${variant}/${direction}.png`;
const paletteSprite = (piece: PieceId) => (faction: Faction) => spriteFor(piece, faction);

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
const clampUnitSize = (value: number) => Math.min(132, Math.max(48, value));

export function UnitStudio() {
  const [unitId, setUnitId] = useState(unitFromLegacyQuery);
  const [faction, setFaction] = useState<Faction>('blue');
  const [zoom, setZoom] = useState(1.15);
  const [unitSize, setUnitSize] = useState(() => {
    const querySize = Number(new URLSearchParams(window.location.search).get('unitSize'));
    return Number.isFinite(querySize) ? clampUnitSize(querySize) : 84;
  });
  const [unitVisible, setUnitVisible] = useState(true);
  const [tileContext, setTileContext] = useState<TileContextId>('grass');
  const [direction, setDirection] = useState<Direction>(() => {
    const queryDirection = new URLSearchParams(window.location.search).get('direction');
    return isDirection(queryDirection) ? queryDirection : 'south';
  });
  const selectedUnit = unitAssets.find((unit) => unit.id === unitId) ?? unitAssets[0];
  const selectedDirection = selectedUnit.directions?.includes(direction) ? direction : 'south';
  const selectedSprite = selectedUnit.sprite(faction, selectedDirection);
  const selectedTile = tileContexts.find((item) => item.id === tileContext) ?? tileContexts[0];
  const hasEightDirections = Boolean(selectedUnit.directions?.length);
  const unitPlacementStyle: UnitPlacementStyle = {
    transform: `scale(${zoom})`,
    '--tile-anchor-x': '50%',
    '--tile-anchor-y': '54px',
    '--unit-anchor-x': selectedUnit.unitAnchorX ?? '50%',
    '--unit-anchor-y': selectedUnit.unitAnchorY ?? '92%',
    '--unit-size': `${unitSize}px`,
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

  const selectUnitSize = (nextSize: number) => {
    const clampedSize = clampUnitSize(nextSize);
    setUnitSize(clampedSize);
    const params = new URLSearchParams(window.location.search);
    params.set('unitSize', String(clampedSize));
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  return (
    <main className="unit-studio-page">
      <header className="unit-studio-header">
        <div className="unit-studio-brand">
          <div className="unit-studio-product">
            <strong>Chess Tactics</strong>
            <span>Tactical chess, infinite possibilities.</span>
          </div>
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
            <span>{hasEightDirections ? `${rookDirectionLabel[selectedDirection]} facing` : 'south facing'} · {selectedUnit.status}</span>
          </div>

          <div className="unit-studio-workbench">
            <section className="unit-studio-art-frame" aria-label={`${selectedUnit.label} on ${selectedTile.label} tile`}>
              <div className="unit-studio-tile-stack" style={unitPlacementStyle}>
                <img className="unit-studio-context-tile" src={selectedTile.src} alt={`${selectedTile.label} tile`} draggable={false} />
                {unitVisible ? (
                  <img
                    className={`unit-studio-unit-preview is-${selectedUnit.family}`}
                    src={selectedSprite}
                    alt={`${factionLabels[faction]} ${selectedUnit.label.toLowerCase()} on ${selectedTile.label.toLowerCase()} tile`}
                    draggable={false}
                  />
                ) : null}
              </div>
            </section>

            <aside className="unit-studio-detail" aria-label="Unit view controls">
              <h3>Controls</h3>
              <div className="unit-studio-control-group" aria-label="Unit visibility">
                <button type="button" className={unitVisible ? 'is-active' : ''} onClick={() => setUnitVisible((value) => !value)}>
                  {unitVisible ? 'Unit On' : 'Unit Off'}
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
                  max="132"
                  step="2"
                  value={unitSize}
                  onChange={(event) => selectUnitSize(Number(event.target.value))}
                />
                <em>{unitSize}px</em>
              </label>
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
                <div className="unit-studio-direction-buttons">
                  {rookDirections.map((item) => (
                    <button
                      type="button"
                      key={item}
                      disabled={!hasEightDirections}
                      className={selectedDirection === item ? 'is-active' : ''}
                      onClick={() => selectDirection(item)}
                    >
                      {rookDirectionLabel[item]}
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
                <div><dt>Facing</dt><dd>{hasEightDirections ? rookDirectionLabel[selectedDirection] : 'South'}</dd></div>
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
