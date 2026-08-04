import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { runCardDefinition, type RunDocument } from '../run/model';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { RunCard } from './RunCard';
import { runCardMotionDurationMs } from './runCardFlightView';
import { runUnitRosterLabel } from './RunArmyWorkspace';
import { RunSceneViewport } from './RunWorkspace';
import { useSceneReveal } from './shell/SceneBoundary';
import { ChromeButton } from './shared/ChromeButton';
import { InnerChromeBox } from './shared/ChromeBox';

/**
 * The pre-Battle deal is a full Run workspace, not a battlefield overlay. The
 * card grid is deliberately unbounded by a three-card composition: later
 * Conflicts may deal more cards and this surface wraps and scrolls with them.
 */
export function RunKlerosisWorkspace({
  run,
  onConfirm,
}: {
  run: RunDocument;
  onConfirm: () => void;
}): ReactElement {
  const sceneRevealed = useSceneReveal();
  const rootRef = useRef<HTMLElement | null>(null);
  const dealtCardIds = run.deployment?.dealtCardIds ?? [];
  const dealKey = dealtCardIds.join(':');
  const cardById = new Map(run.cards.map((card) => [card.id, card]));
  const cards = dealtCardIds.flatMap((cardId) => {
    const card = cardById.get(cardId);
    return card ? [card] : [];
  });
  const deploying = new Set(run.deployment?.deployingUnitIds ?? []);
  const [dealComplete, setDealComplete] = useState(false);

  useLayoutEffect(() => {
    setDealComplete(false);
    const root = rootRef.current;
    if (!sceneRevealed || !root) return undefined;
    const cardElements = [...root.querySelectorAll<HTMLElement>('[data-klerosis-deal-card]')];
    if (!cardElements.length) {
      setDealComplete(true);
      return undefined;
    }
    const style = getComputedStyle(root);
    const duration = runCardMotionDurationMs(style.getPropertyValue('--ds-duration-transfer'));
    const stagger = runCardMotionDurationMs(style.getPropertyValue('--ds-stagger'));
    const easing = style.getPropertyValue('--ds-ease-out').trim();
    if (!duration || !stagger || !easing || typeof Element.prototype.animate !== 'function') {
      setDealComplete(true);
      return undefined;
    }
    const rootRect = root.getBoundingClientRect();
    const originX = rootRect.left + rootRect.width / 2;
    const originY = rootRect.top + Math.min(82, rootRect.height * 0.12);
    let cancelled = false;
    const animations = cardElements.map((element, index) => {
      const rect = element.getBoundingClientRect();
      const x = originX - (rect.left + rect.width / 2);
      const y = originY - (rect.top + rect.height * 0.16);
      return element.animate(
        [
          {
            opacity: 0,
            transform: `translate3d(${x}px, ${y}px, 0) scale(.86) rotate(${index % 2 === 0 ? '-2deg' : '2deg'})`,
          },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1) rotate(0)' },
        ],
        {
          duration,
          delay: index * stagger * 3,
          easing,
          fill: 'both',
        },
      );
    });
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled) setDealComplete(true);
    });
    return () => {
      cancelled = true;
      animations.forEach((animation) => animation.cancel());
    };
  }, [dealKey, sceneRevealed]);

  return (
    <RunSceneViewport
      scene={{
        view: 'klerosis',
        className: 'run-klerosis-scene',
        contentClassName: 'run-klerosis-workspace-content',
        testId: 'run-klerosis-workspace',
        ariaLabelledBy: 'run-klerosis-title',
      }}
    >
      <section
        ref={rootRef}
        className={`run-klerosis-workspace${dealComplete ? ' is-deal-complete' : ' is-dealing'}`}
        data-testid="run-klerosis"
        data-klerosis-deal-state={dealComplete ? 'complete' : 'dealing'}
        aria-busy={!dealComplete}
      >
        <header className="run-klerosis-heading">
          <span className="skirmish-eyebrow">Klerosis</span>
          <h2 id="run-klerosis-title">Your deployment deal</h2>
          <p>These cards supply this combat. Their units enter the pool while space allows.</p>
        </header>

        <div className="run-klerosis-cards" role="list" aria-label="Cards dealt for this combat">
          {cards.map((owned, index) => {
            const card = runCardDefinition(owned.coreId);
            return card ? (
              <div
                role="listitem"
                className="run-klerosis-card"
                data-klerosis-deal-card={owned.id}
                data-klerosis-deal-index={index}
                key={owned.id}
                style={{ zIndex: cards.length - index }}
              >
                <RunCard card={card} mode="reference" cardType={owned.cardType} adlected />
              </div>
            ) : null;
          })}
        </div>

        <InnerChromeBox className="run-klerosis-rosters">
          <div>
            <span className="skirmish-eyebrow">Deploying</span>
            <ul>
              {run.army.filter((unit) => deploying.has(unit.id)).map((unit) => (
                <li key={unit.id}>{runUnitRosterLabel(unit)}</li>
              ))}
            </ul>
          </div>
          <div>
            <span className="skirmish-eyebrow">Unavailable</span>
            <ul>
              {run.army.filter((unit) => !deploying.has(unit.id)).map((unit) => (
                <li key={unit.id}>{runUnitRosterLabel(unit)}</li>
              ))}
              {run.army.every((unit) => deploying.has(unit.id)) ? <li>None</li> : null}
            </ul>
          </div>
        </InnerChromeBox>

        <div className="run-klerosis-actions">
          <ChromeButton
            unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
            data-testid="klerosis-confirm"
            disabled={!dealComplete}
            onClick={onConfirm}
          >
            {dealComplete ? 'Confirm' : 'Dealing…'}
          </ChromeButton>
        </div>
      </section>
    </RunSceneViewport>
  );
}
