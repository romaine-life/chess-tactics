import type { CSSProperties, ReactElement } from 'react';
import {
  cardExpunctioPriceTenths,
  runCardDefinition,
  type RunArmyUnit,
  type RunCardDefinition,
  type RunDocument,
  type RunOwnedCard,
} from '../run/model';
import { runCardName } from '../run/cardNames';
import { KitScroll } from './KitScroll';
import { RunCard } from './RunCard';
import { runCardFrameSlot } from './runCardFaceContent';
import { runCardFrameGeometryForSlot, runCardFramePaintInsetRatios } from './runCardFrameGeometry';
import { emptyRunCardPieceIndices, projectRunCardUnitSeats } from './runCardUnitProjection';
import { RunGoldTransactionAmount } from './RunResources';
import { RunSceneViewport } from './RunWorkspace';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ChromeButton } from './shared/ChromeButton';
import { RunActionIcon } from './shared/RunActionIcon';
import { InnerChromeBox } from './shared/ChromeBox';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';

type ExpunctioRow = Readonly<{
  card: RunOwnedCard;
  definition: RunCardDefinition;
  units: readonly RunArmyUnit[];
  emptyPieceIndices: readonly number[];
  priceTenths: number | null;
  status: 'available' | 'unavailable' | 'unaffordable' | 'spent' | 'expuncted';
}>;

function cardUnitProjection(
  card: RunOwnedCard,
  definition: RunCardDefinition,
  inventory: readonly RunArmyUnit[],
): Pick<ExpunctioRow, 'units' | 'emptyPieceIndices'> {
  const unitsById = new Map(inventory.map((unit) => [unit.id, unit]));
  const unitTypeById = new Map(inventory.map((unit) => [unit.id, unit.type]));
  const projection = projectRunCardUnitSeats(definition.pieces, card.unitSeats, unitTypeById);
  return {
    units: projection.flatMap(({ unitId }) => {
      const unit = unitsById.get(unitId);
      return unit ? [unit] : [];
    }),
    emptyPieceIndices: emptyRunCardPieceIndices(definition.pieces, projection),
  };
}

function expunctioRows(run: RunDocument): ExpunctioRow[] {
  const spent = run.sectio?.expunctedCard ?? null;
  const current = run.cards.flatMap((card): ExpunctioRow[] => {
    const definition = runCardDefinition(card.coreId);
    if (!definition) return [];
    const projection = cardUnitProjection(card, definition, run.army);
    const priceTenths = cardExpunctioPriceTenths(card, projection.units);
    const removable = !('removable' in definition) || definition.removable;
    const status: ExpunctioRow['status'] = !removable
      ? 'unavailable'
      : spent
        ? 'spent'
        : priceTenths === null || run.goldTenths < priceTenths
          ? 'unaffordable'
          : 'available';
    return [{ card, definition, ...projection, priceTenths, status }];
  });
  if (!spent) return current;
  const definition = runCardDefinition(spent.card.coreId);
  return definition
    ? [{
        card: spent.card,
        definition,
        ...cardUnitProjection(spent.card, definition, spent.units),
        priceTenths: spent.priceTenths,
        status: 'expuncted',
      }, ...current]
    : current;
}

function actionLabel(status: ExpunctioRow['status']): string {
  if (status === 'available') return 'Athetize';
  if (status === 'expuncted') return 'Athetized this visit';
  if (status === 'spent') return 'Already used';
  if (status === 'unaffordable') return 'Insufficient gold';
  return 'Unavailable';
}

function formationStatusLabel(status: ExpunctioRow['status'], units: readonly RunArmyUnit[]): string {
  if (status === 'expuncted') return 'Formation removed';
  if (status === 'unavailable') return 'Permanently retained';
  return `${units.length} attached unit${units.length === 1 ? '' : 's'}`;
}

function ExpunctioCardTile({
  row,
  index,
  onExpunct,
}: {
  row: ExpunctioRow;
  index: number;
  onExpunct: (cardId: string) => void;
}): ReactElement {
  const { card, definition, units, emptyPieceIndices, priceTenths, status } = row;
  const paintInsets = runCardFramePaintInsetRatios(runCardFrameGeometryForSlot(runCardFrameSlot(definition)));
  return (
    <InnerChromeBox
      className={`run-expunctio-row is-${status}`}
      fillRole="outer"
      style={{
        ['--run-operation-row-index' as string]: index,
        '--run-expunctio-card-paint-start-ratio': paintInsets.blockStart,
        '--run-expunctio-card-paint-end-ratio': paintInsets.blockEnd,
      } as CSSProperties}
    >
      <span className="run-expunctio-card">
        <RunCard
          card={definition}
          mode="reference"
          emptyPieceIndices={status === 'expuncted' ? [] : emptyPieceIndices}
        />
      </span>
      <span className="run-expunctio-companion">
        <span className="run-expunctio-copy">
          <small>{formationStatusLabel(status, units)}</small>
          <strong>{runCardName(definition)}</strong>
          <span>{status === 'expuncted'
            ? 'The card and all of its units left together.'
            : 'Athetize removes this card and every attached unit as one formation.'}</span>
        </span>
        <span className="run-expunctio-price">
          <small>{status === 'expuncted' ? 'Paid' : 'Expunctio fee'}</small>
          {priceTenths === null
            ? <strong>Unavailable</strong>
            : <RunGoldTransactionAmount direction="loss" valueTenths={priceTenths} />}
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
          <RunActionIcon variant="athetize" />
          <span>{actionLabel(status)}</span>
        </ChromeButton>
      </span>
    </InnerChromeBox>
  );
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
        edgeAttached: true,
        testId: 'run-expunctio-workspace',
        ariaLabelledBy: 'run-expunctio-workspace-title',
      }}
    >
      <h2 id="run-expunctio-workspace-title">Expunctio</h2>
      <p>Athetize one complete formation. Individual units cannot be removed from a held card.</p>
      <p className="run-expunctio-rule">
        Expunctio fee = printed card value + attached unit value. Reset Sectio restores the complete visit.
      </p>
      <KitScroll className="run-sectio-operation-list-scroll">
        <div className="run-sectio-operation-list run-expunctio-list" aria-label="Held formations">
          {rows.map((row, index) => (
            <ExpunctioCardTile
              key={row.card.id}
              row={row}
              index={index}
              onExpunct={onExpunct}
            />
          ))}
        </div>
      </KitScroll>
    </RunSceneViewport>
  );
}
