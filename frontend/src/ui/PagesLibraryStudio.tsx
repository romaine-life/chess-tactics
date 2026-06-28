import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode, type CSSProperties } from 'react';
import { PAGE_ENTRIES, type PageEntry } from './pagesCatalog';
import { MainMenu } from './MainMenu';
import { SurfaceDressingRoom } from './SurfaceDressingRoom';
import { SURFACE_ASSETS } from './surfaceCatalog';

// Read-only "Pages" catalog (ADR-0029): each app screen is a card; "View Selected" opens a
// live Viewer. Selection is owned by the host (TilePreview). Cards reuse the shared studio
// card classes so the grid matches Surfaces/Tiles/Units.
export function PagesLibraryStudio({
  search,
  selected,
  onSelect,
}: {
  search: string;
  selected?: string;
  onSelect: (name: string) => void;
}): ReactElement {
  const q = search.trim().toLowerCase();
  const visible = PAGE_ENTRIES.filter((p) => !q || [p.label, p.status, p.route].join(' ').toLowerCase().includes(q));
  return (
    <div className="tileset-studio-grid pages-grid" aria-label="Pages">
      {visible.map((p) => (
        <button
          key={p.name}
          type="button"
          className={`tileset-studio-card ${p.name === selected ? 'is-selected' : ''}`.trim()}
          onClick={() => onSelect(p.name)}
          aria-pressed={p.name === selected}
          title={`${p.label} — ${p.route}`}
        >
          <span className="tileset-studio-card-image pages-card-image" aria-hidden="true">{p.label.slice(0, 1)}</span>
          <span className="tileset-studio-card-meta">
            <span className="tileset-studio-card-text">
              <strong>{p.label}</strong>
              <em>{p.status === 'functional' ? 'tunable' : 'view-only'}</em>
            </span>
          </span>
        </button>
      ))}
      {visible.length === 0 ? <p className="tileset-studio-empty">No page matches.</p> : null}
    </div>
  );
}

// The stone surfaces the menu slab can wear (files under public/assets/ui/surfaces/).
const STONE_SURFACES = [
  { name: 'stone-slate-blue', label: 'Slate blue' },
  { name: 'stone-cobble-blue', label: 'Cobble blue' },
  { name: 'stone-grey', label: 'Grey' },
  { name: 'stone-sandstone', label: 'Sandstone' },
  { name: 'wood-oak', label: 'Oak' },
];

