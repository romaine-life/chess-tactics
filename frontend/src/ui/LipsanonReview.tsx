import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  fetchAdminLiveMediaCatalog,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaSlot,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { LIPSANON_BY_ID, type LipsanonId } from '../run/model';
import { defaultBackgroundSet } from '../art/backgroundSets';
import { OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { useSceneParticipant } from './shell/SceneBoundary';

const RUN_LIPSANON_SLOT = /^ui\/run\/lipsana\/([a-z][a-z0-9-]*)\.png$/;

export interface LipsanonReviewCandidate {
  lipsanonId: LipsanonId;
  version: AdminLiveMediaVersion;
  slot: AdminLiveMediaSlot;
}

export function partitionLipsanonReviewCandidates(entries: readonly LipsanonReviewCandidate[]): {
  newCandidates: LipsanonReviewCandidate[];
  installedReferences: LipsanonReviewCandidate[];
} {
  return {
    newCandidates: entries.filter(({ version }) => version.status === 'candidate'),
    installedReferences: entries.filter(({ version }) => version.status !== 'candidate'),
  };
}

export function runLipsanonReviewCandidates(catalog: AdminLiveMediaCatalog): LipsanonReviewCandidate[] {
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

function LipsanonReviewGrid({
  entries,
  testId,
}: {
  entries: readonly LipsanonReviewCandidate[];
  testId: string;
}): ReactElement {
  return (
    <div className="run-lipsanon-review-grid" data-testid={testId}>
      {entries.map(({ lipsanonId, version }) => (
        <figure key={version.id} data-version-id={version.id} data-slot={version.slot ?? undefined}>
          <img
            src={version.media!.url}
            width="64"
            height="64"
            alt=""
            draggable={false}
          />
          <figcaption>
            <strong>{LIPSANON_BY_ID[lipsanonId].name}</strong>
            <small>
              64×64 · {version.status === 'candidate'
                ? 'new candidate · not installed'
                : `installed reference · ${version.status} r${version.rowRevision}`}
            </small>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function LipsanonReview(): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);
  const entries = useMemo(() => catalog ? runLipsanonReviewCandidates(catalog) : [], [catalog]);
  const { newCandidates, installedReferences } = useMemo(
    () => partitionLipsanonReviewCandidates(entries),
    [entries],
  );
  const sceneError = useMemo(() => error ? new Error(error) : null, [error]);
  useSceneParticipant('studio', sceneError ? 'error' : catalog ? 'painted' : 'loading', sceneError);

  return (
    <main
      className="run-lipsanon-review-screen skirmish-screen"
      style={{ ['--skirmish-world-bg' as string]: `url("${defaultBackgroundSet().world}")` }}
    >
      <OuterChromeBox chromeConsumer="run-lipsanon-review" titled className="run-lipsanon-review-panel">
        <OuterChromeHeader title="Run Lipsanon Art Review" />
        <p>Exact candidate or installed bytes at 64×64. This surface does not install or substitute artwork.</p>
        {error ? <p role="alert">{error}</p> : null}
        {!catalog && !error ? <p role="status">Loading candidates…</p> : null}
        {catalog ? (
          <>
            <p><strong>{newCandidates.length} newly generated candidate icons</strong> · not installed</p>
            {newCandidates.length ? (
              <LipsanonReviewGrid entries={newCandidates} testId="run-lipsanon-candidate-grid" />
            ) : <p>No new lipsanon art candidates.</p>}
            {installedReferences.length ? (
              <details className="run-lipsanon-reference-art" open={newCandidates.length === 0}>
                <summary>Installed reference art · {installedReferences.length} existing icons</summary>
                <p>Already accepted and installed; available here only for family comparison.</p>
                <LipsanonReviewGrid entries={installedReferences} testId="run-lipsanon-installed-grid" />
              </details>
            ) : null}
          </>
        ) : null}
      </OuterChromeBox>
    </main>
  );
}
