import { useRef, type CSSProperties, type ReactElement } from 'react';
import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import {
  runCardDefinition,
  runCardUnitIds,
  type RunCardDefinition,
  type RunDocument,
  type RunOwnedCard,
} from '../run/model';
import { updateAppSettings, useAppSettings } from '../settings/appSettings';
import { RunCard } from './RunCard';
import { RunCardBack, RUN_CARD_BACK_SLOT } from './RunCardBack';
import { runCardMotionDurationMs } from './runCardFlightView';
import { useSceneEnteredAction } from './shell/SceneActivity';
import { SceneContinuityPortal } from './shell/SceneContinuity';
import { ChromeButton } from './shared/ChromeButton';
import { Toggle } from './shared/Toggle';
import { chromeUnitClassNames } from './chromeUnitRegistry';

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

/** The complete face-down Chartulary deck before its combat partition is committed. */
export function RunDeploymentDeckDeal({
  run,
  dealtCount,
  onBeginDeal,
}: {
  run: RunDocument;
  dealtCount: number;
  onBeginDeal: () => void;
}): ReactElement | null {
  const deployment = run.deployment;
  const settings = useAppSettings();
  const visible = deployment?.stage === 'awaiting-deal' || deployment?.stage === 'dealing';
  const awaiting = deployment?.stage === 'awaiting-deal';
  const centerCount = Math.max(0, run.cards.length - dealtCount);
  const visibleDeckLayers = Math.min(3, Math.max(1, centerCount));

  useSceneEnteredAction(
    `deployment-auto-deal:${run.id}:${deployment?.battleIndex ?? 'none'}`,
    Boolean(awaiting && settings.autoDealDeployment),
    (scene) => scene.nextFrame(onBeginDeal),
  );

  if (!visible) return null;
  return (
    <section className="run-deployment-deal-overlay" aria-label="Deployment deck">
      <div
        className={`run-deployment-center-deck${deployment?.stage === 'dealing' ? ' is-dealing' : ''}`}
        data-deployment-center-deck=""
      >
        {Array.from({ length: visibleDeckLayers }, (_, index) => {
          const depth = visibleDeckLayers - index - 1;
          return (
            <span
              className={`run-deployment-center-card ${depth === 2 ? 'is-depth-two' : depth === 1 ? 'is-depth-one' : 'is-top'}`}
              aria-hidden={depth > 0 ? true : undefined}
              key={depth}
            >
              <RunCardBack mediaUrl={resolvedLiveMediaUrl(RUN_CARD_BACK_SLOT)} />
            </span>
          );
        })}
        <strong className="run-deployment-center-count" aria-live="polite">{centerCount}</strong>
      </div>
      <div className="run-deployment-deal-actions">
        <ChromeButton
          unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
          disabled={!awaiting}
          onClick={onBeginDeal}
        >
          {awaiting ? 'Deal' : 'Dealing…'}
        </ChromeButton>
        {!settings.autoDealDeployment ? (
          <div className="run-deployment-auto-deal">
            <span>Deal automatically</span>
            <Toggle
              checked={false}
              label="Deal Deployment cards automatically"
              onChange={(value) => updateAppSettings({ autoDealDeployment: value })}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The dealt combat stack in Controls. It owns the one scene-scoped partition motion; the Run
 * document owns every information boundary and the parent owns only its visible progress count.
 */
export function RunDeploymentCardStack({
  run,
  dealProgress,
  onDealProgress,
  onDealComplete,
  onRevealComplete,
  onDiscardComplete,
}: {
  run: RunDocument;
  dealProgress: number;
  onDealProgress: (count: number) => void;
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
  const undealtCardCount = Math.max(0, run.cards.length - (deployment?.dealtCardIds.length ?? 0));

  useSceneEnteredAction(`deployment-deal:${run.id}:${dealtKey}`, deployment?.stage === 'dealing', (scene) => {
    const root = rootRef.current;
    const source = document.querySelector<HTMLElement>('[data-deployment-center-deck]');
    const chartulary = document.querySelector<HTMLElement>('[data-run-card-flight-target]');
    if (!root || !source) return scene.nextFrame(onDealComplete);
    const cards = [...root.querySelectorAll<HTMLElement>('[data-deployment-stack-card]')];
    const flights = [...document.querySelectorAll<HTMLElement>('[data-deployment-flight-card]')];
    const remainderFlight = document.querySelector<HTMLElement>('[data-deployment-remainder-flight]');
    if (
      cards.length !== (deployment?.dealtCardIds.length ?? 0)
      || flights.length !== cards.length
      || !remainderFlight
      || typeof Element.prototype.animate !== 'function'
    ) {
      return scene.nextFrame(onDealComplete);
    }
    const sourceRect = source.getBoundingClientRect();
    const style = getComputedStyle(root);
    const duration = runCardMotionDurationMs(style.getPropertyValue('--deployment-deal-duration'))
      ?? runCardMotionDurationMs(style.getPropertyValue('--ds-duration-transfer'))
      ?? 520;
    const stagger = runCardMotionDurationMs(style.getPropertyValue('--deployment-deal-stagger')) ?? 320;
    const easing = style.getPropertyValue('--ds-ease-out').trim() || 'ease-out';
    const animations: Animation[] = [];
    let cancelled = false;
    onDealProgress(0);

    cards.forEach((card, index) => {
      const flight = flights[index];
      const target = card.getBoundingClientRect();
      const scale = Math.min(target.width / sourceRect.width, target.height / sourceRect.height);
      Object.assign(flight.style, {
        left: `${sourceRect.left}px`,
        top: `${sourceRect.top}px`,
        width: `${sourceRect.width}px`,
        height: `${sourceRect.height}px`,
      });
      const animation = scene.animate(flight, [
        {
          opacity: 0,
          transform: 'translate(0, 0) scale(1)',
        },
        { opacity: 1, offset: 0.08 },
        {
          opacity: 1,
          transform: `translate(${target.left + target.width / 2 - sourceRect.left - sourceRect.width / 2}px, ${target.top + target.height / 2 - sourceRect.top - sourceRect.height / 2}px) scale(${scale})`,
        },
      ], {
        duration,
        delay: index * stagger,
        easing,
        fill: 'both',
      });
      if (!animation) return;
      animations.push(animation);
      void animation.finished.then(() => {
        if (!cancelled) onDealProgress(index + 1);
      }).catch(() => undefined);
    });

    const undealtCount = Math.max(0, run.cards.length - cards.length);
    if (undealtCount > 0 && chartulary) {
      const target = chartulary.getBoundingClientRect();
      const scale = Math.min(target.width / sourceRect.width, target.height / sourceRect.height);
      Object.assign(remainderFlight.style, {
        left: `${sourceRect.left}px`,
        top: `${sourceRect.top}px`,
        width: `${sourceRect.width}px`,
        height: `${sourceRect.height}px`,
      });
      const remainder = scene.animate(remainderFlight, [
        { opacity: 0, transform: 'translate(0, 0) scale(1)' },
        { opacity: 1, offset: 0.08 },
        {
          opacity: 1,
          transform: `translate(${target.left + target.width / 2 - sourceRect.left - sourceRect.width / 2}px, ${target.top + target.height / 2 - sourceRect.top - sourceRect.height / 2}px) scale(${scale})`,
        },
      ], {
        duration,
        delay: cards.length * stagger,
        easing,
        fill: 'both',
      });
      if (remainder) animations.push(remainder);
      const sourceFade = scene.animate(source, [{ opacity: 1 }, { opacity: 0 }], {
        duration: 1,
        delay: cards.length * stagger,
        fill: 'both',
      });
      if (sourceFade) animations.push(sourceFade);
    } else {
      const remainder = scene.animate(source, [{ opacity: 1 }, { opacity: 0 }], {
        duration: Math.max(160, Math.round(duration * 0.5)),
        delay: cards.length * stagger,
        easing,
        fill: 'both',
      });
      if (remainder) animations.push(remainder);
    }

    const expectedAnimationCount = cards.length + 1 + (undealtCount > 0 && chartulary ? 1 : 0);
    if (animations.length < expectedAnimationCount) {
      animations.forEach((animation) => animation.cancel());
      return scene.nextFrame(onDealComplete);
    }
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled) onDealComplete();
    });
    return () => { cancelled = true; };
  });

  useSceneEnteredAction(`deployment-reveal:${run.id}:${activeCardId ?? 'none'}`, deployment?.stage === 'revealing', (scene) => {
    const root = rootRef.current;
    if (!root) return undefined;
    const duration = runCardMotionDurationMs(getComputedStyle(root).getPropertyValue('--ds-duration-transfer')) || 420;
    return scene.after(duration, onRevealComplete);
  });

  useSceneEnteredAction(`deployment-discard:${run.id}:${activeCardId ?? 'none'}`, deployment?.stage === 'discarding', (scene) => {
    const root = rootRef.current;
    if (!root) return undefined;
    const duration = runCardMotionDurationMs(getComputedStyle(root).getPropertyValue('--ds-duration-transfer')) || 420;
    return scene.after(duration, onDiscardComplete);
  });

  const visibleCount = deployment?.stage === 'dealing' ? dealProgress : remainingIds.length;
  return (
    <>
      {deployment?.stage === 'dealing' ? (
        <SceneContinuityPortal contribution={{ kind: 'shared-element', id: `deployment-deal:${run.id}` }}>
          <div className="run-deployment-deal-flights">
            {remainingIds.map((cardId) => (
              <div className="run-deployment-deal-flight" data-deployment-flight-card={cardId} key={cardId}>
                <RunCardBack mediaUrl={resolvedLiveMediaUrl(RUN_CARD_BACK_SLOT)} />
              </div>
            ))}
            <div className="run-deployment-deal-flight is-remainder" data-deployment-remainder-flight="">
              <RunCardBack mediaUrl={resolvedLiveMediaUrl(RUN_CARD_BACK_SLOT)} />
              <strong className="run-deployment-center-count">{undealtCardCount}</strong>
            </div>
          </div>
        </SceneContinuityPortal>
      ) : null}
      <section
        ref={rootRef}
        className="run-deployment-card-stack"
        aria-label={`${visibleCount} deployment cards remaining`}
        data-deployment-card-stage={deployment?.stage ?? 'unprepared'}
      >
      <span className="skirmish-eyebrow">Cards</span>
      <div className="run-deployment-card-pile" aria-live="polite">
        {remainingIds.map((cardId, index) => {
          const owned = cardById.get(cardId);
          const isActive = cardId === activeCardId;
          return (
            <div
              className={`run-deployment-stack-card${index < dealProgress ? ' is-dealt' : ''}${isActive ? ' is-active' : ''}${
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
        <strong className="run-deployment-card-count" aria-hidden="true">{visibleCount}</strong>
      </div>
      </section>
    </>
  );
}
