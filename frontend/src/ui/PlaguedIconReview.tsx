import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  fetchAdminLiveMediaCatalog,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { defaultBackgroundSet } from '../art/backgroundSets';
import { CACOCHYMIC_DISPLAY_NAME } from '../run/model';
import { InnerChromeBox, OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { useSceneParticipant } from './shell/SceneBoundary';

const PLAGUED_ICON_SLOT = 'ui/kit/icons/game/plagued.png';
const PESTIFEROUS_ICON_SLOT = 'ui/kit/icons/card-properties/pestiferous.png';
const PLAGUED_ICON_OBJECT_ID = '840ac87b-4e82-402f-9161-c8b3ce705aa4';

function candidateIndex(version: AdminLiveMediaVersion): number {
  const value = Number(version.metadata.candidateIndex);
  return Number.isSafeInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

export function plaguedIconReviewCandidates(catalog: AdminLiveMediaCatalog): AdminLiveMediaVersion[] {
  return catalog.versions
    .filter((version) => version.slot === PLAGUED_ICON_SLOT
      && version.status === 'candidate'
      && version.provenance.objectId === PLAGUED_ICON_OBJECT_ID
      && Boolean(version.media))
    .sort((left, right) => candidateIndex(left) - candidateIndex(right));
}

function selectedIcon(
  catalog: AdminLiveMediaCatalog,
  slot: string,
  frameIndex: number,
): AdminLiveMediaVersion | null {
  const activeVersionId = catalog.slots.find((candidate) => candidate.slot === slot)?.activeVersionId;
  return catalog.versions.find((version) => version.slot === slot
    && version.provenance.objectId === PLAGUED_ICON_OBJECT_ID
    && Number(version.provenance.frameIndex) === frameIndex
    && Boolean(version.media)
    && (version.status === 'candidate' || version.id === activeVersionId)) ?? null;
}

function optionLabel(version: AdminLiveMediaVersion): string {
  const index = candidateIndex(version);
  return index === Number.MAX_SAFE_INTEGER ? 'Option' : `Option ${String(index).padStart(2, '0')}`;
}

function conceptLabel(version: AdminLiveMediaVersion): string {
  return typeof version.metadata.concept === 'string' ? version.metadata.concept : `${CACOCHYMIC_DISPLAY_NAME} condition`;
}

export function PlaguedIconReview(): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);
  const candidates = useMemo(() => catalog ? plaguedIconReviewCandidates(catalog) : [], [catalog]);
  const selectedPlagued = useMemo(() => catalog ? selectedIcon(catalog, PLAGUED_ICON_SLOT, 2) : null, [catalog]);
  const selectedPestiferous = useMemo(() => catalog ? selectedIcon(catalog, PESTIFEROUS_ICON_SLOT, 0) : null, [catalog]);
  const selectionsInstalled = selectedPlagued?.status === 'accepted' && selectedPestiferous?.status === 'accepted';
  const sceneError = useMemo(() => error ? new Error(error) : null, [error]);
  useSceneParticipant('studio', sceneError ? 'error' : catalog ? 'painted' : 'loading', sceneError);

  return (
    <main
      className="run-relic-review-screen plagued-icon-review-screen skirmish-screen"
      style={{ ['--skirmish-world-bg' as string]: `url("${defaultBackgroundSet().world}")` }}
    >
      <OuterChromeBox chromeConsumer="plagued-icon-review" titled className="run-relic-review-panel plagued-icon-review-panel">
        <OuterChromeHeader title={`${CACOCHYMIC_DISPLAY_NAME} Ability Icon Review`} />
        <p>
          {selectionsInstalled
            ? 'The owner-selected PixelLab icons are installed in their distinct Enchiridion seats.'
            : 'PixelLab candidates are shown in the real Enchiridion icon seat and at their native 64×64 pixel size. None are installed.'}
        </p>
        {error ? <p role="alert">{error}</p> : null}
        {!catalog && !error ? <p role="status">Loading candidates…</p> : null}
        {catalog ? (
          <>
            {selectedPlagued && selectedPestiferous ? (
              <section className="plagued-icon-review-section" aria-labelledby="selected-condition-icons-title">
                <h2 id="selected-condition-icons-title">Owner-selected semantic mapping</h2>
                <div className="plagued-icon-review-selection-grid" data-testid="selected-condition-icon-grid">
                  <InnerChromeBox className="enchiridion-ability-card" data-version-id={selectedPlagued.id}>
                    <img src={selectedPlagued.media!.url} width="34" height="34" alt="" draggable={false} />
                    <span>
                      <h3>{CACOCHYMIC_DISPLAY_NAME}</h3>
                      <small>Unit Ability · Option 03</small>
                    </span>
                  </InnerChromeBox>
                  <InnerChromeBox className="enchiridion-card-type-row plagued-icon-review-property-row" data-version-id={selectedPestiferous.id}>
                    <span className="enchiridion-card-type-row-identity">
                      <img className="enchiridion-card-type-row-icon" src={selectedPestiferous.media!.url} alt="" draggable={false} />
                      <span className="plagued-icon-review-property-copy">
                        <strong>Pestiferous</strong>
                        <small>Card Property · Option 01</small>
                      </span>
                    </span>
                  </InnerChromeBox>
                </div>
              </section>
            ) : null}
            {candidates.length ? <p><strong>{candidates.length} remaining private candidates</strong></p> : (
              <p><strong>No unselected candidates remain.</strong></p>
            )}
            {candidates.length ? (
              <>
                <section className="plagued-icon-review-section" aria-labelledby="plagued-ability-size-title">
                  <h2 id="plagued-ability-size-title">Enchiridion ability size</h2>
                  <div className="plagued-icon-review-ability-grid" data-testid="plagued-icon-ability-grid">
                    {candidates.map((version) => (
                      <InnerChromeBox
                        className="enchiridion-ability-card plagued-icon-review-ability-card"
                        data-version-id={version.id}
                        key={`ability-${version.id}`}
                      >
                        <img src={version.media!.url} width="34" height="34" alt="" draggable={false} />
                        <span>
                          <h3>{CACOCHYMIC_DISPLAY_NAME}</h3>
                          <small>{optionLabel(version)}</small>
                        </span>
                      </InnerChromeBox>
                    ))}
                  </div>
                </section>
                <section className="plagued-icon-review-section" aria-labelledby="plagued-native-title">
                  <h2 id="plagued-native-title">Native pixel work</h2>
                  <div className="run-relic-review-grid plagued-icon-review-native-grid" data-testid="plagued-icon-native-grid">
                    {candidates.map((version) => (
                      <figure data-version-id={version.id} key={`native-${version.id}`}>
                        <img src={version.media!.url} width="64" height="64" alt="" draggable={false} />
                        <figcaption>
                          <strong>{optionLabel(version)} · {conceptLabel(version)}</strong>
                          <small>native 64×64 · private candidate</small>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              </>
            ) : null}
          </>
        ) : null}
      </OuterChromeBox>
    </main>
  );
}
