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

// ===== Campaign Editor chrome tuner =====
// The editor's chrome is built from kit 9-slice frames (border-image). This viewer auditions each
// element group's size / frame / fill live on the real /campaigns-next page, one element at a time.

// Kit frames an element can be forced to wear (public/assets/ui/kit/). 'shipped' leaves the element's
// own frame — and its hover/selected/danger variants — untouched.
const CE_KIT_FRAMES = [
  { id: 'primary', label: 'Button · primary', file: '/assets/ui/kit/button-primary.png' },
  { id: 'neutral', label: 'Button · neutral', file: '/assets/ui/kit/button-neutral.png' },
  { id: 'danger', label: 'Button · danger', file: '/assets/ui/kit/button-danger.png' },
  { id: 'panel', label: 'Panel', file: '/assets/ui/kit/panel.png' },
  { id: 'row', label: 'Row', file: '/assets/ui/kit/row.png' },
  { id: 'field-input', label: 'Field', file: '/assets/ui/kit/field-input.png' },
] as const;
const CE_FRAME_FILE: Record<string, string> = Object.fromEntries(CE_KIT_FRAMES.map((f) => [f.id, f.file]));

type CeFill = 'none' | 'color' | 'surface';

// One tunable element group, with its SHIPPED baseline (from style.css) so a control only emits an
// override when it DIFFERS — an untouched element stays pixel-identical to the live editor.
interface CeGroup {
  id: string;
  label: string;
  frameSel: string; // selector carrying the border-image frame
  fillSel: string; // selector the fill background lands on (= frameSel unless the frame is a ::before)
  slice: number; // shipped border-image slice
  border: number; // shipped border-image width / border-width (px)
  minH: number; // shipped min-height (square groups: shipped side length)
  padX: number; // shipped horizontal padding (px)
  knobs: { frame?: boolean; width?: boolean; square?: boolean; height?: boolean; padX?: boolean };
}

const CE_GROUPS: CeGroup[] = [
  { id: 'buttons', label: 'Action buttons', frameSel: '.ce-asset-button, .ce-link-button, .ce-footer-link', fillSel: '.ce-asset-button, .ce-link-button, .ce-footer-link', slice: 24, border: 12, minH: 40, padX: 8, knobs: { frame: true, width: true, height: true, padX: true } },
  { id: 'panels', label: 'Panel boxes', frameSel: '.ce-panel::before', fillSel: '.ce-panel', slice: 24, border: 16, minH: 0, padX: 0, knobs: { frame: true } },
  { id: 'rows', label: 'Rows (campaign / level)', frameSel: '.ce-campaign-row, .ce-level-row', fillSel: '.ce-campaign-row, .ce-level-row', slice: 18, border: 14, minH: 72, padX: 0, knobs: { frame: true, height: true } },
  { id: 'statRows', label: 'Stat rows', frameSel: '.ce-stat-row', fillSel: '.ce-stat-row', slice: 20, border: 14, minH: 48, padX: 16, knobs: { frame: true, height: true, padX: true } },
  { id: 'nameField', label: 'Name field', frameSel: '.ce-name-field input', fillSel: '.ce-name-field input', slice: 14, border: 8, minH: 42, padX: 12, knobs: { frame: true, height: true, padX: true } },
  { id: 'tabs', label: 'Board / Info tabs', frameSel: '.ce-level-view-toggle button', fillSel: '.ce-level-view-toggle button', slice: 24, border: 9, minH: 30, padX: 8, knobs: { frame: true, height: true, padX: true } },
  { id: 'iconButtons', label: 'Icon buttons (38px)', frameSel: '.ce-icon-button', fillSel: '.ce-icon-button', slice: 24, border: 10, minH: 38, padX: 0, knobs: { frame: true, square: true } },
];

interface CeGroupTune {
  frame: string; // 'shipped' or a CE_KIT_FRAMES id
  size: number; // min-width (width knob) OR square side px (square knob); 0 for width = auto
  height: number; // min-height
  padX: number;
  border: number; // frame thickness (border + border-image width)
  fill: CeFill;
  color: string;
  opacity: number;
  surface: string;
}

