import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { SURFACE_ASSETS } from './surfaceCatalog';
import panelCfg from '../../config/nine-slice/panel.json';
import modeButtonCfg from '../../config/nine-slice/mode-button.json';

// Each frame's FILL boundary (px inset from the footprint) — set by eye in the 9-slice editor,
// stored in config/nine-slice/<asset>.json. The surface clips to it so it stops where the frame's
// visual interior begins, while the frame's corners bleed outside it. (See ADR-0034 / the editor's
// Fill box.) 0 = no inset (surface fills to the footprint, the old behaviour).
type FrameId = 'panel' | 'mode-button';
const FRAME_FILL: Record<FrameId, number> = {
  panel: (panelCfg as { fill?: number }).fill ?? 0,
  'mode-button': (modeButtonCfg as { fill?: number }).fill ?? 0,
};

// The "settings dressing room": a kept Studio tool that iframes the REAL /settings page and
// fills its chrome with accepted surfaces, so you can decide what goes where before we bake it
// in. Targets: the two container boxes (Tabs box = rail, Rows box = main), the title bar, and
// the inner elements (Buttons = tabs, Rows). Each gets an independent surface.
//
// Zoom and the starting point are GLOBAL and the texture uses background-attachment: fixed —
// every region samples the same viewport-anchored sheet, so the pattern flows unbroken across
// regions. It reads as one continuous surface seen through several windows.
//
// The two container boxes also get a Disable toggle (strip the frame + fill entirely so the
// inner buttons/rows float) and a transparency dial.

type RegionId = 'title' | 'tabsBox' | 'buttons' | 'rowsBox' | 'rows';
type BoxId = 'tabsBox' | 'rowsBox';

interface RegionDef {
  id: RegionId;
  label: string;
  selector: string;
  hint: string;
  // The element's native 9-slice frame, restated WITHOUT the `fill` keyword so the interior is
  // transparent and the surface shows through while the frame art is preserved. Boxes use the
  // ornamental panel-line frame (matching the title bar); buttons/rows keep their own art.
  frame: string;
  frameWidth: number; // the border-image rendered width (px) = the element's native border-width
  configId: FrameId; // which frame config supplies this region's FILL boundary
  isBox: boolean;
}

// Selectors verified against the live Settings DOM (Settings.tsx). The main box is
// `.settings-main-frame` (a bare `.settings-frame` would also hit the rail — shared class).
const REGIONS: RegionDef[] = [
  { id: 'title', label: 'Title bar', selector: '[data-testid="settings"] .app-titlebar.settings-header-frame', hint: 'The top header strip.', frame: 'url("/assets/ui/explore/frames/panel-line.png") 24 / 16px round', frameWidth: 16, configId: 'panel', isBox: false },
  { id: 'tabsBox', label: 'Tabs box', selector: '[data-testid="settings"] .settings-rail-frame', hint: 'The left rail container holding the tab buttons.', frame: 'url("/assets/ui/explore/frames/panel-line.png") 24 / 16px round', frameWidth: 16, configId: 'panel', isBox: true },
  { id: 'buttons', label: 'Buttons · tabs', selector: '[data-testid="settings"] .settings-tab', hint: 'The individual tab buttons inside the rail.', frame: 'url("/assets/ui/explore/frames/panel-line.png") 24 / 12px round', frameWidth: 12, configId: 'mode-button', isBox: false },
  { id: 'rowsBox', label: 'Rows box', selector: '[data-testid="settings"] .settings-main-frame', hint: 'The main panel container holding the rows.', frame: 'url("/assets/ui/explore/frames/panel-line.png") 24 / 16px round', frameWidth: 16, configId: 'panel', isBox: true },
  { id: 'rows', label: 'Rows', selector: '[data-testid="settings"] .settings-row', hint: 'The individual setting rows.', frame: 'url("/assets/ui/explore/frames/panel-line.png") 24 / 14px round', frameWidth: 14, configId: 'panel', isBox: false },
];

const BOX_IDS: BoxId[] = ['tabsBox', 'rowsBox'];
const DEFAULT_TILE = 1024;
// Sentinel stored in surfaces[id] meaning "keep the frame, drop the fill" (transparent interior).
const CLEAR = '__clear';
const isSurface = (value: string | null): boolean => !!value && value !== CLEAR;

interface DressingConfig {
  surfaces: Record<RegionId, string | null>; // per-region: which surface fills it (or null = default chrome)
  boxDisabled: Record<BoxId, boolean>; // strip the box's frame + fill entirely
  boxOpacity: Record<BoxId, number>; // 0..1 transparency of the box (and its contents)
  tilePx: number; // GLOBAL tile size (zoom); surfaces are 1024px native
  offsetX: number; // GLOBAL background-position-x — the surface "starting point"
  offsetY: number; // GLOBAL background-position-y
}

