// The "Assets" catalog category for the studio — folds the UI-kit Asset Library
// into the studio's existing category-pluggable shell (sibling to UnitsStudio),
// so it inherits the topbar/title/tabs chrome with zero duplication. Layout: a
// flush left tree (browse + the provenance filter) and a per-asset viewer that
// previews the selected asset in a context appropriate to what it is.
import { useMemo, useState, type ReactElement } from 'react';
import manifest from './kitManifest.json';
import provenance from './kitProvenance.json';

type Filter = 'all' | 'forged' | 'unverified';
interface Glyph { name: string; url: string; w: number; h: number; magenta: number; semiPct: number; edge: number; pass: boolean; fails: string[] }
interface Group { id: string; label: string; items: Glyph[] }
interface Frame { name: string; url: string; w: number; h: number }
interface Manifest { generated: string; gate: string; summary: { pass: number; total: number; frames: number }; groups: Group[]; frames: Frame[] }
interface Provenance { process: string; lastRun: string | null; assets: Record<string, { group: string; forged: string; tries: number; gate: string }> }

const KIT = manifest as Manifest;
const PROV = provenance as Provenance;
const forged = (name: string): boolean => Object.prototype.hasOwnProperty.call(PROV.assets, name);

type Entry =
  | { kind: 'glyph'; groupLabel: string; item: Glyph }
  | { kind: 'frame'; item: Frame };

function find(name: string): Entry | null {
  for (const g of KIT.groups) {
    const item = g.items.find((i) => i.name === name);
    if (item) return { kind: 'glyph', groupLabel: g.label.split(' ·')[0], item };
  }
  const f = KIT.frames.find((fr) => fr.name === name);
  return f ? { kind: 'frame', item: f } : null;
}

// A reasonable, type-based preview: glyphs are shown bare and composited into a
// neutral button (their most common home); frames are shown native and stretched
// to a sample box. (Cyclable backdrops come later.)
function Viewer({ entry }: { entry: Entry }): ReactElement {
  const { item } = entry;
  const prov = forged(item.name) ? PROV.assets[item.name] : null;
  const glyph = entry.kind === 'glyph' ? entry.item : null;
  return (
    <div className="al-viewer">
      <header className="al-viewer-head">
        <span className="al-kicker">{entry.kind === 'glyph' ? `${entry.groupLabel} · glyph` : 'frame'}</span>
        <h2>{item.name}</h2>
        <p>{item.w}×{item.h} · {item.url}</p>
      </header>

      <div className="al-stages">
        {entry.kind === 'glyph' ? (
          <>
            <figure className="al-stage"><span className="al-checker"><img src={item.url} alt={item.name} className="al-glyph-lg" /></span><figcaption>default · transparency</figcaption></figure>
            <figure className="al-stage"><span className="al-in-button"><img src={item.url} alt="" className="al-glyph-md" /></span><figcaption>in a button</figcaption></figure>
            <figure className="al-stage"><span className="al-on-panel"><img src={item.url} alt="" className="al-glyph-md" /></span><figcaption>on a panel</figcaption></figure>
          </>
        ) : (
          <>
            <figure className="al-stage"><span className="al-checker"><img src={item.url} alt={item.name} className="al-frame-native" /></span><figcaption>native</figcaption></figure>
            <figure className="al-stage">
              <span className="al-frame-stretch" style={{ borderImageSource: `url(${item.url})`, borderImageSlice: `${Math.max(2, Math.floor(Math.min(item.w, item.h) / 3))} fill`, borderImageWidth: `${Math.max(8, Math.floor(Math.min(item.w, item.h) / 3))}px` }} />
              <figcaption>stretched (9-slice)</figcaption>
            </figure>
          </>
        )}
      </div>

      <dl className="al-meta">
        <div><dt>Process</dt><dd className={prov ? 'al-ok' : 'al-no'}>{prov ? `forged ${prov.forged} (${prov.tries} tr)` : 'unverified'}</dd></div>
        {glyph ? <div><dt>Gate</dt><dd className={glyph.pass ? 'al-ok' : 'al-no'}>{glyph.pass ? 'PASS' : glyph.fails.join(' · ')}</dd></div> : null}
        {glyph ? <div><dt>Magenta</dt><dd>{glyph.magenta}</dd></div> : null}
        {glyph ? <div><dt>Semi-alpha</dt><dd>{glyph.semiPct}%</dd></div> : null}
        {glyph ? <div><dt>Edge</dt><dd>{glyph.edge}</dd></div> : null}
      </dl>
    </div>
  );
}

export function AssetLibraryStudio(): ReactElement {
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string>(KIT.groups[0]?.items[0]?.name ?? '');
  const matches = (name: string): boolean => filter === 'all' || (filter === 'forged' ? forged(name) : !forged(name));
  const entry = useMemo(() => find(selected), [selected]);

  const forgedCount = KIT.groups.flatMap((g) => g.items).filter((i) => forged(i.name)).length;
  const tabs: [Filter, string, number][] = [
    ['all', 'All', KIT.summary.total],
    ['forged', 'Forged', forgedCount],
    ['unverified', 'Unverified', KIT.summary.total - forgedCount],
  ];

  return (
    <section className="tileset-studio-main al-root" aria-label="Asset library">
      <aside className="al-tree" aria-label="Assets">
        <div className="al-filter" role="group" aria-label="Filter by process">
          {tabs.map(([key, label, n]) => (
            <button type="button" key={key} className={filter === key ? 'is-active' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label} <span>{n}</span>
            </button>
          ))}
        </div>
        <div className="al-tree-scroll">
          {KIT.groups.map((g) => {
            const items = g.items.filter((i) => matches(i.name));
            if (!items.length) return null;
            return (
              <div className="al-tree-group" key={g.id}>
                <p className="al-tree-label">{g.label.split(' ·')[0]}</p>
                {items.map((i) => (
                  <button type="button" key={i.name} className={`al-tree-leaf ${selected === i.name ? 'is-selected' : ''}`} onClick={() => setSelected(i.name)}>
                    <img src={i.url} alt="" />
                    <span>{i.name}</span>
                    <em className={forged(i.name) ? 'al-dot-ok' : 'al-dot-no'} aria-hidden="true" />
                  </button>
                ))}
              </div>
            );
          })}
          {KIT.frames.filter((f) => matches(f.name)).length ? (
            <div className="al-tree-group">
              <p className="al-tree-label">Frames</p>
              {KIT.frames.filter((f) => matches(f.name)).map((f) => (
                <button type="button" key={f.name} className={`al-tree-leaf ${selected === f.name ? 'is-selected' : ''}`} onClick={() => setSelected(f.name)}>
                  <img src={f.url} alt="" />
                  <span>{f.name}</span>
                  <em className={forged(f.name) ? 'al-dot-ok' : 'al-dot-no'} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </aside>
      {entry ? <Viewer entry={entry} /> : <div className="al-viewer al-empty">Select an asset.</div>}
    </section>
  );
}