const groupDefault = (g: CeGroup): CeGroupTune => ({
  frame: 'shipped',
  size: g.knobs.square ? g.minH : 0, // square groups (icon) default to their shipped side; others = auto
  height: g.minH,
  padX: g.padX,
  border: g.border,
  fill: 'none',
  color: '#0b2236',
  opacity: 1,
  surface: SURFACE_ASSETS[0]?.name ?? '',
});

const ceAllDefaults = (): Record<string, CeGroupTune> =>
  Object.fromEntries(CE_GROUPS.map((g) => [g.id, groupDefault(g)]));

const hexToRgba = (hex: string, alpha: number): string => {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return `rgba(11, 34, 54, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

const ceFillValue = (t: CeGroupTune): string => {
  if (t.fill === 'color') return hexToRgba(t.color, t.opacity);
  const asset = SURFACE_ASSETS.find((s) => s.name === t.surface) ?? SURFACE_ASSETS[0];
  // 256px is an AUDITIONING scale — surfaces are 1024px native (the dressing room ships them at
  // 1024), but the campaign editor's chrome is small, so a denser tile reads as material here.
  return `url("${asset.file}") 0 0 / 256px repeat`;
};

// Build the override CSS for ONE element group. Two principles keep it honest:
//  1. Emit a declaration ONLY when the knob differs from the shipped baseline — an untouched element
//     emits nothing, so the preview matches the real editor exactly (incl. its hover/selected/danger).
//  2. Use border-image LONGHANDS, never the shorthand — so thickness/fill changes never reset the
//     frame source, letting each element keep its own frame unless Frame explicitly forces one.
// Injected into the live iframe AND copied verbatim by "Copy CSS", so the bare selectors are exactly
// what you paste into style.css. Returns '' when nothing is tuned.
function buildCeGroupCss(g: CeGroup, t: CeGroupTune): string {
  const frameDecls: string[] = [];
  const fillDecls: string[] = []; // used only when the fill lands on a different selector (panels)
  if (g.knobs.width && t.size > 0) frameDecls.push(`min-width: ${t.size}px`);
  if (g.knobs.square && t.size !== g.minH) {
    frameDecls.push(`width: ${t.size}px`);
    frameDecls.push(`height: ${t.size}px`);
  }
  if (g.knobs.height && t.height !== g.minH) frameDecls.push(`min-height: ${t.height}px`);
  if (g.knobs.padX && t.padX !== g.padX) {
    frameDecls.push(`padding-left: ${t.padX}px`);
    frameDecls.push(`padding-right: ${t.padX}px`);
  }
  if (t.border !== g.border) {
    // border-width AND border-image-width move together so the ornament scales with the border.
    frameDecls.push(`border-width: ${t.border}px`);
    frameDecls.push(`border-image-width: ${t.border}px`);
  }
  if (t.frame !== 'shipped' && CE_FRAME_FILE[t.frame]) {
    frameDecls.push(`border-image-source: url("${CE_FRAME_FILE[t.frame]}")`);
  }
  if (t.fill !== 'none') {
    // Drop the baked `fill` slice so the interior clears and the chosen fill shows, then paint it in.
    // (These kit frames have no dedicated "line" variant, so edge slices keep a little baked tint —
    // a clean production fill would bake a *-line frame, ADR-0034. Fine for auditioning.)
    frameDecls.push(`border-image-slice: ${g.slice}`);
    // image-rendering rides WITH the background onto fillSel — for panels that's .ce-panel, not its
    // ::before frame, so the pixel-art surface stays crisp wherever the fill actually lands.
    const bg = [`background: ${ceFillValue(t)}`, `background-origin: border-box`, `background-clip: border-box`, `image-rendering: pixelated`];
    (g.fillSel === g.frameSel ? frameDecls : fillDecls).push(...bg);
  }
  const blocks: string[] = [];
  if (frameDecls.length) blocks.push(`${g.frameSel} {\n${frameDecls.map((d) => `  ${d} !important;`).join('\n')}\n}`);
  if (fillDecls.length) blocks.push(`${g.fillSel} {\n${fillDecls.map((d) => `  ${d} !important;`).join('\n')}\n}`);
  return blocks.join('\n');
}

// All tuned groups concatenated — what gets injected and copied.
function buildCeChromeCss(state: Record<string, CeGroupTune>): string {
  const parts = CE_GROUPS.map((g) => buildCeGroupCss(g, state[g.id] ?? groupDefault(g))).filter(Boolean);
  return parts.length ? parts.join('\n\n') : '/* No changes — the panel matches the live editor. Tune a control to override. */';
}

// Functional viewer: the LIVE campaign editor (ADR-0029 req 4 — real component, not a dead image)
// in an iframe, with controls that inject a tuning stylesheet into it — the same proven shape as
// the Settings dressing room. Iframing isolates the full-page editor's layout + mount side-effects
// and means this touches ZERO shipped CSS; "Copy CSS" exports the bare rules to bake in later.
function CampaignEditorViewer({ page, header }: { page: PageEntry; header?: ReactNode }): ReactElement {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [groups, setGroups] = useState<Record<string, CeGroupTune>>(ceAllDefaults);
  const [activeId, setActiveId] = useState<string>(CE_GROUPS[0].id);
  const [copied, setCopied] = useState(false);

  const g = CE_GROUPS.find((x) => x.id === activeId) ?? CE_GROUPS[0];
  const t = groups[g.id] ?? groupDefault(g);
  const patch = (next: Partial<CeGroupTune>): void =>
    setGroups((prev) => ({ ...prev, [g.id]: { ...prev[g.id], ...next } }));

  // Read the latest state via a ref so the load handler / interval stay stable while always
  // painting current values (mirrors SurfaceDressingRoom).
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const inject = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.head) return; // transient during navigation
      let style = doc.getElementById('ce-chrome-tuning') as HTMLStyleElement | null;
      if (!style) {
        style = doc.createElement('style');
        style.id = 'ce-chrome-tuning';
        doc.head.appendChild(style);
      }
      style.textContent = buildCeChromeCss(groupsRef.current);
    } catch {
      /* same-origin access can blip during reload — re-inject on the next tick/load */
    }
  }, []);

  // Re-inject live whenever any element's tune changes.
  useEffect(() => {
    inject();
  }, [groups, inject]);

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
      await navigator.clipboard.writeText(buildCeChromeCss(groups));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — ignore; values are still live in the preview */
    }
  };

  const tunedCount = CE_GROUPS.filter((x) => buildCeGroupCss(x, groups[x.id] ?? groupDefault(x)) !== '').length;
  const lower = g.label.toLowerCase();

  return (
    <>
      {/* surface-dressing-main is a stretch-grid (grid-template-rows: minmax(0,1fr)) so the iframe
          gets a DEFINITE height — the campaign editor's .ce-screen/.app-root are height:100% and
          collapse to header+footer in a content-sized container like .al-lab-main. */}
      <section className="surface-dressing-main" aria-label="Campaign Editor preview">
        <iframe ref={iframeRef} className="surface-dressing-frame" src={page.route} title="Live campaign editor preview" />
      </section>
      <aside className="tileset-view-controls" aria-label="Campaign Editor chrome controls">
        <section className="tileset-inspector-section">
          <h2>Chrome</h2>
          <div className="tileset-control-stack">
            {header}
            <p className="tileset-catalog-note">
              Tune the campaign editor’s chrome live, one element at a time. Defaults match the editor exactly — each control only overrides what you touch. Nothing is saved; “Copy CSS” exports just those overrides (every element) to paste into style.css.
            </p>
            <label className="tileset-category-select">
              <span>Element</span>
              <select value={activeId} onChange={(e) => setActiveId(e.target.value)} aria-label="Element to tune">
                {CE_GROUPS.map((x) => (
                  <option key={x.id} value={x.id}>{x.label}{buildCeGroupCss(x, groups[x.id] ?? groupDefault(x)) ? ' •' : ''}</option>
                ))}
              </select>
            </label>
            {g.frameSel.includes(',') ? (
              <p className="tileset-catalog-note">Covers several elements at once — size / height / padding tune them together, and the copied CSS bakes one value for the group (any per-element specializations in style.css are flattened).</p>
            ) : null}
            {g.knobs.frame ? (
              <>
                <label className="tileset-category-select">
                  <span>Frame</span>
                  <select value={t.frame} onChange={(e) => patch({ frame: e.target.value })} aria-label="Frame">
                    <option value="shipped">As-is (keep its own)</option>
                    {CE_KIT_FRAMES.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
                {t.frame !== 'shipped' ? (
                  <p className="tileset-catalog-note">Forces this frame on every {lower}. “As-is” keeps each element’s own frame plus its hover / selected / danger states.</p>
                ) : null}
              </>
            ) : null}
            {g.knobs.width ? (
              <label className="tileset-catalog-zoom">
                <span>Width · {t.size === 0 ? 'auto' : `${t.size}px`}</span>
                <input type="range" min="0" max="400" step="4" value={t.size} onChange={(e) => patch({ size: Number(e.target.value) })} />
              </label>
            ) : null}
            {g.knobs.square ? (
              <label className="tileset-catalog-zoom">
                <span>Size · {t.size}px</span>
                <input type="range" min="20" max="72" step="1" value={t.size} onChange={(e) => patch({ size: Number(e.target.value) })} />
              </label>
            ) : null}
            {g.knobs.height ? (
              <label className="tileset-catalog-zoom">
                <span>Height · {t.height}px</span>
                <input type="range" min="20" max="120" step="1" value={t.height} onChange={(e) => patch({ height: Number(e.target.value) })} />
              </label>
            ) : null}
            {g.knobs.padX ? (
              <label className="tileset-catalog-zoom">
                <span>Horizontal padding · {t.padX}px</span>
                <input type="range" min="0" max="40" step="1" value={t.padX} onChange={(e) => patch({ padX: Number(e.target.value) })} />
              </label>
            ) : null}
            <label className="tileset-catalog-zoom">
              <span>Frame thickness · {t.border}px</span>
              <input type="range" min="2" max="28" step="1" value={t.border} onChange={(e) => patch({ border: Number(e.target.value) })} />
            </label>
            <div className="tileset-filter-field">
              <span>Background fill</span>
              <div className="tileset-tier-seg" aria-label="Background fill">
                <button type="button" className={t.fill === 'none' ? 'is-active' : ''} onClick={() => patch({ fill: 'none' })}>None</button>
                <button type="button" className={t.fill === 'color' ? 'is-active' : ''} onClick={() => patch({ fill: 'color' })}>Color</button>
                <button type="button" className={t.fill === 'surface' ? 'is-active' : ''} onClick={() => patch({ fill: 'surface' })}>Surface</button>
              </div>
            </div>
            {t.fill === 'color' ? (
              <>
                <label className="tileset-category-select">
                  <span>Fill color</span>
                  <input type="color" value={t.color} onChange={(e) => patch({ color: e.target.value })} aria-label="Fill color" />
                </label>
                <label className="tileset-catalog-zoom">
                  <span>Fill opacity · {Math.round(t.opacity * 100)}%</span>
                  <input type="range" min="0" max="1" step="0.05" value={t.opacity} onChange={(e) => patch({ opacity: Number(e.target.value) })} />
                </label>
              </>
            ) : null}
            {t.fill === 'surface' ? (
              <label className="tileset-category-select">
                <span>Fill surface</span>
                <select value={t.surface} onChange={(e) => patch({ surface: e.target.value })} aria-label="Fill surface">
                  {SURFACE_ASSETS.map((s) => <option key={s.name} value={s.name}>{s.label}</option>)}
                </select>
              </label>
            ) : null}
            {t.fill !== 'none' ? (
              <p className="tileset-catalog-note">Fill drops the frame’s baked interior so the colour/surface shows. These kit frames have no “line” variant yet, so a faint edge tint may remain — fine for auditioning a look.</p>
            ) : null}
            <button type="button" className="tileset-view-action pages-reset" onClick={() => patch(groupDefault(g))}>Reset this element</button>
            <button type="button" className="tileset-view-action" onClick={() => setGroups(ceAllDefaults())}>Reset all</button>
            <button type="button" className="tileset-view-action" onClick={copyCss}>{copied ? 'Copied CSS ✓' : `Copy CSS${tunedCount ? ` (${tunedCount})` : ''}`}</button>
            <dl className="al-meta">
              <div><dt>Page</dt><dd>{page.label}</dd></div>
              <div><dt>Route</dt><dd>{page.route}</dd></div>
              <div><dt>Tuned</dt><dd>{tunedCount ? `${tunedCount} element${tunedCount > 1 ? 's' : ''}` : 'none (as shipped)'}</dd></div>
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
