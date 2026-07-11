import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { tileAssets, tileFamilies, edgeTiles, muralTiles, edgeFeatures, type TileAsset } from '../art/tileset';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard } from '../render/BoardLabBoard';
import { ViewPane } from './shared/ViewPane';

// Inspector for the production surface-swap BOARD tileset (Blender edge + flat PixelLab top;
// scripts/build-surface-tiles.py, ADR-0040/0075) as an embedded Studio Viewer kind (ADR-0058).
// NOTE: distinct from the `surface` viewer kind, which is UI background-panel textures — these
// are the iso board tiles under /assets/tiles/surface/. Board/grid in `.al-lab-main`, every
// control in the one `.tileset-view-controls` panel, reached from the Tileset Surfaces catalog.
// Pure inspector — nothing committed is edited (ADR-0057 N/A).

export const SURFACE_TILE_FAMILIES = ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'] as const;
type Family = (typeof SURFACE_TILE_FAMILIES)[number];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const surfaceTileCap = cap;
const isFamily = (f: string): f is Family => (SURFACE_TILE_FAMILIES as readonly string[]).includes(f);

function Card({ family, asset, n }: { family: Family; asset: TileAsset; n: number }): ReactElement {
  return (
    <div className="stl-card">
      <div className="stl-card-head">{cap(family)} {n + 1}</div>
      <div className="stl-stage stl-stage--tile">
        <span className="stl-layer-stack" aria-label={`${family} ${n + 1} composed top and side`}>
          {asset.sideSrc ? <img className="stl-px" src={asset.sideSrc} alt="" draggable={false} /> : null}
          {asset.topSrc ? <img className="stl-px" src={asset.topSrc} alt="" draggable={false} /> : null}
        </span>
      </div>
      <div className="stl-stage stl-stage--flat">
        <img className="stl-px" src={`/assets/tiles/surface-lab/${family}-surf-${n}.png`} alt={`${family} ${n + 1} surface`} draggable={false} />
      </div>
      <div className="stl-card-foot">material source ↑ · explicit side + top ↑↑</div>
    </div>
  );
}

