import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { SURFACE_ASSETS } from './surfaceCatalog';

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
  isBox: boolean;
}

// Selectors verified against the live Settings DOM (Settings.tsx). The main box is
// `.settings-main-frame` (a bare `.settings-frame` would also hit the rail — shared class).
const REGIONS: RegionDef[] = [
  { id: 'title', label: 'Title bar', selector: '[data-testid="settings"] .app-titlebar.settings-header-frame', hint: 'The top header strip.', frame: 'url("/assets/ui/explore/frames/panel-line.png") 24 / 16px round', isBox: false },
  { id: 'tabsBox', label: 'Tabs box', selector: '[data-testid="settings"] .settings-rail-frame', hint: 'The left rail container holding the tab buttons.', frame: 'url("/assets/ui/explore/frames/panel-line.png") 24 / 16px round', isBox: true },
  { id: 'buttons', label: 'Buttons · tabs', selector: '[data-testid="settings"] .settings-tab', hint: 'The individual tab buttons inside the rail.', frame: 'url("/assets/ui/kit/mode-button.png") 24 / 12px round', isBox: false },
  { id: 'rowsBox', label: 'Rows box', selector: '[data-testid="settings"] .settings-main-frame', hint: 'The main panel container holding the rows.', frame: 'url("/assets/ui/explore/frames/panel-line.png") 24 / 16px round', isBox: true },
  { id: 'rows', label: 'Rows', selector: '[data-testid="settings"] .settings-row', hint: 'The individual setting rows.', frame: 'url("/assets/ui/kit/row.png") 20 / 14px stretch', isBox: false },
];

const BOX_IDS: BoxId[] = ['tabsBox', 'rowsBox'];
const STORAGE_KEY = 'chess-tactics:surface-dressing:v3';
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

function loadConfig(seed?: string): DressingConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DressingConfig>;
      const base = blankConfig();
      return {
        surfaces: { ...base.surfaces, ...(parsed.surfaces ?? {}) },
        boxDisabled: { ...base.boxDisabled, ...(parsed.boxDisabled ?? {}) },
        boxOpacity: { ...base.boxOpacity, ...(parsed.boxOpacity ?? {}) },
        tilePx: typeof parsed.tilePx === 'number' ? parsed.tilePx : base.tilePx,
        offsetX: typeof parsed.offsetX === 'number' ? parsed.offsetX : base.offsetX,
        offsetY: typeof parsed.offsetY === 'number' ? parsed.offsetY : base.offsetY,
      };
    }
  } catch {
    /* corrupt/absent storage — fall through to a fresh config */
  }
  return seed ? seededConfig(seed) : blankConfig();
}

// Build the override stylesheet injected into the /settings iframe (and copied for baking-in).
function buildCss(config: DressingConfig): string {
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
        parts.push(`${sel} {
  border-image: ${region.frame} !important;
  background: url("${asset.file}") ${offsetX}px ${offsetY}px / ${tilePx}px repeat fixed !important;
  background-origin: border-box !important;
  background-clip: border-box !important;
  image-rendering: pixelated !important;
}`);
      }
    }
    if (region.isBox) {
      const op = config.boxOpacity[region.id as BoxId];
      if (typeof op === 'number' && op < 1) parts.push(`${sel} { opacity: ${op} !important; }`);
    }
  }
  return parts.join('\n');
}

export function SurfaceDressingRoom({ seed }: { seed?: string }): ReactElement {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [config, setConfig] = useState<DressingConfig>(() => loadConfig(seed));
  const [copied, setCopied] = useState(false);

  // inject() reads the latest config via a ref so the mount-time load handler / interval stay
  // stable (no re-subscribe per keystroke) while always painting current values.
  const configRef = useRef(config);
  configRef.current = config;

  const inject = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.head) return; // transient during navigation
      let style = doc.getElementById('surface-dressing') as HTMLStyleElement | null;
      if (!style) {
        style = doc.createElement('style');
        style.id = 'surface-dressing';
        doc.head.appendChild(style);
      }
      style.textContent = buildCss(configRef.current);
    } catch {
      /* same-origin access can blip during reload — re-inject on the next tick/load */
    }
  }, []);

  // Re-inject live whenever the config changes.
  useEffect(() => {
    inject();
  }, [config, inject]);

  // Persist every change so the dressing sticks across reloads (the Studio routes via URL only;
  // this config is too large for the URL, so it gets its own storage key).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {
      /* private mode / quota — non-fatal */
    }
  }, [config]);

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
    const css = buildCss(config) || '/* Nothing assigned yet — pick a surface for a region. */';
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
