// Divider viewer — the interactive, inspectable Studio surface for the section-divider /
// 3-way junction (ADR-0063), modeled on the 9-slice viewer (NineSliceEditor). It renders the
// COMPLETE assembled asset — a real panel.png frame (its 4 corner atoms) split by N dividers —
// and gives the 9-slice bench's shape of controls (±/reset/range sliders, a backing selector,
// an inspect readout), plus pan/zoom via the shared ViewPane. A read-only Viewer kind reached
// from the divider's asset card (ADR-0058), not a bespoke route.
//
// The junction is drawn as ONLY the gold ornament — NOT the atom's own vertical rail (the PANEL
// draws the side rail) and NOT the horizontal branch (the divider bar draws that). Re-drawing
// either doubled the rail. `Reach` controls how far the branch + junctions extend toward the rail.
//
// TWO junction sources (compare-in-place):
//   • corner — DERIVED from the kit's own corner atom: its gold fillet mirrored above+below the
//     branch (the "two corners butted along a straight edge" / collapsed-box-border model),
//     symmetric, with an optional flair toggle to drop the 90°-turn arm + nub. Its scale is LOCKED
//     to the panel's frame scale (frameWidth/24), so the gold matches the pipe width by
//     construction — it can't "break" when made small like a big ornament scaled down does.
//   • codex — the standalone codex-forged ornament (cand3-codex.png), free-scaled by Junction size.
import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { SURFACE_ASSETS } from './surfaceCatalog';
import { ViewPane } from './shared/ViewPane';

const CODEX_URL = '/assets/ui/kit/dividers/codex-ornament.png'; // live semantic slot; source: codex
const ATOM_URL = '/assets/ui/kit/atoms/corner-t.png';  // the authored 3-way T atom (source: atom)
const PANEL = '/assets/ui/kit/panel.png';
const PANEL_LINE = '/assets/ui/explore/frames/panel-line.png';
const PANEL_W = 420;
const MAXREACH = 56;       // how far a strip may extend past the panel content on each side (canvas room)

type Backing = 'none' | 'fill' | 'surface';
type Source = 'atom' | 'codex';
type Cfg = { frameWidth: number; reach: number; dividerH: number; scale: number; count: number; backing: Backing; source: Source; jx: number; jy: number };
const DEFAULT: Cfg = { frameWidth: 16, reach: 14, dividerH: 34, scale: 1, count: 3, backing: 'fill', source: 'atom', jx: 0, jy: 0 };
const KEY = 'divider-viewer-v3';

// A gold-only sprite for one junction end, plus where its through-rail column and branch row sit
// (in the sprite's OWN pixels) so the strip can seat it against the bar.
type Layer = { canvas: HTMLCanvasElement; branch: number; railCol: number };
type Atom = { codexImg: HTMLImageElement; codex: Layer; atom: Layer };

const loadImg = (src: string): Promise<HTMLImageElement> => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

// The standalone codex ornament → gold-only layer. branch = vertical middle of the rows opaque near
// the right edge (the branch tees right); railCol = the through-rail column (first opaque col, row 0).
function buildCodexLayer(img: HTMLImageElement): Layer {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height).data;
  const A = (x: number, y: number) => d[(y * img.width + x) * 4 + 3];
  const xc = Math.floor(img.width * 0.7); let top = -1, bot = -1;
  for (let y = 0; y < img.height; y++) { let on = false; for (let x = xc; x < img.width; x++) if (A(x, y) > 40) { on = true; break; } if (on) { if (top < 0) top = y; bot = y; } }
  const branch = top < 0 ? img.height / 2 : (top + bot) / 2;
  let railCol = Math.floor(img.width * 0.35);
  for (let x = 0; x < img.width; x++) if (A(x, 0) > 40) { railCol = x; break; }
  const gc = document.createElement('canvas'); gc.width = img.width; gc.height = img.height;
  const gg = gc.getContext('2d')!; const gd = gg.createImageData(img.width, img.height);
  for (let i = 0; i < d.length; i += 4) { const r = d[i], b = d[i + 2], a = d[i + 3]; if (a > 40 && r > b + 15) { gd.data[i] = r; gd.data[i + 1] = d[i + 1]; gd.data[i + 2] = b; gd.data[i + 3] = a; } }
  gg.putImageData(gd, 0, 0);
  return { canvas: gc, branch, railCol };
}

