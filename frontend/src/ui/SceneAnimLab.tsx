import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { SCENE_ANIMS } from './SceneBackdrop';

// Scene-animation inspector as an embedded Studio Viewer kind (ADR-0058) — the shared eyes for
// the menu waterfall work. The menu plays the loop as an uncontrollable CSS steps() animation;
// here the SAME sheet + scene pixels are stepped by a JS clock so a human can pause, scrub
// frame-by-frame, slow the tempo, stare at the wrap window, and A/B bake variants. Preview in
// `.al-lab-main`, every control in the one `.tileset-view-controls` panel, reached from the Scene
// Animations catalog. Pure inspector — nothing committed is edited (ADR-0057 N/A).

const SCENE_URL = '/assets/ui/main-menu/background-scene-v1.png';
const SCENE_W = 1586;

export type SceneRegion = (typeof SCENE_ANIMS)[number];
export const SCENE_ANIM_REGIONS = SCENE_ANIMS;

interface Variant { id: string; label: string; sheet: string; frames: number }

// Bake variants per region: every region offers its live sheet; the right fall also keeps the
// retired AI-frames sheet around for comparison.
function variantsFor(region: SceneRegion): Variant[] {
  const live = { id: 'live', label: `Live sheet — ${region.frames} frames`, sheet: region.sheet, frames: region.frames };
  if (region.id === 'waterfall-right') {
    return [live, { id: 'ai', label: 'AI frames, color-locked (retired) — 11 frames', sheet: '/assets/ui/main-menu/scene-anim/waterfall-right-ai.png', frames: 11 }];
  }
  return [live];
}

// A static (frame-0) crop of a region, for the catalog card.
export function SceneRegionThumb({ region }: { region: SceneRegion }): ReactElement {
  const max = 140;
  const scale = Math.min(max / region.w, max / region.h);
  return (
    <span style={{
      display: 'block', width: region.w * scale, height: region.h * scale,
      backgroundImage: `url("${SCENE_URL}")`, backgroundSize: `${SCENE_W * scale}px auto`,
      backgroundPosition: `${-region.x * scale}px ${-region.y * scale}px`, imageRendering: 'pixelated', borderRadius: 4,
    }} />
  );
}

