// The Chartulary — the cards a Run currently HOLDS, as opposed to the Enchiridion's
// reference gallery of every card the deck can deal.
//
// It is the same gallery, and nothing more: the same filter row, the same gold-value groups,
// the same real card faces at the same size. ADR-0364 retired the descriptive rows that used to
// sit beside those faces because a card IS its own record; a held card is the same record and
// gains no annotation here. What this page adds over the reference is which cards are yours.

import { useMemo, useState, type ReactElement } from 'react';
import {
  runCardDefinition,
  type RunCardDefinition,
  type RunDocument,
  type RunOwnedCard,
} from '../run/model';
import {
  cardMatchesFilters,
  cardsByTier,
  CardGalleryFilters,
  ReferenceSectionFrame,
  type CardGoldFilter,
  type CardRarityFilter,
  type CardUnitFilter,
} from './Enchiridion';
import { KitScroll } from './KitScroll';
import { RunCard } from './RunCard';
import { InnerChromeBox } from './shared/ChromeBox';
import {
  RunCardGoldTierDivider,
  runCardTierLabel,
  useRunCardGoldTierDividerSource,
} from './shared/RunCardGoldTierDivider';
import { ChromeButton } from './shared/ChromeButton';
import { chromeUnitClassNames } from './chromeUnitRegistry';

interface HeldCard {
  owned: RunOwnedCard;
  core: RunCardDefinition;
}

/**
 * The held cards this page can show. A card whose core id is no longer in the deck is
 * dropped rather than drawn as a blank face — the gallery shows real cards or nothing.
 */
export function heldCards(run: RunDocument): HeldCard[] {
  return run.cards.flatMap((owned) => {
    const core = runCardDefinition(owned.coreId);
    return core ? [{ owned, core }] : [];
  });
}

export function HeldCardCodex({
  run,
  title = 'The Chartulary',
  framed = true,
}: {
  run: RunDocument;
  title?: string;
  framed?: boolean;
}): ReactElement {
  const [goldFilter, setGoldFilter] = useState<CardGoldFilter>('all');
  const [unitFilter, setUnitFilter] = useState<CardUnitFilter>('all');
  const [rarityFilter, setRarityFilter] = useState<CardRarityFilter>('all');
  // Opened while arranging, the Chartulary IS the view of this Battle's dealt hand — the
  // arranging panel shows one card at a time, so this is where the whole hand, reserves
  // included, is read. It opens narrowed to that hand; the toggle still widens it to the
  // full Chartulary, and outside Deployment it opens wide as before.
  const [thisCombatOnly, setThisCombatOnly] = useState(
    run.phase === 'deployment' && (run.deployment?.dealtCardIds?.length ?? 0) > 0,
  );
  const goldTierDividerSource = useRunCardGoldTierDividerSource();
  const all = useMemo(() => heldCards(run), [run]);
  const thisCombatAvailable = Boolean(
    run.deployment && (run.phase === 'deployment' || run.phase === 'battle'),
  );
  const dealt = useMemo(() => new Set(run.deployment?.dealtCardIds ?? []), [run.deployment?.dealtCardIds]);
  const visible = useMemo(
    () => all.filter((held) => (
      cardMatchesFilters(held.core, goldFilter, unitFilter, rarityFilter)
      && (!thisCombatOnly || !thisCombatAvailable || dealt.has(held.owned.id))
    )),
    [all, dealt, goldFilter, rarityFilter, thisCombatAvailable, thisCombatOnly, unitFilter],
  );
  const groups = useMemo(() => cardsByTier(visible, (held) => held.core), [visible]);
  return (
    <ReferenceSectionFrame
      chromeConsumer="strategikon-chartulary"
      className="enchiridion-card-panel strategikon-chartulary-panel"
      framed={framed}
      title={title}
    >
      <p>Every card held in this Run. Starter cards and cards admitted by Adlectio retain the units still attached to them.</p>
      <div className="enchiridion-card-gallery-layout">
        <CardGalleryFilters
          goldFilter={goldFilter}
          unitFilter={unitFilter}
          rarityFilter={rarityFilter}
          onGoldFilterChange={setGoldFilter}
          onUnitFilterChange={setUnitFilter}
          onRarityFilterChange={setRarityFilter}
          count={visible.length}
          testIdPrefix="strategikon-chartulary"
        />
        {thisCombatAvailable ? (
          <ChromeButton
            unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'app-header-button', thisCombatOnly && 'active')}
            aria-pressed={thisCombatOnly}
            onClick={() => setThisCombatOnly((value) => !value)}
          >
            This Combat
          </ChromeButton>
        ) : null}
        <KitScroll className="enchiridion-card-gallery-scroll">
          <div
            className="enchiridion-card-gallery-browser"
            role="list"
            aria-label="Held cards by tier"
          >
            {groups.map(([value, cards]) => (
              <section className="enchiridion-card-gallery-group" key={value} aria-label={runCardTierLabel(value)}>
                <h3 className="enchiridion-card-gallery-heading">
                  <RunCardGoldTierDivider value={value} source={goldTierDividerSource} />
                </h3>
                <div className="enchiridion-card-gallery-grid">
                  {cards.map((held) => (
                    <div
                      className="enchiridion-card-gallery-item"
                      role="listitem"
                      data-card-id={held.owned.id}
                      key={held.owned.id}
                    >
                      <RunCard card={held.core} mode="reference" />
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {!groups.length ? (
              <InnerChromeBox className="enchiridion-empty">
                <h3>{all.length ? 'No matching cards' : 'No cards held'}</h3>
                <p>
                  {all.length
                    ? 'No held card has all of the selected properties.'
                    : 'No cards are held.'}
                </p>
              </InnerChromeBox>
            ) : null}
          </div>
        </KitScroll>
      </div>
    </ReferenceSectionFrame>
  );
}