// The authored 3-way atom (corner-t.png) is gold-only: a vertical spine (the through-rail direction)
// with the branch teeing to the right, drawn symmetric about the branch. We crop to the drawn pixels,
// find the branch row (centre of the widest opaque run) and anchor the spine at the left edge, and
// hand back a Layer the strip mirrors left/right and locks to the frame scale. No derivation — the
// atom is used exactly as authored; the panel supplies the steel rail, the bar supplies the branch.
function buildAtomLayer(img: HTMLImageElement): Layer {
  const w = img.width, h = img.height;
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  const sg = src.getContext('2d')!; sg.drawImage(img, 0, 0);
  const d = sg.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => d[(y * w + x) * 4 + 3] > 40;
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxX < 0) return { canvas: src, branch: h / 2, railCol: 0 };
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const out = document.createElement('canvas'); out.width = cw; out.height = ch;
  out.getContext('2d')!.drawImage(src, minX, minY, cw, ch, 0, 0, cw, ch);
  // branch row = centre of the widest opaque run (the tee arm); railCol = spine's left edge (0 cropped)
  let mw = 0; const rowW: number[] = new Array(ch).fill(0);
  for (let y = 0; y < ch; y++) { let a = -1, b = -1; for (let x = 0; x < cw; x++) if (on(minX + x, minY + y)) { if (a < 0) a = x; b = x; } rowW[y] = a < 0 ? 0 : b - a + 1; if (rowW[y] > mw) mw = rowW[y]; }
  let sum = 0, n = 0; for (let y = 0; y < ch; y++) if (rowW[y] >= mw - 1) { sum += y; n++; }
  return { canvas: out, branch: n ? sum / n : ch / 2, railCol: 0 };
}

async function loadAtom(): Promise<Atom> {
  const [codexImg, atomImg] = await Promise.all([loadImg(CODEX_URL), loadImg(ATOM_URL)]);
  return { codexImg, codex: buildCodexLayer(codexImg), atom: buildAtomLayer(atomImg) };
}

// One divider strip. The branch RAIL is a DOM element rendered from panel-line's own rail via the
// SAME border-image at the SAME border scale the panel uses — so it is pixel-identical to the panel's
// rail. The GOLD junction (the selected `layer`, no steel) is a canvas overlay at each end, drawn at
// `scale`. `reach` sets how far the branch + junctions extend toward the side rail; jx/jy nudge the T.
function DividerStrip({ layer, scale, innerW, cfg }: { layer: Layer; scale: number; innerW: number; cfg: Cfg }): ReactElement {
  const gL = useRef<HTMLCanvasElement>(null), gR = useRef<HTMLCanvasElement>(null);
  const gw = Math.max(1, Math.round(layer.canvas.width * scale)), gh = Math.max(1, Math.round(layer.canvas.height * scale));
  useEffect(() => {
    for (const [ref, flip] of [[gL, false], [gR, true]] as const) {
      const c = ref.current; if (!c) continue;
      c.width = gw; c.height = gh;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; g.clearRect(0, 0, gw, gh);
      g.save(); if (flip) { g.translate(gw, 0); g.scale(-1, 1); }
      g.drawImage(layer.canvas, 0, 0, layer.canvas.width, layer.canvas.height, 0, 0, gw, gh); g.restore();
    }
  }, [layer, gw, gh]);
  const width = innerW + 2 * MAXREACH, mid = cfg.dividerH / 2;
  const barL = MAXREACH - cfg.reach, barR = MAXREACH + innerW + cfg.reach;
  // The junction (T) is nudged relative to the bar by cfg.jx/jy — the bar rail and the sprite's
  // branch row rarely coincide to the pixel, so these let the user seat the T over the bar.
  const goldTop = Math.round(mid - layer.branch * scale + cfg.jy), rc = layer.railCol * scale;
  return (
    <div data-testid="divider-strip" style={{ position: 'relative', width: `${width}px`, height: `${cfg.dividerH}px`, margin: `7px ${-MAXREACH}px` }}>
      {/* branch = panel-line's rail via border-image at the panel's OWN border scale → pixel-identical */}
      <div style={{ position: 'absolute', left: `${barL}px`, width: `${barR - barL}px`, top: `${mid - cfg.frameWidth / 24}px`, height: 0, borderTop: `${cfg.frameWidth}px solid transparent`, borderImageSource: `url("${PANEL_LINE}")`, borderImageSlice: '24', borderImageWidth: `${cfg.frameWidth}px 0 0 0`, borderImageRepeat: 'round', imageRendering: 'pixelated', boxSizing: 'border-box' }} />
      <canvas ref={gL} style={{ position: 'absolute', left: `${Math.round(barL - rc + cfg.jx)}px`, top: `${goldTop}px`, width: `${gw}px`, height: `${gh}px`, imageRendering: 'pixelated' }} />
      <canvas ref={gR} style={{ position: 'absolute', left: `${Math.round(barR + rc - gw - cfg.jx)}px`, top: `${goldTop}px`, width: `${gw}px`, height: `${gh}px`, imageRendering: 'pixelated' }} />
    </div>
  );
}