// Functional viewer: the LIVE MainMenu (ADR-0029 req 4 — exercise the real component, never
// a dead image) with in-place tweak controls that drive the menu's own CSS custom properties
// (--menu-btn-h / --menu-icon-size / --menu-stone-surface) and the .indent-hover slide class.
// The wrapper is positioned so the menu's absolute .menu-layer fills the viewer stage.
function MainMenuViewer({ page, header }: { page: PageEntry; header?: ReactNode }): ReactElement {
  const [btnH, setBtnH] = useState(80);
  const [btnW, setBtnW] = useState(370);
  const [iconSize, setIconSize] = useState(64);
  // Static indent of the whole button stack. Opens at 16px — the design-research
  // recommendation (1em, "clearly nested under the brand") — even though the live menu
  // still ships flush (0). Slider snaps to the 8px grid (0/8/16/24/32).
  const [indent, setIndent] = useState(16);
  const [hoverSlide, setHoverSlide] = useState<'off' | '6' | '10'>('off');
  // Editor-only aid: freeze the buttons in their hovered look so the hover slide + lift
  // are visible without a mouse (the slide otherwise only fires on a live pointer hover).
  const [previewHover, setPreviewHover] = useState(false);
  const [profileBg, setProfileBg] = useState(true);
  const [stone, setStone] = useState('stone-slate-blue');
  const resetDefaults = (): void => {
    setBtnH(80);
    setBtnW(370);
    setIconSize(64);
    setIndent(16);
    setHoverSlide('off');
    setPreviewHover(false);
    setProfileBg(true);
    setStone('stone-slate-blue');
  };
  const wrapStyle = {
    '--menu-btn-h': `${btnH}px`,
    '--menu-btn-w': `${btnW}px`,
    '--menu-icon-size': `${iconSize}px`,
    '--menu-btn-indent': `${indent}px`,
    '--menu-stone-surface': `url("/assets/ui/surfaces/${stone}.png")`,
    '--profile-bar-frame': profileBg ? 'block' : 'none',
  } as CSSProperties;
  const slideClass = hoverSlide === '6' ? 'indent-hover' : hoverSlide === '10' ? 'indent-hover indent-hover-10' : '';
  const wrapClass = `pages-menu-tweak ${slideClass} ${previewHover ? 'preview-hover' : ''}`.replace(/\s+/g, ' ').trim();
  return (
    <>
      <section className="al-lab-main pages-view-main" aria-label="Main Menu preview">
        <div className={wrapClass} style={wrapStyle}>
          <MainMenu />
        </div>
      </section>
      <aside className="tileset-view-controls" aria-label="Main Menu controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <label className="tileset-catalog-zoom">
              <span>Button height · {btnH}px</span>
              <input type="range" min="56" max="120" step="1" value={btnH} onChange={(e) => setBtnH(Number(e.target.value))} />
            </label>
            <label className="tileset-catalog-zoom">
              <span>Button length · {btnW}px</span>
              <input type="range" min="240" max="460" step="2" value={btnW} onChange={(e) => setBtnW(Number(e.target.value))} />
            </label>
            <label className="tileset-catalog-zoom">
              <span>Button indent · {indent}px{indent === 16 ? ' · recommended' : ''}</span>
              <input type="range" min="0" max="32" step="8" value={indent} onChange={(e) => setIndent(Number(e.target.value))} />
            </label>
            <p className="tileset-catalog-note">Indent offsets the whole stack right of the brand. Research: ~16px (1em) reads as “nested under the brand”; the live menu still ships flush (0).</p>
            <label className="tileset-catalog-zoom">
              <span>Icon size · {iconSize}px</span>
              <input type="range" min="32" max="96" step="1" value={iconSize} onChange={(e) => setIconSize(Number(e.target.value))} />
            </label>
            <div className="tileset-filter-field">
              <span>Hover slide</span>
              <div className="tileset-tier-seg" aria-label="Hover slide">
                <button type="button" className={hoverSlide === 'off' ? 'is-active' : ''} onClick={() => setHoverSlide('off')}>Off</button>
                <button type="button" className={hoverSlide === '6' ? 'is-active' : ''} onClick={() => setHoverSlide('6')}>6px</button>
                <button type="button" className={hoverSlide === '10' ? 'is-active' : ''} onClick={() => setHoverSlide('10')}>10px</button>
              </div>
            </div>
            <div className="tileset-filter-field">
              <span>Preview hover state</span>
              <div className="tileset-tier-seg" aria-label="Preview hover state">
                <button type="button" className={!previewHover ? 'is-active' : ''} onClick={() => setPreviewHover(false)}>Off</button>
                <button type="button" className={previewHover ? 'is-active' : ''} onClick={() => setPreviewHover(true)}>On</button>
              </div>
            </div>
            <p className="tileset-catalog-note">Buttons lean right and the iron lip lifts when you point at them. Flip this On to freeze that look (and feel the slide distance) without a mouse.</p>
            <div className="tileset-filter-field">
              <span>User box background</span>
              <div className="tileset-tier-seg" aria-label="User box background">
                <button type="button" className={profileBg ? 'is-active' : ''} onClick={() => setProfileBg(true)}>On</button>
                <button type="button" className={!profileBg ? 'is-active' : ''} onClick={() => setProfileBg(false)}>Off</button>
              </div>
            </div>
            <label className="tileset-category-select">
              <span>Stone surface</span>
              <select value={stone} onChange={(e) => setStone(e.target.value)} aria-label="Stone surface">
                {STONE_SURFACES.map((s) => <option key={s.name} value={s.name}>{s.label}</option>)}
              </select>
            </label>
            <button type="button" className="tileset-view-action pages-reset" onClick={resetDefaults}>Reset to defaults</button>
            <dl className="al-meta">
              <div><dt>Page</dt><dd>{page.label}</dd></div>
              <div><dt>Route</dt><dd>{page.route}</dd></div>
              <div><dt>State</dt><dd>tunable (live)</dd></div>
            </dl>
          </div>
        </section>
      </aside>
    </>
  );
}

