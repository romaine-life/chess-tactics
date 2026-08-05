import { useRef, type CSSProperties, type ReactElement } from 'react';
import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import {
  runCardDefinition,
  type RunArmyPieceType,
  type RunCardDefinition,
  type RunDeploymentState,
  type RunDocument,
  type RunOwnedCard,
} from '../run/model';
import { updateAppSettings, useAppSettings } from '../settings/appSettings';
import { RunCard } from './RunCard';
import { RunCardBack, RUN_CARD_BACK_SLOT } from './RunCardBack';
import { runCardFlightGeometry, runCardMotionDurationMs } from './runCardFlightView';
import { useSceneEnteredAction } from './shell/SceneActivity';
import { SceneContinuityPortal } from './shell/SceneContinuity';
import { ChromeButton } from './shared/ChromeButton';
import { Toggle } from './shared/Toggle';
import { chromeUnitClassNames } from './chromeUnitRegistry';

export function deploymentCardIsDiscarding(
  deployment: Pick<RunDeploymentState, 'stage' | 'activeCardIndex' | 'discardCursor'> | null | undefined,
  absoluteIndex: number,
  isActive: boolean,
): boolean {
  return deployment?.stage === 'discarding'
    && (deployment.activeCardIndex > deployment.discardCursor
      ? absoluteIndex < deployment.activeCardIndex
      : isActive);
}

export function deploymentCardEmptyPieceIndices(
  pieces: readonly RunArmyPieceType[],
  unitSeats: readonly (string | null)[],
  unitTypeById: ReadonlyMap<string, RunArmyPieceType>,
  fromSeat: number,
): readonly number[] {
  const openPieceIndicesByType = new Map<RunArmyPieceType, number[]>();
  pieces.forEach((piece, pieceIndex) => {
    const openIndices = openPieceIndicesByType.get(piece) ?? [];
    openIndices.push(pieceIndex);
    openPieceIndicesByType.set(piece, openIndices);
  });

  const pieceIndexBySeat = new Map<number, number>();
  unitSeats.forEach((unitId, seatIndex) => {
    if (!unitId) return;
    const unitType = unitTypeById.get(unitId);
    if (!unitType) return;
    const openIndices = openPieceIndicesByType.get(unitType);
    const pieceIndex = openIndices?.shift();
    if (pieceIndex !== undefined) pieceIndexBySeat.set(seatIndex, pieceIndex);
  });

  const occupiedPieceIndices = new Set(pieceIndexBySeat.values());
  const emptyPieceIndices = new Set<number>();
  pieces.forEach((_, pieceIndex) => {
    if (!occupiedPieceIndices.has(pieceIndex)) emptyPieceIndices.add(pieceIndex);
  });
  pieceIndexBySeat.forEach((pieceIndex, seatIndex) => {
    if (seatIndex < fromSeat) emptyPieceIndices.add(pieceIndex);
  });
  return [...emptyPieceIndices].sort((left, right) => left - right);
}