// A labeled tuner row (±, value, reset) + range, matching the 9-slice bench. MODULE-LEVEL and
// stable — defining it inside the render remounts the <input> on every drag tick, breaking dragging.
function Slider({ label, value, min, max, step = 1, unit = 'px', def, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; def: number; onChange: (v: number) => void }): ReactElement {
  const q = (v: number) => Number(v.toFixed(2));
  return (
    <div style={ST.sizeBox}>
      <div style={ST.tunerRow}>
        <span style={{ ...ST.sizeLabel, whiteSpace: 'nowrap' }}>{label}</span>
        <button type="button" style={ST.sb} onClick={() => onChange(Math.max(min, q(value - step)))}>-</button>
        <span style={ST.sizeW}>{step < 1 ? value.toFixed(2) : value}{unit}</span>
        <button type="button" style={ST.sb} onClick={() => onChange(Math.min(max, q(value + step)))}>+</button>
        <button type="button" style={ST.sb} title="Reset to default" onClick={() => onChange(def)}>↺</button>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ display: 'block', width: '100%', minWidth: 0, boxSizing: 'border-box' }} aria-label={label} />
    </div>
  );
}

export function DividerLab({ header }: { header?: ReactNode }): ReactElement {
  const [cfg, setCfg] = useState<Cfg>(() => { try { return { ...DEFAULT, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<Cfg>) }; } catch { return DEFAULT; } });
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(cfg)); }, [cfg]);
  const [atom, setAtom] = useState<Atom | null>(null);
  useEffect(() => { let live = true; loadAtom().then((a) => { if (live) setAtom(a); }).catch(() => {}); return () => { live = false; }; }, []);
  const [zoom, setZoom] = useState(2); // integer zoom keeps the pixel-art crisp under nearest-neighbor
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const resetView = () => { setZoom(2); setPan({ x: 0, y: 0 }); };

  const set = (k: keyof Cfg) => (v: number) => setCfg((c) => ({ ...c, [k]: v }));
  const surface = SURFACE_ASSETS[0]?.file;
  const innerW = PANEL_W - 2 * cfg.frameWidth;
  const exportJson = JSON.stringify(cfg, null, 2);

  // Render the junction 1:1 (native pixels), exactly how the real `.kit-divider` draws its cap —
  // `border-image ... 0 24 0 24 / 0 24px` = a 24px slice into a 24px box, no downscale, crisp.
  // Junction size is a plain multiplier on top (keep it integer — 1×/2× — to stay crisp).
  const scale = cfg.scale;
  const layer: Layer | null = atom ? (cfg.source === 'codex' ? atom.codex : atom.atom) : null;

  const panelStyle: CSSProperties = {
    width: PANEL_W, borderStyle: 'solid', borderWidth: cfg.frameWidth, borderColor: 'transparent',
    borderImage: cfg.backing === 'fill' ? `url("${PANEL}") 24 fill / ${cfg.frameWidth}px round` : `url("${PANEL_LINE}") 24 / ${cfg.frameWidth}px round`,
    imageRendering: 'pixelated', color: '#d7e7f4', font: '600 13px "Segoe UI", system-ui, sans-serif',
    backgroundClip: 'border-box', backgroundOrigin: 'border-box',
    background: cfg.backing === 'surface' && surface ? `url("${surface}")` : 'transparent',
  };
  const sections = ['Display', 'Audio', 'Account', 'Advanced', 'About'];
  const rows: ReactElement[] = [];
  for (let i = 0; i < cfg.count + 1; i++) {
    rows.push(<div key={`s${i}`} style={{ padding: '13px 8px' }}>{sections[i % sections.length]}<br /><small style={{ color: '#8ba9bd', fontWeight: 400 }}>section {i + 1}</small></div>);
    if (i < cfg.count && layer) rows.push(<DividerStrip key={`d${i}`} layer={layer} scale={scale} innerW={innerW} cfg={cfg} />);
  }

  return (
    <>
      <ViewPane kind="board" ariaLabel="Assembled divider preview" zoom={zoom} pan={pan} minZoom={0.4} maxZoom={6} onZoomChange={setZoom} onPanChange={setPan}>
        <div className="tileset-view-board-content is-board" style={{ display: 'grid', placeItems: 'center' }}>
          <div style={{ transform: 'translate(var(--view-pan-x, 0px), var(--view-pan-y, 0px)) scale(var(--view-zoom, 1))', transformOrigin: 'center' }}>
            <div style={panelStyle}>{rows}</div>
          </div>
        </div>
      </ViewPane>
      <aside className="tileset-view-controls" aria-label="Divider controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <p style={ST.hint}>The divider is a junction, not a box — it only reads inside a complete frame. This is the assembled asset: a real panel (4 corner atoms) split by the 3-way divider. The junction draws only its gold; the panel supplies the vertical rail and the bar supplies the branch.</p>
            <div style={ST.sectionHead}>View</div>
            <div style={ST.sizeBox}>
              <div style={ST.tunerRow}>
                <span style={{ ...ST.sizeLabel, whiteSpace: 'nowrap' }}>Zoom</span>
                <button type="button" style={ST.sb} onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))}>-</button>
                <span style={ST.sizeW}>{zoom.toFixed(2)}×</span>
                <button type="button" style={ST.sb} onClick={() => setZoom((z) => Math.min(6, +(z + 0.2).toFixed(2)))}>+</button>
                <button type="button" style={ST.sb} title="Reset view (zoom + pan)" onClick={resetView}>↺</button>
              </div>
              <p style={ST.hint}>Scroll to zoom, drag the stage to pan.</p>
            </div>
            <div style={ST.sectionHead}>Host frame</div>
            <Slider label="Frame width" value={cfg.frameWidth} min={8} max={24} def={DEFAULT.frameWidth} onChange={set('frameWidth')} />
            <div style={ST.pieceRow}>
              {(['none', 'fill', 'surface'] as Backing[]).map((b) => (
                <button key={b} type="button" onClick={() => setCfg((c) => ({ ...c, backing: b }))} style={{ ...ST.pieceBtn, ...(cfg.backing === b ? ST.pieceBtnOn : {}) }}>{b}</button>
              ))}
            </div>
            <div style={ST.sectionHead}>Divider</div>
            <Slider label="Reach → rail" value={cfg.reach} min={-8} max={MAXREACH} def={DEFAULT.reach} onChange={set('reach')} />
            <Slider label="Strip height" value={cfg.dividerH} min={14} max={72} def={DEFAULT.dividerH} onChange={set('dividerH')} />
            <div style={ST.sectionHead}>3-way junction</div>
            <div style={ST.pieceRow}>
              {(['atom', 'codex'] as Source[]).map((s) => (
                <button key={s} type="button" onClick={() => setCfg((c) => ({ ...c, source: s }))} style={{ ...ST.pieceBtn, ...(cfg.source === s ? ST.pieceBtnOn : {}) }}>{s}</button>
              ))}
            </div>
            <p style={ST.hint}>{cfg.source === 'atom' ? 'Authored corner-t.png, used as-is, mirrored left/right and drawn 1:1 (native) — exactly how .kit-divider renders the cap in the app (24px slice → 24px, crisp). Keep size at 1× (or 2×) to stay pixel-crisp.' : 'The standalone codex ornament, free-scaled by Junction size.'}</p>
            <Slider label="Junction size" value={cfg.scale} min={0.5} max={2} step={0.05} unit="×" def={DEFAULT.scale} onChange={set('scale')} />
            <Slider label="Seat ↔ (over bar)" value={cfg.jx} min={-24} max={24} def={DEFAULT.jx} onChange={set('jx')} />
            <Slider label="Align ↕ (to bar)" value={cfg.jy} min={-24} max={24} def={DEFAULT.jy} onChange={set('jy')} />
            <div style={ST.sizeBox}>
              <div style={ST.tunerRow}>
                <span style={{ ...ST.sizeLabel, whiteSpace: 'nowrap' }}>Dividers (N)</span>
                <button type="button" style={ST.sb} onClick={() => set('count')(Math.max(1, cfg.count - 1))}>-</button>
                <span style={ST.sizeW}>{cfg.count}</span>
                <button type="button" style={ST.sb} onClick={() => set('count')(Math.min(5, cfg.count + 1))}>+</button>
                <button type="button" style={ST.sb} title="Reset" onClick={() => set('count')(DEFAULT.count)}>↺</button>
              </div>
            </div>
            <button type="button" style={ST.resetAll} onClick={() => setCfg(DEFAULT)}>↺ Reset all</button>
            <div style={ST.sectionHead}>Export</div>
            <p style={ST.hint}>Your tuned placement — copy this and paste it to me and I'll bake it into the shipped divider.</p>
            <textarea readOnly value={exportJson} style={ST.exportBox} onFocus={(e) => e.currentTarget.select()} aria-label="Divider settings JSON" />
            <button type="button" style={ST.copy} onClick={() => navigator.clipboard?.writeText(exportJson)}>Copy settings JSON</button>
            <div style={ST.offsets}>
              <div style={ST.fpHead}>Inspect</div>
              {[['source', cfg.source], ['gold sprite', layer ? `${layer.canvas.width}×${layer.canvas.height}` : '…'], ['branch row', layer ? layer.branch.toFixed(1) : '…'], ['rail col', layer ? String(layer.railCol) : '…'], ['gold scale', `${scale.toFixed(2)}×`], ['bar span ≈', `${innerW + 2 * cfg.reach}px`], ['panel inner', `${innerW}px`]].map(([k, v]) => (
                <div key={k} style={ST.offsetRow}><span style={ST.offsetKey}>{k}</span><span style={ST.offsetVal}>{v}</span></div>
              ))}
            </div>
          </div>
        </section>
      </aside>
    </>
  );
}

