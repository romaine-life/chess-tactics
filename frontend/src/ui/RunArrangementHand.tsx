import type { ReactElement } from 'react';
import { runCardDefinition, type RunDocument } from '../run/model';
import type { RunArrangedCardSummary } from '../run/deployment';
import { RunCard } from './RunCard';
import { ChromeButton } from './shared/ChromeButton';

export function RunArrangementHand({
  run,
  cards,
  selectedCardId,
  onSelect,
}: {
  run: RunDocument;
  cards: readonly RunArrangedCardSummary[];
  selectedCardId: string | null;
  onSelect: (cardId: string) => void;
}): ReactElement {
  return (
    <section className="run-arrangement-hand" aria-label="Dealt formation cards">
      <span className="skirmish-eyebrow">Dealt formations</span>
      <div className="run-arrangement-hand-cards">
        {cards.map(({ card, admitted, placed }) => {
          const definition = runCardDefinition(card.coreId);
          if (!definition) return null;
          const selected = selectedCardId === card.id;
          return (
            <ChromeButton
              unit="inner-box"
              className={`run-arrangement-card${placed ? ' is-placed' : ''}${!admitted ? ' is-reserve' : ''}`}
              selected={selected}
              disabled={!admitted}
              onClick={() => onSelect(card.id)}
              key={card.id}
            >
              <RunCard card={definition} identityCard={definition} mode="reference" />
              <span className="run-arrangement-card-state">
                {!admitted ? 'Reserve' : placed ? 'Placed' : 'Place'}
              </span>
            </ChromeButton>
          );
        })}
      </div>
      <p className="skirmish-grid-hint">Select cards in any order. Reserve cards exceeded this Battle's capacity.</p>
    </section>
  );
}
