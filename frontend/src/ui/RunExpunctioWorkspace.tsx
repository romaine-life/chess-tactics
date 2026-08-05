import type { CSSProperties, ReactElement } from 'react';
import {
  PIECE_LABEL,
  cardExpunctioPriceTenths,
  runCardDefinition,
  runCardUnitIds,
  type RunArmyUnit,
  type RunDocument,
  type RunOwnedCard,
} from '../run/model';
import { runCardName } from '../run/cardNames';
import { KitScroll } from './KitScroll';
import { RunCard } from './RunCard';
import { RunGoldAmount } from './RunResources';
import { RunSceneViewport } from './RunWorkspace';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ChromeButton } from './shared/ChromeButton';
import { InnerChromeBox } from './shared/ChromeBox';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';

type ExpunctioRow = Readonly<{
  card: RunOwnedCard;
  units: RunArmyUnit[];
  priceTenths: number | null;
  status: 'available' | 'unavailable' | 'unaffordable' | 'spent' | 'expuncted';
}>;

function attachedUnits(run: RunDocument, card: RunOwnedCard): RunArmyUnit[] {
  const byId = new Map(run.army.map((unit) => [unit.id, unit]));
  return runCardUnitIds(card).flatMap((unitId) => {
    const unit = byId.get(unitId);
    return unit ? [unit] : [];
  });
}

function expunctioRows(run: RunDocument): ExpunctioRow[] {
  const spent = run.sectio?.expunctedCard ?? null;
  const current = run.cards.flatMap((card): ExpunctioRow[] => {
    const definition = runCardDefinition(card.coreId);
    if (!definition) return [];
    const units = attachedUnits(run, card);
    const priceTenths = cardExpunctioPriceTenths(card, units);
    const removable = !('removable' in definition) || definition.removable;
    const status: ExpunctioRow['status'] = !removable
      ? 'unavailable'
      : spent
        ? 'spent'
        : priceTenths === null || run.goldTenths < priceTenths
          ? 'unaffordable'
          : 'available';
    return [{ card, units, priceTenths, status }];
  });
  return spent
    ? [{
        card: spent.card,
        units: spent.units,
        priceTenths: spent.priceTenths,
        status: 'expuncted',
      }, ...current]
    : current;
}

function unitList(units: readonly RunArmyUnit[]): string {
  return units.length
    ? units.map((unit) => `${unit.name} · ${PIECE_LABEL[unit.type]}`).join(', ')
    : 'No units remain attached.';
}

function actionLabel(status: ExpunctioRow['status']): string {
  if (status === 'available') return 'Expunctio';
  if (status === 'expuncted') return 'Expuncted this visit';
  if (status === 'spent') return 'Already used';
  if (status === 'unaffordable') return 'Insufficient gold';
  return 'Unavailable';
}

export function RunExpunctioWorkspace({
  run,
  onExpunct,
}: {
  run: RunDocument;
  onExpunct: (cardId: string) => void;
}): ReactElement {
  const rows = expunctioRows(run);
  return (
    <RunSceneViewport
      scene={{
        view: 'expunctio',
        className: 'run-expunctio-workspace',
        contentClassName: 'run-expunctio-workspace-content',
        testId: 'run-expunctio-workspace',
        ariaLabelledBy: 'run-expunctio-workspace-title',
      }}
    >
      <h2 id="run-expunctio-workspace-title">Expunctio</h2>
      <p>Strike one card from the Chartulary this Sectio. Every unit still attached to it leaves too.</p>
      <p className="run-expunctio-rule">
        Fee = printed card value + remaining unit value. Reset Sectio restores the complete visit.
      </p>
      <KitScroll className="run-sectio-operation-list-scroll">
        <div className="run-sectio-operation-list run-expunctio-list" aria-label="Cards available for Expunctio">
          {rows.map(({ card, units, priceTenths, status }, index) => {
            const definition = runCardDefinition(card.coreId)!;
            return (
              <InnerChromeBox
                className={`run-expunctio-row is-${status}`}
                data-chrome-fill-surface="baseline-stone-blue"
                key={`${status}:${card.id}`}
                style={{ ['--run-operation-row-index' as string]: index } as CSSProperties}
              >
                <span className="run-expunctio-card">
                  <RunCard
                    card={definition}
                    cardType={card.cardType}
                    adlected
                    mode="reference"
                  />
                </span>
                <span className="run-expunctio-copy">
                  <strong>{runCardName(definition)}</strong>
                  <small>{status === 'expuncted'
                    ? 'Removed with card'
                    : status === 'unavailable' ? 'Not subject to Expunctio' : 'Attached units'}</small>
                  <span>{unitList(units)}</span>
                </span>
                <span className="run-expunctio-price">
                  <small>{status === 'expuncted' ? 'Paid' : 'Expunctio fee'}</small>
                  {priceTenths === null ? <strong>Unavailable</strong> : <RunGoldAmount valueTenths={priceTenths} />}
                </span>
                <ChromeButton
                  unit="inner-text-button"
                  data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                  data-ui-sfx={status === 'available' ? 'gold' : undefined}
                  className={chromeUnitClassNames(
                    'inner-text-button',
                    'app-header-button',
                    status === 'available' && 'danger',
                  )}
                  disabled={status !== 'available'}
                  onClick={() => onExpunct(card.id)}
                >
                  {actionLabel(status)}
                </ChromeButton>
              </InnerChromeBox>
            );
          })}
        </div>
      </KitScroll>
    </RunSceneViewport>
  );
}
