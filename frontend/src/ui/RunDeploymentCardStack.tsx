import { useRef, type CSSProperties, type ReactElement } from 'react';
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
import { RunCardBack, useRunCardBackMediaUrl } from './RunCardBack';
import { RunCardRow } from './RunCardRow';
import { runCardFlightGeometry, runCardMotionDurationMs } from './runCardFlightView';
import { useSceneEnteredAction } from './shell/SceneActivity';
import { SceneContinuityPortal } from './shell/SceneContinuity';
import { ChromeButton } from './shared/ChromeButton';
import { Toggle } from './shared/Toggle';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { emptyRunCardPieceIndices, projectRunCardUnitSeats } from './runCardUnitProjection';

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
  return emptyRunCardPieceIndices(
    pieces,
    projectRunCardUnitSeats(pieces, unitSeats, unitTypeById),
    fromSeat,
  );
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

/**
 * The complete face-down Chartulary deck before its combat partition is committed, and the table
 * the drawn hand is laid out on.
 *
 * The draw is read here, in the middle of the board, before anything is asked of the player: the
 * cards leave the deck face UP into a spread, the rest of the deck is swept back to the
 * Chartulary, and only after a beat does the hand gather into the Controls panel to be placed.
 * The spread seats are laid out by the shared card row every other Run table uses, so the hand is
 * presented at the size that row gives it rather than at one invented here.
 */
