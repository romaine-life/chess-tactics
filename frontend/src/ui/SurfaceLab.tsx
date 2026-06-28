import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { tileAssets, tileFamilies, type TileAsset } from '../art/tileset';
import { generateSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard } from '../render/BoardLabBoard';

// Surface-swap curation + seam-treatment review. Keep the Blender-derived EDGE
// (codexfilter) and drop a flat top-down PixelLab surface into the top diamond.
// The seam toggle re-skins the top↔edge seam (Current / rim+lip / palette-tied / both)
// across BOTH a per-tile grid and a real generated BOARD (rendered through the game's
// own BoardLabBoard, so seating/tessellation matches the live game). The board's tile
// srcs are remapped to the chosen treatment at render time. Route: /surface-lab.

const FAMILIES = ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'] as const;
type Family = (typeof FAMILIES)[number];
const MAX_PER_FAMILY = 14;
const baseSrc = (f: Family) => `/assets/tiles/pixel/${f}-codexfilter.png`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const TREATMENTS = [
  { key: 'v0', label: 'Current' },
  { key: 'vA', label: 'Rim + lip' },
  { key: 'vC', label: 'Palette side' },
  { key: 'vAC', label: 'Both' },
] as const;
type Treat = (typeof TREATMENTS)[number]['key'];

// v0 (current) is the live production tile; the others are scratch seam mockups
// at /assets/tiles/seam-lab/<fam>-<n>-<treat>.png.
const treatedSrc = (src: string, treat: Treat): string => {
  if (treat === 'v0') return src;
  const m = src.match(/\/assets\/tiles\/surface\/([a-z]+)-(\d+)\.png$/);
  return m ? `/assets/tiles/seam-lab/${m[1]}-${m[2]}-${treat}.png` : src;
};
const appliedSrc = (f: Family, n: number, t: Treat) => treatedSrc(`/assets/tiles/surface/${f}-${n}.png`, t);

function Card({ family, n, treat }: { family: Family; n: number; treat: Treat }): ReactElement | null {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <div className="sl-card">
      <div className="sl-card-head">{cap(family)} {n + 1}</div>
      <div className="sl-stage sl-stage--tile">
        <img className="sl-px" src={appliedSrc(family, n, treat)} alt={`${family} ${n + 1}`}
          draggable={false} onError={() => setOk(false)} />
      </div>
      <div className="sl-stage sl-stage--flat">
        <img className="sl-px" src={`/assets/tiles/surface-lab/${family}-surf-${n}.png`} alt={`${family} ${n + 1} surface`} draggable={false} />
      </div>
      <div className="sl-card-foot">surface ↑ · applied ↑↑</div>
    </div>
  );
}

