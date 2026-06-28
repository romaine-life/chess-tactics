import { useState, type ReactElement, type ReactNode, type CSSProperties } from 'react';
import { PAGE_ENTRIES, type PageEntry } from './pagesCatalog';
import { MainMenu } from './MainMenu';

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
  const [iconSize, setIconSize] = useState(64);
  const [hoverSlide, setHoverSlide] = useState<'off' | '6' | '10'>('off');
  const [stone, setStone] = useState('stone-slate-blue');
  const resetDefaults = (): void => {
    setBtnH(80);
    setIconSize(64);
    setHoverSlide('off');
    setStone('stone-slate-blue');
  };
  const wrapStyle = {
    '--menu-btn-h': `${btnH}px`,
    '--menu-icon-size': `${iconSize}px`,
    '--menu-stone-surface': `url("/assets/ui/surfaces/${stone}.png")`,
  } as CSSProperties;
  const slideClass = hoverSlide === '6' ? 'indent-hover' : hoverSlide === '10' ? 'indent-hover indent-hover-10' : '';
  return (
    <>
      <section className="al-lab-main pages-view-main" aria-label="Main Menu preview">
        <div className={`pages-menu-tweak ${slideClass}`.trim()} style={wrapStyle}>
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

// Dispatcher: routes the selected page to its viewer — Main Menu is functional; the rest are
// live stubs. One arm in the TilePreview viewer ladder calls this.
export function PagesViewer({ name, header }: { name?: string; header?: ReactNode }): ReactElement {
  const page = PAGE_ENTRIES.find((p) => p.name === name) ?? PAGE_ENTRIES[0];
  return page.name === 'main-menu'
    ? <MainMenuViewer page={page} header={header} />
    : <PageStubViewer page={page} header={header} />;
}
