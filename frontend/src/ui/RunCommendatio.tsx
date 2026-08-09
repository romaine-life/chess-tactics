import { useState, type ReactElement, type ReactNode } from 'react';
import {
  RUN_STARTER_CARD_BY_ID,
  formatGold,
  runCardDefinition,
  takeCommendatioKing,
  type RunDocument,
  type RunStarterCardId,
} from '../run/model';
import { RunCard } from './RunCard';
import { RunCardRow } from './RunCardRow';
import { RunGoldAmount } from './RunResources';
import { liveMediaForSlot } from '@chess-tactics/board-render';
import { RunSceneViewport } from './RunWorkspace';
import { workspaceBackgroundArtwork } from './workspaceBackgrounds';

/**
 * Commendatio: the ceremony of entering a lord's service, and the first screen of a Run.
 *
 * It is NOT Bona Vacantia. That is the relic phase a Conflict opens with, later and repeatedly;
 * this happens once, before anything else, and its outcome is the Run's whole starting position.
 * The two shared a state briefly and the conflation read immediately as a bug.
 *
 * Three Kings of the fifteen, shuffled by the Run's own seed. Taking one is what gives the Run its
 * army, its single held card and its opening gold — so a Run genuinely cannot exist until this
 * screen has been answered.
 */
export function RunCommendatio({
  run,
  replace,
}: {
  run: RunDocument;
  replace: (next: RunDocument) => void;
}): ReactElement {
  const [taken, setTaken] = useState<string | null>(null);
  const offers = (run.commendatio?.kingOffers ?? []).filter((id) => Boolean(runCardDefinition(id)));

  return (
    <RunSceneViewport
      scene={{
        view: 'bona-mat',
        className: 'run-commendatio-workspace',
        contentClassName: 'run-commendatio-content',
        testId: 'run-commendatio',
        ariaLabel: 'Choose the King you serve',
        backgroundArtwork: workspaceBackgroundArtwork('run-commendatio'),
      }}
    >
      <div className="run-commendatio">
        <h2 className="run-commendatio-question">Who do you serve?</h2>
        <RunCardRow count={offers.length} testId="run-commendatio-king-offers">
          {offers.map((kingId, index) => (
            <CommendatioSeat key={kingId} kingId={kingId}>
              <RunCard
                card={runCardDefinition(kingId)!}
                mode="grant"
                layoutId={kingId}
                seatIndex={index}
                disabled={Boolean(taken)}
                flying={taken === kingId}
                onSelect={() => {
                  if (taken) return;
                  setTaken(kingId);
                  replace(takeCommendatioKing(run, kingId));
                }}
              />
            </CommendatioSeat>
          ))}
        </RunCardRow>
      </div>
    </RunSceneViewport>
  );
}

/**
 * A King's seat, with the gold it hands over ABOVE the card.
 *
 * Not in the card's cost corner: that corner reads as a PRICE on every other card in the game and
 * this is money received. It is also paid once, here, for taking a thin King, and never applies
 * again — so it is a property of this screen rather than of the card. The line keeps its seat
 * whether or not there is gold, so three cards sit at one height.
 */
/**
 * The gold-gain mark. It is the original directional mark drawn for unit disposal, whose own slot
 * was retired with that feature; retirement is terminal, so the same archived bytes were installed
 * into a slot of their own rather than the retired one being revived. Decorative: an absent slot
 * falls back to the plain gold resource icon.
 */
function goldGainedMarkUrl(): string | null {
  try {
    return liveMediaForSlot('ui/run/resources/gold-gained.png').media?.immutableUrl ?? null;
  } catch {
    return null;
  }
}

function CommendatioSeat({ kingId, children }: { kingId: string; children: ReactNode }): ReactElement {
  const king = RUN_STARTER_CARD_BY_ID[kingId as RunStarterCardId];
  const bonus = king?.goldBonusTenths ?? 0;
  const gainMark = goldGainedMarkUrl();
  return (
    <div className="run-card-grant-seat">
      {bonus > 0 ? (
        <span
          className="run-card-grant-bonus"
          data-testid={`run-commendatio-bonus-${kingId}`}
          title={`You gain ${formatGold(bonus)} gold on pickup`}
          aria-label={`You gain ${formatGold(bonus)} gold on pickup`}
        >
          <RunGoldAmount valueTenths={bonus} iconSrc={gainMark ?? undefined} />
        </span>
      ) : null}
      {children}
    </div>
  );
}
