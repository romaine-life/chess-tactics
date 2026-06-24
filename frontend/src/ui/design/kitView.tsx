// The Kit branch of the asset catalog — the shared UI kit (generated glyphs +
// 9-slice frames) shown with a per-asset health badge from the gate. Like the
// rest of the catalog, the tree drills down to a single asset: /design/catalog/
// kit shows the overview grid, /design/catalog/kit/<name> shows that asset's
// detail. Data is the build-time manifest (frontend/scripts/kit-manifest.mjs).
import manifest from './kitManifest.json';

type Navigate = (href: string, e?: { preventDefault: () => void }) => void;

interface KitGlyph { name: string; url: string; w: number; h: number; magenta: number; semiPct: number; edge: number; pass: boolean; fails: string[] }
interface KitGroup { id: string; label: string; items: KitGlyph[] }
interface KitFrame { name: string; url: string; w: number; h: number }
interface KitManifest { generated: string; gate: string; summary: { pass: number; total: number; frames: number }; groups: KitGroup[]; frames: KitFrame[] }

const KIT = manifest as KitManifest;

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

function GlyphCell({ g, onNavigate }: { g: KitGlyph; onNavigate: Navigate }): React.ReactElement {
  const href = `/design/catalog/kit/${g.name}`;
  return (
    <a className={`kit-cell ${g.pass ? '' : 'is-bad'}`} href={href} onClick={(e) => onNavigate(href, e)}>
      <span className="kit-thumb"><img src={g.url} alt={g.name} loading="lazy" /></span>
      <span className="kit-caption"><b>{g.name}</b><span className="kit-dim">{g.w}×{g.h}</span></span>
      {g.pass
        ? <span className="kit-badge is-ok" title={`magenta ${g.magenta} · AA ${g.semiPct}% · edge ${g.edge}`}>PASS</span>
        : <span className="kit-badge is-no">{g.fails.join(' · ')}</span>}
    </a>
  );
}

function FrameCell({ f, onNavigate }: { f: KitFrame; onNavigate: Navigate }): React.ReactElement {
  const href = `/design/catalog/kit/${f.name}`;
  return (
    <a className="kit-cell is-frame" href={href} onClick={(e) => onNavigate(href, e)}>
      <span className="kit-thumb is-wide"><img src={f.url} alt={f.name} /></span>
      <span className="kit-caption"><b>{f.name}</b><span className="kit-dim">{f.w}×{f.h}</span></span>
    </a>
  );
}

function KitOverview({ onNavigate }: { onNavigate: Navigate }): React.ReactElement {
  const allOk = KIT.summary.pass === KIT.summary.total;
  return (
    <div className="catalog-home kit-view">
      <div className="kit-health">
        <span className={`kit-score ${allOk ? 'is-ok' : 'is-no'}`}>{KIT.summary.pass}/{KIT.summary.total}</span>
        <div>
          <strong>glyphs pass the asset gate</strong>
          <span className="kit-dim">{KIT.gate} · {KIT.frames.length} frames · generated {KIT.generated}</span>
        </div>
      </div>
      {KIT.groups.map((group) => (
        <section className="catalog-home-class kit-group" id={`kit-group-${group.id}`} aria-label={group.label} key={group.id}>
          <h3 className="catalog-home-class-label">
            {group.label}
            <span className="kit-count">{group.items.filter((i) => i.pass).length}/{group.items.length}</span>
          </h3>
          <div className="kit-grid">{group.items.map((g) => <GlyphCell g={g} onNavigate={onNavigate} key={g.name} />)}</div>
        </section>
      ))}
      <section className="catalog-home-class kit-group" id="kit-group-frames" aria-label="Frames and components">
        <h3 className="catalog-home-class-label">Frames &amp; components<span className="kit-count">{KIT.frames.length}</span></h3>
        <p className="kit-note">9-slice chrome &amp; sprites — visual inventory (the glyph gate doesn’t apply).</p>
        <div className="kit-grid">{KIT.frames.map((f) => <FrameCell f={f} onNavigate={onNavigate} key={f.name} />)}</div>
      </section>
    </div>
  );
}

function KitDetail({ found, onNavigate }: { found: Found; onNavigate: Navigate }): React.ReactElement {
  const { item } = found;
  const glyph = found.kind === 'glyph' ? found.item : null;
  return (
    <article className="catalog-asset-card kit-detail" id={item.name}>
      <header className="catalog-asset-head">
        <span className="design-hub-kicker">{found.kind === 'glyph' ? `${found.groupLabel} · glyph` : 'frame · inventory'}</span>
        <h3>{item.name}</h3>
        <p>{found.kind === 'glyph'
          ? 'Generated glyph, audited by the asset gate for background-keying (magenta), binary alpha, and edge bleed.'
          : '9-slice frame / sprite — visual inventory; verified by the frame checks and in use on settings.'}</p>
      </header>
      <section className="kit-detail-stage" aria-label="Preview">
        <span className={`kit-thumb ${found.kind === 'frame' ? 'is-wide' : ''} kit-detail-thumb`}><img src={item.url} alt={item.name} /></span>
      </section>
      <section className="catalog-asset-meta" aria-label="Asset metadata">
        <div><dt>Size</dt><dd>{item.w}×{item.h}</dd></div>
        <div><dt>Path</dt><dd>{item.url}</dd></div>
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
