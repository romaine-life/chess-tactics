import type { ReactElement, ReactNode } from 'react';
import { RUN_RELIC_BY_ID, type RunRelicId } from '../run/model';
import { InnerChromeBox } from './shared/ChromeBox';
import { RunRelicIcon } from './RunRelics';

/**
 * The relic offer's visible anatomy: installed icon, name, and literal effect text.
 *
 * The Shop's offer and any review surface that has to judge art *behind* a relic row
 * must show the same card, or the review is judging something the player never sees.
 * Everything interactive -- the acquire button, a relic's target picker -- is passed in
 * as children by the host, so this component needs no Run document and can be mounted
 * anywhere the art has to be looked at.
 */
export function RunRelicOfferCard({
  relicId,
  children,
}: {
  relicId: RunRelicId;
  children?: ReactNode;
}): ReactElement {
  const relic = RUN_RELIC_BY_ID[relicId];
  return (
    <InnerChromeBox className="run-card run-relic-card">
      <header className="run-relic-card-heading">
        <RunRelicIcon relicId={relicId} />
        <h3>{relic.name}</h3>
      </header>
      <p>{relic.description}</p>
      {children}
    </InnerChromeBox>
  );
}
