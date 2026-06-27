// The "Assets" catalog category for the studio — browses exactly like Tiles:
// a grouped grid of asset cards in the main pane (the browser). Search + the
// process filter live in the studio's Controls panel (tier-2), passed in as
// props, so this component is purely the catalog. The per-asset viewer is the
// Lab's job (Asset surface), not the catalog's. Data: the build-time manifest +
// provenance (frontend/scripts/kit-manifest.mjs / kit-forge.mjs).
import { type CSSProperties, type ReactElement, type ReactNode } from 'react';
import manifest from './kitManifest.json';
import provenance from './kitProvenance.json';

// Every asset card carries three filterable properties: its TYPE (which shelf it
// lives on — Icons/Game/Shields/Frames, restoring the portfolio's categorisation),
// its PROVENANCE (forged through the kit pipeline vs. an original pre-forge asset),
// and its GATE result (did the hard-alpha verifier pass). The Controls panel filters
// on all three; the card surfaces gate + provenance as chips (type is the section).
export type AssetTypeFacet = 'all' | 'settings' | 'game' | 'shields' | 'frames';
export type AssetProvFacet = 'all' | 'forged' | 'original';
export type AssetGateFacet = 'all' | 'pass' | 'fail';
export interface AssetFilters { type: AssetTypeFacet; prov: AssetProvFacet; gate: AssetGateFacet }

// The selectable type shelves, paired with their display label (group id -> label).
export const ASSET_TYPE_FACETS: { value: AssetTypeFacet; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'settings', label: 'Icons' },
  { value: 'game', label: 'Game' },
  { value: 'shields', label: 'Shields' },
  { value: 'frames', label: 'Frames' },
];

interface Glyph { name: string; url: string; w: number; h: number; magenta: number; semiPct: number; edge: number; pass: boolean; fails: string[] }
interface Group { id: string; label: string; items: Glyph[] }
interface Frame { name: string; url: string; w: number; h: number }
interface Manifest { summary: { pass: number; total: number; frames: number }; groups: Group[]; frames: Frame[] }
interface Provenance { assets: Record<string, { forged: string; tries: number }> }

const KIT = manifest as Manifest;
const PROV = provenance as Provenance;
const forged = (name: string): boolean => Object.prototype.hasOwnProperty.call(PROV.assets, name);

// Frames the /nine-slice-editor can open — those with atom sets registered in
// scripts/nine-slice-kit.mjs. Variant names (e.g. -active) map to their base
// editable asset. Other frames are whole-PNG and the atom editor can't edit them.
const EDITOR_ASSET: Record<string, string> = { 'mode-button': 'mode-button', 'mode-button-active': 'mode-button', 'row': 'row', 'panel': 'panel' };
const GROUP_LABEL: Record<string, string> = { settings: 'Icons', game: 'Game', shields: 'Shields' };

