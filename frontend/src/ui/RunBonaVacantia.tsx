import { useState, type ReactElement } from 'react';
import {
  ADLECTED_DISPLAY_NAME,
  canTargetLipsanon,
  LIPSANON_BY_ID,
  lipsanonNeedsUnitTarget,
  runAbilityGeneralDescription,
  takeVacantiaLipsanon,
  type LipsanonId,
  type RunDocument,
} from '../run/model';
import { LipsanonIcon } from './Lipsana';
import { RunSceneViewport } from './RunWorkspace';
import { Tooltip } from './shared/InfoTip';
import { installedLipsanonMatUrl, lipsanonFloatClock } from './runLipsanonMat';
import { lipsanonStripLandingPoint } from './runLipsanonFlight';
import { useLipsanonFlight } from './runLipsanonFlightView';
import {
  RunArmyWorkspace,
  type RunArmyFilters,
} from './RunArmyWorkspace';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ChromeButton } from './shared/ChromeButton';
import { InnerChromeBox } from './shared/ChromeBox';
import { workspaceBackgroundArtwork } from './workspaceBackgrounds';

/**
 * Bona Vacantia — goods with no owner. The screen that opens a Conflict: three lipsana laid
 * out, one taken, and the Sectio behind it opens as a result.
 *
 * The lipsana are shown raw on the mat, at their installed size, with no card and no effect
 * text; the name and effect arrive on hover through the shared Tooltip, the same trigger
 * the held-lipsanon strip uses. The reading is the art.
 *
 * Taking is mandatory. An ordinary lipsanon commits when it lands and opens the Sectio. A
 * lipsanon that needs a unit named first lands provisionally, then uses the Martial
 * Prosopography to make that choice; confirming the unit commits both facts atomically.
 */

export function RunBonaVacantia({
  run,
  replace,
  onTargetLipsanon,
}: {
  run: RunDocument;
  replace: (next: RunDocument) => void;
  onTargetLipsanon: (lipsanonId: LipsanonId) => void;
}): ReactElement | null {
  const vacantia = run.vacantia;
  // Latched, not derived from the flight: the flight ends when the lipsanon lands, and the
  // mat must not repopulate in the beat before the Sectio or target chooser replaces it.
  const [departed, setDeparted] = useState<LipsanonId | null>(null);
  const mat = installedLipsanonMatUrl();
  const { launch, element } = useLipsanonFlight(
    (lipsanonId) => {
      if (lipsanonNeedsUnitTarget(lipsanonId)) {
        onTargetLipsanon(lipsanonId);
        return;
      }
      replace(takeVacantiaLipsanon(run, lipsanonId));
    },
    { handoff: 'scene-retirement' },
  );

  if (!vacantia) return null;

  const heldLipsanonCount = run.lipsana.filter((lipsanonId) => Boolean(LIPSANON_BY_ID[lipsanonId])).length;

  function take(lipsanonId: LipsanonId, icon: Element | null): void {
    if (departed) return;
    const destination = lipsanonStripLandingPoint(heldLipsanonCount);
    setDeparted(lipsanonId);
    // Nothing measurable to fly between means nothing to show — take the lipsanon outright
    // when it needs no target, or open the target chooser immediately when it does.
    if (!launch(lipsanonId, icon, destination)) {
      if (lipsanonNeedsUnitTarget(lipsanonId)) onTargetLipsanon(lipsanonId);
      else replace(takeVacantiaLipsanon(run, lipsanonId));
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
          <div
            className="lipsanon-mat-cards"
            data-testid="run-vacantia-offers"
            data-taking={departed ? '' : undefined}
          >
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
                      disabled={Boolean(departed)}
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
    </RunSceneViewport>
  );
}

export function RunBonaVacantiaTarget({
  run,
  lipsanonId,
  selectedUnitId,
  filters,
  onFiltersChange,
  onSelectUnit,
  onBackToUnits,
  onBackToOffers,
  onConfirm,
}: {
  run: RunDocument;
  lipsanonId: LipsanonId;
  selectedUnitId: string | null;
  filters: RunArmyFilters;
  onFiltersChange: (filters: RunArmyFilters) => void;
  onSelectUnit: (unitId: string) => void;
  onBackToUnits: () => void;
  onBackToOffers: () => void;
  onConfirm: (unitId: string) => void;
}): ReactElement {
  const lipsanon = LIPSANON_BY_ID[lipsanonId];
  return (
    <RunSceneViewport
      scene={{
        view: 'bona-target',
        className: 'run-vacantia-workspace is-targeting',
        contentClassName: 'run-vacantia-target-content',
        testId: 'run-bona-vacantia-target',
        ariaLabelledBy: 'run-vacantia-target-title',
        backgroundArtwork: workspaceBackgroundArtwork('run-bona-vacantia'),
        edgeAttached: true,
      }}
    >
      <div className="run-vacantia-target-layout">
        <aside className="run-vacantia-target-brief">
          <h2 id="run-vacantia-target-title">{lipsanon.name}</h2>
          <p>{lipsanon.description}</p>
          <InnerChromeBox className="run-vacantia-target-ability">
            <strong>{ADLECTED_DISPLAY_NAME}</strong>
            <span>{runAbilityGeneralDescription('adlected')}</span>
          </InnerChromeBox>
          <p className="run-vacantia-target-instruction">
            Select a unit to inspect it, then confirm who permanently gains {ADLECTED_DISPLAY_NAME}.
            Nothing is recorded until that confirmation reveals the Sectio.
          </p>
          <ChromeButton
            unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
            onClick={onBackToOffers}
          >
            Return to the three offers
          </ChromeButton>
        </aside>
        <RunArmyWorkspace
          run={run}
          title="Select a unit"
          backLabel="Back to unit list"
          filters={filters}
          selectedUnitId={selectedUnitId}
          onFiltersChange={onFiltersChange}
          onSelectUnit={onSelectUnit}
          onBack={onBackToUnits}
          onAlienate={() => undefined}
          profileAction={{
            label: `Give ${ADLECTED_DISPLAY_NAME} to this unit`,
            onAction: onConfirm,
            isDisabled: (unit) => !canTargetLipsanon(run, lipsanonId, unit.id),
          }}
          framed={false}
        />
      </div>
    </RunSceneViewport>
  );
}
