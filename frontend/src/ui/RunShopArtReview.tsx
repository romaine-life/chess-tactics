import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { defaultBackgroundSet } from '../art/backgroundSets';
import {
  fetchAdminLiveMediaCatalog,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import type { PieceBundle } from '../run/model';
import { RunBundleCard } from './RunScreen';
import { OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { useSceneParticipant } from './shell/SceneBoundary';

const GOLD_SLOT = 'ui/run/resources/gold.png';
const SHA256 = /^[0-9a-f]{64}$/;
const REVIEW_BUNDLES: readonly PieceBundle[] = [
  { id: 'review-two-pawns-bishop', pieces: ['pawn', 'pawn', 'bishop'], value: 5 },
  { id: 'review-pawn-rook', pieces: ['pawn', 'rook'], value: 6 },
  { id: 'review-four-pawns-bishop', pieces: ['pawn', 'pawn', 'pawn', 'pawn', 'bishop'], value: 7 },
];

function selectedGoldVersion(catalog: AdminLiveMediaCatalog): AdminLiveMediaVersion | null {
  const sha256 = new URLSearchParams(window.location.search).get('goldCandidate')?.trim().toLowerCase();
  if (!sha256 || !SHA256.test(sha256)) return null;
  return catalog.versions.find((version) => (
    version.slot === GOLD_SLOT
    && version.media?.sha256 === sha256
    && (version.status === 'candidate' || version.status === 'accepted')
  )) ?? null;
}

export function RunShopArtReview(): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);
  const version = useMemo(() => catalog ? selectedGoldVersion(catalog) : null, [catalog]);
  const sceneError = useMemo(() => error ? new Error(error) : null, [error]);
  useSceneParticipant('studio', sceneError ? 'error' : catalog ? 'painted' : 'loading', sceneError);

  return (
    <main
      className="run-relic-review-screen skirmish-screen"
      style={{ ['--skirmish-world-bg' as string]: `url("${defaultBackgroundSet().world}")` }}
    >
      <OuterChromeBox chromeConsumer="run-shop-art-review" titled className="run-relic-review-panel">
        <OuterChromeHeader title="Run Shop Art Review" />
        <p>Exact live candidate pixels mounted in the real piece-bundle card assembly.</p>
        {error ? <p role="alert">{error}</p> : null}
        {!catalog && !error ? <p role="status">Loading candidate…</p> : null}
        {catalog && !version ? <p role="alert">The requested gold candidate is unavailable.</p> : null}
        {version ? (
          <>
            <p data-version-id={version.id} data-slot={version.slot ?? undefined}>
              Native {version.media!.width}×{version.media!.height} · {version.status} r{version.rowRevision}
            </p>
            <div className="run-card-grid" aria-label="Gold candidate bundle-card examples">
              {REVIEW_BUNDLES.map((bundle) => (
                <RunBundleCard
                  key={bundle.id}
                  bundle={bundle}
                  mode="shop"
                  onSelect={() => undefined}
                />
              ))}
            </div>
          </>
        ) : null}
      </OuterChromeBox>
    </main>
  );
}
