// 9-slice editor. You edit THREE pieces of a kit 9-slice — the top-left CORNER,
// the TOP edge, and the LEFT edge — by nudging each one pixel at a time. The tool
// renders the rest of the frame from those (corner mirrored into all four corners,
// top edge -> bottom, left edge -> right; symmetric by construction), live, on
// every nudge. When the corners and edges line up, Export the JSON of per-piece
// pixel offsets and hand it back; an apply step writes the nudged atoms.
//
// Routing follows repo convention (lazy route in App.tsx: /nine-slice-editor).
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

type Off = { dx: number; dy: number };
type PieceKey = 'corner' | 'top' | 'left';
type EditState = { corner: Off; top: Off; left: Off };

type Asset = {
  id: string;
  label: string;
  corner: string; // atom urls (served from /public)
  edge: string;
  fill: string;
};

// The atom-assembled kit 9-slices. The editor loads each asset's atoms; the LEFT
// edge starts as the edge rotated to vertical and is nudged independently of TOP.
const ASSETS: Asset[] = [
  { id: 'mode-button', label: 'Mode button (tabs / header)', corner: '/assets/ui/kit/atoms/corner.png', edge: '/assets/ui/kit/atoms/edge.png', fill: '/assets/ui/kit/atoms/fill.png' },
  { id: 'row', label: 'Settings row', corner: '/assets/ui/kit/atoms/row-corner.png', edge: '/assets/ui/kit/atoms/row-edge.png', fill: '/assets/ui/kit/atoms/row-fill.png' },
];

const ZERO: EditState = { corner: { dx: 0, dy: 0 }, top: { dx: 0, dy: 0 }, left: { dx: 0, dy: 0 } };
const STORAGE_KEY = 'nine-slice-editor-v1';

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

// Draw an image into a fresh canvas, optionally rotated 90deg CW, shifted by (dx,dy).
// Pixels pushed off the tile are dropped; vacated area stays transparent.
function pieceCanvas(img: HTMLImageElement, rot: boolean, dx: number, dy: number): HTMLCanvasElement {
  const w = rot ? img.height : img.width;
  const h = rot ? img.width : img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.save();
  g.translate(dx, dy);
  if (rot) { g.translate(w, 0); g.rotate(Math.PI / 2); }
  g.drawImage(img, 0, 0);
  g.restore();
  return c;
}

function flip(src: CanvasImageSource, w: number, h: number, fx: boolean, fy: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  g.translate(fx ? w : 0, fy ? h : 0); g.scale(fx ? -1 : 1, fy ? -1 : 1);
  g.drawImage(src, 0, 0);
  return c;
}

function tile(g: CanvasRenderingContext2D, t: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y < y1; y += t.height) for (let x = x0; x < x1; x += t.width) g.drawImage(t, x, y);
}

