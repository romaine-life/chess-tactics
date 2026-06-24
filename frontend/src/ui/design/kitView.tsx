// The Kit branch of the asset catalog — the shared UI kit (generated glyphs +
// 9-slice frames). Two independent signals per asset:
//   gate     — did the pixels pass the mechanical check (magenta/alpha/edge)
//   process  — did it go through the forge (single-shot prompt + gate + audit),
//              the real "is it safe" signal; older assets can pass the gate yet
//              still be subtly rotten. The Forged/Unverified filter is on process.
// Data: kit-manifest.mjs (gate) + kit-forge.mjs (provenance). The tree drills to
// a single asset; /design/catalog/kit/<name> shows its detail.
import { useState } from 'react';
import manifest from './kitManifest.json';
import provenance from './kitProvenance.json';

type Navigate = (href: string, e?: { preventDefault: () => void }) => void;
type Filter = 'all' | 'forged' | 'unverified';

interface KitGlyph { name: string; url: string; w: number; h: number; magenta: number; semiPct: number; edge: number; pass: boolean; fails: string[] }
interface KitGroup { id: string; label: string; items: KitGlyph[] }
interface KitFrame { name: string; url: string; w: number; h: number }
interface KitManifest { generated: string; gate: string; summary: { pass: number; total: number; frames: number }; groups: KitGroup[]; frames: KitFrame[] }
interface KitProvenance { process: string; lastRun: string | null; assets: Record<string, { group: string; forged: string; tries: number; gate: string }> }

const KIT = manifest as KitManifest;
const PROV = provenance as KitProvenance;
const forged = (name: string): boolean => Object.prototype.hasOwnProperty.call(PROV.assets, name);
const matches = (name: string, f: Filter): boolean => f === 'all' || (f === 'forged' ? forged(name) : !forged(name));

const allGlyphNames = KIT.groups.flatMap((g) => g.items.map((i) => i.name));
const forgedCount = allGlyphNames.filter(forged).length;

type Found =
  | { kind: 'glyph'; groupLabel: string; item: KitGlyph }
  | { kind: 'frame'; item: KitFrame };

export function findKitAsset(name: string): Found | null {
  for (const g of KIT.groups) {
    const item = g.items.find((i) => i.name === name);
    if (item) return { kind: 'glyph', groupLabel: g.label.split(' ·')[0], item };
  }
  const frame = KIT.frames.find((f) => f.name === name);
  return frame ? { kind: 'frame', item: frame } : null;
}

function ProvBadge({ name }: { name: string }): React.ReactElement {
  return forged(name)
    ? <span className="kit-prov is-forged" title={`forged ${PROV.assets[name].forged} · ${PROV.assets[name].tries} tr`}>forged</span>
    : <span className="kit-prov is-unverified" title="has not been through the forge (single-shot + gate + audit)">unverified</span>;
}

function GlyphCell({ g, onNavigate }: { g: KitGlyph; onNavigate: Navigate }): React.ReactElement {
  const href = `/design/catalog/kit/${g.name}`;
  return (
    <a className={`kit-cell ${g.pass ? '' : 'is-bad'}`} href={href} onClick={(e) => onNavigate(href, e)}>
      <span className="kit-thumb"><img src={g.url} alt={g.name} loading="lazy" /></span>
      <span className="kit-caption"><b>{g.name}</b><span className="kit-dim">{g.w}×{g.h}</span></span>
      <span className="kit-badges">
        {g.pass ? <span className="kit-badge is-ok">PASS</span> : <span className="kit-badge is-no">{g.fails.join(' · ')}</span>}
        <ProvBadge name={g.name} />
      </span>
    </a>
  );
}

function FrameCell({ f, onNavigate }: { f: KitFrame; onNavigate: Navigate }): React.ReactElement {
  const href = `/design/catalog/kit/${f.name}`;
  return (
    <a className="kit-cell is-frame" href={href} onClick={(e) => onNavigate(href, e)}>
      <span className="kit-thumb is-wide"><img src={f.url} alt={f.name} /></span>
      <span className="kit-caption"><b>{f.name}</b><span className="kit-dim">{f.w}×{f.h}</span></span>
      <span className="kit-badges"><ProvBadge name={f.name} /></span>
    </a>
  );
}

