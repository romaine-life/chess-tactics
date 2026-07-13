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
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import nineSliceRegistry from '../../config/nine-slice-registry.json';
import { SURFACE_ASSETS } from './surfaceCatalog';
import { ViewPane } from './shared/ViewPane';

const PANEL = '/assets/ui/kit/panel.png';
const PANEL_LINE = '/assets/ui/explore/frames/panel-line.png';
const PANEL_W = 420;
const MAXREACH = 56;       // how far a strip may extend past the panel content on each side (canvas room)
const TUNE_APRON = 40;      // transparent preview room so jx can overhang the rail without clipping

type Backing = 'none' | 'fill' | 'surface';
type Cfg = { frameWidth: number; reach: number; dividerH: number; scale: number; count: number; backing: Backing; jx: number; jy: number };
const FALLBACK: Cfg = { frameWidth: 16, reach: 14, dividerH: 34, scale: 1, count: 3, backing: 'fill', jx: 0, jy: 0 };
type BarAsset = {
  id: string;
  label: string;
  railSource?: 'panel-line' | 'edge';
  railFit?: 'tile' | 'stretch';
  junctionStyle?: 'gold' | 'natural';
  atoms: { edge: string; tee?: string; corner?: string };
  host?: { frame?: string; line?: string; slice?: number; previewWidth?: number };
};
type RegistryBarAsset = Omit<BarAsset, 'id'> & { kind?: string };
const REGISTRY = (nineSliceRegistry as unknown as { assets: Record<string, RegistryBarAsset> }).assets;
const BAR_ASSETS: BarAsset[] = Object.entries(REGISTRY)
  .filter(([, asset]) => asset.kind === 'bar')
  .map(([id, asset]) => ({ ...asset, id }));
export const DEFAULT_DIVIDER_ASSET = BAR_ASSETS.find((asset) => asset.id === 'panel-divider')?.id ?? BAR_ASSETS[0]?.id ?? 'panel-divider';
const CONFIG_MODULES = import.meta.glob('../../config/nine-slice/*.json', { eager: true }) as Record<string, { default: unknown }>;

function savedCfg(assetId: string): Partial<Cfg> {
  return (CONFIG_MODULES[`../../config/nine-slice/${assetId}.json`]?.default ?? {}) as Partial<Cfg>;
}

function defaultCfg(assetId: string): Cfg {
  const asset = BAR_ASSETS.find((entry) => entry.id === assetId);
  const familyDefaults = asset?.railSource === 'edge'
    ? { frameWidth: 32, reach: 24, dividerH: 112, scale: 0.5 }
    : {};
  return { ...FALLBACK, ...familyDefaults, ...savedCfg(assetId) };
}

// A gold-only sprite for one junction end, plus where its through-rail column and branch row sit
// (in the sprite's OWN pixels) so the strip can seat it against the bar.
type Layer = { canvas: HTMLCanvasElement; branch: number; railCol: number };
type BarImages = { railImg: HTMLImageElement; teeImg: HTMLImageElement; layer: Layer };

const loadImg = (src: string): Promise<HTMLImageElement> => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

// The authored 3-way atom is a vertical through-rail with a branch teeing to the right. For
// panel-divider it is gold-only; for codex-outer-divider it is the natural atomless metal merge.
// Keep the full authored atom coordinate frame, including transparent padding, so it is seated
// exactly like the crop was reviewed.
function buildTeeLayer(img: HTMLImageElement): Layer {
  const w = img.width, h = img.height;
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  const sg = src.getContext('2d')!; sg.drawImage(img, 0, 0);
  const d = sg.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => d[(y * w + x) * 4 + 3] > 40;
  let mw = 0; const rowW: number[] = new Array(h).fill(0);
  for (let y = 0; y < h; y++) {
    let a = -1, b = -1;
    for (let x = 0; x < w; x++) if (on(x, y)) { if (a < 0) a = x; b = x; }
    rowW[y] = a < 0 ? 0 : b - a + 1;
    if (rowW[y] > mw) mw = rowW[y];
  }
  let sum = 0, n = 0;
  for (let y = 0; y < h; y++) if (rowW[y] >= mw - 1) { sum += y; n++; }
  return { canvas: src, branch: n ? sum / n : h / 2, railCol: 0 };
}

