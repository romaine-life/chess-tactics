import { useState, useRef, type ReactElement, type ReactNode } from 'react';
import { SURFACE_ASSETS } from './surfaceCatalog';
import { useWindowScaledPreview } from './useWindowScaledPreview';
import { SliderRow, ctlReset } from './dressing/SliderRow';
import { ElementSelect, type ElementOption } from './dressing/ElementSelect';
import { useInjectedStyle } from './dressing/useInjectedStyle';
import panelCfg from '../../config/nine-slice/panel.json';
import modeButtonCfg from '../../config/nine-slice/mode-button.json';

// Each frame's FILL boundary (px inset from the footprint) — set by eye in the 9-slice editor,
// stored in config/nine-slice/<asset>.json. The surface clips to it so it stops where the frame's
// visual interior begins, while the frame's corners bleed outside it. (See ADR-0034.)
type FrameId = 'panel' | 'mode-button';
const FRAME_FILL: Record<FrameId, number> = {
  panel: (panelCfg as { fill?: number }).fill ?? 0,
  'mode-button': (modeButtonCfg as { fill?: number }).fill ?? 0,
};

// The Settings dressing room: iframes the REAL /settings page and lets you tune each element —
// pick an element from the dropdown, then assign a surface AND/OR adjust its geometry
// (size / padding / gap), live. "Copy CSS" exports the settings-scoped overrides to bake.
//
// Shared knobs stay menu-owned: the rail WIDTH, rail OFFSET (X/Y) and the label NUDGE are baked on
// the SHARED .settings-* rules so the Settings tabs stay faithful to the Main Menu's buttons —
// they're shown here read-only and tuned in the Main Menu dressing room (one editor per rule).

type RegionId = 'title' | 'tabsBox' | 'buttons' | 'rowsBox' | 'rows';
type BoxId = 'tabsBox' | 'rowsBox';
type GeomKey = 'minH' | 'padX' | 'padY' | 'gap' | 'iconSize';

interface RegionDef {
  id: RegionId;
  label: string;
  selector: string;
  hint: string;
  // The element's native 9-slice frame, restated WITHOUT `fill` so the interior is transparent and
  // the surface shows through while the frame art is preserved.
  frame: string;
  frameWidth: number; // border-image rendered width (px) = the element's native border-width
  configId: FrameId; // which frame config supplies this region's FILL boundary
  isBox: boolean;
  geom: GeomKey[]; // geometry knobs this element exposes
  inherited?: string; // read-only note: knobs owned by the Main Menu tuner (shared rules)
}

// Selectors verified against the live Settings DOM. `[data-testid="settings"]` is on the
// .settings-art-route wrapper, so these scope every override to the real Settings screen.
const REGIONS: RegionDef[] = [
  { id: 'title', label: 'Title bar', selector: '[data-testid="settings"] .app-titlebar.settings-header-frame', hint: 'The top header strip.', frame: 'url("/assets/ui/explore/frames/panel-line.png") 24 / 16px round', frameWidth: 16, configId: 'panel', isBox: false, geom: ['padX', 'padY'] },
  { id: 'tabsBox', label: 'Rail box', selector: '[data-testid="settings"] .settings-rail-frame', hint: 'The left rail container holding the tab buttons.', frame: 'url("/assets/ui/explore/frames/panel-line.png") 24 / 16px round', frameWidth: 16, configId: 'panel', isBox: true, geom: ['padX', 'padY', 'gap'], inherited: 'Rail width & offset (X / Y) are shared with the Main Menu buttons — tune them in the Main Menu dressing room.' },
  { id: 'buttons', label: 'Rail tabs', selector: '[data-testid="settings"] .settings-tab', hint: 'The individual tab buttons inside the rail.', frame: 'url("/assets/ui/explore/frames/panel-line.png") 24 / 12px round', frameWidth: 12, configId: 'mode-button', isBox: false, geom: ['minH', 'padX', 'padY', 'gap', 'iconSize'], inherited: 'Label position is shared with the Main Menu buttons — tune it in the Main Menu dressing room.' },
  { id: 'rowsBox', label: 'Rows box', selector: '[data-testid="settings"] .settings-main-frame', hint: 'The main panel container holding the rows.', frame: 'url("/assets/ui/explore/frames/panel-line.png") 24 / 16px round', frameWidth: 16, configId: 'panel', isBox: true, geom: ['padX', 'padY'] },
  { id: 'rows', label: 'Setting rows', selector: '[data-testid="settings"] .settings-row', hint: 'The individual setting rows.', frame: 'url("/assets/ui/explore/frames/panel-line.png") 24 / 14px round', frameWidth: 14, configId: 'panel', isBox: false, geom: ['minH', 'padX', 'padY'] },
];

