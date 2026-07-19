import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { drawableAssets } from '@chess-tactics/board-render';

// Before/after inspector for the PixelLab tile pipeline, as an embedded Studio Viewer kind
// (ADR-0058): board/panes in `.al-lab-main`, controls in the one `.tileset-view-controls`
// panel, workspace tabs + kind selector in the `header` slot — reached from the "Tile
// Pipeline" catalog category's Inspect. Left = the RAW PixelLab tile (native ~33°, crisp);
// right = what correct-iso-tile-angle.py produces (snapped to our ~29° grid). Pure inspector
// (no committed baseline is edited — ADR-0057 does not apply).

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type CompareTile = { id: string; family: string; variant: number; label: string; raw: string; proc: string; rawH: number };
const currentCompareTiles = (): CompareTile[] => drawableAssets('terrain-comparison').map((asset) => {
  const family = asset.behavior.family;
  const variant = asset.behavior.variant;
  const raw = asset.media.raw?.media.immutableUrl;
  const proc = asset.media.processed?.media.immutableUrl;
  if (typeof family !== 'string' || typeof variant !== 'number' || !raw || !proc) throw new Error(`terrain comparison ${asset.id} is incomplete`);
  return { id: asset.id, family, variant, label: asset.label, raw, proc, rawH: asset.media.raw.media.height ?? 175 };
});
export const COMPARE_TILES: CompareTile[] = new Proxy([] as CompareTile[], {
  get: (_target, property) => { const values = currentCompareTiles(); const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; },
});
export const COMPARE_TILE_FAMILIES: readonly string[] = new Proxy([] as string[], {
  get: (_target, property) => { const values = [...new Set(currentCompareTiles().map((tile) => tile.family))]; const value = Reflect.get(values, property); return typeof value === 'function' ? value.bind(values) : value; },
});
export const compareTileCap = cap;

// Canonical block wireframe (our grid) in 96×180 tile coords.
const APEX = '48,41', RT = '96,68', LT = '0,68', FT = '48,95', RB = '96,153', LB = '0,153', FB = '48,180';
const GRID_LINES: [string, string][] = [
  [APEX, RT], [APEX, LT], [RT, FT], [LT, FT], [RT, RB], [LT, LB], [FT, FB], [RB, FB], [LB, FB],
];

function Pane({ label, src, w, h, grid }: { label: string; src: string; w: number; h: number; grid: boolean }): ReactElement {
  return (
    <div className="tc-pane">
      <div className="tc-pane-label">{label}</div>
      <div className="tc-stage">
        <div className="tc-frame" style={{ aspectRatio: `${w} / ${h}` }}>
          <img src={src} alt={label} draggable={false} />
          {grid ? (
            <svg className="tc-grid" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
              {GRID_LINES.map(([a, b], i) => <polyline key={i} points={`${a} ${b}`} />)}
            </svg>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function TileCompareLab({ tileId, onTileId, header }: {
  tileId: string; onTileId: (id: string) => void; header?: ReactNode;
}): ReactElement {
  const [grid, setGrid] = useState(false);
  const idx = Math.max(0, COMPARE_TILES.findIndex((t) => t.id === tileId));
  const tile = COMPARE_TILES[idx];

  // ← → flips through the set (VIEW state; guarded against form fields).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = document.activeElement?.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') onTileId(COMPARE_TILES[(idx + 1) % COMPARE_TILES.length].id);
      if (e.key === 'ArrowLeft') onTileId(COMPARE_TILES[(idx - 1 + COMPARE_TILES.length) % COMPARE_TILES.length].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, onTileId]);

  return (
    <>
      <style>{TC_CSS}</style>
      <section className="al-lab-main" aria-label="Tile pipeline compare">
        <div className="tc-panes">
          <Pane label="RAW — PixelLab native (crisp, ~33°)" src={tile.raw} w={96} h={tile.rawH} grid={grid} />
          <Pane label="PROCESSED — snapped to our grid (~29°)" src={tile.proc} w={96} h={180} grid={grid} />
        </div>
      </section>

      <aside className="tileset-view-controls" aria-label="Tile pipeline controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <label className="tileset-category-select" title="Which pipeline tile you're comparing.">
              <span>Tile</span>
              <select value={tile.id} onChange={(e) => onTileId(e.target.value)} aria-label="Tile">
                {COMPARE_TILE_FAMILIES.map((f) => (
                  <optgroup key={f} label={cap(f)}>
                    {COMPARE_TILES.map((t) => (t.family === f ? <option key={t.id} value={t.id}>{t.label}</option> : null))}
                  </optgroup>
                ))}
              </select>
            </label>
            <div className="tc-toggles">
              <button type="button" className={`tc-toggle ${grid ? 'is-on' : ''}`} onClick={() => setGrid((v) => !v)}>Grid overlay</button>
            </div>
            <dl className="tc-meta">
              <div><dt>Tile</dt><dd>{tile.label}</dd></div>
              <div><dt>Id</dt><dd><code>{tile.id}</code></dd></div>
              <div><dt>Index</dt><dd>{idx + 1} / {COMPARE_TILES.length}</dd></div>
            </dl>
            <p className="tc-note">Left is the raw PixelLab tile (~33°); right is snapped to our grid (~29°). ← → to flip.</p>
          </div>
        </section>
      </aside>
    </>
  );
}

const TC_CSS = `
.tc-panes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; min-height: 66vh; align-self: stretch; }
.tc-pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid #18233a; border-radius: 6px; overflow: hidden; }
.tc-pane-label { padding: 8px 12px; font-size: 12px; letter-spacing: .04em; color: #9fd8ff; background: #0b1322; border-bottom: 1px solid #18233a; }
.tc-stage { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 18px;
  background-color: #14181f;
  background-image: linear-gradient(45deg, #1b212b 25%, transparent 25%), linear-gradient(-45deg, #1b212b 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #1b212b 75%), linear-gradient(-45deg, transparent 75%, #1b212b 75%);
  background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0; }
.tc-frame { position: relative; height: min(60vh, 640px); }
.tc-frame img { height: 100%; width: 100%; object-fit: contain; display: block; image-rendering: pixelated; }
.tc-grid { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.tc-grid polyline { fill: none; stroke: #38e07b; stroke-width: 1; vector-effect: non-scaling-stroke; opacity: .85; }
.tc-toggles { display: flex; gap: 6px; }
.tc-toggle { box-sizing: border-box; height: 30px; padding: 0 12px; font: inherit; font-size: 13px; cursor: pointer;
  background: #111a2c; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 5px; }
.tc-toggle:hover { background: #17223a; }
.tc-toggle.is-on { background: #1d3354; border-color: #3f74c0; color: #eaf3ff; }
.tc-meta { display: grid; gap: 6px; margin: 0; }
.tc-meta div { display: grid; grid-template-columns: 60px 1fr; gap: 8px; align-items: baseline; }
.tc-meta dt { color: #72bde8; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
.tc-meta dd { margin: 0; font-size: 13px; color: #d7e6ff; }
.tc-meta code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; color: #7fd4ff; }
.tc-note { margin: 0; font-size: 12px; color: #8197ad; line-height: 1.45; }
`;