export function RunDeploymentDeckDeal({
  run,
  dealtCount,
  onBeginDeal,
  disabled = false,
}: {
  run: RunDocument;
  dealtCount: number;
  onBeginDeal: () => void;
  disabled?: boolean;
}): ReactElement | null {
  const deployment = run.deployment;
  const settings = useAppSettings();
  const backMediaUrl = useRunCardBackMediaUrl();
  const visible = deployment?.stage === 'awaiting-deal' || deployment?.stage === 'dealing';
  const awaiting = deployment?.stage === 'awaiting-deal';
  const centerCount = Math.max(0, run.cards.length - dealtCount);
  const visibleDeckLayers = Math.min(3, Math.max(1, centerCount));
  // What pressing it actually does. The Battle's allowance is `3 + conflictIndex`, but a hand
  // shorter than that draws every card there is, so the allowance would be a promise the deck
  // cannot keep — the dealt list is the honest count.
  const drawIds = deployment?.dealtCardIds ?? [];

  useSceneEnteredAction(
    `deployment-auto-deal:${run.id}:${deployment?.battleIndex ?? 'none'}`,
    Boolean(awaiting && !disabled && settings.autoDealDeployment),
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
              <RunCardBack mediaUrl={backMediaUrl} />
            </span>
          );
        })}
        <strong className="run-deployment-center-count" aria-live="polite">{centerCount}</strong>
      </div>
      {/* Seats only. The drawn cards themselves are the flight elements, which come to rest on
          these boxes and then carry on to Controls, so the hand is never handed between two sets
          of elements mid-motion. */}
      {deployment?.stage === 'dealing' && drawIds.length ? (
        <div className="run-deployment-spread" data-deployment-spread="">
          <RunCardRow count={drawIds.length} testId="deployment-spread-row">
            {drawIds.map((cardId) => (
              <div className="run-deployment-spread-seat" data-deployment-spread-seat={cardId} key={cardId} />
            ))}
          </RunCardRow>
        </div>
      ) : null}
      {/* The actions go quiet once the draw begins — the spread is the feedback, and a dead
          button under it only competes with the thing the player is meant to be reading. They
          are HIDDEN rather than unmounted: the deck is the flight's source rect, so anything
          that re-centres the column between the press and the first card moves the deck out
          from under the cards leaving it. */}
      <div
        className={`run-deployment-deal-actions${awaiting ? '' : ' is-spent'}`}
        aria-hidden={awaiting ? undefined : true}
      >
        <ChromeButton
          unit="inner-text-button"
          data-testid="deployment-deal"
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
          disabled={!awaiting || disabled}
          onClick={onBeginDeal}
        >
          {disabled
            ? 'Withdrawing…'
            : `Draw ${drawIds.length} card${drawIds.length === 1 ? '' : 's'}`}
        </ChromeButton>
        {!settings.autoDealDeployment ? (
          <div className="run-deployment-auto-deal">
            <span>Draw automatically</span>
            <Toggle
              checked={false}
              label="Draw Deployment cards automatically"
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
 *
 * It renders into the arranging card's PINNED seat, not into the scrolling rail, and its pile is
 * that card's box exactly. The deal reads its target rect off this element, so any difference
 * between the two is a jump the player sees the moment dealing finishes.
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
  const backMediaUrl = useRunCardBackMediaUrl();
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
    // Indexed off the same list the flights and the stack cards are rendered from, so leg one's
    // target, leg two's origin and leg two's target are always the same card.
    const seats = remainingIds.map((cardId) => (
      document.querySelector<HTMLElement>(`[data-deployment-spread-seat="${CSS.escape(cardId)}"]`)
    ));
    const remainderFlight = document.querySelector<HTMLElement>('[data-deployment-remainder-flight]');
    if (
      cards.length !== (deployment?.dealtCardIds.length ?? 0)
      || flights.length !== cards.length
      || seats.some((seat) => !seat)
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
    // The pause that makes the spread readable: the hand is dealt TO the player, and a hand that
    // gathers the instant it lands was never shown to anybody.
    const beat = runCardMotionDurationMs(style.getPropertyValue('--deployment-spread-beat')) ?? 520;
    const gather = runCardMotionDurationMs(style.getPropertyValue('--deployment-gather-duration')) ?? 520;
    const gatherStagger = runCardMotionDurationMs(style.getPropertyValue('--deployment-gather-stagger')) ?? 64;
    const easing = style.getPropertyValue('--ds-ease-out').trim() || 'ease-out';
    const easeInOut = style.getPropertyValue('--ds-ease-in-out').trim() || easing;
    const animations: Animation[] = [];
    let cancelled = false;
    onDealProgress(0);

    // Every flight is positioned on the deck and moves by transform alone, so both legs of the
    // journey are expressed against the same base box and the second starts exactly where the
    // first came to rest.
    const restingOn = (rect: DOMRect): string => {
      const scale = Math.min(rect.width / sourceRect.width, rect.height / sourceRect.height);
      const dx = rect.left + rect.width / 2 - sourceRect.left - sourceRect.width / 2;
      const dy = rect.top + rect.height / 2 - sourceRect.top - sourceRect.height / 2;
      return `translate(${dx}px, ${dy}px) scale(${scale})`;
    };

    flights.forEach((flight, index) => {
      Object.assign(flight.style, {
        left: `${sourceRect.left}px`,
        top: `${sourceRect.top}px`,
        width: `${sourceRect.width}px`,
        height: `${sourceRect.height}px`,
      });
      const laid = restingOn(seats[index]!.getBoundingClientRect());
      // Leg one: out of the deck onto the table, face up, in a pour.
      const deal = scene.animate(flight, [
        { opacity: 0, transform: 'translate(0, 0) scale(1)' },
        { opacity: 1, offset: 0.08 },
        { opacity: 1, transform: laid },
      ], { duration, delay: index * stagger, easing, fill: 'both' });
      if (deal) animations.push(deal);
      // Leg two: after the beat, the whole hand gathers into the Controls seat together.
      const gathered = restingOn(cards[index].getBoundingClientRect());
      const collect = scene.animate(flight, [
        { transform: laid },
        { transform: gathered },
      ], {
        duration: gather,
        delay: (flights.length - 1) * stagger + duration + beat + index * gatherStagger,
        easing: easeInOut,
        // FORWARDS only. `both` would back-fill `laid` from time zero, and because this is the
        // later animation on the element it outranks leg one for the whole of the draw — every
        // card would be sitting on its seat before it had left the deck.
        fill: 'forwards',
      });
      if (!collect) return;
      animations.push(collect);
      void collect.finished.then(() => {
        if (!cancelled) onDealProgress(index + 1);
      }).catch(() => undefined);
    });

    // The rest of the deck goes back to the Chartulary face down while the hand is still being
    // laid out — it is the deck leaving, not part of what the player is being shown.
    const undealtCount = Math.max(0, run.cards.length - cards.length);
    const deckLeavesAt = flights.length * stagger;
    if (undealtCount > 0 && chartulary) {
      Object.assign(remainderFlight.style, {
        left: `${sourceRect.left}px`,
        top: `${sourceRect.top}px`,
        width: `${sourceRect.width}px`,
        height: `${sourceRect.height}px`,
      });
      const remainder = scene.animate(remainderFlight, [
        { opacity: 0, transform: 'translate(0, 0) scale(1)' },
        { opacity: 1, offset: 0.08 },
        { opacity: 1, transform: restingOn(chartulary.getBoundingClientRect()) },
      ], { duration, delay: deckLeavesAt, easing, fill: 'both' });
      if (remainder) animations.push(remainder);
      const sourceFade = scene.animate(source, [{ opacity: 1 }, { opacity: 0 }], {
        duration: 1,
        delay: deckLeavesAt,
        fill: 'both',
      });
      if (sourceFade) animations.push(sourceFade);
    } else {
      const remainder = scene.animate(source, [{ opacity: 1 }, { opacity: 0 }], {
        duration: Math.max(160, Math.round(duration * 0.5)),
        delay: deckLeavesAt,
        easing,
        fill: 'both',
      });
      if (remainder) animations.push(remainder);
    }

    const expectedAnimationCount = cards.length * 2 + 1 + (undealtCount > 0 && chartulary ? 1 : 0);
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
            {/* Face UP. These are the player's own cards being dealt to them; turning them over
                afterwards would be a second ceremony for information they were owed on arrival.
                Only the deck's remainder below stays face down — that one is leaving. */}
            {remainingIds.map((cardId) => {
              const owned = cardById.get(cardId);
              const identity = owned ? runCardDefinition(owned.coreId) ?? null : null;
              const presentation = owned
                ? deploymentCardPresentation(run, owned, deployment?.unitCursor ?? 0)
                : null;
              return (
                <div className="run-deployment-deal-flight" data-deployment-flight-card={cardId} key={cardId}>
                  {identity && presentation ? (
                    <RunCard
                      card={presentation.definition}
                      identityCard={identity}
                      mode="reference"
                      emptyPieceIndices={presentation.emptyPieceIndices}
                    />
                  ) : (
                    <RunCardBack mediaUrl={backMediaUrl} />
                  )}
                </div>
              );
            })}
            <div className="run-deployment-deal-flight is-remainder" data-deployment-remainder-flight="">
              <RunCardBack mediaUrl={backMediaUrl} />
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
                      emptyPieceIndices={presentation.emptyPieceIndices}
                    />
                  ) : (
                    <RunCardBack mediaUrl={backMediaUrl} />
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
      {/* No eyebrow. This pile is the seat the arranging card takes over the instant the deal
          lands, so it must be that card's box exactly — a label above it would push the landing
          down by its own height and the dealt card would jump the moment it arrived. */}
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
                <RunCardBack mediaUrl={backMediaUrl} />
              </span>
              {isActive && owned && activeDefinition && activeIdentity ? (
                <span className="run-deployment-stack-side is-front">
                  <RunCard
                    card={activeDefinition}
                    identityCard={activeIdentity}
                    mode="reference"
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