const ST: Record<string, CSSProperties> = {
  sizeBox: { display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0', borderTop: '1px solid #1b2740' },
  sizeLabel: { fontSize: 12, lineHeight: 1.15, color: '#9fc4d5' },
  tunerRow: { display: 'grid', gridTemplateColumns: 'minmax(58px, 1fr) 30px 52px 30px 30px', alignItems: 'center', gap: 5, minWidth: 0 },
  sizeW: { display: 'grid', placeItems: 'center', minWidth: 0, fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1, whiteSpace: 'nowrap', color: '#dbe9ff' },
  sb: { display: 'grid', placeItems: 'center', width: 30, height: 30, padding: 0, boxSizing: 'border-box', fontFamily: 'system-ui, sans-serif', fontSize: 18, lineHeight: 1, background: '#111a2c', color: '#eaf3ff', border: '1px solid #2a3c5e', borderRadius: 5, cursor: 'pointer', overflow: 'hidden' },
  pieceRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 },
  pieceBtn: { display: 'grid', placeItems: 'center', minWidth: 0, padding: '8px 6px', background: '#111a2c', color: '#c4d6e6', border: '1px solid #2a3c5e', borderRadius: 4, cursor: 'pointer', textTransform: 'none', lineHeight: 1.1 },
  pieceBtnOn: { background: '#1d5f9e', color: '#fff', borderColor: '#4fbdf0' },
  sectionHead: { fontSize: 11, color: '#ffd98a', letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 700, marginTop: 4 },
  hint: { fontSize: 13, color: '#9fc4d5', margin: 0, textTransform: 'none', fontWeight: 400, letterSpacing: 0, lineHeight: 1.45 },
  resetAll: { padding: '9px 0', background: '#241a2b', color: '#e6c8ef', border: '1px solid #6b4f78', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  exportBox: { width: '100%', minHeight: 150, flexShrink: 0, resize: 'vertical', background: '#0a0f1c', color: '#dbe9ff', border: '1px solid #2a3c5e', borderRadius: 4, fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: 8, boxSizing: 'border-box' },
  copy: { padding: '8px 0', background: '#1d5f9e', color: '#fff', border: '1px solid #4fbdf0', borderRadius: 4, cursor: 'pointer' },
  offsets: { display: 'grid', gap: 3, padding: '8px 10px', background: '#0a0f1c', border: '1px solid #1b2740', borderRadius: 6 },
  offsetRow: { display: 'grid', gridTemplateColumns: '100px minmax(0, 1fr)', columnGap: 8, alignItems: 'baseline' },
  offsetKey: { fontSize: 11, color: '#7f93ad', lineHeight: 1.35 },
  offsetVal: { fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#dbe9ff', lineHeight: 1.35, overflowWrap: 'anywhere' },
  fpHead: { fontSize: 11, color: '#7f93ad', letterSpacing: 0.2 },
};