// The kit button frames the campaign editor's action buttons can wear (files under
// public/assets/ui/kit/). Same three baked variants the editor already ships with.
const CE_BUTTON_FRAMES = [
  { id: 'primary', label: 'Primary', file: '/assets/ui/kit/button-primary.png' },
  { id: 'neutral', label: 'Neutral', file: '/assets/ui/kit/button-neutral.png' },
  { id: 'danger', label: 'Danger', file: '/assets/ui/kit/button-danger.png' },
] as const;
type CeFrameId = (typeof CE_BUTTON_FRAMES)[number]['id'];
// 'shipped' leaves each button's own frame alone (the editor uses primary for most, neutral for
// Duplicate/Export/Import, danger/red for Delete); the others FORCE one frame on every action button.
type CeFrameChoice = 'shipped' | CeFrameId;

// Shipped baseline values of the .ce-asset-button rule (style.css ~6434). A control only emits an
// override when it DIFFERS from these — so "no tuning" injects nothing and the preview is identical
// to the real editor (it keeps each button's own frame, size and the danger button's red).
const CE_SHIPPED = { minH: 40, padX: 8, border: 12 } as const;

interface CeButtonTune {
  frame: CeFrameChoice;
  minW: number; // 0 = auto (natural width)
  minH: number;
  padX: number; // horizontal padding
  border: number; // border + border-image width (scales the ornament)
  fill: 'none' | 'color' | 'surface';
  color: string; // hex, used when fill === 'color'
  opacity: number; // 0..1, alpha of the colour fill
  surface: string; // surface asset name, used when fill === 'surface'
}

const CE_TUNE_DEFAULTS: CeButtonTune = {
  // Defaults = the shipped baseline, so an untouched panel overrides nothing.
  frame: 'shipped',
  minW: 0,
  minH: CE_SHIPPED.minH,
  padX: CE_SHIPPED.padX,
  border: CE_SHIPPED.border,
  fill: 'none',
  color: '#0b2236',
  opacity: 1,
  surface: SURFACE_ASSETS[0]?.name ?? '',
};