export function SurfaceTilesLab({ family, onFamily, header }: {
  family: string; onFamily: (f: string) => void; header?: ReactNode;
}): ReactElement {
  const fam: Family = isFamily(family) ? family : 'grass';
  const [view, setView] = useState<'board' | 'tiles'>('board');
  const [seed, setSeed] = useState(7);
  const [zoom, setZoom] = useState(1.1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [crisp, setCrisp] = useState(true);
  // Story features are PARKED (ADR-0041) — default OFF so the board shows the continuity mural.
  const [story, setStory] = useState(false);

  const COLS = 11;
  const ROWS = 9;
  const board = useMemo(
    () => solveSocketBoard({
      assets: tileAssets as readonly TileAsset[],
      terrainMap: Array.from({ length: COLS * ROWS }, () => fam),
      seed,
      columns: COLS,
      rows: ROWS,
      familyAssets: tileFamilies,
      edgeAssets: edgeTiles,
      muralEdges: muralTiles,
      edgeFeatures: story ? edgeFeatures : undefined,
    }),
    [fam, seed, story],
  );

  return (
    <>
      <style>{STL_CSS}</style>
      <section className={`al-lab-main ${view === 'board' ? 'stl-board-main' : ''}`.trim()} aria-label="Surface tileset preview">
        {view === 'board' ? (
          <ViewPane kind="board" ariaLabel="Surface tileset viewport" zoom={zoom} pan={pan} minZoom={0.5} maxZoom={3} onZoomChange={setZoom} onPanChange={setPan}>
            <BoardLabBoard board={board} boardZoom={zoom} boardPan={pan}
              className={`stl-board-surface ${crisp ? 'is-crisp' : ''}`} ariaLabel="Surface tileset board preview" />
          </ViewPane>
        ) : (
          <div className="stl-grid" key={fam}>
            {tileFamilies[fam]
              .filter((asset) => asset.kind === 'tile')
              .map((asset, n) => <Card key={asset.id} family={fam} asset={asset} n={n} />)}
          </div>
        )}
      </section>

      <aside className="tileset-view-controls" aria-label="Surface tileset controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <label className="tileset-category-select" title="Which terrain family's tiles you're inspecting.">
              <span>Family</span>
              <select value={fam} onChange={(e) => onFamily(e.target.value)} aria-label="Family">
                {SURFACE_TILE_FAMILIES.map((f) => <option key={f} value={f}>{cap(f)}</option>)}
              </select>
            </label>
            <div className="stl-seg" role="group" aria-label="View">
              <button type="button" className={`stl-toggle ${view === 'board' ? 'is-on' : ''}`} onClick={() => setView('board')}>Board</button>
              <button type="button" className={`stl-toggle ${view === 'tiles' ? 'is-on' : ''}`} onClick={() => setView('tiles')}>Tiles</button>
            </div>
            {view === 'board' ? (
              <>
                <label className="tileset-catalog-zoom">
                  <span>Zoom</span>
                  <input type="range" min={0.5} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
                </label>
                <div className="stl-toggles">
                  <button type="button" className="stl-toggle" onClick={() => setSeed((s) => (s % 9999) + 1)} title="Re-roll the board tiles">↻ Re-roll</button>
                  <button type="button" className={`stl-toggle ${crisp ? 'is-on' : ''}`} onClick={() => setCrisp((v) => !v)} title="Nearest-neighbour (pixelated) vs smooth">Crisp</button>
                  <button type="button" className={`stl-toggle ${story ? 'is-on' : ''}`} onClick={() => setStory((v) => !v)} title="Parked story edge-features (ADR-0041)">Story</button>
                </div>
              </>
            ) : (
              <p className="stl-note">Each card composes the production side and top layers, then shows the flat material source beneath them.</p>
            )}
          </div>
        </section>
      </aside>
    </>
  );
}

const STL_CSS = `
/* Board view fills the pane and uses the shared ViewPane (pan/zoom/fit) — same as the skirmish
   board, so it pans and never clips. */
.stl-board-main { padding: 0; grid-template-rows: minmax(0, 1fr); align-content: stretch; overflow: hidden; }
.stl-board-surface.is-crisp .tileset-generated-board-tile img { image-rendering: pixelated; }
.stl-grid { align-self: stretch; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; align-content: start; }
.stl-card { display: flex; flex-direction: column; gap: 8px; background: #0c1322; border: 1px solid #1b2740; border-radius: 8px; padding: 10px; }
.stl-card-head { text-align: center; font-size: 13px; font-weight: 600; color: #9fd8ff; letter-spacing: .03em; }
.stl-card-foot { text-align: center; font-size: 10px; color: #5f769b; }
.stl-stage { display: flex; align-items: center; justify-content: center; border-radius: 6px;
  background-color: #14181f;
  background-image: linear-gradient(45deg, #1b212b 25%, transparent 25%), linear-gradient(-45deg, #1b212b 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #1b212b 75%), linear-gradient(-45deg, transparent 75%, #1b212b 75%);
  background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0; }
.stl-stage--tile { padding: 6px; height: 190px; }
.stl-layer-stack { position: relative; display: block; width: 96px; height: 180px; }
.stl-layer-stack .stl-px { position: absolute; inset: 0; width: 100%; height: 100%; }
.stl-stage--flat { padding: 6px; height: 92px; }
.stl-stage--flat .stl-px { height: 100%; }
.stl-px { width: auto; object-fit: contain; display: block; image-rendering: pixelated; }
.stl-seg { display: flex; gap: 6px; }
.stl-toggles { display: flex; flex-wrap: wrap; gap: 6px; }
.stl-toggle { box-sizing: border-box; height: 30px; padding: 0 12px; font: inherit; font-size: 13px; cursor: pointer;
  background: #111a2c; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 5px; }
.stl-toggle:hover { background: #17223a; }
.stl-toggle.is-on { background: #1d3354; border-color: #3f74c0; color: #eaf3ff; }
.stl-note { margin: 0; font-size: 12px; color: #8197ad; line-height: 1.45; }
`;
