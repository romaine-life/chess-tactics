import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  type AdminLiveMediaCatalog,
  type AdminLiveMediaSlot,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { useAdminLiveMediaCatalog } from './studio/useAdminLiveMediaCatalog';
import { LIPSANON_BY_ID, type LipsanonId } from '../run/model';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

/**
 * Lipsanon art candidates, as a Studio CATEGORY.
 *
 * Review only: this surface shows exact candidate or installed bytes at 64×64 and does not
 * install or substitute artwork. It was its own screen at `/studio?lipsanonReview=1` until
 * ADR-0588, which is why it had no category rail and no way in but a hand-passed URL.
 */
const RUN_LIPSANON_SLOT = /^ui\/run\/lipsana\/([a-z][a-z0-9-]*)\.png$/;

export interface LipsanonArtCandidate {
  lipsanonId: LipsanonId;
  version: AdminLiveMediaVersion;
  slot: AdminLiveMediaSlot;
}

export function partitionLipsanonArtCandidates(entries: readonly LipsanonArtCandidate[]): {
  newCandidates: LipsanonArtCandidate[];
  installedReferences: LipsanonArtCandidate[];
} {
  return {
    newCandidates: entries.filter(({ version }) => version.status === 'candidate'),
    installedReferences: entries.filter(({ version }) => version.status !== 'candidate'),
  };
}

export function runLipsanonArtCandidates(catalog: AdminLiveMediaCatalog): LipsanonArtCandidate[] {
  const slots = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
  return catalog.versions.flatMap((version) => {
    const match = RUN_LIPSANON_SLOT.exec(version.slot ?? '');
    const lipsanonId = match?.[1] as LipsanonId | undefined;
    const slot = version.slot ? slots.get(version.slot) : undefined;
    const reviewable = version.status === 'candidate' || slot?.activeVersionId === version.id;
    if (!lipsanonId || !LIPSANON_BY_ID[lipsanonId] || !slot || !reviewable || !version.media) return [];
    return [{ lipsanonId, version, slot }];
  }).sort((left, right) => (
    LIPSANON_BY_ID[left.lipsanonId].name.localeCompare(LIPSANON_BY_ID[right.lipsanonId].name)
  ));
}

function LipsanonArtGrid({
  entries,
  testId,
  selectedId,
  onSelect,
}: {
  entries: readonly LipsanonArtCandidate[];
  testId: string;
  selectedId: string;
  onSelect: (id: string) => void;
}): ReactElement {
  return (
    <div className="tileset-studio-grid" data-testid={testId}>
      {entries.map(({ lipsanonId, version }) => (
        <StudioCatalogCard
          key={version.id}
          title={LIPSANON_BY_ID[lipsanonId].name}
          badge={`${version.media!.width}×${version.media!.height}`}
          textExtra={(
            <small>
              {version.status === 'candidate'
                ? 'new candidate · not installed'
                : `installed reference · ${version.status} r${version.rowRevision}`}
            </small>
          )}
          image={version.media!.url}
          selected={selectedId === version.id}
          onSelect={() => onSelect(version.id)}
        />
      ))}
    </div>
  );
}

export interface LipsanonArtState {
  catalog: AdminLiveMediaCatalog | null;
  selectedId: string;
  select: (id: string) => void;
  error: string;
}

export function useLipsanonArt(): LipsanonArtState {
  const { catalog, error } = useAdminLiveMediaCatalog();
  const [selectedId, setSelectedId] = useState('');
  return { catalog, selectedId, select: setSelectedId, error };
}

export function LipsanonArtCatalog({ state }: { state: LipsanonArtState }): ReactElement {
  const { catalog, selectedId, select, error } = state;
  const entries = useMemo(() => catalog ? runLipsanonArtCandidates(catalog) : [], [catalog]);
  const { newCandidates, installedReferences } = useMemo(
    () => partitionLipsanonArtCandidates(entries),
    [entries],
  );
  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;
  return (
    <div data-testid="lipsanon-art-catalog">
      <p className="tileset-catalog-note">
        <strong>{newCandidates.length} newly generated candidate icons</strong> · not installed
      </p>
      {newCandidates.length ? (
        <LipsanonArtGrid
          entries={newCandidates}
          testId="run-lipsanon-candidate-grid"
          selectedId={selectedId}
          onSelect={select}
        />
      ) : <p>No new lipsanon art candidates.</p>}
      {installedReferences.length ? (
        <details className="run-lipsanon-reference-art" open={newCandidates.length === 0}>
          <summary>Installed reference art · {installedReferences.length} existing icons</summary>
          <p className="tileset-catalog-note">Already accepted and installed; available here only for family comparison.</p>
          <LipsanonArtGrid
            entries={installedReferences}
            testId="run-lipsanon-installed-grid"
            selectedId={selectedId}
            onSelect={select}
          />
        </details>
      ) : null}
    </div>
  );
}

export function LipsanonArtControls(): ReactElement {
  return (
    <p className="tileset-catalog-note">
      Exact candidate or installed bytes at 64×64. This category does not install or substitute
      artwork — it exists so a new lipsanon icon can be read against the family it joins.
    </p>
  );
}