const hexToRgba = (hex: string, alpha: number): string => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(11, 34, 54, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

// Build the override rule for the campaign editor's rectangular action buttons
// (.ce-asset-button / .ce-link-button / .ce-footer-link). Injected into the live /campaigns-next
// iframe AND copied verbatim by "Copy CSS", so the bare selector is exactly what you paste into
// style.css. Two principles keep it honest:
//  1. ONLY emit a declaration for a knob that differs from the shipped baseline — so an untouched
//     panel emits nothing and the preview matches the real editor exactly.
//  2. Use border-image LONGHANDS, never the shorthand — so changing thickness/fill doesn't reset
//     border-image-source, letting each button keep its own frame (danger=red, neutral=Duplicate…)
//     unless the Frame control is explicitly set to force one.
function buildCeButtonCss(t: CeButtonTune): string {
  const decls: string[] = [];
  if (t.minW > 0) decls.push(`min-width: ${t.minW}px`);
  if (t.minH !== CE_SHIPPED.minH) decls.push(`min-height: ${t.minH}px`);
  if (t.padX !== CE_SHIPPED.padX) {
    decls.push(`padding-left: ${t.padX}px`);
    decls.push(`padding-right: ${t.padX}px`);
  }
  if (t.border !== CE_SHIPPED.border) {
    // border-width AND border-image-width move together so the ornament scales with the border.
    decls.push(`border-width: ${t.border}px`);
    decls.push(`border-image-width: ${t.border}px`);
  }
  if (t.frame !== 'shipped') {
    // Force one frame on EVERY action button (overrides the per-button danger/neutral sources).
    const frame = CE_BUTTON_FRAMES.find((f) => f.id === t.frame) ?? CE_BUTTON_FRAMES[0];
    decls.push(`border-image-source: url("${frame.file}")`);
  }
  if (t.fill !== 'none') {
    // Drop the baked `fill` slice so the interior goes transparent and the chosen fill shows, then
    // paint it into the border box. (These kit frames have no dedicated "line" variant, so edge
    // slices keep a little baked tint — a clean production fill would bake a button-line frame,
    // ADR-0034. Fine for auditioning.) image-rendering keeps the now-sliced frame crisp.
    decls.push(`border-image-slice: 24`);
    if (t.fill === 'color') {
      decls.push(`background: ${hexToRgba(t.color, t.opacity)}`);
    } else {
      const asset = SURFACE_ASSETS.find((s) => s.name === t.surface) ?? SURFACE_ASSETS[0];
      decls.push(`background: url("${asset.file}") 0 0 / 256px repeat`);
    }
    decls.push(`background-origin: border-box`);
    decls.push(`background-clip: border-box`);
    decls.push(`image-rendering: pixelated`);
  }
  if (!decls.length) return '/* No changes — the panel matches the live editor. Tune a control to override. */';
  const body = decls.map((d) => `  ${d} !important;`).join('\n');
  return `.ce-asset-button,\n.ce-link-button,\n.ce-footer-link {\n${body}\n}`;
}

// Functional viewer: the LIVE campaign editor (ADR-0029 req 4 — real component, not a dead image)
// in an iframe, with controls that inject a tuning stylesheet into it — the same proven shape as
// the Settings dressing room. Iframing isolates the full-page editor's layout + mount side-effects
// and means this touches ZERO shipped CSS; "Copy CSS" exports the bare rule to bake in later.
function CampaignEditorViewer({ page, header }: { page: PageEntry; header?: ReactNode }): ReactElement {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [tune, setTune] = useState<CeButtonTune>(CE_TUNE_DEFAULTS);
  const [copied, setCopied] = useState(false);
  const patch = (next: Partial<CeButtonTune>): void => setTune((prev) => ({ ...prev, ...next }));

  // Read the latest tune via a ref so the load handler / interval stay stable while always
  // painting current values (mirrors SurfaceDressingRoom).
  const tuneRef = useRef(tune);
  tuneRef.current = tune;

  const inject = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.head) return; // transient during navigation
      let style = doc.getElementById('ce-button-tuning') as HTMLStyleElement | null;
      if (!style) {
        style = doc.createElement('style');
        style.id = 'ce-button-tuning';
        doc.head.appendChild(style);
      }
      style.textContent = buildCeButtonCss(tuneRef.current);
    } catch {
      /* same-origin access can blip during reload — re-inject on the next tick/load */
    }
  }, []);

  // Re-inject live whenever the tune changes.
  useEffect(() => {
    inject();
  }, [tune, inject]);

  // The SPA mounts /campaigns-next asynchronously after the iframe load fires, so re-inject on
  // load and on a short interval until it sticks (same handshake as the dressing room).
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

  const copyCss = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(buildCeButtonCss(tune));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — ignore; values are still live in the preview */
    }
  };

  return (
    <>
      {/* surface-dressing-main is a stretch-grid (grid-template-rows: minmax(0,1fr)) so the iframe
          gets a DEFINITE height — the campaign editor's .ce-screen/.app-root are height:100% and
          collapse to header+footer in a content-sized container like .al-lab-main. */}
      <section className="surface-dressing-main" aria-label="Campaign Editor preview">
        <iframe ref={iframeRef} className="surface-dressing-frame" src={page.route} title="Live campaign editor preview" />
      </section>
      <aside className="tileset-view-controls" aria-label="Campaign Editor button controls">
        <section className="tileset-inspector-section">
          <h2>Buttons</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="tileset-catalog-note">
              Tune the campaign editor’s action buttons (New Campaign, Duplicate, Export, Delete…) on the live page. Defaults match the editor exactly — each control only overrides what you touch. Nothing is saved; “Copy CSS” gives you just those overrides to paste into style.css.
            </p>
            <div className="tileset-filter-field">
              <span>Frame</span>
              <div className="tileset-tier-seg" aria-label="Button frame">
                <button type="button" className={tune.frame === 'shipped' ? 'is-active' : ''} onClick={() => patch({ frame: 'shipped' })}>As-is</button>
                {CE_BUTTON_FRAMES.map((f) => (
                  <button key={f.id} type="button" className={tune.frame === f.id ? 'is-active' : ''} onClick={() => patch({ frame: f.id })}>{f.label}</button>
                ))}
              </div>
            </div>
            {tune.frame !== 'shipped' ? (
              <p className="tileset-catalog-note">Forces this frame on every action button. “As-is” keeps each button’s own frame (Delete is red, Duplicate/Export are neutral).</p>
            ) : null}
            <label className="tileset-catalog-zoom">
              <span>Button width · {tune.minW === 0 ? 'auto' : `${tune.minW}px`}</span>
              <input type="range" min="0" max="360" step="4" value={tune.minW} onChange={(e) => patch({ minW: Number(e.target.value) })} />
            </label>
            <label className="tileset-catalog-zoom">
              <span>Button height · {tune.minH}px</span>
              <input type="range" min="28" max="72" step="1" value={tune.minH} onChange={(e) => patch({ minH: Number(e.target.value) })} />
            </label>
            <label className="tileset-catalog-zoom">
              <span>Horizontal padding · {tune.padX}px</span>
              <input type="range" min="0" max="32" step="1" value={tune.padX} onChange={(e) => patch({ padX: Number(e.target.value) })} />
            </label>
            <label className="tileset-catalog-zoom">
              <span>Frame thickness · {tune.border}px</span>
              <input type="range" min="6" max="20" step="1" value={tune.border} onChange={(e) => patch({ border: Number(e.target.value) })} />
            </label>
            <div className="tileset-filter-field">
              <span>Background fill</span>
              <div className="tileset-tier-seg" aria-label="Background fill">
                <button type="button" className={tune.fill === 'none' ? 'is-active' : ''} onClick={() => patch({ fill: 'none' })}>None</button>
                <button type="button" className={tune.fill === 'color' ? 'is-active' : ''} onClick={() => patch({ fill: 'color' })}>Color</button>
                <button type="button" className={tune.fill === 'surface' ? 'is-active' : ''} onClick={() => patch({ fill: 'surface' })}>Surface</button>
              </div>
            </div>
            {tune.fill === 'color' ? (
              <>
                <label className="tileset-category-select">
                  <span>Fill color</span>
                  <input type="color" value={tune.color} onChange={(e) => patch({ color: e.target.value })} aria-label="Fill color" />
                </label>
                <label className="tileset-catalog-zoom">
                  <span>Fill opacity · {Math.round(tune.opacity * 100)}%</span>
                  <input type="range" min="0" max="1" step="0.05" value={tune.opacity} onChange={(e) => patch({ opacity: Number(e.target.value) })} />
                </label>
              </>
            ) : null}
            {tune.fill === 'surface' ? (
              <label className="tileset-category-select">
                <span>Fill surface</span>
                <select value={tune.surface} onChange={(e) => patch({ surface: e.target.value })} aria-label="Fill surface">
                  {SURFACE_ASSETS.map((s) => <option key={s.name} value={s.name}>{s.label}</option>)}
                </select>
              </label>
            ) : null}
            {tune.fill !== 'none' ? (
              <p className="tileset-catalog-note">Fill drops the frame’s baked interior so the colour/surface shows. These kit frames have no “line” variant yet, so a faint edge tint may remain — fine for auditioning a look.</p>
            ) : null}
            <button type="button" className="tileset-view-action pages-reset" onClick={() => setTune(CE_TUNE_DEFAULTS)}>Reset to defaults</button>
            <button type="button" className="tileset-view-action" onClick={copyCss}>{copied ? 'Copied CSS ✓' : 'Copy CSS'}</button>
            <dl className="al-meta">
              <div><dt>Page</dt><dd>{page.label}</dd></div>
              <div><dt>Route</dt><dd>{page.route}</dd></div>
              <div><dt>State</dt><dd>tunable (live)</dd></div>
            </dl>
          </div>
        </section>
      </aside>
    </>
  );
}

