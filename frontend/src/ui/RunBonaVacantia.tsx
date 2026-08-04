import { useState, type ReactElement } from 'react';
import { LIPSANON_BY_ID, takeVacantiaLipsanon, type RunDocument, type LipsanonId } from '../run/model';
import { LipsanonIcon } from './Lipsana';
import { RunWorkspace } from './RunWorkspace';
import { HouseSelect } from './shared/HouseSelect';
import { Tooltip } from './shared/InfoTip';
import { installedLipsanonMatUrl, lipsanonFloatClock } from './runLipsanonMat';
import { lipsanonStripLandingPoint } from './runLipsanonFlight';
import { useLipsanonFlight } from './runLipsanonFlightView';
import { runUnitRosterLabel } from './RunArmyWorkspace';
import { workspaceBackgroundArtwork } from './workspaceBackgrounds';

/**
 * Bona Vacantia — goods with no owner. The screen that opens a Conflict: three lipsana laid
 * out, one taken, and the shop behind it opens as a result.
 *
 * The lipsana are shown raw on the mat, at their installed size, with no card and no effect
 * text; the name and effect arrive on hover through the shared Tooltip, the same trigger
 * the held-lipsanon strip uses. The reading is the art.
 *
 * Taking is mandatory and there is no confirm step: choosing is the whole screen, and the
 * choice is what advances the Run. The take is committed when the lipsanon LANDS in the
 * held-lipsanon strip — commit first and the workspace it is flying out of is already gone.
 */

/** Lipsana that cannot be granted blind — they need a unit named before they mean anything. */
function lipsanonTargetRequired(lipsanon: LipsanonId): boolean {
  return lipsanon === 'conscription-notice';
}

export function RunBonaVacantia({
  run,
  replace,
}: {
  run: RunDocument;
  replace: (next: RunDocument) => void;
}): ReactElement | null {
  const vacantia = run.vacantia;
  const [target, setTarget] = useState('');
  // Latched, not derived from the flight: the flight ends when the lipsanon lands, and the mat
  // must not un-take itself in the beat before the shop replaces it. Choosing is final.
  const [departed, setDeparted] = useState<LipsanonId | null>(null);
  const mat = installedLipsanonMatUrl();
  const { launch, element } = useLipsanonFlight((lipsanonId) => {
    replace(takeVacantiaLipsanon(run, lipsanonId, target || undefined));
  });

  if (!vacantia) return null;

  const needsTarget = vacantia.offers.some(lipsanonTargetRequired);
  const heldLipsanonCount = run.lipsana.filter((lipsanonId) => Boolean(LIPSANON_BY_ID[lipsanonId])).length;

  function take(lipsanonId: LipsanonId, icon: Element | null): void {
    if (departed) return;
    setDeparted(lipsanonId);
    // Nothing measurable to fly between means nothing to show — take the lipsanon outright
    // rather than stalling the screen on its own presentation.
    if (!launch(lipsanonId, icon, lipsanonStripLandingPoint(heldLipsanonCount))) {
      replace(takeVacantiaLipsanon(run, lipsanonId, target || undefined));
    }
  }

  return (
    <RunWorkspace
      className="run-vacantia-workspace"
      contentClassName="run-vacantia-content"
      data-testid="run-bona-vacantia"
      aria-labelledby="run-vacantia-title"
      backgroundArtwork={workspaceBackgroundArtwork('run-bona-vacantia')}
    >
      <h2 id="run-vacantia-title">Bona Vacantia</h2>
      <p className="run-vacantia-lede">Nobody is here to hand these over. Take one.</p>

      {needsTarget ? (
        <HouseSelect
          value={target}
          options={[
            { value: '', label: 'Choose a unit…' },
            ...run.army.map((unit) => ({ value: unit.id, label: runUnitRosterLabel(unit) })),
          ]}
          onChange={setTarget}
          ariaLabel="Discipline target"
        />
      ) : null}

      <div className="lipsanon-mat-stage" data-cards="on" data-testid="run-vacantia-mat">
        <div className="lipsanon-mat-layer">
          {mat ? <img className="lipsanon-mat-art" src={mat} alt="" draggable={false} /> : null}
          <div
            className="lipsanon-mat-cards"
            data-testid="run-vacantia-offers"
            data-taking={departed ? '' : undefined}
          >
            {vacantia.offers.map((lipsanonId, index) => {
              const lipsanon = LIPSANON_BY_ID[lipsanonId];
              const blocked = lipsanonTargetRequired(lipsanonId) && !target;
              const flying = departed === lipsanonId;
              return (
                <Tooltip
                  className={`lipsanon-mat-offer${flying ? ' is-flying' : ''}`}
                  key={lipsanonId}
                  label={`${lipsanon.name}. ${lipsanon.description}`}
                  popupMaxInlineSize={288}
                  title={lipsanon.name}
                  // The mat is emptying; a name still floating over it belongs to nothing.
                  suppressed={Boolean(departed)}
                  // Each lipsanon breathes on its own clock. One shared clock makes three
                  // objects lying loose on a table read as a single animated strip.
                  style={lipsanonFloatClock(index)}
                  trigger={
                    <button
                      type="button"
                      className="run-vacantia-take"
                      data-lipsanon-id={lipsanonId}
                      disabled={blocked}
                      aria-label={`Take ${lipsanon.name}`}
                      onClick={(event) => take(lipsanonId, event.currentTarget.querySelector('.run-lipsanon-icon'))}
                    >
                      <LipsanonIcon lipsanonId={lipsanonId} />
                    </button>
                  }
                >
                  <span>{lipsanon.description}</span>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>

      {element}
    </RunWorkspace>
  );
}