async function loadBarImages(asset: BarAsset): Promise<BarImages> {
  const tee = asset.atoms.tee ?? asset.atoms.corner;
  if (!tee) throw new Error(`Divider asset "${asset.id}" is missing a tee atom`);
  const railUrl = asset.railSource === 'edge' ? `/assets/ui/kit/atoms/${asset.atoms.edge}.png` : PANEL_LINE;
  const [teeImg, railImg] = await Promise.all([loadImg(`/assets/ui/kit/atoms/${tee}.png`), loadImg(railUrl)]);
  return { teeImg, railImg, layer: buildTeeLayer(teeImg) };
}

// One divider strip. The preview draws a single composed raster, matching the bake path: tile the
// same panel-line top rail slice the frame uses, then seat mirrored gold T caps onto it. This avoids
// fractional CSS border-image placement and keeps the divider pipe the same weight as the panel pipe.
function drawRail(g: CanvasRenderingContext2D, railImg: HTMLImageElement, asset: BarAsset, frameWidth: number, x0: number, x1: number, y: number): void {
  const railSource = asset.railSource;
  if (railSource === 'edge') {
    const scale = Math.max(1, frameWidth) / railImg.height;
    const tileW = Math.max(1, Math.round(railImg.width * scale));
    const tileH = Math.max(1, Math.round(railImg.height * scale));
    if (asset.railFit === 'stretch') {
      g.drawImage(railImg, 0, 0, railImg.width, railImg.height, x0, y, x1 - x0, tileH);
      return;
    }
    for (let x = x0; x < x1; x += tileW) g.drawImage(railImg, 0, 0, railImg.width, railImg.height, x, y, tileW, tileH);
    return;
  }
  const railSize = Math.max(1, Math.round(frameWidth));
  for (let x = x0; x < x1; x += railSize) g.drawImage(railImg, 24, 0, 24, 24, x, y, railSize, railSize);
}

