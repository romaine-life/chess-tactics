import { useState, type ReactElement } from 'react';
import {
  LIPSANON_BY_ID,
  RUN_CARD_BY_ID,
  takeVacantiaLipsanon,
  type LipsanonId,
  type RunDocument,
} from '../run/model';
import { LipsanonIcon } from './Lipsana';
import { RunCard } from './RunCard';
import { RunCardRow } from './RunCardRow';
import { RunSceneViewport } from './RunWorkspace';
import { Tooltip } from './shared/InfoTip';
import { installedLipsanonMatUrl, lipsanonFloatClock } from './runLipsanonMat';
import { lipsanonStripLandingPoint } from './runLipsanonFlight';
import type { LipsanonFlightPoint } from './runLipsanonFlightView';
import { workspaceBackgroundArtwork } from './workspaceBackgrounds';

/**
 * The Run's opening grant: three formation cards, one taken, on the same mat the later
 * Conflicts use for lipsana. Taking one opens Deployment for Battle 1 with a formation to
 * arrange beside His Grace, which is what makes the opening Battle teach placement at all.
 */
function RunVacantiaCardGrant({
  run,
  takeCard,
}: {
  run: RunDocument;
  takeCard: (coreId: string, source: HTMLButtonElement) => void;
}): ReactElement {
  const [taken, setTaken] = useState<string | null>(null);
  // The row is sized from how many cards it actually prints, so an offer whose core
  // has left the Chartulary shrinks the row rather than reserving a seat for nothing.
  const offers = (run.vacantia?.cardOffers ?? []).filter((coreId) => Boolean(RUN_CARD_BY_ID[coreId]));

  // The Sectio's own card row, not the lipsanon mat: the mat is sized for 64x64 relic
  // icons and collapses around a card face.
  return (
    <div className="run-vacantia-grant">
      {/*
        The first screen of a Run, and the only one whose cards cost nothing. Every card
        prints its value, and on the Sectio that same number IS its price, so an opening
        grant with no words on it reads as a shop the starting purse can barely afford.
        The line says what to do and that it is free before the badges can say otherwise.
      */}
      <p className="run-card-row-call">Take one. They&apos;ll join for free.</p>
      <RunCardRow count={offers.length} testId="run-vacantia-card-offers">
        {offers.map((coreId, index) => (
          <RunCard
            key={coreId}
            card={RUN_CARD_BY_ID[coreId]}
            mode="grant"
            layoutId={coreId}
            seatIndex={index}
            disabled={Boolean(taken)}
            flying={taken === coreId}
            // Local only so the untaken offers dim in the same frame as the press. The
            // admission itself, and the card's travel into the Chartulary, belong to the
            // Run phase: this take ends the phase, so the carry outlives this component.
            onSelect={(source) => {
              if (taken) return;
              setTaken(coreId);
              takeCard(coreId, source);
            }}
          />
        ))}
      </RunCardRow>
    </div>
  );
}

/** Mandatory three-way relic choice at the opening of a Conflict. */
export function RunBonaVacantia({
  run,
  replace,
  launchLipsanon,
  takeCard,
}: {
  run: RunDocument;
  replace: (next: RunDocument) => void;
  launchLipsanon: (
    lipsanonId: LipsanonId,
    icon: Element | null,
    to: LipsanonFlightPoint | null,
  ) => boolean;
  takeCard: (coreId: string, source: HTMLButtonElement) => void;
}): ReactElement | null {
  const vacantia = run.vacantia;
  const [departed, setDeparted] = useState<LipsanonId | null>(null);
  const mat = installedLipsanonMatUrl();
  if (!vacantia) return null;
  const heldCount = run.lipsana.filter((id) => Boolean(LIPSANON_BY_ID[id])).length;

  function take(lipsanonId: LipsanonId, icon: Element | null): void {
    if (departed) return;
    setDeparted(lipsanonId);
    const destination = lipsanonStripLandingPoint(heldCount);
    if (!launchLipsanon(lipsanonId, icon, destination)) {
      replace(takeVacantiaLipsanon(run, lipsanonId));
    }
  }

  const grant = vacantia.kind === 'opening';

  return (
    <RunSceneViewport
      scene={{
        view: 'bona-mat',
        className: 'run-vacantia-workspace',
        contentClassName: 'run-vacantia-content',
        testId: 'run-bona-vacantia',
        ariaLabel: grant ? 'Opening card offers' : 'Lipsanon offers',
        backgroundArtwork: workspaceBackgroundArtwork('run-bona-vacantia'),
      }}
    >
      {grant ? <RunVacantiaCardGrant run={run} takeCard={takeCard} /> : (
      <div className="lipsanon-mat-stage" data-cards="on" data-testid="run-vacantia-mat">
        <div className="lipsanon-mat-layer">
          {mat ? <img className="lipsanon-mat-art" src={mat} alt="" draggable={false} /> : null}
          <div className="lipsanon-mat-cards" data-testid="run-vacantia-offers" data-taking={departed ? '' : undefined}>
            {vacantia.offers.map((lipsanonId, index) => {
              const lipsanon = LIPSANON_BY_ID[lipsanonId];
              const flying = departed === lipsanonId;
              return (
                <Tooltip
                  className={`lipsanon-mat-offer${flying ? ' is-flying' : ''}`}
                  key={lipsanonId}
                  label={`${lipsanon.name}. ${lipsanon.description}`}
                  popupMaxInlineSize={288}
                  title={lipsanon.name}
                  suppressed={Boolean(departed)}
                  style={lipsanonFloatClock(index)}
                  trigger={(
                    <button
                      type="button"
                      className="run-vacantia-take"
                      data-lipsanon-id={lipsanonId}
                      disabled={Boolean(departed)}
                      aria-label={`Take ${lipsanon.name}`}
                      onClick={(event) => take(lipsanonId, event.currentTarget.querySelector('.run-lipsanon-icon'))}
                    >
                      <LipsanonIcon lipsanonId={lipsanonId} />
                    </button>
                  )}
                >
                  <span>{lipsanon.description}</span>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
      )}
    </RunSceneViewport>
  );
}
