// 9-slice editor. You edit the pieces of a kit 9-slice by nudging each one pixel
// at a time; the tool renders the rest of the frame from those (corner mirrored
// into all four corners, top edge -> bottom, left edge -> right; symmetric by
// construction), live, on every nudge. The CORNER is split into its keyline base
// and its gold BRACKET accent, so the bracket can be aligned independently of the
// corner border. When it lines up, Export the JSON of per-piece pixel offsets and
// hand it back; an apply step writes the nudged atoms.
//
// Routing follows repo convention (lazy route in App.tsx: /nine-slice-editor).
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

type Off = { dx: number; dy: number };
type PieceKey = 'corner' | 'bracket' | 'top' | 'left';
type EditState = Record<PieceKey, Off>;

type Asset = { id: string; label: string; corner: string; edge: string; fill: string };

const ASSETS: Asset[] = [
  { id: 'mode-button', label: 'Mode button (tabs / header)', corner: '/assets/ui/kit/atoms/corner.png', edge: '/assets/ui/kit/atoms/edge.png', fill: '/assets/ui/kit/atoms/fill.png' },
  { id: 'row', label: 'Settings row', corner: '/assets/ui/kit/atoms/row-corner.png', edge: '/assets/ui/kit/atoms/row-edge.png', fill: '/assets/ui/kit/atoms/row-fill.png' },
];

const ZERO: EditState = { corner: { dx: 0, dy: 0 }, bracket: { dx: 0, dy: 0 }, top: { dx: 0, dy: 0 }, left: { dx: 0, dy: 0 } };
const STORAGE_KEY = 'nine-slice-editor-v2';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

// Split a corner atom into base (the keyline / cool pixels) and accent (the warm
// gold bracket, r>b). Lets the bracket be nudged separately from the border.
function splitWarm(img: HTMLImageElement): { base: HTMLCanvasElement; accent: HTMLCanvasElement; hasAccent: boolean } {
  const w = img.width, h = img.height;
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  const sg = src.getContext('2d')!; sg.imageSmoothingEnabled = false; sg.drawImage(img, 0, 0);
  const d = sg.getImageData(0, 0, w, h);
  const base = document.createElement('canvas'); base.width = w; base.height = h;
  const accent = document.createElement('canvas'); accent.width = w; accent.height = h;
  const bg = base.getContext('2d')!; const ag = accent.getContext('2d')!;
  const bd = bg.createImageData(w, h); const ad = ag.createImageData(w, h);
  let hasAccent = false;
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i], g = d.data[i + 1], b = d.data[i + 2], a = d.data[i + 3];
    const warm = a > 40 && r > b + 15; // gold ramp is warm; keyline/navy are cool
    const t = warm ? ad : bd;
    t.data[i] = r; t.data[i + 1] = g; t.data[i + 2] = b; t.data[i + 3] = a;
    if (warm) hasAccent = true;
  }
  bg.putImageData(bd, 0, 0); ag.putImageData(ad, 0, 0);
  return { base, accent, hasAccent };
}

// Draw src into a fresh canvas, optionally rotated 90deg CW, shifted by (dx,dy).
function pieceCanvas(src: CanvasImageSource, w: number, h: number, rot: boolean, dx: number, dy: number): HTMLCanvasElement {
  const ow = rot ? h : w, oh = rot ? w : h;
  const c = document.createElement('canvas'); c.width = ow; c.height = oh;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  g.save(); g.translate(dx, dy);
  if (rot) { g.translate(ow, 0); g.rotate(Math.PI / 2); }
  g.drawImage(src, 0, 0); g.restore();
  return c;
}

function flip(src: CanvasImageSource, w: number, h: number, fx: boolean, fy: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  g.translate(fx ? w : 0, fy ? h : 0); g.scale(fx ? -1 : 1, fy ? -1 : 1); g.drawImage(src, 0, 0);
  return c;
}

function tile(g: CanvasRenderingContext2D, t: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y < y1; y += t.height) for (let x = x0; x < x1; x += t.width) g.drawImage(t, x, y);
}

type Loaded = { base: HTMLCanvasElement; accent: HTMLCanvasElement; hasAccent: boolean; edge: HTMLImageElement; fill: HTMLImageElement; cw: number; ch: number };

