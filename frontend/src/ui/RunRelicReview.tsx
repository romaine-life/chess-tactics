import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  fetchAdminLiveMediaCatalog,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaSlot,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { RUN_RELIC_BY_ID, type RunRelicId } from '../run/model';
import { defaultBackgroundSet } from '../art/backgroundSets';
import { OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { useSceneParticipant } from './shell/SceneBoundary';

const RUN_RELIC_SLOT = /^ui\/run\/relics\/([a-z][a-z0-9-]*)\.png$/;

export interface RunRelicReviewCandidate {
  relicId: RunRelicId;
  version: AdminLiveMediaVersion;
  slot: AdminLiveMediaSlot;
}

export function partitionRunRelicReviewCandidates(entries: readonly RunRelicReviewCandidate[]): {
  newCandidates: RunRelicReviewCandidate[];
  installedReferences: RunRelicReviewCandidate[];
} {
  return {
    newCandidates: entries.filter(({ version }) => version.status === 'candidate'),
    installedReferences: entries.filter(({ version }) => version.status !== 'candidate'),
  };
}

export function runRelicReviewCandidates(catalog: AdminLiveMediaCatalog): RunRelicReviewCandidate[] {
  const slots = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
  return catalog.versions.flatMap((version) => {
    const match = RUN_RELIC_SLOT.exec(version.slot ?? '');
    const relicId = match?.[1] as RunRelicId | undefined;
    const slot = version.slot ? slots.get(version.slot) : undefined;
    const reviewable = version.status === 'candidate' || slot?.activeVersionId === version.id;
    if (!relicId || !RUN_RELIC_BY_ID[relicId] || !slot || !reviewable || !version.media) return [];
    return [{ relicId, version, slot }];
  }).sort((left, right) => (
    RUN_RELIC_BY_ID[left.relicId].name.localeCompare(RUN_RELIC_BY_ID[right.relicId].name)
  ));
}

function RunRelicReviewGrid({
  entries,
  testId,
}: {
  entries: readonly RunRelicReviewCandidate[];
  testId: string;
}): ReactElement {
  return (
    <div className="run-relic-review-grid" data-testid={testId}>
      {entries.map(({ relicId, version }) => (
        <figure key={version.id} data-version-id={version.id} data-slot={version.slot ?? undefined}>
          <img
            src={version.media!.url}
            width="64"
            height="64"
            alt=""
            draggable={false}
          />
          <figcaption>
            <strong>{RUN_RELIC_BY_ID[relicId].name}</strong>
            <small>
              native 64×64 · {version.status === 'candidate'
                ? 'new candidate · not installed'
                : `installed reference · ${version.status} r${version.rowRevision}`}
            </small>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function RunRelicReview(): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);
  const entries = useMemo(() => catalog ? runRelicReviewCandidates(catalog) : [], [catalog]);
  const { newCandidates, installedReferences } = useMemo(
    () => partitionRunRelicReviewCandidates(entries),
    [entries],
  );
  const sceneError = useMemo(() => error ? new Error(error) : null, [error]);
  useSceneParticipant('studio', sceneError ? 'error' : catalog ? 'painted' : 'loading', sceneError);

  return (
    <main
      className="run-relic-review-screen skirmish-screen"
      style={{ ['--skirmish-world-bg' as string]: `url("${defaultBackgroundSet().world}")` }}
    >
      <OuterChromeBox chromeConsumer="run-relic-review" titled className="run-relic-review-panel">
        <OuterChromeHeader title="Run Relic Art Review" />
        <p>Exact candidate or installed bytes at native 64×64. This surface does not install or substitute artwork.</p>
        {error ? <p role="alert">{error}</p> : null}
        {!catalog && !error ? <p role="status">Loading candidates…</p> : null}
        {catalog ? (
          <>
            <p><strong>{newCandidates.length} newly generated candidate icons</strong> · not installed</p>
            {newCandidates.length ? (
              <RunRelicReviewGrid entries={newCandidates} testId="run-relic-candidate-grid" />
            ) : <p>No new relic art candidates.</p>}
            {installedReferences.length ? (
              <details className="run-relic-reference-art" open={newCandidates.length === 0}>
                <summary>Installed reference art · {installedReferences.length} existing icons</summary>
                <p>Already accepted and installed; available here only for family comparison.</p>
                <RunRelicReviewGrid entries={installedReferences} testId="run-relic-installed-grid" />
              </details>
            ) : null}
          </>
        ) : null}
      </OuterChromeBox>
    </main>
  );
}