const blankConfig = (): DressingConfig => ({
  surfaces: { title: null, tabsBox: null, buttons: null, rowsBox: null, rows: null },
  boxDisabled: { tabsBox: false, rowsBox: false },
  boxOpacity: { tabsBox: 1, rowsBox: 1 },
  tilePx: DEFAULT_TILE,
  offsetX: 0,
  offsetY: 0,
});

function seededConfig(seed: string): DressingConfig {
  const base = blankConfig();
  return { ...base, surfaces: { title: seed, tabsBox: seed, buttons: seed, rowsBox: seed, rows: seed } };
}

// A fresh load always opens at DEFAULTS, so the dressing room reflects the LIVE page (no
// overrides) and can never drift from what actually ships. Choices live only in the current
// session — use "Copy CSS" to keep a result; they're intentionally not persisted across reloads.
function loadConfig(seed?: string): DressingConfig {
  return seed ? seededConfig(seed) : blankConfig();
}

// Build the override stylesheet injected into the /settings iframe (and copied for baking-in).
// `geom` carries each region's ORIGINAL padding (read live once) so the FILL clip can compensate
// it and keep content from shifting; absent it (not measured yet) we fall back to no-clip.
function buildCss(config: DressingConfig, geom: Map<RegionId, number[]>): string {
  const { tilePx, offsetX, offsetY } = config;
  const parts: string[] = [];
  for (const region of REGIONS) {
    const sel = region.selector;
    const disabled = region.isBox && config.boxDisabled[region.id as BoxId];
    if (disabled) {
      // Strip the frame + fill: panel.png's navy interior comes entirely from the border-image
      // `fill`, so dropping the border-image leaves a fully transparent container.
      parts.push(`${sel} { border-image: none !important; background: transparent !important; box-shadow: none !important; }`);
      continue;
    }
    const name = config.surfaces[region.id];
    if (region.id === 'title') {
      // The title bar is no longer a frame+fill region (ADR-0037): it's a full-bleed surface
      // + a forged stud strip + a centred stud. Mirror that here so dressing it swaps the
      // SURFACE under the real nailhead chrome, instead of wrapping it in the retired frame —
      // keeping the dressing room honest with what actually ships. No surface = no override, so
      // the default shows the live bar; CLEAR keeps the chrome but drops the surface.
      const studded = 'url("/assets/ui/titlebar/ornament-nailstud.png") center bottom / auto 26px no-repeat, url("/assets/ui/titlebar/band-studded.png") left bottom / auto var(--titlebar-rule-h, 14px) repeat-x';
      if (name === CLEAR) {
        parts.push(`${sel} { border: 0 !important; border-image: none !important; background: ${studded} !important; image-rendering: pixelated !important; }`);
      } else if (name) {
        const asset = SURFACE_ASSETS.find((s) => s.name === name);
        if (asset) {
          const surfaceBg = `url("${asset.file}") ${offsetX}px ${offsetY}px / ${tilePx}px repeat fixed`;
          parts.push(`${sel} { border: 0 !important; border-image: none !important; background: ${studded}, ${surfaceBg} !important; image-rendering: pixelated !important; }`);
        }
      }
      continue;
    }
    if (name === CLEAR) {
      // Keep the element's frame art but drop the baked `fill` so the interior is transparent —
      // whatever is behind (the box's surface for buttons/rows; the page for the title) shows
      // through. Solves the "navy patch on a surfaced box" fill problem.
      parts.push(`${sel} {
  border-image: ${region.frame} !important;
  background: transparent !important;
  image-rendering: pixelated !important;
}`);
    } else {
      const asset = name ? SURFACE_ASSETS.find((s) => s.name === name) : undefined;
      if (asset) {
        const surfaceBg = `url("${asset.file}") ${offsetX}px ${offsetY}px / ${tilePx}px repeat fixed`;
        const fill = FRAME_FILL[region.configId] ?? 0;
        const pad = geom.get(region.id);
        if (fill > 0 && pad) {
          // FILL clip: shrink border-width to the fill inset so background-clip:padding-box lands on
          // the fill box, but keep the frame at its full thickness via border-image-width, and add
          // (frameWidth − fill) to the original padding so content stays put. The surface then stops
          // at the fill boundary while the frame's corners bleed past it.
          const compensated = pad.map((p) => `${Math.max(0, Math.round(p + region.frameWidth - fill))}px`).join(' ');
          parts.push(`${sel} {
  border-image: ${region.frame} !important;
  border-width: ${fill}px !important;
  padding: ${compensated} !important;
  background: ${surfaceBg} !important;
  background-origin: padding-box !important;
  background-clip: padding-box !important;
  image-rendering: pixelated !important;
}`);
        } else {
          parts.push(`${sel} {
  border-image: ${region.frame} !important;
  background: ${surfaceBg} !important;
  background-origin: border-box !important;
  background-clip: border-box !important;
  image-rendering: pixelated !important;
}`);
        }
      }
    }
    if (region.isBox) {
      const op = config.boxOpacity[region.id as BoxId];
      if (typeof op === 'number' && op < 1) parts.push(`${sel} { opacity: ${op} !important; }`);
    }
  }
  if (parts.length) {
    // background-attachment: fixed anchors to the nearest *transformed* ancestor, not the
    // viewport. The settings screen carries an (identity) transform, which makes every region
    // restart the surface from its own corner — the fill reads as a per-element patch instead of
    // one continuous sheet. Neutralise it so all regions sample the same viewport-anchored
    // surface: the texture then persists element-to-element as if it filled the whole screen.
    parts.unshift('[data-testid="settings"] .settings-screen { transform: none !important; }');
  }
  return parts.join('\n');
}

