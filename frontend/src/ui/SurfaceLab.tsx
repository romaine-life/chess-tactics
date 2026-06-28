import { useEffect, useState, type ReactElement } from 'react';

// Surface-swap curation: keep the Blender-derived EDGE (codexfilter, perfect iso
// geometry) and drop a separately-generated FLAT top-down surface into the exact
// top-diamond. Each card shows the applied tile + the flat source surface so the
// look can be judged per family. Cards whose PNG is absent hide themselves, so the
// grid auto-fits however many surfaces were composited. Route: /surface-lab?family=…

const FAMILIES = ['grass', 'dirt', 'stone', 'pebble', 'sand', 'water'] as const;
type Family = (typeof FAMILIES)[number];
const MAX_PER_FAMILY = 14;
const DIR = '/assets/tiles/surface-lab';
const baseSrc = (f: Family) => `/assets/tiles/pixel/${f}-codexfilter.png`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Card({ family, n }: { family: Family; n: number }): ReactElement | null {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <div className="sl-card">
      <div className="sl-card-head">{cap(family)} {n + 1}</div>
      <div className="sl-stage sl-stage--tile">
        <img className="sl-px" src={`/assets/tiles/surface/${family}-${n}.png`} alt={`${family} ${n + 1} applied`}
          draggable={false} onError={() => setOk(false)} />
      </div>
      <div className="sl-stage sl-stage--flat">
        <img className="sl-px" src={`${DIR}/${family}-surf-${n}.png`} alt={`${family} ${n + 1} surface`} draggable={false} />
      </div>
      <div className="sl-card-foot">surface ↑ · applied ↑↑</div>
    </div>
  );
}

export function SurfaceLab(): ReactElement {
  const [family, setFamily] = useState<Family>(() => {
    const f = new URLSearchParams(window.location.search).get('family') as Family;
    return FAMILIES.includes(f) ? f : 'stone';
  });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set('family', family);
    window.history.replaceState(window.history.state, '', `${window.location.pathname}?${p.toString()}`);
  }, [family]);

  return (
    <section className="sl">
      <style>{SL_CSS}</style>
      <header className="sl-bar">
        <strong className="sl-name">Surface lab</strong>
        <nav className="sl-tabs">
          {FAMILIES.map((f) => (
            <button key={f} type="button" className={`sl-tab ${f === family ? 'is-active' : ''}`} onClick={() => setFamily(f)}>
              {cap(f)}
            </button>
          ))}
        </nav>
        <span className="sl-hint">Blender edge + generated flat top-down surface, projected into the iso diamond</span>
      </header>

      <div className="sl-grid" key={family}>
        <div className="sl-card sl-card--ref">
          <div className="sl-card-head">edge base</div>
          <div className="sl-stage sl-stage--tile">
            <img className="sl-px" src={baseSrc(family)} alt="edge base" draggable={false} />
          </div>
          <div className="sl-stage sl-stage--flat sl-stage--empty">no surface</div>
          <div className="sl-card-foot">codexfilter top (for contrast)</div>
        </div>
        {Array.from({ length: MAX_PER_FAMILY }, (_, n) => <Card key={`${family}-${n}`} family={family} n={n} />)}
      </div>
    </section>
  );
}

const SL_CSS = `
.sl { position: fixed; inset: 0; z-index: 5; display: flex; flex-direction: column;
  background: #0a0c12; color: #d7e6ff; font-family: var(--ds-font-sans, system-ui, sans-serif); }
.sl-bar { display: flex; align-items: center; gap: 14px; padding: 9px 16px; background: #0d1626; border-bottom: 1px solid #1b2740; }
.sl-name { font-size: 18px; font-weight: 700; color: #eaf3ff; }
.sl-tabs { display: flex; gap: 4px; }
.sl-tab { appearance: none; height: 30px; padding: 0 12px; font-size: 13px; font-family: inherit; cursor: pointer;
  background: #111a2c; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 5px; }
.sl-tab:hover { background: #17223a; }
.sl-tab.is-active { background: #1d3354; border-color: #3f74c0; color: #eaf3ff; }
.sl-hint { margin-left: auto; font-size: 12px; color: #6f86ab; }
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