export function NineSliceEditor(): ReactElement {
  const [assetId, setAssetId] = useState(ASSETS[0].id);
  const [imgs, setImgs] = useState<{ corner: HTMLImageElement; edge: HTMLImageElement; fill: HTMLImageElement } | null>(null);
  const [active, setActive] = useState<PieceKey>('corner');
  const [edits, setEdits] = useState<Record<string, EditState>>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const asset = useMemo(() => ASSETS.find((a) => a.id === assetId)!, [assetId]);
  const edit = edits[assetId] ?? ZERO;

  useEffect(() => {
    let live = true;
    setImgs(null);
    Promise.all([loadImage(asset.corner), loadImage(asset.edge), loadImage(asset.fill)])
      .then(([corner, edge, fill]) => { if (live) setImgs({ corner, edge, fill }); })
      .catch(() => { if (live) setImgs(null); });
    return () => { live = false; };
  }, [asset]);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(edits)); }, [edits]);

  // Assemble the frame from the three edited pieces, mirrored to fill the rest.
  useEffect(() => {
    if (!imgs) return;
    const cw = imgs.corner.width, ch = imgs.corner.height;
    const W = cw * 3, H = ch * 3; // one tile-region of middle on each axis
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const g = off.getContext('2d')!; g.imageSmoothingEnabled = false;

    const fillC = pieceCanvas(imgs.fill, false, 0, 0);
    tile(g, fillC, cw, ch, W - cw, H - ch); // interior fill

    const top = pieceCanvas(imgs.edge, false, edit.top.dx, edit.top.dy);
    const bottom = flip(top, top.width, top.height, false, true);
    tile(g, top, cw, 0, W - cw, top.height);
    tile(g, bottom, cw, H - top.height, W - cw, H);

    const left = pieceCanvas(imgs.edge, true, edit.left.dx, edit.left.dy);
    const right = flip(left, left.width, left.height, true, false);
    tile(g, left, 0, ch, left.width, H - ch);
    tile(g, right, W - left.width, ch, W, H - ch);

    const c0 = pieceCanvas(imgs.corner, false, edit.corner.dx, edit.corner.dy);
    g.drawImage(c0, 0, 0);
    g.drawImage(flip(c0, cw, ch, true, false), W - cw, 0);
    g.drawImage(flip(c0, cw, ch, false, true), 0, H - ch);
    g.drawImage(flip(c0, cw, ch, true, true), W - cw, H - ch);

    // paint to the visible canvas, scaled up, pixelated, on a checkerboard
    const view = canvasRef.current; if (!view) return;
    const Z = 6; view.width = W * Z; view.height = H * Z;
    const vg = view.getContext('2d')!; vg.imageSmoothingEnabled = false;
    const sq = 8;
    for (let y = 0; y < view.height; y += sq) for (let x = 0; x < view.width; x += sq) {
      vg.fillStyle = ((x / sq + y / sq) & 1) ? '#3a3f48' : '#2b2f37';
      vg.fillRect(x, y, sq, sq);
    }
    vg.drawImage(off, 0, 0, W, H, 0, 0, W * Z, H * Z);
  }, [imgs, edit]);

  const nudge = (dx: number, dy: number) => {
    setEdits((prev) => {
      const cur = prev[assetId] ?? ZERO;
      const p = cur[active];
      return { ...prev, [assetId]: { ...cur, [active]: { dx: p.dx + dx, dy: p.dy + dy } } };
    });
  };
  const reset = () => setEdits((prev) => ({ ...prev, [assetId]: ZERO }));
  const exportJson = JSON.stringify({ asset: assetId, ...edit }, null, 2);

  return (
    <section style={S.page}>
      <header style={S.bar}>
        <strong style={{ fontSize: 18 }}>9-slice editor</strong>
        <select value={assetId} onChange={(e) => setAssetId(e.target.value)} style={S.select}>
          {ASSETS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <a href="/tileset-studio" style={S.link}>← Studio</a>
      </header>

      <div style={S.body}>
        <div style={S.stage}><canvas ref={canvasRef} style={{ imageRendering: 'pixelated', maxWidth: '100%' }} /></div>

        <aside style={S.panel}>
          <div style={S.pieceRow}>
            {(['corner', 'top', 'left'] as PieceKey[]).map((k) => (
              <button key={k} type="button" onClick={() => setActive(k)}
                style={{ ...S.pieceBtn, ...(active === k ? S.pieceBtnOn : {}) }}>{k}</button>
            ))}
          </div>
          <p style={S.hint}>Editing: <b>{active}</b> — nudge 1px. Corner mirrors to 4; top→bottom; left→right.</p>
          <div style={S.dpad}>
            <div />
            <button type="button" style={S.nb} onClick={() => nudge(0, -1)}>↑</button>
            <div />
            <button type="button" style={S.nb} onClick={() => nudge(-1, 0)}>←</button>
            <button type="button" style={S.nbReset} onClick={reset}>0</button>
            <button type="button" style={S.nb} onClick={() => nudge(1, 0)}>→</button>
            <div />
            <button type="button" style={S.nb} onClick={() => nudge(0, 1)}>↓</button>
            <div />
          </div>
          <div style={S.offsets}>
            {(['corner', 'top', 'left'] as PieceKey[]).map((k) => (
              <div key={k}>{k}: dx {edit[k].dx}, dy {edit[k].dy}</div>
            ))}
          </div>
          <label style={S.hint}>Export — paste this back:</label>
          <textarea readOnly value={exportJson} style={S.export} onFocus={(e) => e.currentTarget.select()} />
          <button type="button" style={S.copy} onClick={() => navigator.clipboard?.writeText(exportJson)}>Copy JSON</button>
        </aside>
      </div>
    </section>
  );
}

const S: Record<string, React.CSSProperties> = {
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
