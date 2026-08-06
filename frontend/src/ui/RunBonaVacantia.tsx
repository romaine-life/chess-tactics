import { useState, type ReactElement } from 'react';
import { LIPSANON_BY_ID, takeVacantiaLipsanon, type LipsanonId, type RunDocument } from '../run/model';
import { LipsanonIcon } from './Lipsana';
import { RunSceneViewport } from './RunWorkspace';
import { Tooltip } from './shared/InfoTip';
import { installedLipsanonMatUrl, lipsanonFloatClock } from './runLipsanonMat';
import { lipsanonStripLandingPoint } from './runLipsanonFlight';
import type { LipsanonFlightPoint } from './runLipsanonFlightView';
import { workspaceBackgroundArtwork } from './workspaceBackgrounds';

/** Mandatory three-way relic choice at the opening of a Conflict. */
export function RunBonaVacantia({
  run,
  replace,
  launchLipsanon,
}: {
  run: RunDocument;
  replace: (next: RunDocument) => void;
  launchLipsanon: (
    lipsanonId: LipsanonId,
    icon: Element | null,
    to: LipsanonFlightPoint | null,
  ) => boolean;
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

  return (
    <RunSceneViewport
      scene={{
        view: 'bona-mat',
        className: 'run-vacantia-workspace',
        contentClassName: 'run-vacantia-content',
        testId: 'run-bona-vacantia',
        ariaLabel: 'Lipsanon offers',
        backgroundArtwork: workspaceBackgroundArtwork('run-bona-vacantia'),
      }}
    >
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
    </RunSceneViewport>
  );
}
