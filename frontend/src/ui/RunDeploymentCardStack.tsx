import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
} from 'react';
import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import {
  runCardDefinition,
  runCardUnitIds,
  type RunCardDefinition,
  type RunDocument,
  type RunOwnedCard,
} from '../run/model';
import { RunCard } from './RunCard';
import { RunCardBack, RUN_CARD_BACK_SLOT } from './RunCardBack';
import { runCardMotionDurationMs } from './runCardFlightView';

function visibleCardDefinition(run: RunDocument, owned: RunOwnedCard, fromSeat: number): RunCardDefinition | null {
  const definition = runCardDefinition(owned.coreId);
  if (!definition) return null;
  const unitById = new Map(run.army.map((unit) => [unit.id, unit]));
  const pieces = runCardUnitIds({ unitSeats: owned.unitSeats.slice(fromSeat) }).flatMap((unitId) => {
    const unit = unitById.get(unitId);
    return unit ? [unit.type] : [];
  });
  return { ...definition, pieces } as RunCardDefinition;
}

/**
 * The persisted Deployment deal projected into one compact Controls-owned deck. It owns only
 * presentation timing; every information boundary is acknowledged back into the Run document.
 */
export function RunDeploymentCardStack({
  run,
  onDealComplete,
  onRevealComplete,
  onDiscardComplete,
}: {
  run: RunDocument;
  onDealComplete: () => void;
  onRevealComplete: () => void;
  onDiscardComplete: () => void;
}): ReactElement {
  const deployment = run.deployment;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dealtKey = deployment?.dealtCardIds.join(':') ?? '';
  const cardById = new Map(run.cards.map((card) => [card.id, card]));
  const remainingIds = (deployment?.dealtCardIds ?? []).slice(deployment?.discardCursor ?? 0);
  const activeCardId = deployment?.dealtCardIds[deployment.activeCardIndex] ?? null;
  const activeCard = activeCardId ? cardById.get(activeCardId) ?? null : null;
  const activeIdentity = activeCard ? runCardDefinition(activeCard.coreId) ?? null : null;
  const activeDefinition = activeCard
    ? visibleCardDefinition(run, activeCard, deployment?.unitCursor ?? 0)
    : null;
  const activeRevealed = Boolean(activeCardId && deployment?.revealedCardIds.includes(activeCardId));

  useLayoutEffect(() => {
    if (deployment?.stage !== 'dealing') return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const cards = [...root.querySelectorAll<HTMLElement>('[data-deployment-stack-card]')];
    const source = document.querySelector<HTMLElement>('[data-run-card-flight-target]');
    const sourceRect = source?.getBoundingClientRect();
    if (!cards.length || !sourceRect || typeof Element.prototype.animate !== 'function') {
      const frame = requestAnimationFrame(onDealComplete);
      return () => cancelAnimationFrame(frame);
    }
    const style = getComputedStyle(root);
    const duration = runCardMotionDurationMs(style.getPropertyValue('--ds-duration-transfer')) || 420;
    const stagger = runCardMotionDurationMs(style.getPropertyValue('--ds-stagger')) || 45;
    const easing = style.getPropertyValue('--ds-ease-out').trim() || 'ease-out';
    let cancelled = false;
    const animations = cards.map((card, index) => {
      const target = card.getBoundingClientRect();
      const sourceCenterX = sourceRect.left + sourceRect.width / 2;
      const sourceCenterY = sourceRect.top + sourceRect.height / 2;
      const targetCenterX = target.left + target.width / 2;
      const targetCenterY = target.top + target.height / 2;
      const scale = Math.min(sourceRect.width / target.width, sourceRect.height / target.height);
      return card.animate([
        {
          opacity: 0,
          transform: `translate(${sourceCenterX - targetCenterX}px, ${sourceCenterY - targetCenterY}px) scale(${scale})`,
        },
        { opacity: 1, offset: 0.08 },
        { opacity: 1, transform: 'translate(0, 0) scale(1)' },
      ], {
        duration,
        delay: index * stagger,
        easing,
        fill: 'both',
      });
    });
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled) onDealComplete();
    });
    return () => {
      cancelled = true;
      animations.forEach((animation) => animation.cancel());
    };
  }, [dealtKey, deployment?.stage, onDealComplete]);

  useLayoutEffect(() => {
    if (deployment?.stage !== 'revealing') return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const duration = runCardMotionDurationMs(getComputedStyle(root).getPropertyValue('--ds-duration-transfer')) || 420;
    const timer = window.setTimeout(onRevealComplete, duration);
    return () => window.clearTimeout(timer);
  }, [activeCardId, deployment?.stage, onRevealComplete]);

  useLayoutEffect(() => {
    if (deployment?.stage !== 'discarding') return undefined;
    const root = rootRef.current;
    if (!root) return undefined;
    const duration = runCardMotionDurationMs(getComputedStyle(root).getPropertyValue('--ds-duration-transfer')) || 420;
    const timer = window.setTimeout(onDiscardComplete, duration);
    return () => window.clearTimeout(timer);
  }, [activeCardId, deployment?.stage, onDiscardComplete]);

  return (
    <section
      ref={rootRef}
      className="run-deployment-card-stack"
      aria-label={`${remainingIds.length} deployment cards remaining`}
      data-deployment-card-stage={deployment?.stage ?? 'unprepared'}
    >
      <span className="skirmish-eyebrow">Cards</span>
      <div className="run-deployment-card-pile" aria-live="polite">
        {remainingIds.map((cardId, index) => {
          const owned = cardById.get(cardId);
          const isActive = cardId === activeCardId;
          return (
            <div
              className={`run-deployment-stack-card${isActive ? ' is-active' : ''}${
                isActive && activeRevealed ? ' is-revealed' : ''
              }${isActive && deployment?.stage === 'revealing' ? ' is-revealing' : ''}${
                isActive && deployment?.stage === 'discarding' ? ' is-discarding' : ''
              }`}
              data-deployment-stack-card={cardId}
              style={{
                '--deployment-card-depth': index,
                zIndex: remainingIds.length - index,
              } as CSSProperties}
              key={cardId}
            >
              <span className="run-deployment-stack-side is-back">
                <RunCardBack mediaUrl={resolvedLiveMediaUrl(RUN_CARD_BACK_SLOT)} />
              </span>
              {isActive && owned && activeDefinition && activeIdentity ? (
                <span className="run-deployment-stack-side is-front">
                  <RunCard
                    card={activeDefinition}
                    identityCard={activeIdentity}
                    mode="reference"
                    cardType={owned.cardType}
                    adlected
                  />
                </span>
              ) : null}
            </div>
          );
        })}
        <strong className="run-deployment-card-count" aria-hidden="true">{remainingIds.length}</strong>
      </div>
    </section>
  );
}
