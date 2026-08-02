import type { CSSProperties, ReactElement } from 'react';
import { defaultBackgroundSet } from '../art/backgroundSets';
import type { RunCoreCard } from '../run/model';
import { RunCard } from './RunCard';
import {
  RUN_SHOP_WRAP_CANDIDATES,
  runShopWrapInsets,
  runShopWrapSeatPadding,
  runShopWrapSeatTrack,
  type RunShopWrapCandidate,
} from './runShopWrapCandidates';
import { OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { useSceneParticipant } from './shell/SceneBoundary';

const REVIEW_CARDS: readonly RunCoreCard[] = [
  { id: 'review-two-pawns-bishop', pieces: ['pawn', 'pawn', 'bishop'], value: 5 },
  { id: 'review-pawn-rook', pieces: ['pawn', 'rook'], value: 6 },
  { id: 'review-four-pawns-bishop', pieces: ['pawn', 'pawn', 'pawn', 'pawn', 'bishop'], value: 7 },
];

function WrapCandidateRow({ candidate }: { candidate: RunShopWrapCandidate }): ReactElement {
  return (
    <section className="run-wrap-candidate" aria-label={candidate.label}>
      <h3>
        {candidate.label}
        <small> — {candidate.engine} · {candidate.kind === 'seat' ? 'wraps each card' : 'wraps the card row'}</small>
      </h3>
      {candidate.kind === 'seat' ? (
        <div
          className="run-card-grid run-wrap-grid"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(0, ${runShopWrapSeatTrack(candidate)}))` }}
        >
          {REVIEW_CARDS.map((card) => (
            <span
              className="run-wrap-seat"
              key={`${candidate.id}:${card.id}`}
              style={runShopWrapSeatPadding(candidate) as CSSProperties}
            >
              <img className="run-wrap-art run-wrap-seat-art" src={candidate.src} alt="" draggable={false} />
              <RunCard card={card} mode="shop" onSelect={() => undefined} />
            </span>
          ))}
        </div>
      ) : (
        <div className="run-wrap-band-shell" style={runShopWrapInsets(candidate) as CSSProperties}>
          <img className="run-wrap-art" src={candidate.src} alt="" draggable={false} />
          <div className="run-card-grid">
            {REVIEW_CARDS.map((card) => (
              <RunCard key={`${candidate.id}:${card.id}`} card={card} mode="shop" onSelect={() => undefined} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

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
          {REVIEW_CARDS.map((card) => (
            <RunCard
              key={card.id}
              card={card}
              mode="shop"
              onSelect={() => undefined}
            />
          ))}
        </div>
        {RUN_SHOP_WRAP_CANDIDATES.map((candidate) => (
          <WrapCandidateRow key={candidate.id} candidate={candidate} />
        ))}
      </OuterChromeBox>
    </main>
  );
}
