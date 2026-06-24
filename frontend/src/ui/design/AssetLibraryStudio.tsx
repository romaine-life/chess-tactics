// The "Assets" catalog category for the studio — browses exactly like Tiles:
// a grouped grid of asset cards in the main pane (the browser). Search + the
// process filter live in the studio's Controls panel (tier-2), passed in as
// props, so this component is purely the catalog. The per-asset viewer is the
// Lab's job (Asset surface), not the catalog's. Data: the build-time manifest +
// provenance (frontend/scripts/kit-manifest.mjs / kit-forge.mjs).
import { type ReactElement } from 'react';
import manifest from './kitManifest.json';
import provenance from './kitProvenance.json';

export type AssetFilter = 'all' | 'forged' | 'unverified';

interface Glyph { name: string; url: string; w: number; h: number; pass: boolean }
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
        <span className={`asset-prov ${forged(name) ? 'is-forged' : 'is-unverified'}`}>{forged(name) ? 'forged' : 'unverified'}</span>
      </span>
    </button>
  );
}

export function AssetLibraryStudio({ filter, search, selected, onSelect }: {
  filter: AssetFilter;
  search: string;
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

  const shown = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <section className="tileset-studio-main">
      <div className="tileset-studio-toolbar">
        <div className="tileset-studio-title-row">
          <div className="tileset-catalog-heading">
            <h2>Asset Library</h2>
            <p className="tileset-filter-summary">{shown} assets · gate {KIT.summary.pass}/{KIT.summary.total} · select a card, then open Lab to preview it</p>
          </div>
        </div>
      </div>
      <section className="tileset-studio-tab-panel">
        <div className="tileset-asset-sections">
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
