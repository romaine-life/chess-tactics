// The "Assets" catalog category for the studio — browses exactly like Tiles:
// a grouped grid of asset cards in the main pane (the browser). Search + the
// process filter live in the studio's Controls panel (tier-2), passed in as
// props, so this component is purely the catalog. The per-asset viewer is the
// Lab's job (Asset surface), not the catalog's. Data: the build-time manifest +
// provenance (frontend/scripts/kit-manifest.mjs / kit-forge.mjs).
import { type CSSProperties, type ReactElement } from 'react';
import manifest from './kitManifest.json';
import provenance from './kitProvenance.json';

export type AssetFilter = 'all' | 'forged' | 'unverified';

interface Glyph { name: string; url: string; w: number; h: number; magenta: number; semiPct: number; edge: number; pass: boolean; fails: string[] }
interface Group { id: string; label: string; items: Glyph[] }
interface Frame { name: string; url: string; w: number; h: number }
interface Manifest { summary: { pass: number; total: number; frames: number }; groups: Group[]; frames: Frame[] }
interface Provenance { assets: Record<string, { forged: string; tries: number }> }

const KIT = manifest as Manifest;
const PROV = provenance as Provenance;
const forged = (name: string): boolean => Object.prototype.hasOwnProperty.call(PROV.assets, name);
const GROUP_LABEL: Record<string, string> = { settings: 'Icons', game: 'Game', shields: 'Shields' };

function Card({ name, url, sub, selected, onSelect }: { name: string; url: string; sub: string; selected: boolean; onSelect: (name: string) => void }): ReactElement {
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
        <span className={`asset-prov ${forged(name) ? 'is-forged' : 'is-original'}`}>{forged(name) ? 'forged' : 'original'}</span>
      </span>
    </button>
  );
}

export function AssetLibraryStudio({ filter, search, zoom, selected, onSelect }: {
  filter: AssetFilter;
  search: string;
  zoom: number;
  selected: string;
  onSelect: (name: string) => void;
}): ReactElement {
  const q = search.trim().toLowerCase();
  const ok = (name: string): boolean =>
    (filter === 'all' || (filter === 'forged' ? forged(name) : !forged(name))) && (!q || name.toLowerCase().includes(q));

  const sections = [
    ...KIT.groups.map((g) => ({ key: g.id, label: GROUP_LABEL[g.id] ?? g.label, items: g.items.filter((i) => ok(i.name)).map((i) => ({ name: i.name, url: i.url, sub: `${i.w}×${i.h}` })) })),
    { key: 'frames', label: 'Frames', items: KIT.frames.filter((f) => ok(f.name)).map((f) => ({ name: f.name, url: f.url, sub: `${f.w}×${f.h}` })) },
  ].filter((s) => s.items.length);

  return (
    <section className="tileset-studio-main is-headless">
      <section className="tileset-studio-tab-panel">
        <div className="tileset-asset-sections" style={{ '--tile-zoom': zoom } as CSSProperties}>
          {sections.map((s) => (
            <section className="tileset-asset-section" aria-label={s.label} key={s.key}>
              <h3>{s.label}</h3>
              <div className="tileset-studio-grid">
                {s.items.map((it) => <Card key={it.name} name={it.name} url={it.url} sub={it.sub} selected={selected === it.name} onSelect={onSelect} />)}
              </div>
            </section>
          ))}
          {!sections.length ? <p className="tileset-catalog-note">No assets match this filter.</p> : null}
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

// The Lab's Asset surface — main pane previews the selected asset in contexts
// chosen by its type (glyph: bare / in a button / on a panel; frame: native /
// stretched); the aside carries the same cascade as the board lab (Surface
// segmented at the top) plus the asset's provenance/gate readout. It renders
// [main][aside] straight into the shell so the frame matches every other mode.
export function AssetLab({ name, onPickBoard }: { name: string; onPickBoard: () => void }): ReactElement {
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
      <aside className="tileset-view-controls" aria-label="Asset controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            <div className="tileset-tier-seg" aria-label="Lab surface">
              <button type="button" onClick={onPickBoard} title="Work on the shared board.">Board</button>
              <button type="button" className="is-active" title="Preview a UI-kit asset.">Asset</button>
            </div>
            {found && item ? (
              <dl className="al-meta">
                <div><dt>Source</dt><dd>{found.kind === 'glyph' ? `${found.groupLabel} · glyph` : 'frame'} · {item.w}×{item.h}</dd></div>
                <div><dt>Process</dt><dd className={prov ? 'al-ok' : ''}>{prov ? `forged ${prov.forged} (${prov.tries} tr)` : 'original (pre-forge)'}</dd></div>
                {glyph ? <div><dt>Gate</dt><dd className={glyph.pass ? 'al-ok' : 'al-no'}>{glyph.pass ? 'PASS' : glyph.fails.join(' · ')}</dd></div> : null}
                {glyph ? <div><dt>Magenta</dt><dd>{glyph.magenta}</dd></div> : null}
                {glyph ? <div><dt>Semi-alpha</dt><dd>{glyph.semiPct}%</dd></div> : null}
                {glyph ? <div><dt>Edge</dt><dd>{glyph.edge}</dd></div> : null}
              </dl>
            ) : null}
          </div>
        </section>
      </aside>
    </>
  );
}