function deploymentCardPresentation(run: RunDocument, owned: RunOwnedCard, fromSeat: number): Readonly<{
  definition: RunCardDefinition;
  emptyPieceIndices: readonly number[];
}> | null {
  const definition = runCardDefinition(owned.coreId);
  if (!definition) return null;
  const unitTypeById = new Map(run.army.map((unit) => [unit.id, unit.type]));
  const emptyPieceIndices = deploymentCardEmptyPieceIndices(
    definition.pieces,
    owned.unitSeats,
    unitTypeById,
    fromSeat,
  );
  return { definition, emptyPieceIndices };
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
          data-testid="deployment-deal"
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
  const activePresentation = activeCard
    ? deploymentCardPresentation(run, activeCard, deployment?.unitCursor ?? 0)
    : null;
  const activeDefinition = activePresentation?.definition ?? null;
  const activeRevealed = Boolean(activeCardId && deployment?.revealedCardIds.includes(activeCardId));
  const undealtCardCount = Math.max(0, run.cards.length - (deployment?.dealtCardIds.length ?? 0));
  const discardingIds = remainingIds.filter((_, index) => deploymentCardIsDiscarding(
    deployment,
    (deployment?.discardCursor ?? 0) + index,
    remainingIds[index] === activeCardId,
  ));
  const discardKey = discardingIds.join(':');

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

  useSceneEnteredAction(`deployment-discard:${run.id}:${discardKey || 'none'}`, deployment?.stage === 'discarding', (scene) => {
    const root = rootRef.current;
    const target = document.querySelector<HTMLElement>('[data-run-card-flight-target]');
    if (!root || !target || !discardingIds.length) return scene.nextFrame(onDiscardComplete);
    const sources = discardingIds.map((cardId) => (
      root.querySelector<HTMLElement>(`[data-deployment-stack-card="${CSS.escape(cardId)}"]`)
    ));
    const flights = discardingIds.map((cardId) => (
      document.querySelector<HTMLElement>(`[data-deployment-discard-flight-card="${CSS.escape(cardId)}"]`)
    ));
    if (sources.some((source) => !source) || flights.some((flight) => !flight)) {
      return scene.nextFrame(onDiscardComplete);
    }
    const style = getComputedStyle(root);
    const duration = runCardMotionDurationMs(style.getPropertyValue('--deployment-discard-duration'))
      ?? runCardMotionDurationMs(style.getPropertyValue('--ds-duration-transfer'))
      ?? 560;
    const stagger = runCardMotionDurationMs(style.getPropertyValue('--deployment-discard-stagger')) ?? 72;
    const easing = style.getPropertyValue('--ds-ease-in-out').trim()
      || style.getPropertyValue('--ds-ease-out').trim()
      || 'ease-in-out';
    const targetRect = target.getBoundingClientRect();
    const animations: Animation[] = [];
    let cancelled = false;
    flights.forEach((flight, index) => {
      const sourceRect = sources[index]!.getBoundingClientRect();
      const geometry = runCardFlightGeometry(sourceRect, targetRect);
      if (!flight || !geometry) return;
      Object.assign(flight.style, {
        left: `${geometry.from.left}px`,
        top: `${geometry.from.top}px`,
        width: `${geometry.from.width}px`,
        height: `${geometry.from.height}px`,
      });
      const fan = (index - (flights.length - 1) / 2) * 4;
      const animation = scene.animate(flight, [
        { opacity: 1, transform: 'translate(0, 0) scale(1) rotate(0deg)' },
        { opacity: 1, transform: `translate(${fan}px, -10px) scale(.98) rotate(${fan}deg)`, offset: 0.2 },
        {
          opacity: 1,
          transform: `translate(${geometry.x}px, ${geometry.y}px) scale(${geometry.scale}) rotate(0deg)`,
          offset: 0.9,
        },
        {
          opacity: 0,
          transform: `translate(${geometry.x}px, ${geometry.y}px) scale(${geometry.scale}) rotate(0deg)`,
        },
      ], {
        duration,
        delay: index * stagger,
        easing,
        fill: 'both',
      });
      if (animation) animations.push(animation);
    });
    if (animations.length !== discardingIds.length) {
      animations.forEach((animation) => animation.cancel());
      return scene.nextFrame(onDiscardComplete);
    }
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (!cancelled) onDiscardComplete();
    });
    return () => { cancelled = true; };
  });

  const visibleCount = deployment?.stage === 'awaiting-deal' || deployment?.stage === 'dealing'
    ? dealProgress
    : remainingIds.length;
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
      {deployment?.stage === 'discarding' && discardingIds.length ? (
        <SceneContinuityPortal contribution={{ kind: 'shared-element', id: `deployment-discard:${run.id}:${discardKey}` }}>
          <div className="run-deployment-discard-flights">
            {discardingIds.map((cardId) => {
              const owned = cardById.get(cardId);
              const identity = owned ? runCardDefinition(owned.coreId) ?? null : null;
              const presentation = owned ? deploymentCardPresentation(run, owned, deployment.unitCursor) : null;
              const faceUp = cardId === activeCardId && activeRevealed;
              return (
                <div
                  className="run-deployment-discard-flight"
                  data-deployment-discard-flight-card={cardId}
                  key={cardId}
                >
                  {faceUp && owned && identity && presentation ? (
                    <RunCard
                      card={presentation.definition}
                      identityCard={identity}
                      mode="reference"
                      cardType={owned.cardType}
                      adlected
                      emptyPieceIndices={presentation.emptyPieceIndices}
                    />
                  ) : (
                    <RunCardBack mediaUrl={resolvedLiveMediaUrl(RUN_CARD_BACK_SLOT)} />
                  )}
                </div>
              );
            })}
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
          const absoluteIndex = (deployment?.discardCursor ?? 0) + index;
          const discarding = deploymentCardIsDiscarding(deployment, absoluteIndex, isActive);
          return (
            <div
              className={`run-deployment-stack-card${index < dealProgress ? ' is-dealt' : ''}${isActive ? ' is-active' : ''}${
                isActive && activeRevealed ? ' is-revealed' : ''
              }${isActive && deployment?.stage === 'revealing' ? ' is-revealing' : ''}${
                discarding ? ' is-discarding' : ''
              }`}
              data-deployment-stack-card={cardId}
              style={{
                '--deployment-card-depth': index,
                zIndex: isActive ? remainingIds.length + 1 : remainingIds.length - index,
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
                    emptyPieceIndices={activePresentation?.emptyPieceIndices ?? []}
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