// Stub viewer for the other pages — still LIVE (ADR-0029 req 4) via an iframe of the real
// route, with a Details readout. Per-page tweak controls land later.
function PageStubViewer({ page, header }: { page: PageEntry; header?: ReactNode }): ReactElement {
  return (
    <>
      <section className="al-lab-main pages-view-main" aria-label={`${page.label} preview`}>
        <iframe className="pages-stub-frame" src={page.route} title={page.label} />
      </section>
      <aside className="tileset-view-controls" aria-label="Page details">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="tileset-catalog-note">Live page — tweak controls land here later.</p>
            <dl className="al-meta">
              <div><dt>Page</dt><dd>{page.label}</dd></div>
              <div><dt>Route</dt><dd>{page.route}</dd></div>
              <div><dt>State</dt><dd>view-only (stub)</dd></div>
            </dl>
          </div>
        </section>
      </aside>
    </>
  );
}

// Dispatcher: routes the selected page to its viewer — Main Menu tunes the live menu; Settings
// is the dressing room (assign surfaces to each region of the live /settings page); the rest are
// live stubs. One arm in the TilePreview viewer ladder calls this.
export function PagesViewer({ name, header }: { name?: string; header?: ReactNode }): ReactElement {
  const page = PAGE_ENTRIES.find((p) => p.name === name) ?? PAGE_ENTRIES[0];
  if (page.name === 'main-menu') return <MainMenuViewer page={page} header={header} />;
  if (page.name === 'settings') return <SurfaceDressingRoom header={header} />;
  if (page.name === 'campaign-editor') return <CampaignEditorViewer page={page} header={header} />;
  return <PageStubViewer page={page} header={header} />;
}