function KitOverview({ onNavigate }: { onNavigate: Navigate }): React.ReactElement {
  const [filter, setFilter] = useState<Filter>('all');
  const allOk = KIT.summary.pass === KIT.summary.total;
  const tabs: [Filter, string, number][] = [
    ['all', 'All', KIT.summary.total],
    ['forged', 'Forged', forgedCount],
    ['unverified', 'Unverified', KIT.summary.total - forgedCount],
  ];
  return (
    <div className="catalog-home kit-view">
      <div className="kit-health">
        <span className={`kit-score ${allOk ? 'is-ok' : 'is-no'}`}>{KIT.summary.pass}/{KIT.summary.total}</span>
        <div>
          <strong>gate-clean · {forgedCount}/{KIT.summary.total} forged through the process</strong>
          <span className="kit-dim">gate: {KIT.gate} · process: {PROV.process}{PROV.lastRun ? ` (last run ${PROV.lastRun})` : ''}</span>
        </div>
      </div>

      <div className="kit-filter" role="group" aria-label="Filter by process provenance">
        <span className="kit-filter-label">Filter · process</span>
        {tabs.map(([key, label, n]) => (
          <button type="button" key={key} className={filter === key ? 'is-active' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label} <span className="kit-filter-n">{n}</span>
          </button>
        ))}
      </div>

      {KIT.groups.map((group) => {
        const items = group.items.filter((i) => matches(i.name, filter));
        if (!items.length) return null;
        return (
          <section className="catalog-home-class kit-group" id={`kit-group-${group.id}`} aria-label={group.label} key={group.id}>
            <h3 className="catalog-home-class-label">
              {group.label}
              <span className="kit-count">{items.filter((i) => forged(i.name)).length}/{items.length} forged</span>
            </h3>
            <div className="kit-grid">{items.map((g) => <GlyphCell g={g} onNavigate={onNavigate} key={g.name} />)}</div>
          </section>
        );
      })}

      {(() => {
        const frames = KIT.frames.filter((f) => matches(f.name, filter));
        if (!frames.length) return null;
        return (
          <section className="catalog-home-class kit-group" id="kit-group-frames" aria-label="Frames and components">
            <h3 className="catalog-home-class-label">Frames &amp; components<span className="kit-count">{frames.length}</span></h3>
            <p className="kit-note">9-slice chrome &amp; sprites — built from atoms, not the glyph forge; the glyph gate doesn’t apply.</p>
            <div className="kit-grid">{frames.map((f) => <FrameCell f={f} onNavigate={onNavigate} key={f.name} />)}</div>
          </section>
        );
      })()}
    </div>
  );
}

function KitDetail({ found, onNavigate }: { found: Found; onNavigate: Navigate }): React.ReactElement {
  const { item } = found;
  const glyph = found.kind === 'glyph' ? found.item : null;
  const prov = forged(item.name) ? PROV.assets[item.name] : null;
  return (
    <article className="catalog-asset-card kit-detail" id={item.name}>
      <header className="catalog-asset-head">
        <span className="design-hub-kicker">{found.kind === 'glyph' ? `${found.groupLabel} · glyph` : 'frame · inventory'}</span>
        <h3>{item.name}</h3>
        <p>{found.kind === 'glyph'
          ? 'Generated glyph, audited by the asset gate for background-keying (magenta), binary alpha, and edge bleed.'
          : '9-slice frame / sprite — built from atoms; verified by the frame checks and in use on settings.'}</p>
      </header>
      <section className="kit-detail-stage" aria-label="Preview">
        <span className={`kit-thumb ${found.kind === 'frame' ? 'is-wide' : ''} kit-detail-thumb`}><img src={item.url} alt={item.name} /></span>
      </section>
      <section className="catalog-asset-meta" aria-label="Asset metadata">
        <div><dt>Size</dt><dd>{item.w}×{item.h}</dd></div>
        <div><dt>Path</dt><dd>{item.url}</dd></div>
        <div><dt>Process</dt><dd className={prov ? 'kit-ok' : 'kit-no'}>{prov ? `forged ${prov.forged} (${prov.tries} tr)` : 'unverified — not through the forge'}</dd></div>
        {glyph ? <div><dt>Gate</dt><dd className={glyph.pass ? 'kit-ok' : 'kit-no'}>{glyph.pass ? 'PASS' : glyph.fails.join(' · ')}</dd></div> : null}
        {glyph ? <div><dt>Magenta px</dt><dd>{glyph.magenta}</dd></div> : null}
        {glyph ? <div><dt>Semi-alpha</dt><dd>{glyph.semiPct}%</dd></div> : null}
        {glyph ? <div><dt>Edge px</dt><dd>{glyph.edge}</dd></div> : null}
      </section>
      <p className="kit-detail-back"><a href="/design/catalog/kit" onClick={(e) => onNavigate('/design/catalog/kit', e)}>← all kit assets</a></p>
    </article>
  );
}

export function KitView({ selected, onNavigate }: { selected?: string; onNavigate: Navigate }): React.ReactElement {
  if (selected) {
    const found = findKitAsset(selected);
    return found ? <KitDetail found={found} onNavigate={onNavigate} /> : <p className="catalog-empty">No kit asset “{selected}”.</p>;
  }
  return <KitOverview onNavigate={onNavigate} />;
}