function Card({ name, url, sub, gate, selected, onSelect }: { name: string; url: string; sub: string; gate?: 'pass' | 'fail'; selected: boolean; onSelect: (name: string) => void }): ReactElement {
  return (
    <button
      type="button"
      className={`tileset-studio-card is-asset ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(name)}
      aria-pressed={selected}
      title={`Select ${name}`}
    >
      <span className="tileset-studio-card-image asset-card-image"><img src={url} alt="" draggable={false} /></span>
      <span className="tileset-studio-card-meta">
        <span className="tileset-studio-card-text"><strong>{name}</strong><em>{sub}</em></span>
        <span className="asset-card-chips">
          {gate ? <span className={`asset-gate is-${gate}`}>{gate}</span> : null}
          <span className={`asset-prov ${forged(name) ? 'is-forged' : 'is-original'}`}>{forged(name) ? 'forged' : 'original'}</span>
        </span>
      </span>
    </button>
  );
}

export function AssetLibraryStudio({ filters, search, zoom, selected, onSelect }: {
  filters: AssetFilters;
  search: string;
  zoom: number;
  selected: string;
  onSelect: (name: string) => void;
}): ReactElement {
  const q = search.trim().toLowerCase();
  const provOk = (name: string): boolean => filters.prov === 'all' || (filters.prov === 'forged' ? forged(name) : !forged(name));
  const searchOk = (name: string): boolean => !q || name.toLowerCase().includes(q);
  const gateOk = (g: Glyph): boolean => filters.gate === 'all' || (filters.gate === 'pass' ? g.pass : !g.pass);

  const groupSections = KIT.groups
    .filter((g) => filters.type === 'all' || filters.type === g.id)
    .map((g) => ({
      key: g.id,
      label: GROUP_LABEL[g.id] ?? g.label,
      items: g.items
        .filter((i) => provOk(i.name) && searchOk(i.name) && gateOk(i))
        .map((i) => ({ name: i.name, url: i.url, sub: `${i.w}×${i.h}`, gate: (i.pass ? 'pass' : 'fail') as 'pass' | 'fail' })),
    }));

  // Frames aren't gated, so they only appear when the gate facet isn't narrowing to pass/fail.
  const frameSection = (filters.type === 'all' || filters.type === 'frames') && filters.gate === 'all'
    ? [{ key: 'frames', label: 'Frames', items: KIT.frames.filter((f) => provOk(f.name) && searchOk(f.name)).map((f) => ({ name: f.name, url: f.url, sub: `${f.w}×${f.h}`, gate: undefined as 'pass' | 'fail' | undefined })) }]
    : [];

  const sections = [...groupSections, ...frameSection].filter((s) => s.items.length);

  return (
    <section className="tileset-studio-main is-headless">
      <section className="tileset-studio-tab-panel">
        <div className="tileset-asset-sections" style={{ '--tile-zoom': zoom } as CSSProperties}>
          {sections.map((s) => (
            <section className="tileset-asset-section" aria-label={s.label} key={s.key}>
              <h3>{s.label}</h3>
              <div className="tileset-studio-grid">
                {s.items.map((it) => <Card key={it.name} name={it.name} url={it.url} sub={it.sub} gate={it.gate} selected={selected === it.name} onSelect={onSelect} />)}
              </div>
            </section>
          ))}
          {!sections.length ? <p className="tileset-catalog-note">No assets match these filters.</p> : null}
        </div>
      </section>
    </section>
  );
}

type Found =
  | { kind: 'glyph'; groupLabel: string; item: Glyph }
  | { kind: 'frame'; item: Frame };

function findAsset(name: string): Found | null {
  for (const g of KIT.groups) {
    const item = g.items.find((i) => i.name === name);
    if (item) return { kind: 'glyph', groupLabel: GROUP_LABEL[g.id] ?? g.label, item };
  }
  const f = KIT.frames.find((fr) => fr.name === name);
  return f ? { kind: 'frame', item: f } : null;
}

// The Asset Viewer surface — main pane previews the selected asset in contexts
// chosen by its type (glyph: bare / in a button / on a panel; frame: native /
// stretched); the aside carries the Viewer's Asset|Artwork kind selector (the
// `header` slot) above a read-only Details readout (provenance/gate). Assets are
// inspected, not manipulated, so this is the Viewer destination, not the board
// Lab. It renders [main][aside] straight into the shell to match every other mode.
export function AssetLab({ name, header }: { name: string; header?: ReactNode }): ReactElement {
  const found = name ? findAsset(name) : null;
  const item = found?.item;
  const prov = item && forged(item.name) ? PROV.assets[item.name] : null;
  const glyph = found?.kind === 'glyph' ? found.item : null;
  return (
    <>
      <section className="al-lab-main" aria-label="Asset preview">
        {!found ? (
          <p className="al-lab-empty">No asset selected — pick a card in the Assets catalog.</p>
        ) : (
          <div className="al-lab-stages">
            {found.kind === 'glyph' ? (
              <>
                <figure className="al-stage"><span className="al-checker"><img src={found.item.url} alt={found.item.name} className="al-glyph-lg" /></span><figcaption>default · transparency</figcaption></figure>
                <figure className="al-stage"><span className="al-in-button"><img src={found.item.url} alt="" className="al-glyph-md" /></span><figcaption>in a button</figcaption></figure>
                <figure className="al-stage"><span className="al-on-panel"><img src={found.item.url} alt="" className="al-glyph-md" /></span><figcaption>on a panel</figcaption></figure>
              </>
            ) : (
              <>
                <figure className="al-stage"><span className="al-checker"><img src={found.item.url} alt={found.item.name} className="al-frame-native" /></span><figcaption>native</figcaption></figure>
                <figure className="al-stage"><span className="al-frame-stretch" style={{ borderImageSource: `url(${found.item.url})`, borderImageSlice: `${Math.max(2, Math.floor(Math.min(found.item.w, found.item.h) / 3))} fill`, borderImageWidth: `${Math.max(8, Math.floor(Math.min(found.item.w, found.item.h) / 3))}px` }} /><figcaption>stretched (9-slice)</figcaption></figure>
              </>
            )}
          </div>
        )}
      </section>
      <aside className="tileset-view-controls" aria-label="Asset details">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            {item && EDITOR_ASSET[item.name] ? (
              <a
                href={`/nine-slice-editor?asset=${EDITOR_ASSET[item.name]}`}
                style={{ display: 'block', padding: '9px 12px', textAlign: 'center', background: '#1d5f9e', color: '#fff', borderRadius: 4, textDecoration: 'none', fontWeight: 700, fontSize: 13 }}
              >✎ Edit in 9-slice editor</a>
            ) : null}
            {found && item ? (
              <dl className="al-meta">
                <div><dt>Source</dt><dd>{found.kind === 'glyph' ? `${found.groupLabel} · glyph` : 'frame'} · {item.w}×{item.h}</dd></div>
                <div><dt>Process</dt><dd className={prov ? 'al-ok' : ''}>{prov ? `forged ${prov.forged} (${prov.tries} tr)` : 'original (pre-forge)'}</dd></div>
                {glyph ? <div><dt>Gate</dt><dd className={glyph.pass ? 'al-ok' : 'al-no'}>{glyph.pass ? 'PASS' : glyph.fails.join(' · ')}</dd></div> : null}
                {glyph ? <div><dt>Magenta</dt><dd>{glyph.magenta}</dd></div> : null}
                {glyph ? <div><dt>Semi-alpha</dt><dd>{glyph.semiPct}%</dd></div> : null}
                {glyph ? <div><dt>Edge</dt><dd>{glyph.edge}</dd></div> : null}
              </dl>
            ) : (
              <p className="tileset-catalog-note">No asset selected — pick a card in the Assets catalog.</p>
            )}
          </div>
        </section>
      </aside>
    </>
  );
}
