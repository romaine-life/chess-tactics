import { useState, type ReactElement } from 'react';
import { RUN_RELIC_BY_ID, takeVacantiaRelic, type RunDocument, type RunRelicId } from '../run/model';
import { RunRelicIcon } from './RunRelics';
import { RunWorkspace } from './RunWorkspace';
import { HouseSelect } from './shared/HouseSelect';
import { Tooltip } from './shared/InfoTip';
import { installedRelicMatUrl, relicFloatClock } from './runRelicMat';
import { relicStripLandingPoint } from './runRelicFlight';
import { useRelicFlight } from './runRelicFlightView';
import { runUnitRosterLabel } from './RunArmyWorkspace';
import { workspaceBackgroundArtwork } from './workspaceBackgrounds';

/**
 * Bona Vacantia — goods with no owner. The screen that opens a Conflict: three relics laid
 * out, one taken, and the shop behind it opens as a result.
 *
 * The relics are shown raw on the mat, at their installed size, with no card and no effect
 * text; the name and effect arrive on hover through the shared Tooltip, the same trigger
 * the held-relic strip uses. The reading is the art.
 *
 * Taking is mandatory and there is no confirm step: choosing is the whole screen, and the
 * choice is what advances the Run. The take is committed when the relic LANDS in the
 * held-relic strip — commit first and the workspace it is flying out of is already gone.
 */

/** Relics that cannot be granted blind — they need a unit named before they mean anything. */
function relicTargetRequired(relic: RunRelicId): boolean {
  return relic === 'conscription-notice';
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
  const mat = installedRelicMatUrl();
  const { flight, launch, element } = useRelicFlight((relicId) => {
    replace(takeVacantiaRelic(run, relicId, target || undefined));
  });

  if (!vacantia) return null;

  const needsTarget = vacantia.offers.some(relicTargetRequired);
  const heldRelicCount = run.relics.filter((relicId) => Boolean(RUN_RELIC_BY_ID[relicId])).length;

  function take(relicId: RunRelicId, icon: Element | null): void {
    // Nothing measurable to fly between means nothing to show — take the relic outright
    // rather than stalling the screen on its own presentation.
    if (!launch(relicId, icon, relicStripLandingPoint(heldRelicCount))) {
      replace(takeVacantiaRelic(run, relicId, target || undefined));
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

      <div className="relic-mat-stage" data-cards="on" data-testid="run-vacantia-mat">
        <div className="relic-mat-layer">
          {mat ? <img className="relic-mat-art" src={mat} alt="" draggable={false} /> : null}
          <div
            className="relic-mat-cards"
            data-testid="run-vacantia-offers"
            data-taking={flight ? '' : undefined}
          >
            {vacantia.offers.map((relicId, index) => {
              const relic = RUN_RELIC_BY_ID[relicId];
              const blocked = relicTargetRequired(relicId) && !target;
              const flying = flight?.relicId === relicId;
              return (
                <Tooltip
                  className={`relic-mat-offer${flying ? ' is-flying' : ''}`}
                  key={relicId}
                  label={`${relic.name}. ${relic.description}`}
                  popupMaxInlineSize={288}
                  title={relic.name}
                  // Each relic breathes on its own clock. One shared clock makes three
                  // objects lying loose on a table read as a single animated strip.
                  style={relicFloatClock(index)}
                  trigger={
                    <button
                      type="button"
                      className="run-vacantia-take"
                      data-relic-id={relicId}
                      disabled={blocked}
                      aria-label={`Take ${relic.name}`}
                      onClick={(event) => take(relicId, event.currentTarget.querySelector('.run-relic-icon'))}
                    >
                      <RunRelicIcon relicId={relicId} />
                    </button>
                  }
                >
                  <span>{relic.description}</span>
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