export function NineSliceEditor(): ReactElement {
  const [assetId, setAssetId] = useState(ASSETS[0].id);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [active, setActive] = useState<PieceKey>('corner');
  const [edits, setEdits] = useState<Record<string, EditState>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const asset = useMemo(() => ASSETS.find((a) => a.id === assetId)!, [assetId]);
  const edit = edits[assetId] ?? ZERO;
  const pieces: PieceKey[] = loaded?.hasAccent ? ['corner', 'bracket', 'top', 'left'] : ['corner', 'top', 'left'];

  useEffect(() => {
    let live = true; setLoaded(null);
    Promise.all([loadImage(asset.corner), loadImage(asset.edge), loadImage(asset.fill)])
      .then(([corner, edge, fill]) => {
        if (!live) return;
        const { base, accent, hasAccent } = splitWarm(corner);
        setLoaded({ base, accent, hasAccent, edge, fill, cw: corner.width, ch: corner.height });
      }).catch(() => { if (live) setLoaded(null); });
    return () => { live = false; };
  }, [asset]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(edits)); }, [edits]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      const sel: Record<string, PieceKey> = { c: 'corner', b: 'bracket', t: 'top', l: 'left' };
      if (sel[e.key]) { setActive(sel[e.key]); return; }
      const moves: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      const m = moves[e.key]; if (!m) return;
      e.preventDefault();
      setEdits((prev) => { const cur = prev[assetId] ?? ZERO; const p = cur[active]; return { ...prev, [assetId]: { ...cur, [active]: { dx: p.dx + m[0], dy: p.dy + m[1] } } }; });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, assetId]);

  useEffect(() => {
    if (!loaded) return;
    const { cw, ch } = loaded; const W = cw * 3, H = ch * 3;
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const g = off.getContext('2d')!; g.imageSmoothingEnabled = false;

    tile(g, pieceCanvas(loaded.fill, loaded.fill.width, loaded.fill.height, false, 0, 0), cw, ch, W - cw, H - ch);

    const top = pieceCanvas(loaded.edge, loaded.edge.width, loaded.edge.height, false, edit.top.dx, edit.top.dy);
    tile(g, top, cw, 0, W - cw, top.height);
    tile(g, flip(top, top.width, top.height, false, true), cw, H - top.height, W - cw, H);

    const left = pieceCanvas(loaded.edge, loaded.edge.width, loaded.edge.height, true, edit.left.dx, edit.left.dy);
    tile(g, left, 0, ch, left.width, H - ch);
    tile(g, flip(left, left.width, left.height, true, false), W - left.width, ch, W, H - ch);

    const baseC = pieceCanvas(loaded.base, cw, ch, false, edit.corner.dx, edit.corner.dy);
    const accC = loaded.hasAccent ? pieceCanvas(loaded.accent, cw, ch, false, edit.bracket.dx, edit.bracket.dy) : null;
    const corner = (fx: boolean, fy: boolean, x: number, y: number) => {
      g.drawImage(flip(baseC, cw, ch, fx, fy), x, y);
      if (accC) g.drawImage(flip(accC, cw, ch, fx, fy), x, y);
    };
    corner(false, false, 0, 0); corner(true, false, W - cw, 0); corner(false, true, 0, H - ch); corner(true, true, W - cw, H - ch);

    const view = canvasRef.current; if (!view) return;
    const Z = 6; view.width = W * Z; view.height = H * Z;
    const vg = view.getContext('2d')!; vg.imageSmoothingEnabled = false;
    for (let y = 0; y < view.height; y += 8) for (let x = 0; x < view.width; x += 8) { vg.fillStyle = ((x / 8 + y / 8) & 1) ? '#3a3f48' : '#2b2f37'; vg.fillRect(x, y, 8, 8); }
    vg.drawImage(off, 0, 0, W, H, 0, 0, W * Z, H * Z);
  }, [loaded, edit]);

  const nudge = (dx: number, dy: number) => setEdits((prev) => { const cur = prev[assetId] ?? ZERO; const p = cur[active]; return { ...prev, [assetId]: { ...cur, [active]: { dx: p.dx + dx, dy: p.dy + dy } } }; });
  const reset = () => setEdits((prev) => ({ ...prev, [assetId]: ZERO }));
  const exportJson = JSON.stringify({ asset: assetId, ...edit }, null, 2);

  return (
    <section style={ST.page}>
      <header style={ST.bar}>
        <strong style={{ fontSize: 18 }}>9-slice editor</strong>
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)} style={ST.select}>
          {ASSETS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <a href="/tileset-studio" style={ST.link}>← Studio</a>
      </header>
      <div style={ST.body}>
        <div style={ST.stage}><canvas ref={canvasRef} style={{ imageRendering: 'pixelated', maxWidth: '100%' }} /></div>
        <aside style={ST.panel}>
          <div style={ST.pieceRow}>
            {pieces.map((k) => (
              <button key={k} type="button" onClick={() => setActive(k)} style={{ ...ST.pieceBtn, ...(active === k ? ST.pieceBtnOn : {}) }}>{k}</button>
            ))}
          </div>
          <p style={ST.hint}>Editing <b>{active}</b> — arrow keys nudge 1px. Keys: c/b/t/l switch piece. Corner & bracket mirror to 4; top→bottom; left→right.</p>
          <div style={ST.dpad}>
            <div /><button type="button" style={ST.nb} onClick={() => nudge(0, -1)}>↑</button><div />
            <button type="button" style={ST.nb} onClick={() => nudge(-1, 0)}>←</button>
            <button type="button" style={ST.nbReset} onClick={reset}>0</button>
            <button type="button" style={ST.nb} onClick={() => nudge(1, 0)}>→</button>
            <div /><button type="button" style={ST.nb} onClick={() => nudge(0, 1)}>↓</button><div />
          </div>
          <div style={ST.offsets}>{pieces.map((k) => <div key={k}>{k}: dx {edit[k].dx}, dy {edit[k].dy}</div>)}</div>
          <label style={ST.hint}>Export — paste this back:</label>
          <textarea readOnly value={exportJson} style={ST.export} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" style={ST.copy} onClick={() => navigator.clipboard?.writeText(exportJson)}>Copy JSON</button>
        </aside>
      </div>
    </section>
  );
}

