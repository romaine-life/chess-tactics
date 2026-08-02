import { useEffect, useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
  fetchAdminLiveMediaCatalog,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

/**
 * Candidate backdrops for the full-screen workspace pages, read straight from the
 * live-media catalog. Read-only art: browsed as a Catalog grid and inspected one-big in
 * the shared Viewer, per docs/studio-control-architecture.md — the Catalog's main pane is
 * the grid, and "one item big + Details readout" is the Viewer's job, never the catalog's.
 *
 * Plates are authored at 640x360 and ship at 4x (2560x1440) with nearest-neighbour
 * scaling. This surface never accepts, installs, or substitutes artwork.
 */
const SCREEN_ART_SLOT = /^review\/run-screen-art\/([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\.png$/;

const SCREEN_LABELS: Record<string, string> = {
  deployment: 'Deployment',
  sell: 'Sell Units',
  army: 'Army',
  relics: 'Relics',
  victory: 'Victory — War won',
  events: 'Level Editor — Events',
};

const GENERATOR_LABELS: Record<string, string> = {
  codex: 'Codex (gpt-image)',
  pixellab: 'PixelLab (pro)',
};

export interface ScreenArtCandidate {
  id: string;
  screen: string;
  screenLabel: string;
  generator: string;
  generatorLabel: string;
  version: AdminLiveMediaVersion;
}

/** Newest candidate per (screen, generator), ordered by screen then generator. */
export function screenArtCandidates(catalog: AdminLiveMediaCatalog): ScreenArtCandidate[] {
  const newest = new Map<string, ScreenArtCandidate>();
  for (const version of catalog.versions) {
    const match = SCREEN_ART_SLOT.exec(version.slot ?? '');
    if (!match || !version.media) continue;
    const [, screen, generator] = match;
    const id = `${screen}--${generator}`;
    const prior = newest.get(id);
    if (!prior || version.rowRevision > prior.version.rowRevision) {
      newest.set(id, {
        id,
        screen,
        screenLabel: SCREEN_LABELS[screen] ?? screen,
        generator,
        generatorLabel: GENERATOR_LABELS[generator] ?? generator,
        version,
      });
    }
  }
  return [...newest.values()].sort((left, right) => (
    left.screenLabel.localeCompare(right.screenLabel) || left.generator.localeCompare(right.generator)
  ));
}

export function useScreenArtCatalog(): { items: ScreenArtCandidate[]; loading: boolean; error: string } {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);
  const items = useMemo(() => catalog ? screenArtCandidates(catalog) : [], [catalog]);
  return { items, loading: !catalog && !error, error };
}

export function findScreenArt(items: readonly ScreenArtCandidate[], id: string): ScreenArtCandidate | null {
  return items.find((item) => item.id === id) ?? null;
}

/** Catalog main pane: the grid. Selection lives here, not in the Controls rail. */
export function ScreenArtCatalog({
  items,
  loading,
  error,
  search,
  zoom,
  selected,
  onSelect,
  onView,
}: {
  items: readonly ScreenArtCandidate[];
  loading: boolean;
  error: string;
  search: string;
  zoom: number;
  selected: string;
  onSelect: (id: string) => void;
  onView: (id: string) => void;
}): ReactElement {
  const query = search.trim().toLowerCase();
  const visible = items.filter((item) => !query
    || `${item.screenLabel} ${item.generatorLabel}`.toLowerCase().includes(query));

  return (
    <section className="tileset-studio-main is-headless">
      <section className="tileset-studio-tab-panel">
        <div className="tileset-asset-sections" style={{ '--tile-zoom': zoom } as CSSProperties}>
          {error ? <p className="tileset-catalog-note" role="alert">{error}</p> : null}
          {loading ? <p className="tileset-catalog-note" role="status">Loading screen-art candidates…</p> : null}
          {!loading && !error && !visible.length
            ? <p className="tileset-catalog-note">No screen-art candidates match the current search.</p>
            : null}
          {visible.length ? (
            <div className="tileset-studio-grid" data-testid="screen-art-grid">
              {visible.map((item) => (
                <StudioCatalogCard
                  key={item.id}
                  title={item.screenLabel}
                  badge={item.generatorLabel}
                  image={item.version.media!.url}
                  imageClassName="screen-art-card-image"
                  selected={selected === item.id}
                  onSelect={() => onSelect(item.id)}
                  onInspect={() => onView(item.id)}
                  inspectLabel={`View ${item.screenLabel} — ${item.generatorLabel}`}
                  metaExtra={<span className="asset-prov is-original">
                    {item.version.status === 'candidate' ? 'candidate' : item.version.status}
                  </span>}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </section>
  );
}

/** Viewer stage: one plate as large as the pane allows, plus the Details readout. */
export function ScreenArtViewer({
  items,
  id,
  header,
}: {
  items: readonly ScreenArtCandidate[];
  id: string;
  header?: ReactNode;
}): ReactElement {
  const found = id ? findScreenArt(items, id) : null;
  const empty = 'No candidate selected — pick a card in the Screen Art catalog.';
  return (
    <>
      <section className="al-lab-main" aria-label="Screen art preview">
        {!found ? <p className="al-lab-empty">{empty}</p> : (
          <div className="al-lab-stages">
            <figure className="al-stage screen-art-stage" data-testid="screen-art-stage" data-screen={found.screen} data-generator={found.generator}>
              <img
                src={found.version.media!.url}
                alt={`${found.screenLabel} backdrop by ${found.generatorLabel}`}
                data-version-id={found.version.id}
              />
              <figcaption>{found.screenLabel} — {found.generatorLabel}</figcaption>
            </figure>
          </div>
        )}
      </section>
      <aside className="tileset-view-controls" aria-label="Screen art controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            {found ? (
              <dl className="al-meta">
                <div><dt>Screen</dt><dd>{found.screenLabel}</dd></div>
                <div><dt>Generator</dt><dd>{found.generatorLabel}</dd></div>
                <div><dt>Native</dt><dd>{found.version.media!.width ?? '?'}×{found.version.media!.height ?? '?'}</dd></div>
                <div><dt>Ships at</dt><dd>4× (2560×1440)</dd></div>
                <div><dt>Status</dt><dd>{found.version.status === 'candidate' ? 'candidate · not installed' : found.version.status}</dd></div>
                <div><dt>Slot</dt><dd>{found.version.slot}</dd></div>
                <div><dt>Revision</dt><dd>{found.version.rowRevision}</dd></div>
                <div><dt>SHA-256</dt><dd>{found.version.media!.sha256}</dd></div>
              </dl>
            ) : <p className="tileset-catalog-note">{empty}</p>}
          </div>
        </section>
      </aside>
    </>
  );
}
