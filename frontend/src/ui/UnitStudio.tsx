import { type CSSProperties, useEffect, useState } from 'react';

type Faction = 'blue' | 'red' | 'neutral';
type PieceId = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
type Direction = 'south' | 'south-east' | 'east' | 'north-east' | 'north' | 'north-west' | 'west' | 'south-west';
type UnitSourceId = 'production' | 'pixellab-a' | 'blender-v2' | 'blender-render-v3' | 'blender-render-v4-calibrated';
type TileContextId = 'grass' | 'stone' | 'water';
type UnitPlacementStyle = CSSProperties & {
  '--tile-anchor-x': string;
  '--tile-anchor-y': string;
  '--unit-anchor-x': string;
  '--unit-anchor-y': string;
};

type UnitPiece = {
  id: PieceId;
  label: string;
  title: string;
  concept: string;
  read: string;
};

const unitPieces: UnitPiece[] = [
  {
    id: 'pawn',
    label: 'Pawn',
    title: 'Shield Pawn South',
    concept: '/assets/units/concepts/pawn-shield-south-concept.png',
    read: 'Compact pawn with front shield',
  },
  {
    id: 'rook',
    label: 'Rook',
    title: 'Fortress Rook South',
    concept: '/assets/units/concepts/rook-south-concept.png',
    read: 'Tower silhouette first',
  },
  {
    id: 'knight',
    label: 'Knight',
    title: 'Horse Knight South',
    concept: '/assets/units/concepts/knight-south-concept.png',
    read: 'Horse-head chess marker',
  },
  {
    id: 'bishop',
    label: 'Bishop',
    title: 'Mitre Bishop South',
    concept: '/assets/units/concepts/bishop-south-concept.png',
    read: 'Tall bishop cap profile',
  },
  {
    id: 'queen',
    label: 'Queen',
    title: 'Crowned Queen South',
    concept: '/assets/units/concepts/queen-south-concept.png',
    read: 'Crown and narrow royal body',
  },
  {
    id: 'king',
    label: 'King',
    title: 'Crowned King South',
    concept: '/assets/units/concepts/king-south-concept.png',
    read: 'Cross crown chess identity',
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

const spriteFor = (piece: PieceId, faction: Faction) => `/assets/units/${piece}/${faction}/south.png`;
const isPieceId = (value: string | null): value is PieceId => unitPieces.some((piece) => piece.id === value);
const isDirection = (value: string | null): value is Direction => rookDirections.some((direction) => direction === value);
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
const rookComparisonSets = [
  {
    id: 'blender-render-v4-calibrated',
    label: 'Blender v4 calibrated',
    note: 'Board-calibrated camera basis: cardinal views are square-on and diagonal views are diamond-on.',
    path: (direction: Direction) => `/assets/units/rook/blender-render-v4-calibrated/${direction}.png`,
  },
  {
    id: 'blender-render-v3',
    label: 'Blender v3 render',
    note: 'Current castle-first model pass with clean eight-direction Blender renders.',
    path: (direction: Direction) => `/assets/units/rook/blender-render-v3/${direction}.png`,
  },
  {
    id: 'pixellab-a',
    label: 'PixelLab reference run',
    note: 'Generated from the accepted rook reference; useful for checking whether PixelLab preserves the art read across rotations.',
    path: (direction: Direction) => `/assets/units/rook/pixellab-a/${direction}.png`,
  },
  {
    id: 'blender-v2',
    label: 'Blender model',
    note: 'Exact rotations from the current model; useful for geometry and facing checks.',
    path: (direction: Direction) => `/assets/units/rook/blender-v2/${direction}.png`,
  },
];
const productionSource = {
  id: 'production' as UnitSourceId,
  label: 'Production south',
  note: 'Current extracted game sprite. South only for now.',
};
const rookSources = [
  {
    id: 'blender-render-v4-calibrated' as UnitSourceId,
    label: 'Blender v4 calibrated',
    note: 'Current board-calibrated Blender pass. Eight exact rotations.',
  },
  {
    id: 'blender-render-v3' as UnitSourceId,
    label: 'Blender v3 rook',
    note: 'Current castle-first Blender pass. Eight exact rotations.',
  },
  {
    id: 'pixellab-a' as UnitSourceId,
    label: 'PixelLab rook',
    note: 'Current preferred rook candidate. Eight generated rotations.',
  },
  {
    id: 'blender-v2' as UnitSourceId,
    label: 'Blender rook',
    note: 'Geometry reference. Useful for rotation consistency checks.',
  },
  productionSource,
];

const sourceFor = (piece: PieceId, source: UnitSourceId, faction: Faction, direction: Direction) => {
  if (piece === 'rook' && source !== 'production') return `/assets/units/rook/${source}/${direction}.png`;
  return spriteFor(piece, faction);
};

const previewFor = (piece: PieceId) => piece === 'rook' ? '/assets/units/rook/blender-render-v4-calibrated/south.png' : spriteFor(piece, 'blue');

export function UnitStudio() {
  const [pieceId, setPieceId] = useState<PieceId>(() => {
    const queryPiece = new URLSearchParams(window.location.search).get('piece');
    return isPieceId(queryPiece) ? queryPiece : 'pawn';
  });
  const [faction, setFaction] = useState<Faction>('blue');
  const [zoom, setZoom] = useState(1.15);
  const [unitVisible, setUnitVisible] = useState(true);
  const [tileContext, setTileContext] = useState<TileContextId>('grass');
  const [direction, setDirection] = useState<Direction>(() => {
    const queryDirection = new URLSearchParams(window.location.search).get('direction');
    return isDirection(queryDirection) ? queryDirection : 'south';
  });
  const [source, setSource] = useState<UnitSourceId>(() => {
    const querySource = new URLSearchParams(window.location.search).get('source');
    return querySource === 'blender-render-v4-calibrated' || querySource === 'blender-render-v3' || querySource === 'blender-v2' || querySource === 'production' || querySource === 'pixellab-a'
      ? querySource
      : 'blender-render-v4-calibrated';
  });
  const selectedPiece = unitPieces.find((piece) => piece.id === pieceId) ?? unitPieces[0];
  const sourceOptions = selectedPiece.id === 'rook' ? rookSources : [productionSource];
  const normalizedSource = selectedPiece.id === 'rook' ? source : 'production';
  const selectedSprite = sourceFor(selectedPiece.id, normalizedSource, faction, direction);
  const selectedTile = tileContexts.find((item) => item.id === tileContext) ?? tileContexts[0];
  const hasEightDirections = selectedPiece.id === 'rook' && normalizedSource !== 'production';
  const isBlenderRenderSource = normalizedSource === 'blender-render-v3' || normalizedSource === 'blender-render-v4-calibrated';
  const unitPlacementStyle: UnitPlacementStyle = {
    transform: `scale(${zoom})`,
    '--tile-anchor-x': '50%',
    '--tile-anchor-y': '54px',
    '--unit-anchor-x': isBlenderRenderSource ? '49.9%' : '50%',
    '--unit-anchor-y': normalizedSource === 'blender-render-v4-calibrated'
      ? '71.753%'
      : isBlenderRenderSource ? '90.8%' : '92%',
  };

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('unit-studio-active');
    return () => shell?.classList.remove('unit-studio-active');
  }, []);

  const selectPiece = (nextPieceId: PieceId) => {
    setPieceId(nextPieceId);
    const params = new URLSearchParams(window.location.search);
    params.set('piece', nextPieceId);
    if (nextPieceId !== 'rook') {
      setSource('production');
      setDirection('south');
      params.set('source', 'production');
      params.set('direction', 'south');
    } else if (source === 'production') {
      setSource('blender-render-v4-calibrated');
      params.set('source', 'blender-render-v4-calibrated');
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  const selectSource = (nextSource: UnitSourceId) => {
    setSource(nextSource);
    if (nextSource === 'production') setDirection('south');
    const params = new URLSearchParams(window.location.search);
    params.set('source', nextSource);
    params.set('direction', nextSource === 'production' ? 'south' : direction);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  const selectDirection = (nextDirection: Direction) => {
    setDirection(nextDirection);
    const params = new URLSearchParams(window.location.search);
    params.set('direction', nextDirection);
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
            <h1>{selectedPiece.label}</h1>
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
          <h2>Unit Library</h2>
          {unitPieces.map((piece) => (
            <button
              type="button"
              className={piece.id === selectedPiece.id ? 'is-active' : ''}
              key={piece.id}
              onClick={() => selectPiece(piece.id)}
            >
              <img src={previewFor(piece.id)} alt="" draggable={false} />
              <span>
                <strong>{piece.label}</strong>
                <em>{piece.id === 'rook' ? '8 directions · Blender v4' : 'south concept sprite'}</em>
              </span>
            </button>
          ))}
        </aside>

        <section className="unit-studio-main" aria-label="Selected unit">
          <div className="unit-studio-panel-head">
            <div>
              <p>Tile View</p>
              <h2>{selectedPiece.label} on {selectedTile.label}</h2>
            </div>
            <span>{hasEightDirections ? `${rookDirectionLabel[direction]} facing · ${normalizedSource}` : 'south facing · production'}</span>
          </div>

          <div className="unit-studio-workbench">
            <section className="unit-studio-art-frame" aria-label={`${selectedPiece.label} on ${selectedTile.label} tile`}>
              <div className="unit-studio-tile-stack" style={unitPlacementStyle}>
                <img className="unit-studio-context-tile" src={selectedTile.src} alt={`${selectedTile.label} tile`} draggable={false} />
                {unitVisible ? (
                  <img
                    className={`unit-studio-unit-preview is-${selectedPiece.id}`}
                    src={selectedSprite}
                    alt={`${factionLabels[faction]} ${selectedPiece.label.toLowerCase()} on ${selectedTile.label.toLowerCase()} tile`}
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
              <div className="unit-studio-control-group" aria-label="Asset source">
                <strong>Source</strong>
                {sourceOptions.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={normalizedSource === item.id ? 'is-active' : ''}
                    onClick={() => selectSource(item.id)}
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
                      className={direction === item ? 'is-active' : ''}
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
                      disabled={normalizedSource !== 'production'}
                      onClick={() => setFaction(item)}
                    >
                      {factionLabels[item]}
                    </button>
                  ))}
                </div>
              </div>
              <dl>
                <div><dt>Piece</dt><dd>{selectedPiece.label}</dd></div>
                <div><dt>Source</dt><dd>{sourceOptions.find((item) => item.id === normalizedSource)?.label}</dd></div>
                <div><dt>Facing</dt><dd>{hasEightDirections ? rookDirectionLabel[direction] : 'South'}</dd></div>
                <div><dt>Read</dt><dd>{selectedPiece.read}</dd></div>
              </dl>
            </aside>
          </div>

          {selectedPiece.id === 'rook' ? (
            <section className="unit-studio-rook-comparison" aria-label="Rook direction comparison">
              <div className="unit-studio-panel-head">
                <div>
                  <p>Rook Direction Sheet</p>
                  <h2>Rotation Candidates</h2>
                </div>
                <span>Blender v4 calibrated is the current default</span>
              </div>
              {rookComparisonSets.map((set) => (
                <div className="unit-studio-direction-set" key={set.id}>
                  <div>
                    <strong>{set.label}</strong>
                    <span>{set.note}</span>
                  </div>
                  <div className="unit-studio-direction-grid">
                    {rookDirections.map((item) => (
                      <button
                        type="button"
                        key={`${set.id}-${item}`}
                        className={normalizedSource === set.id && direction === item ? 'is-active' : ''}
                        onClick={() => {
                          selectSource(set.id as UnitSourceId);
                          selectDirection(item);
                        }}
                      >
                        <span>{rookDirectionLabel[item]}</span>
                        <img src={set.path(item)} alt={`${set.label} rook ${item}`} draggable={false} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ) : (
            <section className="unit-studio-concept-reference" aria-label="Accepted concept reference">
              <img src={selectedPiece.concept} alt={`Accepted ${selectedPiece.label} concept reference`} draggable={false} />
              <p>Accepted concept remains the art-direction source; the tile view is the current scale and readability test.</p>
            </section>
          )}
        </section>
      </section>
    </main>
  );
}
