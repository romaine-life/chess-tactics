import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { RUN_RELIC_BY_ID, takeVacantiaRelic, type RunDocument, type RunRelicId } from '../run/model';
import { RunRelicIcon } from './RunRelics';
import { RunWorkspace } from './RunWorkspace';
import { HouseSelect } from './shared/HouseSelect';
import { Tooltip } from './shared/InfoTip';
import { installedRelicMatUrl, relicFloatClock } from './runRelicMat';
import { relicStripLandingPoint } from './runRelicFlight';
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
 * choice is what advances the Run.
 */

/** Relics that cannot be granted blind — they need a unit named before they mean anything. */
function relicTargetRequired(relic: RunRelicId): boolean {
  return relic === 'conscription-notice';
}

/** How long the taken relic spends travelling to the held-relic strip. */
const RELIC_FLIGHT_MS = 560;

/**
 * The relic in transit between the mat and the held-relic strip.
 *
 * Committing the take is what ENDS this screen, so the commit is held back until the
 * flight lands: commit first and the workspace the relic is flying out of is already gone.
 */
interface RelicFlight {
  relicId: RunRelicId;
  targetUnitId: string | undefined;
  from: { left: number; top: number };
  to: { left: number; top: number };
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
  const [flight, setFlight] = useState<RelicFlight | null>(null);
  // A transition needs a frame with the start state applied before the end state arrives;
  // rendering the flight already landed would snap the relic into the strip with no travel.
  const [landed, setLanded] = useState(false);
  // The travelling copy is dropped the moment the real strip slot exists, in the same
  // commit, so the two never draw on top of each other while the screen changes behind it.
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);
  const mat = installedRelicMatUrl();

  // The take is committed exactly once per flight, by whichever of the transition or its
  // watchdog gets there first.
  const commitRef = useRef<() => void>(() => {});
  commitRef.current = () => {
    if (settledRef.current || !flight) return;
    settledRef.current = true;
    setSettled(true);
    replace(takeVacantiaRelic(run, flight.relicId, flight.targetUnitId));
  };
  const settle = useCallback(() => commitRef.current(), []);

  useEffect(() => {
    if (!flight) return undefined;
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setLanded(true)));
    // transitionend is the real settle. This only guarantees the Run still advances when
    // the travel never completes — a backgrounded tab, an interrupted transition.
    const watchdog = setTimeout(settle, RELIC_FLIGHT_MS + 240);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(watchdog);
    };
  }, [flight, settle]);

  if (!vacantia) return null;

  const needsTarget = vacantia.offers.some(relicTargetRequired);
  const heldRelicCount = run.relics.filter((relicId) => Boolean(RUN_RELIC_BY_ID[relicId])).length;

  function take(relicId: RunRelicId, icon: Element | null): void {
    if (flight) return;
    const targetUnitId = target || undefined;
    const from = icon?.getBoundingClientRect();
    const to = relicStripLandingPoint(heldRelicCount);
    // Nothing measurable to fly between means nothing to show — take the relic outright
    // rather than stalling the screen on its own presentation.
    if (!from || !to) {
      replace(takeVacantiaRelic(run, relicId, targetUnitId));
      return;
    }
    settledRef.current = false;
    setLanded(false);
    setSettled(false);
    setFlight({ relicId, targetUnitId, from: { left: from.left, top: from.top }, to });
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

      {flight && !settled ? createPortal(
        // Portalled to the document so the travel is not clipped by the workspace it
        // leaves: the mat sits inside an overflow-hidden scene slot, the strip does not.
        <div
          className={`run-relic-flight${landed ? ' is-landed' : ''}`}
          data-testid="run-vacantia-flight"
          aria-hidden="true"
          style={{
            insetInlineStart: `${flight.from.left}px`,
            insetBlockStart: `${flight.from.top}px`,
            '--relic-flight-x': `${flight.to.left - flight.from.left}px`,
            '--relic-flight-y': `${flight.to.top - flight.from.top}px`,
            '--relic-flight-duration': `${RELIC_FLIGHT_MS}ms`,
          } as CSSProperties}
          onTransitionEnd={(event) => {
            if (event.propertyName === 'translate') settle();
          }}
        >
          {/* Two axes, two easings: the relic lifts clear of the mat first and then carries
              across, which reads as being picked up rather than dragged along a ruler. */}
          <div className="run-relic-flight-lift">
            <RunRelicIcon relicId={flight.relicId} />
          </div>
        </div>,
        document.body,
      ) : null}
    </RunWorkspace>
  );
}
