// Portrait Editor — an in-app tool for dialling in each unit's portrait headshot
// crop. Each unit is pre-rendered full-body (high-res masters at
// /assets/portrait-editor/<piece>/<palette>.png); here you drag to pan and
// scroll/slider to zoom a square crop, with a live preview in the real HUD
// portrait frame. The crop is per-piece (geometry), previewable in any palette.
// Export the JSON and hand it back — it maps to camera framing for crisp finals.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement, ReactNode, WheelEvent as ReactWheelEvent } from 'react';
import COMMITTED_CROPS from '../art/portraitCrops.json';
import { PORTRAIT_METHODS, portraitMasterSrc, type PortraitMethod } from './portraitCandidates';

const PIECES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const;
const PALETTES = ['navy-blue', 'crimson', 'golden', 'emerald'] as const;
export type Piece = (typeof PIECES)[number];
export type Palette = (typeof PALETTES)[number];
export type Crop = { cx: number; cy: number; s: number };

// Master render framing (Tz·topZ, span·topZ) used per piece — emitted with the
// JSON so the crop can be mapped back to camera framing exactly.
const MASTER_FRAMING: Record<Piece, { tz: number; span: number }> = {
  pawn: { tz: 0.5, span: 1.45 }, knight: { tz: 0.5, span: 1.45 }, bishop: { tz: 0.5, span: 1.45 },
  rook: { tz: 0.45, span: 1.75 }, queen: { tz: 0.5, span: 1.45 }, king: { tz: 0.5, span: 1.45 },
};

// Fallback headshot if a piece is somehow missing from the committed crops below.
const DEFAULT_CROP: Crop = { cx: 0.5, cy: 0.30, s: 0.50 };
// The committed, intentional per-piece framing (off-center lead room, zoom) — the single source
// of truth the editor, the Skirmish HUD, and the roster all START from, so they never diverge.
const COMMITTED = COMMITTED_CROPS as Record<Piece, Crop>;
export const STORAGE_KEY = 'portrait-editor-crops-v3'; // v3: discard stale v2 (centered-default) crops

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
// s ≤ 1 crops INSIDE the master (the original behaviour); s > 1 lets the crop extend BEYOND
// it, wrapping the unit in transparent padding — so you can add headroom a tightly-framed
// master can't otherwise give (e.g. above the rook keep). S_MAX caps how small the unit can go.
const S_MAX = 2;
const Z_OFF = 0.15 + S_MAX; // zoom slider maps value = Z_OFF - s, so dragging right still zooms in
// For s ≤ 1 this keeps the window inside the image (unchanged, so other portraits don't move);
// for s > 1 it lets the centre roam so the unit can sit against an edge with padding on the far side.
function clampCrop({ cx, cy, s }: Crop): Crop {
  const ss = clamp(s, 0.15, S_MAX);
  const half = ss / 2;
  const lo = Math.min(half, 1 - half), hi = Math.max(half, 1 - half);
  return { s: ss, cx: clamp(cx, lo, hi), cy: clamp(cy, lo, hi) };
}

export const masterSrc = (piece: Piece, pal: Palette, method: PortraitMethod = 'smooth') => portraitMasterSrc(piece, pal, method);

// Render the cropped region of a square master to fill a frame, via an absolutely
// positioned img (width 1/s of the frame, translated so the crop centre is centred).
export function CroppedView({ src, crop }: { src: string; crop: Crop }): ReactElement {
  const { cx, cy, s } = crop;
  const imgStyle: CSSProperties = {
    position: 'absolute', width: `${100 / s}%`, height: 'auto',
    left: `${(0.5 - cx / s) * 100}%`, top: `${(0.5 - cy / s) * 100}%`,
    imageRendering: 'auto', pointerEvents: 'none', userSelect: 'none',
  };
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <img src={src} alt="" draggable={false} style={imgStyle} />
    </div>
  );
}

