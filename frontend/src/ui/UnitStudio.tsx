import { useEffect, useState } from 'react';

const pawnConcept = '/assets/units/concepts/pawn-shield-south-concept.png';
const grassTile = '/assets/tiles/canonical-accepted/grass-clean-a.png';
const stoneTile = '/assets/tiles/canonical-accepted/stone-clean-a.png';
const waterTile = '/assets/tiles/canonical-accepted/water-clean-a.png';

type Faction = 'blue' | 'red' | 'neutral';

const factionLabels: Record<Faction, string> = {
  blue: 'Blue',
  red: 'Red',
  neutral: 'Neutral',
};

const boardTiles = [
  grassTile, grassTile, stoneTile, grassTile,
  grassTile, waterTile, grassTile, grassTile,
  stoneTile, grassTile, grassTile, waterTile,
];

export function UnitStudio() {
  const [faction, setFaction] = useState<Faction>('blue');
  const [zoom, setZoom] = useState(1.0);

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('unit-studio-active');
    return () => shell?.classList.remove('unit-studio-active');
  }, []);

  return (
    <main className="unit-studio-page">
      <header className="unit-studio-header">
        <div className="unit-studio-product">
          <strong>Chess Tactics</strong>
          <span>Tactical chess, infinite possibilities.</span>
        </div>
        <div className="unit-studio-title">
          <p>Unit Studio</p>
          <h1>Pawn</h1>
          <span>Shield-forward squad pawn concept.</span>
        </div>
        <nav className="unit-studio-actions" aria-label="Unit studio navigation">
          <a href="/tileset-studio">Tilesets</a>
          <a href="/settings">Settings</a>
        </nav>
      </header>

      <section className="unit-studio-shell" aria-label="Unit art workbench">
        <aside className="unit-studio-rail" aria-label="Unit library">
          <h2>Unit Library</h2>
          <button type="button" className="is-active">
            <img src={pawnConcept} alt="" draggable={false} />
            <span>
              <strong>Pawn</strong>
              <em>1 concept · south</em>
            </span>
          </button>
          {['Rook', 'Knight', 'Bishop', 'Queen', 'King'].map((piece) => (
            <button type="button" disabled key={piece}>
              <span>
                <strong>{piece}</strong>
                <em>not started</em>
              </span>
            </button>
          ))}
        </aside>

        <section className="unit-studio-main" aria-label="Selected unit">
          <div className="unit-studio-panel-head">
            <div>
              <p>Accepted Concept</p>
              <h2>Shield Pawn South</h2>
            </div>
            <label className="unit-studio-zoom">
              <span>Zoom</span>
              <input
                type="range"
                min="0.7"
                max="1.8"
                step="0.05"
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="unit-studio-focus-grid">
            <section className="unit-studio-art-frame" aria-label="Pawn concept art">
              <img
                className={`unit-studio-pawn-preview is-${faction}`}
                src={pawnConcept}
                alt="South-facing pawn concept with shield"
                draggable={false}
                style={{ transform: `scale(${zoom})` }}
              />
            </section>

            <section className="unit-studio-detail" aria-label="Unit details">
              <h3>Direction Lock</h3>
              <dl>
                <div><dt>Piece</dt><dd>Pawn</dd></div>
                <div><dt>Facing</dt><dd>South</dd></div>
                <div><dt>Orientation</dt><dd>Physical shield</dd></div>
                <div><dt>Read</dt><dd>Chess piece first</dd></div>
                <div><dt>State</dt><dd>Concept accepted</dd></div>
              </dl>
              <div className="unit-studio-factions" aria-label="Faction preview">
                {(Object.keys(factionLabels) as Faction[]).map((item) => (
                  <button
                    type="button"
                    key={item}
                    className={faction === item ? 'is-active' : ''}
                    onClick={() => setFaction(item)}
                  >
                    {factionLabels[item]}
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section className="unit-studio-board-proof" aria-label="Board scale proof">
            <div className="unit-studio-panel-head">
              <div>
                <p>Board Proof</p>
                <h2>Tile Scale Read</h2>
              </div>
              <span>concept art, not final cutout sprite</span>
            </div>
            <div className="unit-studio-board">
              {boardTiles.map((tile, index) => (
                <div className="unit-studio-board-cell" key={`${tile}-${index}`}>
                  <img src={tile} alt="" draggable={false} />
                  {index === 5 ? (
                    <img
                      className={`unit-studio-board-unit is-${faction}`}
                      src={pawnConcept}
                      alt="Pawn on board"
                      draggable={false}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
