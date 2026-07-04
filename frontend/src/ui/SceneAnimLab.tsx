import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { SCENE_ANIMS, SceneBackdrop } from './SceneBackdrop';

// Scene-animation inspector as an embedded Studio Viewer kind (ADR-0058) — the shared eyes for
// the menu waterfall work. The menu plays the loop as an uncontrollable CSS steps() animation;
// here the SAME sheet + scene pixels are stepped by a JS clock so a human can pause, scrub
// frame-by-frame, slow the tempo, stare at the wrap window, and A/B bake variants. Preview in
// `.al-lab-main`, every control in the one `.tileset-view-controls` panel, reached from the Scene
// Animations catalog. Pure inspector — nothing committed is edited (ADR-0057 N/A).

const SCENE_URL = '/assets/ui/main-menu/background-scene-v1.png';
const SCENE_W = 1586;
const SCENE_H = 991;

export type SceneRegion = (typeof SCENE_ANIMS)[number];
export const SCENE_ANIM_REGIONS = SCENE_ANIMS;

// The Animated Scenes catalog: whole backdrops, each owning a set of animated regions. Today
// only the main-menu backdrop, but modelled as a list so a second scene is one more entry
// (ADR-0059) rather than a fork. regionIds index into SCENE_ANIMS.
export interface SceneAnimScene { id: string; label: string; url: string; w: number; h: number; regionIds: string[] }
export const SCENE_ANIM_SCENES: SceneAnimScene[] = [
  { id: 'main-menu', label: 'Main Menu', url: SCENE_URL, w: SCENE_W, h: SCENE_H, regionIds: SCENE_ANIMS.map((r) => r.id) },
];

const shortRegionName = (id: string): string => id.replace(/^waterfall-/, '');

interface Variant { id: string; label: string; sheet: string; frames: number }

const SCENE_ANIM_DIR = '/assets/ui/main-menu/scene-anim/';
function cand(name: string, hint: string): Variant {
  return { id: name, label: `Candidate — ${hint}`, sheet: `${SCENE_ANIM_DIR}${name}.png`, frames: 12 };
}

// Liveliness candidates for the right-side falls, baked for A/B in this inspector
// (build-scene-anim.py --scroll from the static art; all 12-frame, loop-clean by construction).
// The shipped bakes gate water at brightness 64 and animate only ~4-13% of each box, reading as
// too static; these lower the gate so more of the fall moves. Coverage is the key lever: past
// ~35-46% the scroll starts animating non-water (wet rock / mist / the flat lake), which reads as
// unnatural shimmer. Ordered here CALMEST -> FULLEST. Verdict tags come from an adversarial judge
// panel (liveliness / naturalism / motion). Pick the winner in the inspector, then promote it to
// the live sheet + SCENE_ANIMS and delete the rest. Deliberately not committed long-term.
const RIGHT_CANDIDATES: Record<string, Variant[]> = {
  'waterfall-right': [
    cand('cand-right-b62-s3', '21% · calmest, closest to waterfall-left feel'),
    cand('cand-right-b58-s3', '25% · calm'),
    cand('cand-right-b52-s3', '34% · panel pick ★ — lively + clean'),
    cand('cand-right-b46-s3', '46% · livelier (mild rock bleed)'),
    cand('cand-right-b46-s4', '46% · livelier, faster (mild rock bleed)'),
    cand('cand-right-b42-s3', '56% · full — over-shimmer: rock/mist/pool'),
    cand('cand-right-b42-s5', '56% · fullest — over-shimmer: whole-cliff pulse'),
  ],
  'waterfall-right-lower': [
    cand('cand-rlow-b64-s3', '19% · calmest, lake stays still (~reference)'),
    cand('cand-rlow-b60-s3', '26% · calm'),
    cand('cand-rlow-b56-s3', '34% · panel pick ★'),
    cand('cand-rlow-b48-s3', '54% · over-shimmer: lake speckle + boiling'),
    cand('cand-rlow-b48-s4', '54% · over-shimmer: lake drift + wrap jolt'),
    cand('cand-rlow-b44-s5', '63% · liveliest (lake + rock sparkle)'),
  ],
  'waterfall-right-mid': [
    cand('cand-rmid-b58-s3', '24% · calmest (~reference)'),
    cand('cand-rmid-b54-s3', '33% · calm'),
    cand('cand-rmid-b48-s3', '46% · panel pick ★'),
    cand('cand-rmid-b42-s3', '58% · busy (rock bleed)'),
    cand('cand-rmid-b42-s4', '58% · over-shimmer: strobing + wrap jolt'),
    cand('cand-rmid-b38-s5', '65% · full, clean motion but wide smear'),
  ],
};