const BOX_IDS: BoxId[] = ['tabsBox', 'rowsBox'];
const DEFAULT_TILE = 1024;
const CLEAR = '__clear'; // sentinel: keep the frame, drop the fill (transparent interior)
const isSurface = (value: string | null | undefined): boolean => !!value && value !== CLEAR;

// Per-knob slider bounds + which measured baseline drives the slider's "live" value.
const GEOM_META: Record<GeomKey, { label: string; min: number; max: number; step?: number }> = {
  minH: { label: 'Min height', min: 0, max: 200 },
  padX: { label: 'Padding · horizontal', min: 0, max: 96 },
  padY: { label: 'Padding · vertical', min: 0, max: 96 },
  gap: { label: 'Gap', min: 0, max: 48 },
  iconSize: { label: 'Icon size', min: 16, max: 120 },
};

// A region's live computed geometry, measured once from the real element (before our overrides).
interface GeomBase { padT: number; padR: number; padB: number; padL: number; minH: number; gap: number; iconSize: number; }
// Placeholder until the live measure lands (the iframe mounts a tick after first render).
const GEOM_FALLBACK: GeomBase = { padT: 22, padR: 22, padB: 22, padL: 22, minH: 56, gap: 11, iconSize: 64 };
const geomBaseVal = (b: GeomBase, key: GeomKey): number =>
  key === 'minH' ? b.minH : key === 'gap' ? b.gap : key === 'iconSize' ? b.iconSize : key === 'padX' ? b.padL : b.padT;

type GeomTune = Partial<Record<GeomKey, number>>;

interface DressingConfig {
  surfaces: Record<RegionId, string | null>; // per-region surface (or null = default, CLEAR = transparent)
  boxDisabled: Record<BoxId, boolean>;
  boxOpacity: Record<BoxId, number>;
  geom: Record<RegionId, GeomTune>; // per-element geometry overrides (key absent = shipped)
  tilePx: number;
  offsetX: number;
  offsetY: number;
}

const blankConfig = (): DressingConfig => ({
  surfaces: { title: null, tabsBox: null, buttons: null, rowsBox: null, rows: null },
  boxDisabled: { tabsBox: false, rowsBox: false },
  boxOpacity: { tabsBox: 1, rowsBox: 1 },
  geom: { title: {}, tabsBox: {}, buttons: {}, rowsBox: {}, rows: {} },
  tilePx: DEFAULT_TILE,
  offsetX: 0,
  offsetY: 0,
});

function seededConfig(seed: string): DressingConfig {
  const base = blankConfig();
  return { ...base, surfaces: { title: seed, tabsBox: seed, buttons: seed, rowsBox: seed, rows: seed } };
}

// A fresh load always opens at DEFAULTS, so the dressing room reflects the LIVE page (no overrides)
// and can never drift from what ships. Choices live only in the session — use "Copy CSS" to keep.
function loadConfig(seed?: string): DressingConfig {
  return seed ? seededConfig(seed) : blankConfig();
}

