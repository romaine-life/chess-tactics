// The "Artwork" catalog category for the studio — browses like Assets: a grouped
// grid of art cards in the browser pane (world scenes, portrait backgrounds, unit
// portraits, portrait-editor sources, brand/key art, concept art, inspiration).
// Search + zoom live in the studio's Controls panel (passed in as props). The
// per-piece viewer is the Lab's job. Data: the build-time manifest from
// scripts/artwork-manifest.mjs (parallel to Assets' kit-manifest). No forge/gate
// here — these are authored artworks, not generated hard-alpha glyphs.
import { type CSSProperties, type ReactElement, type ReactNode } from 'react';
import manifest from './artworkManifest.json';

interface ArtworkItem { id: string; label: string; url: string; w: number; h: number; sub: string }
interface ArtworkGroup { id: string; label: string; items: ArtworkItem[] }
interface ArtworkManifest { generated: string; summary: { total: number; groups: number }; groups: ArtworkGroup[] }

const ART = manifest as ArtworkManifest;
const dimOf = (it: ArtworkItem): string => (it.w && it.h ? `${it.w}×${it.h}` : '');

function Card({ item, selected, onSelect }: { item: ArtworkItem; selected: boolean; onSelect: (id: string) => void }): ReactElement {
  const dim = dimOf(item);
  return (
    <button
      type="button"
      className={`tileset-studio-card is-artwork ${selected ? 'is-selected' : ''}`}
      onClick={() => onSelect(item.id)}
      aria-pressed={selected}
      title={`Select ${item.label}`}
    >
      <span className="tileset-studio-card-image"><img src={item.url} alt="" loading="lazy" draggable={false} /></span>
      <span className="tileset-studio-card-meta">
        <span className="tileset-studio-card-text"><strong>{item.label}</strong><em>{[item.sub, dim].filter(Boolean).join(' · ')}</em></span>
      </span>
    </button>
  );
}

export function ArtworkLibraryStudio({ search, zoom, selected, onSelect }: {
  search: string;
  zoom: number;
  selected: string;
  onSelect: (id: string) => void;
}): ReactElement {
  const q = search.trim().toLowerCase();
  const sections = ART.groups
    .map((g) => ({
      ...g,
      items: g.items.filter((it) => !q || it.label.toLowerCase().includes(q) || g.label.toLowerCase().includes(q) || it.sub.toLowerCase().includes(q)),
    }))
    .filter((s) => s.items.length);

  return (
    <section className="tileset-studio-main is-headless">
      <section className="tileset-studio-tab-panel">
        <div className="tileset-asset-sections" style={{ '--tile-zoom': zoom } as CSSProperties}>
          {sections.map((s) => (
            <section className="tileset-asset-section" aria-label={s.label} key={s.id}>
              <h3>{s.label}</h3>
              <div className="tileset-studio-grid">
                {s.items.map((it) => <Card key={it.id} item={it} selected={selected === it.id} onSelect={onSelect} />)}
              </div>
            </section>
          ))}
          {!sections.length ? <p className="tileset-catalog-note">No artwork matches this search.</p> : null}
        </div>
      </section>
    </section>
  );
}

function findArtwork(id: string): { group: ArtworkGroup; item: ArtworkItem } | null {
  for (const g of ART.groups) {
    const item = g.items.find((i) => i.id === id);
    if (item) return { group: g, item };
  }
  return null;
}

// The Artwork viewer surface — one big contained preview of the selected piece on a
// checker stage, plus a metadata readout (group, dimensions, served path). Renders
// [main][aside] straight into the shell so the frame matches every other mode. The
// `header` slot carries the Viewer's Asset|Artwork kind selector (the Viewer's tier
// control), supplied by the host so both Viewer surfaces share one selector.
export function ArtworkLab({ name, header }: { name: string; header?: ReactNode }): ReactElement {
  const found = name ? findArtwork(name) : null;
  return (
    <>
      <section className="al-lab-main" aria-label="Artwork preview">
        {!found ? (
          <p className="al-lab-empty">No artwork selected — pick a card in the Artwork catalog.</p>
        ) : (
          <div className="al-lab-stages">
            <figure className="al-stage">
              <span className="al-checker al-artwork-stage"><img src={found.item.url} alt={found.item.label} className="al-artwork-lg" /></span>
              <figcaption>{found.item.label}</figcaption>
            </figure>
          </div>
        )}
      </section>
      <aside className="tileset-view-controls" aria-label="Artwork controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            {found ? (
              <dl className="al-meta">
                <div><dt>Group</dt><dd>{found.group.label}</dd></div>
                <div><dt>Size</dt><dd>{found.item.w && found.item.h ? `${found.item.w}×${found.item.h}` : '—'}</dd></div>
                <div><dt>Path</dt><dd>{found.item.url}</dd></div>
              </dl>
            ) : (
              <p className="tileset-catalog-note">No artwork selected — pick a card in the Artwork catalog.</p>
            )}
          </div>
        </section>
      </aside>
    </>
  );
}
