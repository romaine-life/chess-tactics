import type { ReactElement } from 'react';
import { defaultBackgroundSet } from '../art/backgroundSets';
import type { PieceBundle } from '../run/model';
import { RunBundleCard } from './RunBundleCard';
import { OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { useSceneParticipant } from './shell/SceneBoundary';

const REVIEW_BUNDLES: readonly PieceBundle[] = [
  { id: 'review-two-pawns-bishop', pieces: ['pawn', 'pawn', 'bishop'], value: 5 },
  { id: 'review-pawn-rook', pieces: ['pawn', 'rook'], value: 6 },
  { id: 'review-four-pawns-bishop', pieces: ['pawn', 'pawn', 'pawn', 'pawn', 'bishop'], value: 7 },
];

export function RunShopArtReview(): ReactElement {
  useSceneParticipant('studio', 'painted');

  return (
    <main
      className="run-relic-review-screen skirmish-screen"
      style={{ ['--skirmish-world-bg' as string]: `url("${defaultBackgroundSet().world}")` }}
    >
      <OuterChromeBox chromeConsumer="run-shop-art-review" titled className="run-relic-review-panel">
        <OuterChromeHeader title="Run Card Review" />
        <p>Accepted frame and illustration pixels mounted in the shared live card face.</p>
        <div className="run-card-grid" aria-label="Trading-card examples">
          {REVIEW_BUNDLES.map((bundle) => (
            <RunBundleCard
              key={bundle.id}
              bundle={bundle}
              mode="shop"
              onSelect={() => undefined}
            />
          ))}
        </div>
      </OuterChromeBox>
    </main>
  );
}