export function SurfaceLab(): ReactElement {
  const params = new URLSearchParams(window.location.search);
  const [view, setView] = useState<'board' | 'tiles'>(() => (params.get('view') === 'tiles' ? 'tiles' : 'board'));
  const [family, setFamily] = useState<Family>(() => {
    const f = params.get('family') as Family;
    return FAMILIES.includes(f) ? f : 'grass';
  });
  const [treat, setTreat] = useState<Treat>(() => {
    const t = params.get('treat') as Treat;
    return TREATMENTS.some((x) => x.key === t) ? t : 'v0';
  });
  const [seed, setSeed] = useState(7);
  const [zoom, setZoom] = useState(1.1);
  const [crisp, setCrisp] = useState(() => params.get('render') === 'crisp');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set('view', view); p.set('family', family); p.set('treat', treat); p.set('render', crisp ? 'crisp' : 'smooth');
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${p.toString()}`);
  }, [view, family, treat, crisp]);

  const board = useMemo(
    () => generateSocketBoard({ assets: tileAssets as readonly TileAsset[], seed, columns: 11, rows: 9, familyAssets: tileFamilies }),
    [seed],
  );

  return (
    <section className="sl">
      <style>{SL_CSS}</style>
      <header className="sl-bar">
        <strong className="sl-name">Surface lab</strong>
        <div className="sl-seg">
          <button type="button" className={`sl-tab ${view === 'board' ? 'is-active' : ''}`} onClick={() => setView('board')}>Board</button>
          <button type="button" className={`sl-tab ${view === 'tiles' ? 'is-active' : ''}`} onClick={() => setView('tiles')}>Tiles</button>
        </div>
        {view === 'tiles' ? (
          <nav className="sl-tabs">
            {FAMILIES.map((f) => (
              <button key={f} type="button" className={`sl-tab ${f === family ? 'is-active' : ''}`} onClick={() => setFamily(f)}>{cap(f)}</button>
            ))}
          </nav>
        ) : (
          <div className="sl-seg">
            <button type="button" className="sl-tab" onClick={() => setSeed((s) => (s % 9999) + 1)}>↻ Re-roll</button>
            <button type="button" className="sl-tab" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}>−</button>
            <button type="button" className="sl-tab" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}>+</button>
            <span className="sl-treat-label" style={{ marginLeft: 8 }}>render:</span>
            <button type="button" className={`sl-tab ${!crisp ? 'is-active' : ''}`} onClick={() => setCrisp(false)}>Smooth</button>
            <button type="button" className={`sl-tab ${crisp ? 'is-active' : ''}`} onClick={() => setCrisp(true)}>Crisp</button>
          </div>
        )}
        <div className="sl-treat">
          <span className="sl-treat-label">seam:</span>
          {TREATMENTS.map((t) => (
            <button key={t.key} type="button" className={`sl-tab sl-tab--treat ${t.key === treat ? 'is-active' : ''}`} onClick={() => setTreat(t.key)}>{t.label}</button>
          ))}
        </div>
      </header>

      {view === 'board' ? (
        <div className={`sl-board ${crisp ? 'is-crisp' : ''}`}>
          <BoardLabBoard board={board} assetFrameSrc={(a) => treatedSrc(a.src, treat)} boardZoom={zoom} ariaLabel="Seam treatment board preview" />
        </div>
      ) : (
        <div className="sl-grid" key={family}>
          <div className="sl-card sl-card--ref">
            <div className="sl-card-head">edge base</div>
            <div className="sl-stage sl-stage--tile">
              <img className="sl-px" src={baseSrc(family)} alt="edge base" draggable={false} />
            </div>
            <div className="sl-stage sl-stage--flat sl-stage--empty">no surface</div>
            <div className="sl-card-foot">codexfilter top (for contrast)</div>
          </div>
          {Array.from({ length: MAX_PER_FAMILY }, (_, n) => <Card key={`${family}-${n}`} family={family} n={n} treat={treat} />)}
        </div>
      )}
    </section>
  );
}

const SL_CSS = `
.sl { position: fixed; inset: 0; z-index: 5; display: flex; flex-direction: column;
  background: #0a0c12; color: #d7e6ff; font-family: var(--ds-font-sans, system-ui, sans-serif); }
.sl-bar { display: flex; align-items: center; gap: 12px; padding: 9px 16px; background: #0d1626; border-bottom: 1px solid #1b2740; flex-wrap: wrap; }
.sl-name { font-size: 18px; font-weight: 700; color: #eaf3ff; }
.sl-seg, .sl-tabs { display: flex; gap: 4px; }
.sl-treat { display: flex; gap: 4px; align-items: center; margin-left: auto; }
.sl-treat-label { font-size: 12px; color: #6f86ab; margin-right: 2px; }
.sl-tab { appearance: none; height: 30px; padding: 0 12px; font-size: 13px; font-family: inherit; cursor: pointer;
  background: #111a2c; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 5px; }
.sl-tab:hover { background: #17223a; }
.sl-tab.is-active { background: #1d3354; border-color: #3f74c0; color: #eaf3ff; }
.sl-tab--treat.is-active { background: #2a2150; border-color: #6b56c0; }
.sl-board { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden;
  background:
    radial-gradient(120% 90% at 50% 18%, #16202f 0%, #0b1018 70%); }
.sl-board.is-crisp .tileset-generated-board-tile img { image-rendering: pixelated; }
.sl-grid { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; align-content: start; }
.sl-card { display: flex; flex-direction: column; gap: 8px;
  background: #0c1322; border: 1px solid #1b2740; border-radius: 8px; padding: 10px; }
.sl-card--ref { background: #0b1a16; border-color: #1d3a30; }
.sl-card-head { text-align: center; font-size: 13px; font-weight: 600; color: #9fd8ff; letter-spacing: .03em; }
.sl-card-foot { text-align: center; font-size: 10px; color: #5f769b; }
.sl-stage { display: flex; align-items: center; justify-content: center; border-radius: 6px;
  background-color: #14181f;
  background-image: linear-gradient(45deg, #1b212b 25%, transparent 25%), linear-gradient(-45deg, #1b212b 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #1b212b 75%), linear-gradient(-45deg, transparent 75%, #1b212b 75%);
  background-size: 16px 16px; background-position: 0 0, 0 8px, 8px -8px, -8px 0; }
.sl-stage--tile { padding: 6px; height: 190px; }
.sl-stage--tile .sl-px { height: 100%; }
.sl-stage--flat { padding: 6px; height: 92px; }
.sl-stage--flat .sl-px { height: 100%; }
.sl-stage--empty { color: #4f6688; font-size: 12px; }
.sl-px { width: auto; object-fit: contain; display: block; image-rendering: pixelated; }
`;
