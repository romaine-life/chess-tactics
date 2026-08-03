// The Chartulary — the cards a Run currently HOLDS, as opposed to the Enchiridion's
// reference gallery of every card the deck can deal.
//
// It is the same gallery, and nothing more: the same filter row, the same gold-value groups,
// the same real card faces at the same size. ADR-0364 retired the descriptive rows that used to
// sit beside those faces because a card IS its own record; a held card is the same record and
// gains no annotation here. What this page adds over the reference is which cards are yours.

import { useMemo, useState, type ReactElement } from 'react';
import {
  RUN_CARD_BY_ID,
  type RunCoreCard,
  type RunDocument,
  type RunOwnedCard,
} from '../run/model';
import {
  cardMatchesFilters,
  cardsByGoldValue,
  CardGalleryFilters,
  ReferenceSectionFrame,
  type CardGoldFilter,
  type CardUnitFilter,
} from './Enchiridion';
import { KitScroll } from './KitScroll';
import { RunCard } from './RunCard';
import { InnerChromeBox } from './shared/ChromeBox';
import { RunCardCostCoin } from './shared/RunCardCostCoin';

interface HeldCard {
  owned: RunOwnedCard;
  core: RunCoreCard;
}

/**
 * The held cards this page can show. A card whose core id is no longer in the deck is
 * dropped rather than drawn as a blank face — the gallery shows real cards or nothing.
 */
export function heldCards(run: RunDocument): HeldCard[] {
  return run.cards.flatMap((owned) => {
    const core = RUN_CARD_BY_ID[owned.coreId];
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
  const all = useMemo(() => heldCards(run), [run]);
  const visible = useMemo(
    () => all.filter((held) => cardMatchesFilters(held.core, goldFilter, unitFilter)),
    [all, goldFilter, unitFilter],
  );
  const groups = useMemo(() => cardsByGoldValue(visible, (held) => held.core), [visible]);
  return (
    <ReferenceSectionFrame
      chromeConsumer="strategikon-chartulary"
      className="enchiridion-card-panel strategikon-chartulary-panel"
      framed={framed}
      title={title}
    >
      <p>Every card bought in this Run. A card is kept once bought; the units it brought are in the Martial Prosopography.</p>
      <div className="enchiridion-card-gallery-layout">
        <CardGalleryFilters
          goldFilter={goldFilter}
          unitFilter={unitFilter}
          onGoldFilterChange={setGoldFilter}
          onUnitFilterChange={setUnitFilter}
          count={visible.length}
          testIdPrefix="strategikon-chartulary"
        />
        <KitScroll className="enchiridion-card-gallery-scroll">
          <div
            className="enchiridion-card-gallery-browser"
            role="list"
            aria-label="Held cards by gold value"
          >
            {groups.map(([value, cards]) => (
              <section className="enchiridion-card-gallery-group" key={value} aria-label={`${value} gold cards`}>
                <h3 className="enchiridion-card-gallery-heading">
                  <RunCardCostCoin value={value} className="enchiridion-card-group-gold" />
                </h3>
                <div className="enchiridion-card-gallery-grid">
                  {cards.map((held) => (
                    <div
                      className="enchiridion-card-gallery-item"
                      role="listitem"
                      data-card-id={held.owned.id}
                      key={held.owned.id}
                    >
                      <RunCard card={held.core} mode="reference" cardType={held.owned.cardType} />
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
                    ? 'No held card has both of the selected properties.'
                    : 'Nothing has been bought yet. Cards bought in the Shop are kept here for the rest of the Run.'}
                </p>
              </InnerChromeBox>
            ) : null}
          </div>
        </KitScroll>
      </div>
    </ReferenceSectionFrame>
  );
}