// The ONE "unit portrait box": the shared CroppedView (master + crop) inside the standard
// transparent line-frame with the fill boundary. Every surface — the Selected-Unit HUD, the
// roster slots, and these editor previews — renders through THIS, so the framing/fill/crop are
// defined once (here + the `.unit-portrait` CSS) and never re-derived per surface. Size, backdrop,
// and the selected highlight vary via `size`/`backdrop`/a `className` modifier; nothing else.
export function UnitPortrait({ piece, palette, crop, backdrop, size, className, method }: {
  piece: Piece; palette: Palette; crop: Crop; backdrop?: string | null; size?: number; className?: string; method?: PortraitMethod;
}): ReactElement {
  const style: CSSProperties = {};
  if (size != null) { style.width = size; style.height = size; }
  if (backdrop) (style as Record<string, string>)['--up-backdrop'] = `url("${backdrop}")`;
  return (
    <div className={`unit-portrait ${backdrop ? 'has-backdrop' : ''} ${className ?? ''}`.trim()} style={style}>
      <div className="unit-portrait__bust"><CroppedView src={masterSrc(piece, palette, method)} crop={crop} /></div>
    </div>
  );
}

// Editor preview = a labelled UnitPortrait, so the previews can't drift from the live HUD.
function HudFrame({ piece, palette, crop, size, label, method }: { piece: Piece; palette: Palette; crop: Crop; size: number; label?: string; method?: PortraitMethod }): ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <UnitPortrait piece={piece} palette={palette} crop={crop} size={size} className="unit-portrait--preview" method={method} />
      {label ? <span style={{ fontSize: 11, color: '#7fa8bd' }}>{label}</span> : null}
    </div>
  );
}

export function loadCrops(): Record<Piece, Crop> {
  const base = Object.fromEntries(PIECES.map((p) => [p, { ...(COMMITTED[p] ?? DEFAULT_CROP) }])) as Record<Piece, Crop>;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Record<Piece, Crop>>;
      for (const p of PIECES) if (saved[p]) base[p] = clampCrop(saved[p] as Crop);
    }
  } catch { /* defaults */ }
  return base;
}

// Shared editor core — crop state per piece, pan/zoom handlers, persistence and
// JSON export. Consumed both by the standalone PortraitEditor page and by the
// in-studio PortraitLab Viewer surface, so the two never diverge.
function usePortraitEditor() {
  const [crops, setCrops] = useState<Record<Piece, Crop>>(loadCrops);
  const [piece, setPiece] = useState<Piece>('pawn');
  const [palette, setPalette] = useState<Palette>('navy-blue');
  const [method, setMethod] = useState<PortraitMethod>('smooth');
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; cx: number; cy: number } | null>(null);

  const crop = crops[piece];
  const setCrop = useCallback((next: Crop) => {
    setCrops((prev) => ({ ...prev, [piece]: clampCrop(next) }));
  }, [piece]);
  // Zoom anchored to the crop's TOP edge: tightening trims the bottom (neck/
  // shoulders) and keeps the head framed, instead of eating into it from the top.
  const setZoom = useCallback((nextS: number) => {
    setCrops((prev) => {
      const c = prev[piece];
      const top = c.cy - c.s / 2;
      const s = clamp(nextS, 0.15, S_MAX);
      return { ...prev, [piece]: clampCrop({ cx: c.cx, s, cy: top + s / 2 }) };
    });
  }, [piece]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(crops)); } catch { /* ignore */ }
  }, [crops]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, cx: crop.cx, cy: crop.cy };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current; const box = canvasRef.current?.getBoundingClientRect();
    if (!d || !box) return;
    // When zoomed out into padding (s>1) the master is drawn smaller in the canvas, so pan
    // proportionally faster to keep the crop tracking the cursor.
    const k = Math.max(1, crop.s);
    setCrop({ ...crop, cx: d.cx + ((e.clientX - d.startX) / box.width) * k, cy: d.cy + ((e.clientY - d.startY) / box.height) * k });
  };
  const onPointerUp = () => { dragRef.current = null; };
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setZoom(crop.s * (e.deltaY > 0 ? 1.06 : 0.94));
  };

  const json = useMemo(() => JSON.stringify({
    masterFraming: MASTER_FRAMING,
    crops: Object.fromEntries(PIECES.map((p) => [p, {
      cx: +crops[p].cx.toFixed(4), cy: +crops[p].cy.toFixed(4), s: +crops[p].s.toFixed(4),
    }])),
  }, null, 2), [crops]);

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(json); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  const resetPiece = () => setCrop({ ...(COMMITTED[piece] ?? DEFAULT_CROP) });
  const resetAll = () => setCrops(Object.fromEntries(PIECES.map((p) => [p, { ...(COMMITTED[p] ?? DEFAULT_CROP) }])) as Record<Piece, Crop>);

  return { crops, piece, setPiece, palette, setPalette, method, setMethod, crop, setCrop, setZoom, canvasRef, onPointerDown, onPointerMove, onPointerUp, onWheel, json, copied, copy, resetPiece, resetAll };
}

