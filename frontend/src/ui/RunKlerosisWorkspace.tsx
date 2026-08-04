import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { runCardDefinition, type RunDocument } from '../run/model';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { RunCard } from './RunCard';
import {
  runCardFlightGeometry,
  runCardMotionDurationMs,
  type RunCardFlightGeometry,
} from './runCardFlightView';
import { RunSceneViewport } from './RunWorkspace';
import { useSceneReveal } from './shell/SceneBoundary';
import { SceneContinuityPortal, useSceneContinuityAvailable } from './shell/SceneContinuity';
import { ChromeButton } from './shared/ChromeButton';

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
  const continuityAvailable = useSceneContinuityAvailable();
  const rootRef = useRef<HTMLElement | null>(null);
  const flightElementsRef = useRef(new Map<string, HTMLDivElement>());
  const dealtCardIds = run.deployment?.dealtCardIds ?? [];
  const dealKey = dealtCardIds.join(':');
  const cardById = new Map(run.cards.map((card) => [card.id, card]));
  const cards = dealtCardIds.flatMap((cardId) => {
    const card = cardById.get(cardId);
    return card ? [card] : [];
  });
  const [dealComplete, setDealComplete] = useState(false);
  const [dealFlights, setDealFlights] = useState<Array<{
    cardId: string;
    geometry: RunCardFlightGeometry;
  }> | null>(null);

  useLayoutEffect(() => {
    setDealComplete(false);
    setDealFlights(null);
    const root = rootRef.current;
    if (!sceneRevealed || !root) return undefined;
    const cardElements = [...root.querySelectorAll<HTMLElement>('[data-klerosis-deal-card]')];
    if (!cardElements.length) {
      setDealComplete(true);
      return undefined;
    }
    const chartulary = document.querySelector('[data-run-card-flight-target]');
    const chartularyRect = chartulary?.getBoundingClientRect();
    if (!continuityAvailable || !chartularyRect) {
      setDealComplete(true);
      return undefined;
    }
    const flights = cardElements.flatMap((element) => {
      const cardId = element.getAttribute('data-klerosis-deal-card');
      const geometry = runCardFlightGeometry(element.getBoundingClientRect(), chartularyRect);
      return cardId && geometry ? [{ cardId, geometry }] : [];
    });
    if (flights.length !== cardElements.length) {
      setDealComplete(true);
      return undefined;
    }
    setDealFlights(flights);
    return undefined;
  }, [continuityAvailable, dealKey, sceneRevealed]);

  useLayoutEffect(() => {
    if (!dealFlights?.length) return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const style = getComputedStyle(root);
    const duration = runCardMotionDurationMs(style.getPropertyValue('--ds-duration-transfer'));
    const stagger = runCardMotionDurationMs(style.getPropertyValue('--ds-stagger'));
    const easing = style.getPropertyValue('--ds-ease-out').trim();
    if (!duration || !stagger || !easing || typeof Element.prototype.animate !== 'function') {
      setDealComplete(true);
      setDealFlights(null);
      return undefined;
    }
    let cancelled = false;
    const animations = dealFlights.flatMap(({ cardId, geometry }, index) => {
      const element = flightElementsRef.current.get(cardId);
      if (!element) return [];
      return element.animate(
        [
          {
            opacity: 0,
            translate: `${geometry.x}px ${geometry.y}px`,
            scale: geometry.scale,
          },
          {
            opacity: 1,
            offset: 0.06,
            translate: `${geometry.x}px ${geometry.y}px`,
            scale: geometry.scale,
          },
          { opacity: 1, translate: '0px 0px', scale: 1 },
        ],
        {
          duration,
          delay: index * stagger * 3,
          easing,
          fill: 'both',
        },
      );
    });
    if (animations.length !== dealFlights.length) {
      animations.forEach((animation) => animation.cancel());
      setDealComplete(true);
      setDealFlights(null);
      return undefined;
    }
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled) {
        setDealComplete(true);
        setDealFlights(null);
      }
    });
    return () => {
      cancelled = true;
      animations.forEach((animation) => animation.cancel());
    };
  }, [dealFlights]);

  return (
    <>
      {dealFlights?.map(({ cardId, geometry }) => {
        const owned = cardById.get(cardId);
        const card = owned ? runCardDefinition(owned.coreId) : null;
        return owned && card ? (
          <SceneContinuityPortal
            key={cardId}
            contribution={{ kind: 'shared-element', id: `klerosis-deal:${cardId}` }}
          >
            <div
              ref={(element) => {
                if (element) flightElementsRef.current.set(cardId, element);
                else flightElementsRef.current.delete(cardId);
              }}
              className="run-klerosis-deal-flight"
              data-klerosis-deal-flight={cardId}
              style={{
                insetInlineStart: `${geometry.from.left}px`,
                insetBlockStart: `${geometry.from.top}px`,
                inlineSize: `${geometry.from.width}px`,
                blockSize: `${geometry.from.height}px`,
              } as CSSProperties}
            >
              <RunCard card={card} mode="reference" cardType={owned.cardType} adlected />
            </div>
          </SceneContinuityPortal>
        ) : null;
      })}
      <RunSceneViewport
        scene={{
          view: 'klerosis',
          className: 'run-klerosis-scene',
          contentClassName: 'run-klerosis-workspace-content',
          testId: 'run-klerosis-workspace',
          ariaLabel: 'Klerosis',
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
    </>
  );
}