// Bake variants per region: every region offers its live sheet, then any liveliness candidates,
// then (for the big right fall) the retired AI-frames sheet for comparison.
function variantsFor(region: SceneRegion): Variant[] {
  const live = { id: 'live', label: `Live sheet — ${region.frames} frames`, sheet: region.sheet, frames: region.frames };
  const candidates = RIGHT_CANDIDATES[region.id] ?? [];
  const retired: Variant[] = region.id === 'waterfall-right'
    ? [{ id: 'ai', label: 'AI frames, color-locked (retired) — 11 frames', sheet: `${SCENE_ANIM_DIR}waterfall-right-ai.png`, frames: 11 }]
    : [];
  return [live, ...candidates, ...retired];
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

// The Animated Scenes viewer (Viewer 'animscene' kind): the whole backdrop with a clickable box
// over each animated region (the SCENE_ANIMS rects) — an overview picker that LINKS to the
// per-region Scene Animations viewer (onPickRegion). It reuses the canonical live <SceneBackdrop>
// (ADR-0059) so the scene animates here exactly as on the home page, satisfying ADR-0029's rule
// that a read-only Viewer exercises the live component, not a dead still image. Region boxes and
// the Details list both navigate; smaller boxes take a higher z-index so overlaps stay clickable.
export function SceneRegionPicker({ sceneId, onSceneId, onPickRegion, header }: {
  sceneId: string; onSceneId: (id: string) => void; onPickRegion: (regionId: string) => void; header?: ReactNode;
}): ReactElement {
  const scene = SCENE_ANIM_SCENES.find((s) => s.id === sceneId) ?? SCENE_ANIM_SCENES[0];
  const regions = SCENE_ANIMS.filter((r) => scene.regionIds.includes(r.id));
  return (
    <>
      <style>{SA_CSS}</style>
      <section className="al-lab-main" aria-label="Animated scene picker">
        <div className="sa-stage">
          <div className="sa-picker-scene" style={{ aspectRatio: `${scene.w} / ${scene.h}` }}>
            <SceneBackdrop />
            {regions.map((r) => (
              <button
                key={r.id}
                type="button"
                className="sa-picker-box"
                style={{
                  left: `${(r.x / scene.w) * 100}%`,
                  top: `${(r.y / scene.h) * 100}%`,
                  width: `${(r.w / scene.w) * 100}%`,
                  height: `${(r.h / scene.h) * 100}%`,
                  zIndex: Math.round(1e7 / (r.w * r.h)),
                }}
                onClick={() => onPickRegion(r.id)}
                title={`Inspect ${r.id} — ${r.frames} frames · ${r.frameMs}ms`}
                aria-label={`Inspect ${r.id}`}
              >
                <span className="sa-picker-tag">{shortRegionName(r.id)}</span>
              </button>
            ))}
          </div>
          <div className="sa-counter">Click a waterfall to inspect it</div>
        </div>
      </section>

      <aside className="tileset-view-controls" aria-label="Animated scene controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            {SCENE_ANIM_SCENES.length > 1 ? (
              <label className="tileset-category-select" title="Which animated scene you're mapping.">
                <span>Scene</span>
                <select value={scene.id} onChange={(e) => onSceneId(e.target.value)} aria-label="Scene">
                  {SCENE_ANIM_SCENES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            ) : null}
            <div className="sa-picker-details">
              <div className="sa-picker-details-head">{scene.label}</div>
              <div className="sa-picker-details-sub">{scene.w}×{scene.h} · {regions.length} animated waterfalls</div>
              <ul className="sa-picker-list">
                {regions.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="sa-picker-listbtn" onClick={() => onPickRegion(r.id)}>
                      <span>{shortRegionName(r.id)}</span>
                      <span className="sa-picker-listmeta">{r.frames}f · {r.frameMs}ms</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </aside>
    </>
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
.sa-picker-scene { position: relative; width: min(100%, 760px); aspect-ratio: 1586 / 991;
  border-radius: 6px; overflow: hidden; box-shadow: 0 2px 20px rgba(0, 0, 0, .55); }
.sa-picker-box { position: absolute; box-sizing: border-box; margin: 0; padding: 0; cursor: pointer;
  border: 2px solid rgba(140, 205, 255, .7); background: rgba(90, 170, 255, .05);
  border-radius: 3px; transition: background .12s, border-color .12s, box-shadow .12s; }
.sa-picker-box:hover, .sa-picker-box:focus-visible { outline: none; background: rgba(140, 205, 255, .24);
  border-color: #bfe2ff; box-shadow: 0 0 0 2px rgba(140, 205, 255, .35); }
.sa-picker-tag { position: absolute; top: 0; left: 0; font-size: 10px; line-height: 1; padding: 2px 4px;
  background: rgba(6, 12, 20, .82); color: #d6ebff; border-radius: 3px 0 4px 0; white-space: nowrap; pointer-events: none; }
.sa-picker-box:hover .sa-picker-tag { background: #1d3354; color: #eaf3ff; }
.sa-picker-details { color: #cfe3f5; font-size: 13px; display: grid; gap: 6px; }
.sa-picker-details-head { font-size: 15px; font-weight: 600; color: #eaf3ff; }
.sa-picker-details-sub { color: #8fb0ce; }
.sa-picker-list { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 4px; }
.sa-picker-listbtn { width: 100%; display: flex; justify-content: space-between; gap: 8px; align-items: center;
  height: 28px; padding: 0 8px; font: inherit; font-size: 12px; cursor: pointer; background: #111a2c;
  color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 5px; }
.sa-picker-listbtn:hover { background: #17223a; border-color: #3f74c0; }
.sa-picker-listmeta { color: #7f9ec0; font-variant-numeric: tabular-nums; }
`;