// Does this element carry any override (surface, transparency, box state, or geometry)?
function regionTuned(config: DressingConfig, base: Record<RegionId, GeomBase>, id: RegionId): boolean {
  if (isSurface(config.surfaces[id]) || config.surfaces[id] === CLEAR) return true;
  if (BOX_IDS.includes(id as BoxId) && (config.boxDisabled[id as BoxId] || config.boxOpacity[id as BoxId] < 1)) return true;
  const b = base[id] ?? GEOM_FALLBACK;
  const tune = config.geom[id] ?? {};
  return (Object.keys(tune) as GeomKey[]).some((k) => tune[k] !== undefined && tune[k] !== geomBaseVal(b, k));
}

// Build the override stylesheet injected into the /settings iframe AND copied for baking. Each
// element bakes ONE rule = surface/fill decls + geometry decls, so padding is never declared twice
// (the fill-clip stays the authority on padding when a surface is assigned).
function buildCss(config: DressingConfig, base: Record<RegionId, GeomBase>): string {
  const { tilePx, offsetX, offsetY } = config;
  const blocks: string[] = [];
  for (const region of REGIONS) {
    const sel = region.selector;
    if (region.isBox && config.boxDisabled[region.id as BoxId]) {
      // Strip the frame + fill entirely so the inner buttons/rows float.
      blocks.push(`${sel} { border-image: none !important; background: transparent !important; box-shadow: none !important; }`);
      continue;
    }
    const name = config.surfaces[region.id];
    const b = base[region.id] ?? GEOM_FALLBACK;
    const tune = config.geom[region.id] ?? {};
    const padTuned = tune.padX !== undefined || tune.padY !== undefined;
    // Effective base padding [t,r,b,l] = measured, overridden by tuned padX (L/R) / padY (T/B).
    const effPad = [tune.padY ?? b.padT, tune.padX ?? b.padR, tune.padY ?? b.padB, tune.padX ?? b.padL];
    const decls: string[] = [];
    let paddingHandled = false; // true once the fill-clip owns padding

    if (region.id === 'title') {
      // Title bar (ADR-0037): a full-bleed surface under a forged stud strip — not a frame+fill.
      const studded = 'url("/assets/ui/titlebar/ornament-nailstud.png") center bottom / auto 26px no-repeat, url("/assets/ui/titlebar/band-studded.png") left bottom / auto var(--titlebar-rule-h, 14px) repeat-x';
      if (name === CLEAR) {
        decls.push('border: 0', 'border-image: none', `background: ${studded}`, 'image-rendering: pixelated');
      } else if (isSurface(name)) {
        const asset = SURFACE_ASSETS.find((s) => s.name === name);
        if (asset) decls.push('border: 0', 'border-image: none', `background: ${studded}, url("${asset.file}") ${offsetX}px ${offsetY}px / ${tilePx}px repeat fixed`, 'image-rendering: pixelated');
      }
    } else if (name === CLEAR) {
      decls.push(`border-image: ${region.frame}`, 'background: transparent', 'image-rendering: pixelated');
    } else if (isSurface(name)) {
      const asset = SURFACE_ASSETS.find((s) => s.name === name);
      if (asset) {
        const surfaceBg = `url("${asset.file}") ${offsetX}px ${offsetY}px / ${tilePx}px repeat fixed`;
        const fill = FRAME_FILL[region.configId] ?? 0;
        if (fill > 0) {
          // FILL clip: border-width shrinks to the fill inset so background-clip:padding-box lands
          // on the fill box, while border-image-width keeps the frame's full thickness. effPad
          // (tuned-or-measured padding) is compensated by (frameWidth − fill) so content stays put —
          // this is also where a tuned padding folds in, so we never emit a second `padding`.
          const compensated = effPad.map((p) => `${Math.max(0, Math.round(p + region.frameWidth - fill))}px`).join(' ');
          decls.push(`border-image: ${region.frame}`, `border-width: ${fill}px`, `padding: ${compensated}`, `background: ${surfaceBg}`, 'background-origin: padding-box', 'background-clip: padding-box', 'image-rendering: pixelated');
          paddingHandled = true;
        } else {
          decls.push(`border-image: ${region.frame}`, `background: ${surfaceBg}`, 'background-origin: border-box', 'background-clip: border-box', 'image-rendering: pixelated');
        }
      }
    }

    // Geometry padding (only when the fill-clip didn't already own it).
    if (!paddingHandled && padTuned) decls.push(`padding: ${effPad.map((p) => `${Math.round(p)}px`).join(' ')}`);
    // Standalone geometry decls — never touch the clip.
    if (region.geom.includes('minH') && tune.minH !== undefined && tune.minH !== b.minH) decls.push(`min-height: ${tune.minH}px`);
    if (region.geom.includes('gap') && tune.gap !== undefined && tune.gap !== b.gap) decls.push(`gap: ${tune.gap}px`);
    if (region.geom.includes('iconSize') && tune.iconSize !== undefined && tune.iconSize !== b.iconSize) decls.push(`--settings-tab-icon-size: ${tune.iconSize}px`);

    if (decls.length) blocks.push(`${sel} {\n${decls.map((d) => `  ${d} !important;`).join('\n')}\n}`);

    if (region.isBox) {
      const op = config.boxOpacity[region.id as BoxId];
      if (op < 1) blocks.push(`${sel} { opacity: ${op} !important; }`);
    }
  }
  // The fixed-attachment surface continuity needs the screen's identity transform neutralised — but
  // ONLY when a surface is assigned. A geometry-only change must not trigger it (it interacts with
  // the shipped zoom UI-scale path).
  if (REGIONS.some((r) => isSurface(config.surfaces[r.id]))) {
    blocks.unshift('[data-testid="settings"] .settings-screen { transform: none !important; }');
  }
  return blocks.join('\n');
}

