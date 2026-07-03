import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { SCENE_ANIMS } from './SceneBackdrop';

// Scene-animation inspector (/scene-anim-lab) — the shared eyes for the menu
// waterfall work. The menu plays the loop as an uncontrollable CSS steps()
// animation; here the SAME sheet + scene pixels are stepped by a JS clock so
// a human can pause, scrub frame-by-frame, slow the tempo, stare at the wrap
// window, and A/B bake variants — and then SAY which frame transition is
// wrong instead of describing a moving target. Dev tooling: plain controls,
// no kit chrome (Studio surfaces are "just a web page").

const SCENE_URL = '/assets/ui/main-menu/background-scene-v1.png';
const SCENE_W = 1586;

// Bake variants the lab can flip between. `sheet` frames must match `frames`.
const VARIANTS = [
  { id: 'scroll', label: 'Scroll bake (current live) — 12 frames', sheet: '/assets/ui/main-menu/scene-anim/waterfall-right.png', frames: 12 },
  { id: 'ai', label: 'AI frames, color-locked (previous) — 11 frames', sheet: '/assets/ui/main-menu/scene-anim/waterfall-right-ai.png', frames: 11 },
];

const REGION = SCENE_ANIMS[0]; // waterfall-right rect in scene px

export function SceneAnimLab(): ReactElement {
  const [variantId, setVariantId] = useState(VARIANTS[0].id);
  const variant = VARIANTS.find((v) => v.id === variantId) ?? VARIANTS[0];
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [frameMs, setFrameMs] = useState(REGION.frameMs);
  const [zoom, setZoom] = useState(3);
  const [wrapOnly, setWrapOnly] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const frameRef = useRef(0);

  const n = variant.frames;

  // JS frame clock (not CSS animation): deterministic, pausable, scrubbable.
  useEffect(() => {
    if (!playing) return undefined;
    const t = window.setInterval(() => {
      let next = (frameRef.current + 1) % n;
      if (wrapOnly) {
        // Stare at the wrap: cycle only the last two and first two frames.
        const window_ = [n - 2, n - 1, 0, 1];
        const at = window_.indexOf(frameRef.current);
        next = window_[(at + 1) % window_.length] ?? n - 2;
      }
      frameRef.current = next;
      setFrame(next);
    }, frameMs);
    return () => window.clearInterval(t);
  }, [playing, frameMs, n, wrapOnly]);

  const step = (d: number): void => {
    setPlaying(false);
    const next = ((frameRef.current + d) % n + n) % n;
    frameRef.current = next;
    setFrame(next);
  };

  const { x, y, w, h } = REGION;
  const view = useMemo(() => {
    const px = (v: number): string => `${v * zoom}px`;
    const scene: CSSProperties = {
      width: px(w),
      height: px(h),
      backgroundImage: `url("${SCENE_URL}")`,
      backgroundSize: `${SCENE_W * zoom}px auto`,
      backgroundPosition: `${-x * zoom}px ${-y * zoom}px`,
      imageRendering: 'pixelated',
      position: 'relative',
    };
    const overlay: CSSProperties = {
      position: 'absolute',
      inset: 0,
      backgroundImage: `url("${variant.sheet}")`,
      backgroundSize: `${w * n * zoom}px ${h * zoom}px`,
      backgroundPosition: `${-frame * w * zoom}px 0`,
      imageRendering: 'pixelated',
    };
    return { scene, overlay };
  }, [zoom, frame, n, variant.sheet, x, y, w, h]);

  return (
    <div style={{ padding: 24, color: '#cfe3f5', fontFamily: 'system-ui, sans-serif', background: '#060a10', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>Scene animation lab — right waterfall</h1>
      <p style={{ margin: '0 0 16px', color: '#8fb0c9', fontSize: 13 }}>
        Same sheet + scene pixels as the menu, stepped by a controllable clock. Frame 0 wraps to start the next cycle —
        watch the <strong>{n - 1} → 0</strong> transition.
      </p>

      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={view.scene}>
            {showOverlay ? <div style={view.overlay} /> : null}
          </div>
          <div style={{ marginTop: 8, fontSize: 26, fontVariantNumeric: 'tabular-nums' }}>
            frame <strong style={{ color: frame === 0 ? '#ff7a5c' : '#e9f4ff' }}>{frame}</strong> / {n - 1}
            {frame === 0 ? <span style={{ color: '#ff7a5c', fontSize: 14 }}> &nbsp;← wrap landed</span> : null}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12, minWidth: 300, fontSize: 14 }}>
          <label>
            Variant<br />
            <select value={variantId} onChange={(e) => { setVariantId(e.target.value); frameRef.current = 0; setFrame(0); }}>
              {VARIANTS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
            <button onClick={() => step(-1)}>◀ step</button>
            <button onClick={() => step(1)}>step ▶</button>
          </div>

          <label>
            Scrub: frame {frame}
            <input type="range" min={0} max={n - 1} value={frame} style={{ width: '100%' }}
              onChange={(e) => { setPlaying(false); const v = Number(e.target.value); frameRef.current = v; setFrame(v); }} />
          </label>

          <label>
            Tempo: {frameMs} ms/frame ({(n * frameMs / 1000).toFixed(2)}s loop; menu ships {REGION.frameMs} ms)
            <input type="range" min={40} max={400} step={10} value={frameMs} style={{ width: '100%' }}
              onChange={(e) => setFrameMs(Number(e.target.value))} />
          </label>

          <label>
            Zoom: {zoom}x
            <input type="range" min={1} max={6} value={zoom} style={{ width: '100%' }}
              onChange={(e) => setZoom(Number(e.target.value))} />
          </label>

          <label style={{ userSelect: 'none' }}>
            <input type="checkbox" checked={wrapOnly} onChange={(e) => setWrapOnly(e.target.checked)} />
            &nbsp;Wrap window only (plays {n - 2}, {n - 1}, 0, 1)
          </label>

          <label style={{ userSelect: 'none' }}>
            <input type="checkbox" checked={showOverlay} onChange={(e) => setShowOverlay(e.target.checked)} />
            &nbsp;Show animation overlay (off = the untouched scene art)
          </label>
        </div>
      </div>
    </div>
  );
}