// `header` (optional) is the Studio Viewer's kind-selector strip, injected when the dressing
// room is mounted as the Settings page's viewer (Pages catalog) so it matches the sibling page
// viewers. Omitted when it runs as the standalone Dressing studio mode.
export function SurfaceDressingRoom({ seed, header }: { seed?: string; header?: ReactNode }): ReactElement {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [config, setConfig] = useState<DressingConfig>(() => loadConfig(seed));
  const [copied, setCopied] = useState(false);

  // inject() reads the latest config via a ref so the mount-time load handler / interval stay
  // stable (no re-subscribe per keystroke) while always painting current values.
  const configRef = useRef(config);
  configRef.current = config;
  // Each region's ORIGINAL padding [t,r,b,l], measured ONCE per element class (before the FILL
  // clip overrides it) so the clip can compensate padding without the value drifting on re-inject.
  const geomRef = useRef<Map<RegionId, number[]>>(new Map());

  const inject = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.head) return; // transient during navigation
      const win = doc.defaultView;
      if (win) {
        // Measure uncached regions. Our non-clip rules never touch padding, so what we read here
        // is the element's true original padding even if a prior inject already styled it.
        for (const region of REGIONS) {
          if (geomRef.current.has(region.id)) continue;
          const el = doc.querySelector(region.selector);
          if (!el) continue;
          const cs = win.getComputedStyle(el);
          geomRef.current.set(region.id, [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map((v) => parseFloat(v) || 0));
        }
      }
      let style = doc.getElementById('surface-dressing') as HTMLStyleElement | null;
      if (!style) {
        style = doc.createElement('style');
        style.id = 'surface-dressing';
        doc.head.appendChild(style);
      }
      style.textContent = buildCss(configRef.current, geomRef.current);
    } catch {
      /* same-origin access can blip during reload — re-inject on the next tick/load */
    }
  }, []);

  // Re-inject live whenever the config changes.
  useEffect(() => {
    inject();
  }, [config, inject]);

  // The SPA mounts /settings asynchronously after the iframe load fires, so re-inject on load
  // and on a short interval (mirrors the harness). Same-origin: contentDocument is reachable.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => inject();
    iframe.addEventListener('load', onLoad);
    let n = 0;
    const timer = window.setInterval(() => {
      inject();
      if (++n > 24) window.clearInterval(timer);
    }, 250);
    return () => {
      iframe.removeEventListener('load', onLoad);
      window.clearInterval(timer);
    };
  }, [inject]);

  const setSurface = (id: RegionId, surface: string | null): void =>
    setConfig((prev) => ({ ...prev, surfaces: { ...prev.surfaces, [id]: surface } }));

  const setAll = (surface: string | null): void =>
    setConfig((prev) => ({
      ...prev,
      surfaces: { title: surface, tabsBox: surface, buttons: surface, rowsBox: surface, rows: surface },
    }));

  const setBoxDisabled = (id: BoxId, value: boolean): void =>
    setConfig((prev) => ({ ...prev, boxDisabled: { ...prev.boxDisabled, [id]: value } }));

  const setBoxOpacity = (id: BoxId, value: number): void =>
    setConfig((prev) => ({ ...prev, boxOpacity: { ...prev.boxOpacity, [id]: value } }));

  const setGlobal = (patch: Partial<Pick<DressingConfig, 'tilePx' | 'offsetX' | 'offsetY'>>): void =>
    setConfig((prev) => ({ ...prev, ...patch }));

  const copyCss = async (): Promise<void> => {
    const css = buildCss(config, geomRef.current) || '/* Nothing assigned yet — pick a surface for a region. */';
    try {
      await navigator.clipboard.writeText(css);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — ignore; the values are still saved */
    }
  };

  // A real surface image is needed before the global tile/offset sliders do anything.
  const anySurface = REGIONS.some((r) => isSurface(config.surfaces[r.id]));
  // Any override at all (surface, transparent, disable, or opacity) means there's CSS to copy.
  const anyRule = anySurface
    || REGIONS.some((r) => config.surfaces[r.id] === CLEAR)
    || BOX_IDS.some((id) => config.boxDisabled[id] || config.boxOpacity[id] < 1);

  return (
    <>
      <section className="surface-dressing-main" aria-label="Settings preview">
        <iframe ref={iframeRef} className="surface-dressing-frame" src="/settings" title="Live settings preview" />
      </section>
      <aside className="tileset-view-controls" aria-label="Surface placement controls">
        <section className="tileset-inspector-section">
          <h2>Dressing room</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="tileset-catalog-note">
              Assign a surface to each region of the live Settings page. Zoom and starting point are shared, so the texture reads as one continuous surface. The Tabs and Rows boxes can also be disabled or made transparent. Choices are saved.
            </p>

            <label className="tileset-filter-field">
              <span>Set all regions</span>
              <select
                value=""
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === '__none') setAll(null);
                  else if (value) setAll(value);
                }}
              >
                <option value="">— quick fill —</option>
                {SURFACE_ASSETS.map((s) => (
                  <option key={s.name} value={s.name}>{s.label}</option>
                ))}
                <option value={CLEAR}>Transparent (see through)</option>
                <option value="__none">None · default</option>
              </select>
            </label>

            {REGIONS.map((region) => {
              const name = config.surfaces[region.id];
              const boxId = region.id as BoxId;
              const disabled = region.isBox && config.boxDisabled[boxId];
              const empty = region.isBox ? !name && !disabled && config.boxOpacity[boxId] >= 1 : !name;
              return (
                <div className={`surface-region-card ${empty ? 'is-empty' : ''}`.trim()} key={region.id}>
                  <strong title={region.hint}>{region.label}</strong>
                  <label className="tileset-filter-field">
                    <span>Surface</span>
                    <select value={name ?? ''} disabled={disabled} onChange={(event) => setSurface(region.id, event.target.value || null)}>
                      <option value="">None · default</option>
                      <option value={CLEAR}>Transparent (see through)</option>
                      {SURFACE_ASSETS.map((s) => (
                        <option key={s.name} value={s.name}>{s.label}</option>
                      ))}
                    </select>
                  </label>
                  {region.isBox ? (
                    <>
                      <label className="surface-box-toggle">
                        <input type="checkbox" checked={disabled} onChange={(event) => setBoxDisabled(boxId, event.target.checked)} />
                        <span>Disable box (no frame)</span>
                      </label>
                      <label className="tileset-catalog-zoom">
                        <span>Transparency · {Math.round(config.boxOpacity[boxId] * 100)}%</span>
                        <input type="range" min={0} max={1} step={0.05} value={config.boxOpacity[boxId]} disabled={disabled} onChange={(event) => setBoxOpacity(boxId, Number(event.target.value))} />
                      </label>
                    </>
                  ) : null}
                </div>
              );
            })}

            <div className={`surface-region-card surface-global-card ${anySurface ? '' : 'is-empty'}`.trim()}>
              <strong>Surface · all regions</strong>
              <label className="tileset-catalog-zoom">
                <span>Tile size · {config.tilePx}px</span>
                <input type="range" min={128} max={2048} step={16} value={config.tilePx} disabled={!anySurface} onChange={(event) => setGlobal({ tilePx: Number(event.target.value) })} />
              </label>
              <label className="tileset-catalog-zoom">
                <span>Start X · {config.offsetX}px</span>
                <input type="range" min={-1024} max={1024} step={4} value={config.offsetX} disabled={!anySurface} onChange={(event) => setGlobal({ offsetX: Number(event.target.value) })} />
              </label>
              <label className="tileset-catalog-zoom">
                <span>Start Y · {config.offsetY}px</span>
                <input type="range" min={-1024} max={1024} step={4} value={config.offsetY} disabled={!anySurface} onChange={(event) => setGlobal({ offsetY: Number(event.target.value) })} />
              </label>
              <button type="button" className="surface-region-reset" disabled={!anySurface} onClick={() => setGlobal({ tilePx: DEFAULT_TILE, offsetX: 0, offsetY: 0 })}>
                Reset zoom & start
              </button>
            </div>

            <button type="button" className="tileset-view-action" onClick={copyCss} disabled={!anyRule}>
              {copied ? 'Copied CSS ✓' : 'Copy CSS'}
            </button>
          </div>
        </section>
      </aside>
    </>
  );
}
