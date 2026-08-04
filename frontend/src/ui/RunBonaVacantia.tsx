import { useState, type ReactElement } from 'react';
import { LIPSANON_BY_ID, takeVacantiaLipsanon, type RunDocument, type LipsanonId } from '../run/model';
import { LipsanonIcon } from './Lipsana';
import { RunWorkspace } from './RunWorkspace';
import { HouseSelect } from './shared/HouseSelect';
import { Tooltip } from './shared/InfoTip';
import { installedLipsanonMatUrl } from './runLipsanonMat';
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
 * choice is what advances the Run.
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
  const mat = installedLipsanonMatUrl();
  if (!vacantia) return null;

  const needsTarget = vacantia.offers.some(lipsanonTargetRequired);

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
          <div className="lipsanon-mat-cards" data-testid="run-vacantia-offers">
            {vacantia.offers.map((lipsanonId) => {
              const lipsanon = LIPSANON_BY_ID[lipsanonId];
              const blocked = lipsanonTargetRequired(lipsanonId) && !target;
              return (
                <Tooltip
                  className="lipsanon-mat-offer"
                  key={lipsanonId}
                  label={`${lipsanon.name}. ${lipsanon.description}`}
                  popupMaxInlineSize={288}
                  title={lipsanon.name}
                  trigger={
                    <button
                      type="button"
                      className="run-vacantia-take"
                      data-lipsanon-id={lipsanonId}
                      disabled={blocked}
                      aria-label={`Take ${lipsanon.name}`}
                      onClick={() => replace(takeVacantiaLipsanon(run, lipsanonId, target || undefined))}
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
    </RunWorkspace>
  );
}
