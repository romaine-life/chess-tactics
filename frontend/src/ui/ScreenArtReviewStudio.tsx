import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  fetchAdminLiveMediaCatalog,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';

/**
 * Candidate backdrops for the full-overlay workspace screens, read straight from the
 * live-media catalog. Every plate is authored at 640x360 and displayed at exactly 4x
 * (2560x1440) with nearest-neighbour scaling, so this surface previews them at integer
 * fractions of that to keep the texels honest.
 *
 * Review only: this never accepts, installs, or substitutes artwork.
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
  screen: string;
  generator: string;
  version: AdminLiveMediaVersion;
}

export interface ScreenArtGroup {
  screen: string;
  label: string;
  candidates: ScreenArtCandidate[];
}

/** Newest candidate per (screen, generator), grouped by screen. */
export function screenArtGroups(catalog: AdminLiveMediaCatalog): ScreenArtGroup[] {
  const newest = new Map<string, ScreenArtCandidate>();
  for (const version of catalog.versions) {
    const match = SCREEN_ART_SLOT.exec(version.slot ?? '');
    if (!match || !version.media) continue;
    const [, screen, generator] = match;
    const key = `${screen}/${generator}`;
    const prior = newest.get(key);
    if (!prior || version.rowRevision > prior.version.rowRevision) {
      newest.set(key, { screen, generator, version });
    }
  }
  const byScreen = new Map<string, ScreenArtCandidate[]>();
  for (const candidate of newest.values()) {
    byScreen.set(candidate.screen, [...(byScreen.get(candidate.screen) ?? []), candidate]);
  }
  return [...byScreen.entries()]
    .map(([screen, candidates]) => ({
      screen,
      label: SCREEN_LABELS[screen] ?? screen,
      candidates: candidates.sort((left, right) => left.generator.localeCompare(right.generator)),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function ScreenArtReviewStudio({
  generator,
  width,
}: {
  generator: string;
  width: number;
}): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);

  const groups = useMemo(() => catalog ? screenArtGroups(catalog) : [], [catalog]);

  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading screen-art candidates…</p>;
  if (!groups.length) return <p role="status">No screen-art candidates uploaded.</p>;

  return (
    // `tileset-studio-grid` is what the catalog shell scrolls
    // (.tileset-studio-shell.is-catalog > .tileset-studio-grid); without it this pane is
    // clipped at the fold with no scrollbar. Same opt-in the Pages/Asset libraries use.
    <div className="tileset-studio-grid screen-art-review" data-testid="screen-art-review">
      {groups.map((group) => {
        const shown = group.candidates.filter((c) => generator === 'all' || c.generator === generator);
        if (!shown.length) return null;
        return (
          <section className="screen-art-row" key={group.screen}>
            <h3>{group.label}</h3>
            <div className="screen-art-plates">
              {shown.map(({ generator: source, version }) => (
                <figure key={version.id} data-version-id={version.id} data-slot={version.slot ?? undefined}>
                  <img
                    src={version.media!.url}
                    alt={`${group.label} backdrop by ${GENERATOR_LABELS[source] ?? source}`}
                    style={{ width: `${width}px` }}
                    draggable={false}
                  />
                  <figcaption>
                    <strong>{GENERATOR_LABELS[source] ?? source}</strong>
                    <small>
                      {version.media!.width ?? '?'}×{version.media!.height ?? '?'} native · shows at 4× ·{' '}
                      {version.status === 'candidate' ? 'candidate · not installed' : version.status}
                    </small>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