// Editor display scale: when s>1 the master shrinks to 1/s of the canvas (centred) so the
// crop — which can now exceed the image — still fits, and the transparent padding shows as
// checker margin around the unit. For s≤1 the master fills the canvas exactly as before.
const editorDisp = (s: number) => 1 / Math.max(1, s);
const editorImgStyle = (s: number): CSSProperties => {
  const d = editorDisp(s); const m = ((1 - d) / 2) * 100;
  return { position: 'absolute', left: `${m}%`, top: `${m}%`, width: `${d * 100}%`, height: `${d * 100}%`, objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' };
};
const overlayStyle = (crop: Crop): CSSProperties => {
  const d = editorDisp(crop.s); const off = (1 - d) / 2;
  return {
    position: 'absolute', boxSizing: 'border-box',
    left: `${(off + (crop.cx - crop.s / 2) * d) * 100}%`, top: `${(off + (crop.cy - crop.s / 2) * d) * 100}%`,
    width: `${crop.s * d * 100}%`, height: `${crop.s * d * 100}%`,
    border: '2px solid #7fd0ff', boxShadow: '0 0 0 9999px rgba(2,8,13,.55)', borderRadius: 4, cursor: 'grab',
  };
};
const checkerBg = 'repeating-conic-gradient(#15202b 0% 25%, #0e161e 0% 50%) 50% / 28px 28px';

// In-studio Viewer surface — the same crop editor in the studio's [main][aside]
// frame. `header` carries the Viewer's Asset|Artwork|Portrait kind selector.
export function PortraitLab({ header }: { header?: ReactNode }): ReactElement {
  const ed = usePortraitEditor();
  const { crops, piece, palette, method, crop } = ed;
  const CANVAS = 360;
  return (
    <>
      <section className="al-lab-main" aria-label="Portrait crop editor">
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', padding: 16 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="tileset-tier-seg" style={{ width: CANVAS }} aria-label="Unit">
              {PIECES.map((p) => (
                <button key={p} type="button" className={p === piece ? 'is-active' : ''} onClick={() => ed.setPiece(p)} style={{ textTransform: 'capitalize' }}>{p}</button>
              ))}
            </div>
            <div
              ref={ed.canvasRef}
              onPointerDown={ed.onPointerDown} onPointerMove={ed.onPointerMove} onPointerUp={ed.onPointerUp} onWheel={ed.onWheel}
              style={{ position: 'relative', width: CANVAS, height: CANVAS, borderRadius: 8, overflow: 'hidden', background: checkerBg, touchAction: 'none', userSelect: 'none' }}
            >
              <img src={masterSrc(piece, palette)} alt="" draggable={false} style={editorImgStyle(crop.s)} />
              <div style={overlayStyle(crop)} />
            </div>
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <HudFrame piece={piece} palette={palette} crop={crop} size={150} label={`${piece} · ${method}`} method={method} />
              <HudFrame piece={piece} palette={palette} crop={crop} size={86} label="actual HUD size" method={method} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#7fa8bd', marginBottom: 6 }}>{piece} · all methods — click to select</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {PORTRAIT_METHODS.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => ed.setMethod(m.key)}
                    title={m.sub}
                    style={{ all: 'unset', cursor: 'pointer', borderRadius: 10, padding: 3, outline: m.key === method ? '2px solid #5fb0d6' : '2px solid transparent' }}
                  >
                    <HudFrame piece={piece} palette={palette} crop={crop} size={104} label={m.label} method={m.key} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#7fa8bd', marginBottom: 6 }}>All units · {method}</div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {PIECES.map((p) => <HudFrame key={p} piece={p} palette={palette} crop={crops[p]} size={72} label={p} method={method} />)}
              </div>
            </div>
          </div>
        </div>
      </section>
      <aside className="tileset-view-controls" aria-label="Portrait controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <div className="tileset-tier-seg" aria-label="Method" style={{ flexWrap: 'wrap' }}>
              {PORTRAIT_METHODS.map((m) => (
                <button key={m.key} type="button" className={m.key === method ? 'is-active' : ''} onClick={() => ed.setMethod(m.key)} title={m.sub}>{m.label}</button>
              ))}
            </div>
            <div className="tileset-tier-seg" aria-label="Palette">
              {PALETTES.map((p) => (
                <button key={p} type="button" className={p === palette ? 'is-active' : ''} onClick={() => ed.setPalette(p)} style={{ textTransform: 'capitalize' }} disabled={method !== 'smooth'} title={method !== 'smooth' ? 'Candidates are navy-only' : undefined}>{p.replace('-', ' ')}</button>
              ))}
            </div>
            <label className="tileset-catalog-zoom"><span>Zoom</span>
              <input type="range" min={0.15} max={S_MAX} step={0.005} value={Z_OFF - crop.s} onChange={(e) => ed.setZoom(Z_OFF - Number(e.target.value))} />
            </label>
            <label className="tileset-catalog-zoom"><span>Vertical</span>
              <input type="range" min={0} max={1} step={0.002} value={crop.cy} onChange={(e) => ed.setCrop({ ...crop, cy: Number(e.target.value) })} />
            </label>
            <label className="tileset-catalog-zoom"><span>Horizontal</span>
              <input type="range" min={0} max={1} step={0.002} value={crop.cx} onChange={(e) => ed.setCrop({ ...crop, cx: Number(e.target.value) })} />
            </label>
            <div className="tileset-button-row">
              <button type="button" onClick={ed.resetPiece}>Reset piece</button>
              <button type="button" onClick={ed.resetAll}>Reset all</button>
            </div>
            <button type="button" className="tileset-view-action" onClick={ed.copy}>{ed.copied ? 'Copied ✓' : 'Copy JSON'}</button>
          </div>
        </section>
      </aside>
    </>
  );
}

export function PortraitEditor(): ReactElement {
  const { crops, piece, setPiece, palette, setPalette, crop, setCrop, setZoom, canvasRef, onPointerDown, onPointerMove, onPointerUp, onWheel, json, copied, copy, resetPiece, resetAll } = usePortraitEditor();

  const CANVAS = 420;
  const overlay = overlayStyle(crop);

  return (
    <main style={{ minHeight: '100vh', background: '#0b1016', color: '#cfe3ee', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>Portrait Editor</h1>
      <p style={{ margin: '0 0 18px', color: '#7fa8bd', fontSize: 13 }}>
        Drag the crop to pan · scroll or use the zoom slider (below 1× adds transparent padding for headroom) · the crop is per-piece (shared across palettes).
        Tune each unit, then <strong>Copy JSON</strong> and paste it back in chat.
      </p>

      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Editing canvas */}
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {PIECES.map((p) => (
              <button key={p} onClick={() => setPiece(p)} style={tabStyle(p === piece)}>{p}</button>
            ))}
          </div>
          <div
            ref={canvasRef}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onWheel={onWheel}
            style={{ position: 'relative', width: CANVAS, height: CANVAS, borderRadius: 8, overflow: 'hidden',
              background: 'repeating-conic-gradient(#15202b 0% 25%, #0e161e 0% 50%) 50% / 28px 28px', touchAction: 'none', userSelect: 'none' }}
          >
            <img src={masterSrc(piece, palette)} alt="" draggable={false}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
            <div style={overlay} />
          </div>

          <div style={{ marginTop: 12, display: 'grid', gap: 8, maxWidth: CANVAS }}>
            <label style={rowStyle}>
              <span style={{ width: 56 }}>Zoom</span>
              {/* invert so dragging right = tighter crop */}
              <input type="range" min={0.15} max={S_MAX} step={0.005} value={Z_OFF - crop.s}
                onChange={(e) => setZoom(Z_OFF - Number(e.target.value))}
                style={{ flex: 1 }} />
              <span style={{ width: 44, textAlign: 'right' }}>{(1 / crop.s).toFixed(2)}×</span>
            </label>
            <label style={rowStyle}>
              <span style={{ width: 56 }}>Vertical</span>
              <input type="range" min={0} max={1} step={0.002} value={crop.cy}
                onChange={(e) => setCrop({ ...crop, cy: Number(e.target.value) })} style={{ flex: 1 }} />
            </label>
            <label style={rowStyle}>
              <span style={{ width: 56 }}>Horizontal</span>
              <input type="range" min={0} max={1} step={0.002} value={crop.cx}
                onChange={(e) => setCrop({ ...crop, cx: Number(e.target.value) })} style={{ flex: 1 }} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnStyle(false)} onClick={resetPiece}>Reset piece</button>
              <button style={btnStyle(false)} onClick={resetAll}>Reset all</button>
            </div>
          </div>
        </div>

        {/* Live previews */}
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {PALETTES.map((p) => (
              <button key={p} onClick={() => setPalette(p)} style={tabStyle(p === palette)}>{p}</button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <HudFrame piece={piece} palette={palette} crop={crop} size={200} label={`${piece} · large`} />
            <HudFrame piece={piece} palette={palette} crop={crop} size={86} label="actual HUD size" />
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#7fa8bd', marginBottom: 6 }}>All units · {palette}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {PIECES.map((p) => (
                <HudFrame key={p} piece={p} palette={palette} crop={crops[p]} size={86} label={p} />
              ))}
            </div>
          </div>
        </div>

        {/* Export */}
        <div style={{ width: 320 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <strong style={{ fontSize: 13 }}>Export</strong>
            <button style={btnStyle(true)} onClick={copy}>{copied ? 'Copied ✓' : 'Copy JSON'}</button>
          </div>
          <textarea readOnly value={json} spellCheck={false}
            style={{ width: '100%', height: 360, background: '#0e161e', color: '#bcd6e6', border: '1px solid #2a3b48',
              borderRadius: 6, padding: 10, fontFamily: 'ui-monospace, monospace', fontSize: 11 }} />
        </div>
      </div>
    </main>
  );
}

const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#9ec7da' };
function tabStyle(active: boolean): CSSProperties {
  return { padding: '5px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
    border: `1px solid ${active ? '#5fb0d6' : '#2a3b48'}`, background: active ? 'rgba(65,151,190,.22)' : '#121c25',
    color: active ? '#dcf0fb' : '#9ec7da', textTransform: 'capitalize' };
}
function btnStyle(primary: boolean): CSSProperties {
  return { padding: '6px 12px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
    border: `1px solid ${primary ? '#5fb0d6' : '#2a3b48'}`, background: primary ? 'rgba(65,151,190,.28)' : '#121c25', color: '#dcf0fb' };
}