const ST: Record<string, React.CSSProperties> = {
  page: { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#06080d', color: '#cfe3ff', fontFamily: 'var(--ds-font-sans, system-ui, sans-serif)' },
  bar: { display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderBottom: '1px solid #1b2740', background: '#0b1220' },
  select: { fontSize: 15, padding: '4px 8px', background: '#111a2c', color: '#eaf3ff', border: '1px solid #2a3c5e', borderRadius: 4 },
  link: { marginLeft: 'auto', color: '#9fd8ff', textDecoration: 'none' },
  body: { flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', minHeight: 0 },
  stage: { display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto', padding: 20 },
  panel: { borderLeft: '1px solid #1b2740', background: '#0b1220', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' },
  pieceRow: { display: 'flex', gap: 6 },
  pieceBtn: { flex: 1, padding: '8px 0', background: '#111a2c', color: '#c4d6e6', border: '1px solid #2a3c5e', borderRadius: 4, cursor: 'pointer', textTransform: 'capitalize' },
  pieceBtnOn: { background: '#1d5f9e', color: '#fff', borderColor: '#4fbdf0' },
  hint: { fontSize: 13, color: '#9fc4d5', margin: 0 },
  dpad: { display: 'grid', gridTemplateColumns: 'repeat(3, 56px)', gridAutoRows: '56px', gap: 6, justifyContent: 'center' },
  nb: { fontSize: 22, background: '#111a2c', color: '#eaf3ff', border: '1px solid #2a3c5e', borderRadius: 6, cursor: 'pointer' },
  nbReset: { fontSize: 14, background: '#17223a', color: '#9fc4d5', border: '1px solid #2a3c5e', borderRadius: 6, cursor: 'pointer' },
  offsets: { fontSize: 13, fontFamily: 'ui-monospace, monospace', color: '#dbe9ff', display: 'grid', gap: 2 },
  export: { width: '100%', height: 120, background: '#0a0f1c', color: '#dbe9ff', border: '1px solid #2a3c5e', borderRadius: 4, fontFamily: 'ui-monospace, monospace', fontSize: 12, padding: 8, boxSizing: 'border-box' },
  copy: { padding: '8px 0', background: '#1d5f9e', color: '#fff', border: '1px solid #4fbdf0', borderRadius: 4, cursor: 'pointer' },
};
