import type { CSSProperties, ReactElement } from 'react';
import {
  cardExpunctioPriceTenths,
  runCardDefinition,
  sectioAdmittedCardIds,
  type RunArmyUnit,
  type RunCardDefinition,
  type RunDocument,
  type RunOwnedCard,
} from '../run/model';
import { KitScroll } from './KitScroll';
import { RunCard } from './RunCard';
import { runCardFrameSlot } from './runCardFaceContent';
import { runCardFrameGeometryForSlot, runCardFramePaintInsetRatios } from './runCardFrameGeometry';
import { emptyRunCardPieceIndices, projectRunCardUnitSeats } from './runCardUnitProjection';
import { RunAdlectioMarkLine } from './RunAdlectioMark';
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
  /** Admitted by this visit's Adlectio rather than carried into it. */
  admittedThisVisit: boolean;
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
  const admitted = sectioAdmittedCardIds(run);
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
    return [{
      card,
      definition,
      ...projection,
      priceTenths,
      status,
      admittedThisVisit: admitted.has(card.id),
    }];
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
        admittedThisVisit: admitted.has(spent.card.id),
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

function ExpunctioCardTile({
  row,
  index,
  onExpunct,
}: {
  row: ExpunctioRow;
  index: number;
  onExpunct: (cardId: string) => void;
}): ReactElement {
  const { card, definition, emptyPieceIndices, priceTenths, status, admittedThisVisit } = row;
  const paintInsets = runCardFramePaintInsetRatios(runCardFrameGeometryForSlot(runCardFrameSlot(definition)));
  return (
    <InnerChromeBox
      className={`run-expunctio-row is-${status}${admittedThisVisit ? ' is-admitted-this-visit' : ''}`}
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
        {/*
          The only thing the companion says in words is what THIS visit did to the record, because
          everything else it used to say was already on the tile: the face prints the card's name,
          the workspace's own rules copy states that Athetize takes the complete formation, and the
          action states the state it is in. Which formations the visit admitted is the one fact
          nothing else carries — Reset Sectio takes exactly those back, so the choice between
          striking one and resetting the visit is illegible until the gallery says so.
        */}
        <span className="run-expunctio-copy">
          {/*
            The admission itself, and nothing about the price: the fee below this line already says
            what the card cost, so a coin here would only repeat it. The mark's own candidates are
            auditioned in the Studio's Adlectio Mark category, in this same line.
          */}
          {admittedThisVisit ? <RunAdlectioMarkLine /> : null}
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
