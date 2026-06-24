// Portrait Editor — an in-app tool for dialling in each unit's portrait headshot
// crop. Each unit is pre-rendered full-body (high-res masters at
// /assets/portrait-editor/<piece>/<palette>.png); here you drag to pan and
// scroll/slider to zoom a square crop, with a live preview in the real HUD
// portrait frame. The crop is per-piece (geometry), previewable in any palette.
// Export the JSON and hand it back — it maps to camera framing for crisp finals.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement, WheelEvent as ReactWheelEvent } from 'react';

const PIECES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const;
const PALETTES = ['navy-blue', 'crimson', 'golden', 'emerald'] as const;
type Piece = (typeof PIECES)[number];
type Palette = (typeof PALETTES)[number];
type Crop = { cx: number; cy: number; s: number };

// Master render framing (Tz·topZ, span·topZ) used per piece — emitted with the
// JSON so the crop can be mapped back to camera framing exactly.
const MASTER_FRAMING: Record<Piece, { tz: number; span: number }> = {
  pawn: { tz: 0.5, span: 1.45 }, knight: { tz: 0.5, span: 1.45 }, bishop: { tz: 0.5, span: 1.45 },
  rook: { tz: 0.45, span: 1.75 }, queen: { tz: 0.5, span: 1.45 }, king: { tz: 0.5, span: 1.45 },
};

// A sensible starting headshot: centred, framed on the upper third.
const DEFAULT_CROP: Crop = { cx: 0.5, cy: 0.32, s: 0.46 };
const STORAGE_KEY = 'portrait-editor-crops-v1';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function clampCrop({ cx, cy, s }: Crop): Crop {
  const ss = clamp(s, 0.15, 1);
  const half = ss / 2;
  return { s: ss, cx: clamp(cx, half, 1 - half), cy: clamp(cy, half, 1 - half) };
}

const masterSrc = (piece: Piece, pal: Palette) => `/assets/portrait-editor/${piece}/${pal}.png`;

// Render the cropped region of a square master to fill a frame, via an absolutely
// positioned img (width 1/s of the frame, translated so the crop centre is centred).
function CroppedView({ src, crop }: { src: string; crop: Crop }): ReactElement {
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

// The HUD's real portrait frame: square frame, 8px top/side padding (none at the
// bottom), and the square portrait contained + bottom-anchored so it bleeds to the
// bottom border. Mirrors .skirmish-portrait-frame so the preview is faithful.
function HudFrame({ src, crop, size, label }: { src: string; crop: Crop; size: number; label?: string }): ReactElement {
  const pad = Math.max(2, Math.round((size * 8) / 86)); // scale the 8px@86 padding
  const inner = size - 2 * pad; // contained square width (and height, bottom-anchored)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div className="skirmish-portrait-frame" style={{ width: size, height: size, padding: `${pad}px ${pad}px 0`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: pad, bottom: 0, width: inner, height: inner, overflow: 'hidden' }}>
          <CroppedView src={src} crop={crop} />
        </div>
      </div>
      {label ? <span style={{ fontSize: 11, color: '#7fa8bd' }}>{label}</span> : null}
    </div>
  );
}

function loadCrops(): Record<Piece, Crop> {
  const base = Object.fromEntries(PIECES.map((p) => [p, { ...DEFAULT_CROP }])) as Record<Piece, Crop>;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Record<Piece, Crop>>;
      for (const p of PIECES) if (saved[p]) base[p] = clampCrop(saved[p] as Crop);
    }
  } catch { /* defaults */ }
  return base;
}

export function PortraitEditor(): ReactElement {
  const [crops, setCrops] = useState<Record<Piece, Crop>>(loadCrops);
  const [piece, setPiece] = useState<Piece>('pawn');
  const [palette, setPalette] = useState<Palette>('navy-blue');
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
      const s = clamp(nextS, 0.15, 1);
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
    setCrop({ ...crop, cx: d.cx + (e.clientX - d.startX) / box.width, cy: d.cy + (e.clientY - d.startY) / box.height });
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

  const CANVAS = 420;
  const overlay: CSSProperties = {
    position: 'absolute', boxSizing: 'border-box',
    left: `${(crop.cx - crop.s / 2) * 100}%`, top: `${(crop.cy - crop.s / 2) * 100}%`,
    width: `${crop.s * 100}%`, height: `${crop.s * 100}%`,
    border: '2px solid #7fd0ff', boxShadow: '0 0 0 9999px rgba(2,8,13,.55)', borderRadius: 4, cursor: 'grab',
  };

  return (
    <main style={{ minHeight: '100vh', background: '#0b1016', color: '#cfe3ee', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>Portrait Editor</h1>
      <p style={{ margin: '0 0 18px', color: '#7fa8bd', fontSize: 13 }}>
        Drag the crop to pan · scroll or use the zoom slider · the crop is per-piece (shared across palettes).
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
              <input type="range" min={0.15} max={1} step={0.005} value={1.15 - crop.s}
                onChange={(e) => setZoom(1.15 - Number(e.target.value))}
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
              <button style={btnStyle(false)} onClick={() => setCrop({ ...DEFAULT_CROP })}>Reset piece</button>
              <button style={btnStyle(false)} onClick={() => setCrops(Object.fromEntries(PIECES.map((p) => [p, { ...DEFAULT_CROP }])) as Record<Piece, Crop>)}>Reset all</button>
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
            <HudFrame src={masterSrc(piece, palette)} crop={crop} size={200} label={`${piece} · large`} />
            <HudFrame src={masterSrc(piece, palette)} crop={crop} size={86} label="actual HUD size" />
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#7fa8bd', marginBottom: 6 }}>All units · {palette}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {PIECES.map((p) => (
                <HudFrame key={p} src={masterSrc(p, palette)} crop={crops[p]} size={86} label={p} />
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