// `header` (optional) is the Studio Viewer's kind-selector strip, injected when this is mounted as
// the Settings page's viewer (Pages catalog) so it matches the sibling page viewers.
export function SurfaceDressingRoom({ seed, header }: { seed?: string; header?: ReactNode }): ReactElement {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  // True-to-window miniature: /settings centres its body under a viewport-relative cap (the same
  // .settings-shell as the menu), so a panel-sized iframe would re-proportion the rail/rows. Scaling
  // the iframe ELEMENT doesn't disturb the in-iframe background-attachment:fixed surface continuity.
  const { hostRef, frameStyle } = useWindowScaledPreview();
  const [config, setConfig] = useState<DressingConfig>(() => loadConfig(seed));
  const [base, setBase] = useState<Record<RegionId, GeomBase>>({} as Record<RegionId, GeomBase>);
  const [activeId, setActiveId] = useState<RegionId>('buttons');
  const [copied, setCopied] = useState(false);

  const css = buildCss(config, base);

  // Inject into the live /settings iframe; measure each element's shipped geometry ONCE (before our
  // overrides change it) so the sliders open at the real values and ↺ returns there.
  useInjectedStyle(iframeRef, 'surface-dressing', css, {
    onBeforeInject: (doc, win) => {
      const next: Partial<Record<RegionId, GeomBase>> = {};
      for (const region of REGIONS) {
        if (base[region.id]) continue;
        const el = doc.querySelector(region.selector);
        if (!el) continue;
        const cs = win.getComputedStyle(el);
        const px = (v: string): number => parseFloat(v) || 0;
        next[region.id] = {
          padT: px(cs.paddingTop), padR: px(cs.paddingRight), padB: px(cs.paddingBottom), padL: px(cs.paddingLeft),
          minH: px(cs.minHeight), gap: px(cs.columnGap || cs.gap), iconSize: px(cs.getPropertyValue('--settings-tab-icon-size')) || 64,
        };
      }
      if (Object.keys(next).length) setBase((prev) => ({ ...prev, ...next }));
    },
  });

  const setSurface = (id: RegionId, surface: string | null): void =>
    setConfig((prev) => ({ ...prev, surfaces: { ...prev.surfaces, [id]: surface } }));
  const setAll = (surface: string | null): void =>
    setConfig((prev) => ({ ...prev, surfaces: { title: surface, tabsBox: surface, buttons: surface, rowsBox: surface, rows: surface } }));
  const setBoxDisabled = (id: BoxId, value: boolean): void =>
    setConfig((prev) => ({ ...prev, boxDisabled: { ...prev.boxDisabled, [id]: value } }));
  const setBoxOpacity = (id: BoxId, value: number): void =>
    setConfig((prev) => ({ ...prev, boxOpacity: { ...prev.boxOpacity, [id]: value } }));
  const setGeom = (id: RegionId, key: GeomKey, value: number): void =>
    setConfig((prev) => ({ ...prev, geom: { ...prev.geom, [id]: { ...prev.geom[id], [key]: value } } }));
  const setGlobal = (patch: Partial<Pick<DressingConfig, 'tilePx' | 'offsetX' | 'offsetY'>>): void =>
    setConfig((prev) => ({ ...prev, ...patch }));
  const resetElement = (id: RegionId): void =>
    setConfig((prev) => ({
      ...prev,
      surfaces: { ...prev.surfaces, [id]: null },
      geom: { ...prev.geom, [id]: {} },
      ...(BOX_IDS.includes(id as BoxId) ? { boxDisabled: { ...prev.boxDisabled, [id]: false }, boxOpacity: { ...prev.boxOpacity, [id]: 1 } } : {}),
    }));

  const copyCss = async (): Promise<void> => {
    const out = css || '/* Nothing tuned yet — pick an element and assign a surface or adjust its geometry. */';
    try {
      await navigator.clipboard.writeText(out);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch { /* clipboard blocked — values still applied in the preview */ }
  };

  const anySurface = REGIONS.some((r) => isSurface(config.surfaces[r.id]));
  const anyRule = REGIONS.some((r) => regionTuned(config, base, r.id));
  const region = REGIONS.find((r) => r.id === activeId) ?? REGIONS[0];
  const boxId = region.id as BoxId;
  const isBox = region.isBox;
  const surfaceName = config.surfaces[region.id];
  const elementOptions: ElementOption[] = REGIONS.map((r) => ({ id: r.id, label: r.label, tuned: regionTuned(config, base, r.id) }));
  const geomVal = (key: GeomKey): number => {
    const t = config.geom[region.id]?.[key];
    if (t !== undefined) return t;
    return geomBaseVal(base[region.id] ?? GEOM_FALLBACK, key);
  };
  const geomDflt = (key: GeomKey): number => geomBaseVal(base[region.id] ?? GEOM_FALLBACK, key);

  return (
    <>
      <section className="surface-dressing-main is-window-scaled" aria-label="Settings preview" ref={hostRef}>
        <iframe ref={iframeRef} className="surface-dressing-frame" src="/settings" title="Live settings preview" style={frameStyle} />
      </section>
      <aside className="tileset-view-controls" aria-label="Settings element controls">
        <section className="tileset-inspector-section">
          <h2>Dressing room</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="tileset-catalog-note">Pick an <strong>element</strong>, then give it a surface and/or adjust its geometry — live on the real Settings page. <strong>Copy CSS</strong> to bake. Defaults = what ships.</p>

            <ElementSelect value={activeId} options={elementOptions} onChange={(id) => setActiveId(id as RegionId)} />

            <label className="tileset-filter-field">
              <span>Surface</span>
              <div className="pages-ctl-row">
                <select value={surfaceName ?? ''} disabled={isBox && config.boxDisabled[boxId]} onChange={(e) => setSurface(region.id, e.target.value || null)} aria-label="Surface">
                  <option value="">None · default</option>
                  <option value={CLEAR}>Transparent (see through)</option>
                  {SURFACE_ASSETS.map((s) => <option key={s.name} value={s.name}>{s.label}</option>)}
                </select>
                {ctlReset(() => setSurface(region.id, null))}
              </div>
            </label>

            {isBox ? (
              <>
                <label className="surface-box-toggle">
                  <input type="checkbox" checked={config.boxDisabled[boxId]} onChange={(e) => setBoxDisabled(boxId, e.target.checked)} />
                  <span>Disable box (no frame)</span>
                </label>
                <label className="tileset-catalog-zoom">
                  <span>Transparency · {Math.round(config.boxOpacity[boxId] * 100)}%</span>
                  <div className="pages-ctl-row">
                    <input type="range" min={0} max={1} step={0.05} value={config.boxOpacity[boxId]} disabled={config.boxDisabled[boxId]} onChange={(e) => setBoxOpacity(boxId, Number(e.target.value))} />
                    {ctlReset(() => setBoxOpacity(boxId, 1))}
                  </div>
                </label>
              </>
            ) : null}

            {region.geom.map((key) => {
              const meta = GEOM_META[key];
              const v = geomVal(key);
              const live = v === geomDflt(key);
              return (
                <SliderRow key={key} label={<>{meta.label} · {v}px{live ? ' · live' : ''}</>} value={v} set={(val) => setGeom(region.id, key, val)} min={meta.min} max={meta.max} step={meta.step ?? 1} dflt={geomDflt(key)} />
              );
            })}

            {region.inherited ? <p className="tileset-catalog-note">{region.inherited}</p> : null}

            <button type="button" className="tileset-view-action pages-reset" onClick={() => resetElement(region.id)}>Reset this element</button>

            <label className="tileset-filter-field">
              <span>Set all surfaces</span>
              <select value="" onChange={(e) => { const v = e.target.value; if (v === '__none') setAll(null); else if (v) setAll(v); }}>
                <option value="">— quick fill —</option>
                {SURFACE_ASSETS.map((s) => <option key={s.name} value={s.name}>{s.label}</option>)}
                <option value={CLEAR}>Transparent (see through)</option>
                <option value="__none">None · default</option>
              </select>
            </label>

            <div className={`surface-region-card surface-global-card ${anySurface ? '' : 'is-empty'}`.trim()}>
              <strong>Surface · all regions</strong>
              <label className="tileset-catalog-zoom">
                <span>Tile size · {config.tilePx}px</span>
                <input type="range" min={128} max={2048} step={16} value={config.tilePx} disabled={!anySurface} onChange={(e) => setGlobal({ tilePx: Number(e.target.value) })} />
              </label>
              <label className="tileset-catalog-zoom">
                <span>Start X · {config.offsetX}px</span>
                <input type="range" min={-1024} max={1024} step={4} value={config.offsetX} disabled={!anySurface} onChange={(e) => setGlobal({ offsetX: Number(e.target.value) })} />
              </label>
              <label className="tileset-catalog-zoom">
                <span>Start Y · {config.offsetY}px</span>
                <input type="range" min={-1024} max={1024} step={4} value={config.offsetY} disabled={!anySurface} onChange={(e) => setGlobal({ offsetY: Number(e.target.value) })} />
              </label>
              <button type="button" className="surface-region-reset" disabled={!anySurface} onClick={() => setGlobal({ tilePx: DEFAULT_TILE, offsetX: 0, offsetY: 0 })}>Reset zoom &amp; start</button>
            </div>

            <button type="button" className="tileset-view-action" onClick={copyCss} disabled={!anyRule}>{copied ? 'Copied CSS ✓' : 'Copy CSS'}</button>
            <button type="button" className="tileset-view-action pages-reset" onClick={() => setConfig(loadConfig())}>Reset all</button>
          </div>
        </section>
      </aside>
    </>
  );
}
