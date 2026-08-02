import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  fetchAdminLiveMediaCatalog,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';

/**
 * Candidate backdrops for the full-overlay workspace screens, read straight from the
 * live-media catalog. Shows ONE plate as large as the pane allows — these are judged on
 * how the art reads, which a wall of thumbnails cannot answer. Screen and generator are
 * picked in Controls, so switching sources is a single click on identical framing.
 *
 * Plates are authored at 640x360 and ship at 4x (2560x1440) with nearest-neighbour
 * scaling. Review only: this never accepts, installs, or substitutes artwork.
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

export function useScreenArtCatalog(): {
  groups: ScreenArtGroup[];
  loading: boolean;
  error: string;
} {
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
  return { groups, loading: !catalog && !error, error };
}

export function ScreenArtReviewStudio({
  groups,
  loading,
  error,
  screen,
  generator,
}: {
  groups: ScreenArtGroup[];
  loading: boolean;
  error: string;
  screen: string;
  generator: string;
}): ReactElement {
  if (error) return <p role="alert">{error}</p>;
  if (loading) return <p role="status">Loading screen-art candidates…</p>;
  if (!groups.length) return <p role="status">No screen-art candidates uploaded.</p>;

  const group = groups.find((entry) => entry.screen === screen) ?? groups[0];
  const candidate = group.candidates.find((entry) => entry.generator === generator)
    ?? group.candidates[0];
  if (!candidate) return <p role="status">No candidate for this screen.</p>;

  const { version } = candidate;
  return (
    <div className="screen-art-stage" data-testid="screen-art-review" data-screen={group.screen} data-generator={candidate.generator}>
      <img
        key={version.id}
        src={version.media!.url}
        alt={`${group.label} backdrop by ${GENERATOR_LABELS[candidate.generator] ?? candidate.generator}`}
        data-version-id={version.id}
        data-slot={version.slot ?? undefined}
        draggable={false}
      />
      <figcaption>
        <strong>{group.label}</strong>
        <span>{GENERATOR_LABELS[candidate.generator] ?? candidate.generator}</span>
        <small>
          {version.media!.width ?? '?'}×{version.media!.height ?? '?'} native · ships at 4× ·{' '}
          {version.status === 'candidate' ? 'candidate · not installed' : version.status}
        </small>
      </figcaption>
    </div>
  );
}
