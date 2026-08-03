// The Chartulary — the cards a Run currently HOLDS, as opposed to the Enchiridion's
// reference gallery of every card the deck can deal.
//
// It is deliberately the same gallery: the same filter row, the same gold-value groups,
// the same real card faces at the same size (ADR-0368). What a held card adds is its
// register entry — the units it actually put in the army and what has become of them —
// so the page answers "what did I buy, and what is left of it" without becoming a second
// army roster.

import { useMemo, useState, type ReactElement } from 'react';
import {
  RUN_CARD_BY_ID,
  type RunArmyUnit,
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
import { RunUnitTraitList, runUnitRosterLabel } from './RunArmyWorkspace';
import { InnerChromeBox } from './shared/ChromeBox';
import { RunCardCostCoin } from './shared/RunCardCostCoin';

interface HeldCard {
  owned: RunOwnedCard;
  core: RunCoreCard;
  units: RunArmyUnit[];
}

/**
 * The held cards this page can show. A card whose core id is no longer in the deck is
 * dropped rather than drawn as a blank face — the register shows real cards or nothing.
 */
export function heldCards(run: RunDocument): HeldCard[] {
  const armyById = new Map(run.army.map((unit) => [unit.id, unit]));
  return run.cards.flatMap((owned) => {
    const core = RUN_CARD_BY_ID[owned.coreId];
    if (!core) return [];
    return [{
      owned,
      core,
      units: owned.unitIds.flatMap((id) => {
        const unit = armyById.get(id);
        return unit ? [unit] : [];
      }),
    }];
  });
}

function HeldCardRegister({ run, held }: { run: RunDocument; held: HeldCard }): ReactElement {
  // Counted against the card's own pieces, not `lostUnitIds` — that field records only
  // Pestiferous attrition, so a sold unit would go unreported by it.
  const total = held.core.pieces.length;
  const departed = total - held.units.length;
  if (!held.units.length) {
    return (
      <InnerChromeBox className="strategikon-chartulary-register">
        <small className="strategikon-chartulary-spent">
          {total === 1 ? 'Its one unit has left the army.' : `All ${total} of its units have left the army.`}
        </small>
      </InnerChromeBox>
    );
  }
  return (
    <InnerChromeBox className="strategikon-chartulary-register">
      <ul className="strategikon-chartulary-units">
        {held.units.map((unit) => (
          <li className="strategikon-chartulary-unit" key={unit.id}>
            <span className="strategikon-chartulary-unit-name">{runUnitRosterLabel(unit)}</span>
            <RunUnitTraitList run={run} unit={unit} compact />
          </li>
        ))}
      </ul>
      {departed ? (
        <small className="strategikon-chartulary-departed">
          {departed} more {departed === 1 ? 'has' : 'have'} left the army.
        </small>
      ) : null}
    </InnerChromeBox>
  );
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
      <p>Every card bought in this Run, with the units it put in the army. Cards are kept once bought; the units on them can still be lost or sold.</p>
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
                      className="enchiridion-card-gallery-item strategikon-chartulary-item"
                      role="listitem"
                      data-card-id={held.owned.id}
                      key={held.owned.id}
                    >
                      <RunCard card={held.core} mode="reference" cardType={held.owned.cardType} />
                      <HeldCardRegister run={run} held={held} />
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