function DividerStrip({ asset, railImg, layer, scale, innerW, cfg }: { asset: BarAsset; railImg: HTMLImageElement; layer: Layer; scale: number; innerW: number; cfg: Cfg }): ReactElement {
  const stripRef = useRef<HTMLCanvasElement>(null);
  const gw = Math.max(1, Math.round(layer.canvas.width * scale)), gh = Math.max(1, Math.round(layer.canvas.height * scale));
  useEffect(() => {
    const c = stripRef.current; if (!c) return;
    const previewRoom = MAXREACH + TUNE_APRON;
    const stripW = Math.max(1, Math.round(innerW + 2 * previewRoom));
    const stripH = Math.max(1, Math.round(cfg.dividerH));
    c.width = stripW; c.height = stripH;
    const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; g.clearRect(0, 0, stripW, stripH);
    const mid = stripH / 2;
    const railSize = Math.max(1, Math.round(cfg.frameWidth));
    const railY = Math.round(mid - railSize / 2);
    const barL = Math.round(previewRoom - cfg.reach);
    const barR = Math.round(previewRoom + innerW + cfg.reach);
    drawRail(g, railImg, asset, cfg.frameWidth, barL, barR, railY);
    const teeY = Math.round(mid - layer.branch * scale + cfg.jy);
    const rc = layer.railCol * scale;
    g.drawImage(layer.canvas, 0, 0, layer.canvas.width, layer.canvas.height, Math.round(barL - rc + cfg.jx), teeY, gw, gh);
    g.save();
    const rightX = Math.round(barR + rc - gw - cfg.jx);
    g.translate(rightX + gw, teeY);
    g.scale(-1, 1);
    g.drawImage(layer.canvas, 0, 0, layer.canvas.width, layer.canvas.height, 0, 0, gw, gh);
    g.restore();
  }, [asset, cfg.dividerH, cfg.frameWidth, cfg.jx, cfg.jy, cfg.reach, gh, gw, innerW, layer, railImg, scale]);
  const previewRoom = MAXREACH + TUNE_APRON;
  const stripW = Math.max(1, Math.round(innerW + 2 * previewRoom));
  return (
    <div data-testid="divider-strip" style={{ position: 'relative', width: `${stripW}px`, height: `${cfg.dividerH}px`, margin: `7px ${-previewRoom}px` }}>
      <canvas
        ref={stripRef}
        style={{ position: 'absolute', left: 0, top: 0, width: `${stripW}px`, height: `${Math.max(1, Math.round(cfg.dividerH))}px`, imageRendering: 'pixelated' }}
      />
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

export function DividerLab({ assetId, onAssetId, header }: { assetId?: string; onAssetId?: (id: string) => void; header?: ReactNode }): ReactElement {
  const initialAssetId = BAR_ASSETS.some((asset) => asset.id === assetId) ? assetId! : DEFAULT_DIVIDER_ASSET;
  const [ownAssetId, setOwnAssetId] = useState(initialAssetId);
  const selectedAssetId = BAR_ASSETS.some((asset) => asset.id === assetId) ? assetId! : ownAssetId;
  const asset = useMemo(() => BAR_ASSETS.find((entry) => entry.id === selectedAssetId) ?? BAR_ASSETS[0], [selectedAssetId]);
  const defaultForSelected = useMemo(() => defaultCfg(selectedAssetId), [selectedAssetId]);
  const [cfg, setCfg] = useState<Cfg>(() => defaultCfg(initialAssetId));
  const [barImages, setBarImages] = useState<BarImages | null>(null);
  useEffect(() => {
    setCfg(defaultForSelected);
  }, [defaultForSelected]);
  useEffect(() => {
    let live = true;
    setBarImages(null);
    loadBarImages(asset).then((images) => { if (live) setBarImages(images); }).catch(() => {});
    return () => { live = false; };
  }, [asset]);
  const [zoom, setZoom] = useState(2); // integer zoom keeps the pixel-art crisp under nearest-neighbor
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const resetView = () => { setZoom(2); setPan({ x: 0, y: 0 }); };

  const set = (k: keyof Cfg) => (v: number) => setCfg((c) => ({ ...c, [k]: v }));
  const selectAsset = (id: string) => {
    if (onAssetId) onAssetId(id);
    else setOwnAssetId(id);
  };
  const surface = SURFACE_ASSETS[0]?.file;
  const panelW = asset.host?.previewWidth ?? PANEL_W;
  const innerW = panelW - 2 * cfg.frameWidth;
  const exportPayload = { asset: selectedAssetId, ...cfg };
  const exportJson = JSON.stringify(exportPayload, null, 2);

  // Render the junction in the same coordinate system the bake uses: scale the full authored atom
  // frame, then seat that cap by reach/jx/jy. Transparent atom padding participates, like corners.
  const scale = cfg.scale;
  const layer: Layer | null = barImages?.layer ?? null;
  const hostFrame = asset.host?.frame ? `/assets/ui/kit/${asset.host.frame}` : PANEL;
  const hostLine = asset.host?.line ? `/assets/ui/kit/${asset.host.line}` : PANEL_LINE;
  const hostSlice = asset.host?.slice ?? 24;
  const hostImage = cfg.backing === 'fill' || !asset.host?.line ? hostFrame : hostLine;

  const panelStyle: CSSProperties = {
    width: panelW, borderStyle: 'solid', borderWidth: cfg.frameWidth, borderColor: 'transparent',
    borderImage: cfg.backing === 'fill' ? `url("${hostFrame}") ${hostSlice} fill / ${cfg.frameWidth}px round` : `url("${hostImage}") ${hostSlice} / ${cfg.frameWidth}px round`,
    imageRendering: 'pixelated', color: '#d7e7f4', font: '600 13px "Segoe UI", system-ui, sans-serif',
    backgroundClip: 'border-box', backgroundOrigin: 'border-box',
    background: cfg.backing === 'surface' && surface ? `url("${surface}")` : 'transparent',
  };
  const sections = ['Display', 'Audio', 'Account', 'Advanced', 'About'];
  const rows: ReactElement[] = [];
  for (let i = 0; i < cfg.count + 1; i++) {
    rows.push(<div key={`s${i}`} style={{ padding: '13px 8px' }}>{sections[i % sections.length]}<br /><small style={{ color: '#8ba9bd', fontWeight: 400 }}>section {i + 1}</small></div>);
    if (i < cfg.count && layer && barImages) rows.push(<DividerStrip key={`d${i}`} asset={asset} railImg={barImages.railImg} layer={layer} scale={scale} innerW={innerW} cfg={cfg} />);
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
            <p style={ST.hint}>The divider is a junction, not a box — it only reads inside a complete frame. This preview assembles the selected bar asset inside its host frame, so the rail, cap, and frame relationship are visible together.</p>
            <div style={ST.sectionHead}>View</div>
            <label style={ST.selectWrap}>
              <span style={ST.sizeLabel}>Divider asset</span>
              <select value={selectedAssetId} onChange={(event) => selectAsset(event.target.value)} style={ST.select} aria-label="Divider asset">
                {BAR_ASSETS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
            </label>
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
            <Slider label="Frame width" value={cfg.frameWidth} min={8} max={asset.railSource === 'edge' ? 64 : 24} def={defaultForSelected.frameWidth} onChange={set('frameWidth')} />
            <div style={ST.pieceRow}>
              {(['none', 'fill', 'surface'] as Backing[]).map((b) => (
                <button key={b} type="button" onClick={() => setCfg((c) => ({ ...c, backing: b }))} style={{ ...ST.pieceBtn, ...(cfg.backing === b ? ST.pieceBtnOn : {}) }}>{b}</button>
              ))}
            </div>
            <div style={ST.sectionHead}>Divider</div>
            <Slider label="Reach → rail" value={cfg.reach} min={-8} max={MAXREACH} def={defaultForSelected.reach} onChange={set('reach')} />
            <Slider label="Strip height" value={cfg.dividerH} min={14} max={asset.railSource === 'edge' ? 220 : 72} def={defaultForSelected.dividerH} onChange={set('dividerH')} />
            <div style={ST.sectionHead}>3-way junction</div>
            <p style={ST.hint}>{asset.junctionStyle === 'natural' ? 'Atomless natural T cap: the rail merge is the artwork, with no gold overlay at the mid-junction.' : 'Authored T cap: full atom frame included, mirrored left/right, and seated by reach/jx/jy.'}</p>
            <Slider label="Junction size" value={cfg.scale} min={0.5} max={2} step={0.05} unit="×" def={defaultForSelected.scale} onChange={set('scale')} />
            <Slider label="Seat ↔ (over bar)" value={cfg.jx} min={-24} max={24} def={defaultForSelected.jx} onChange={set('jx')} />
            <Slider label="Align ↕ (to bar)" value={cfg.jy} min={-24} max={24} def={defaultForSelected.jy} onChange={set('jy')} />
            <div style={ST.sizeBox}>
              <div style={ST.tunerRow}>
                <span style={{ ...ST.sizeLabel, whiteSpace: 'nowrap' }}>Dividers (N)</span>
                <button type="button" style={ST.sb} onClick={() => set('count')(Math.max(1, cfg.count - 1))}>-</button>
                <span style={ST.sizeW}>{cfg.count}</span>
                <button type="button" style={ST.sb} onClick={() => set('count')(Math.min(5, cfg.count + 1))}>+</button>
                <button type="button" style={ST.sb} title="Reset" onClick={() => set('count')(defaultForSelected.count)}>↺</button>
              </div>
            </div>
            <button type="button" style={ST.resetAll} onClick={() => setCfg(defaultForSelected)}>↺ Reset to saved</button>
            <div style={ST.sectionHead}>Export</div>
            <p style={ST.hint}>Copy the tuned deterministic geometry for review. Runtime media and accepted pointers remain owned by the live backend catalog.</p>
            <textarea readOnly value={exportJson} style={ST.exportBox} onFocus={(e) => e.currentTarget.select()} aria-label="Divider settings JSON" />
            <button type="button" style={ST.copy} onClick={() => navigator.clipboard?.writeText(exportJson)}>Copy settings JSON</button>
            <div style={ST.offsets}>
              <div style={ST.fpHead}>Inspect</div>
              {[['asset', selectedAssetId], ['junction', asset.junctionStyle ?? 'gold'], ['tee sprite', layer ? `${layer.canvas.width}×${layer.canvas.height}` : '…'], ['branch row', layer ? layer.branch.toFixed(1) : '…'], ['rail col', layer ? String(layer.railCol) : '…'], ['tee scale', `${scale.toFixed(2)}×`], ['bar span ≈', `${innerW + 2 * cfg.reach}px`], ['panel inner', `${innerW}px`]].map(([k, v]) => (
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
  selectWrap: { display: 'grid', gap: 5, padding: '8px 0', borderTop: '1px solid #1b2740' },
  select: { width: '100%', minWidth: 0, fontSize: 13, lineHeight: 1.2, padding: '6px 8px', background: '#111a2c', color: '#eaf3ff', border: '1px solid #2a3c5e', borderRadius: 4 },
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