export function SceneAnimLab({ regionId, onRegionId, header }: {
  regionId: string; onRegionId: (id: string) => void; header?: ReactNode;
}): ReactElement {
  const region = SCENE_ANIMS.find((r) => r.id === regionId) ?? SCENE_ANIMS[0];
  const variants = variantsFor(region);
  const [variantId, setVariantId] = useState(variants[0].id);
  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [frameMs, setFrameMs] = useState(region.frameMs);
  const [zoom, setZoom] = useState(3);
  const [wrapOnly, setWrapOnly] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const frameRef = useRef(0);

  const n = variant.frames;

  // Region (the selection axis) is owned by the studio; on a change reset the per-region
  // view state — variant to live, tempo to the region's shipped ms, frame to 0.
  useEffect(() => {
    setVariantId('live');
    setFrameMs(region.frameMs);
    frameRef.current = 0;
    setFrame(0);
  }, [regionId, region.frameMs]);

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

  const { x, y, w, h } = region;
  const view = useMemo(() => {
    const px = (v: number): string => `${v * zoom}px`;
    const scene: CSSProperties = {
      width: px(w), height: px(h),
      backgroundImage: `url("${SCENE_URL}")`,
      backgroundSize: `${SCENE_W * zoom}px auto`,
      backgroundPosition: `${-x * zoom}px ${-y * zoom}px`,
      imageRendering: 'pixelated', position: 'relative',
    };
    const overlay: CSSProperties = {
      position: 'absolute', inset: 0,
      backgroundImage: `url("${variant.sheet}")`,
      backgroundSize: `${w * n * zoom}px ${h * zoom}px`,
      backgroundPosition: `${-frame * w * zoom}px 0`,
      imageRendering: 'pixelated',
    };
    return { scene, overlay };
  }, [zoom, frame, n, variant.sheet, x, y, w, h]);

  return (
    <>
      <style>{SA_CSS}</style>
      <section className="al-lab-main" aria-label="Scene animation preview">
        <div className="sa-stage">
          <div style={view.scene}>
            {showOverlay ? <div style={view.overlay} /> : null}
          </div>
          <div className="sa-counter">
            frame <strong style={{ color: frame === 0 ? '#ff7a5c' : '#e9f4ff' }}>{frame}</strong> / {n - 1}
            {frame === 0 ? <span className="sa-wrap"> ← wrap landed</span> : null}
          </div>
        </div>
      </section>

      <aside className="tileset-view-controls" aria-label="Scene animation controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <label className="tileset-category-select" title="Which menu-backdrop region you're inspecting.">
              <span>Region</span>
              <select value={region.id} onChange={(e) => onRegionId(e.target.value)} aria-label="Region">
                {SCENE_ANIMS.map((r) => <option key={r.id} value={r.id}>{r.id} — {r.frameMs}ms</option>)}
              </select>
            </label>
            <label className="tileset-category-select" title="Live sheet, or a retired bake for A/B.">
              <span>Variant</span>
              <select value={variantId} onChange={(e) => { setVariantId(e.target.value); frameRef.current = 0; setFrame(0); }} aria-label="Variant">
                {variants.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </label>
            <div className="sa-transport">
              <button type="button" className="sa-btn" onClick={() => setPlaying((p) => !p)}>{playing ? '❚❚ Pause' : '▶ Play'}</button>
              <button type="button" className="sa-btn" onClick={() => step(-1)}>◀</button>
              <button type="button" className="sa-btn" onClick={() => step(1)}>▶</button>
            </div>
            <label className="tileset-catalog-zoom">
              <span>Scrub · frame {frame}</span>
              <input type="range" min={0} max={n - 1} value={frame}
                onChange={(e) => { setPlaying(false); const v = Number(e.target.value); frameRef.current = v; setFrame(v); }} />
            </label>
            <label className="tileset-catalog-zoom">
              <span>Tempo · {frameMs}ms ({(n * frameMs / 1000).toFixed(2)}s loop; ships {region.frameMs}ms)</span>
              <input type="range" min={40} max={400} step={10} value={frameMs} onChange={(e) => setFrameMs(Number(e.target.value))} />
            </label>
            <label className="tileset-catalog-zoom">
              <span>Zoom · {zoom}×</span>
              <input type="range" min={1} max={6} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </label>
            <div className="sa-toggles">
              <button type="button" className={`sa-btn ${wrapOnly ? 'is-on' : ''}`} onClick={() => setWrapOnly((v) => !v)} title={`Cycle only ${n - 2}, ${n - 1}, 0, 1`}>Wrap window</button>
              <button type="button" className={`sa-btn ${showOverlay ? 'is-on' : ''}`} onClick={() => setShowOverlay((v) => !v)} title="Off = the untouched scene art">Overlay</button>
            </div>
          </div>
        </section>
      </aside>
    </>
  );
}

const SA_CSS = `
.sa-stage { align-self: stretch; display: grid; justify-items: center; align-content: center; gap: 10px; min-height: 60vh;
  border-radius: 4px; background: radial-gradient(120% 90% at 50% 18%, #12161f 0%, #060a10 70%); padding: 24px; }
.sa-counter { font-size: 24px; font-variant-numeric: tabular-nums; color: #cfe3f5; }
.sa-wrap { color: #ff7a5c; font-size: 14px; }
.sa-transport, .sa-toggles { display: flex; gap: 6px; flex-wrap: wrap; }
.sa-btn { box-sizing: border-box; height: 30px; padding: 0 12px; font: inherit; font-size: 13px; cursor: pointer;
  background: #111a2c; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 5px; }
.sa-btn:hover { background: #17223a; }
.sa-btn.is-on { background: #1d3354; border-color: #3f74c0; color: #eaf3ff; }
`;
