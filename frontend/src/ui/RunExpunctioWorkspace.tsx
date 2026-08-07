import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
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
import {
  RunUnitTraitList,
  runUnitDisplayName,
  runUnitIdentifier,
  runUnitRosterLabel,
  unitAlienatioTenths,
} from './RunArmyWorkspace';
import { runCardFrameSlot } from './runCardFaceContent';
import { runCardFrameGeometryForSlot, runCardFramePaintInsetRatios } from './runCardFrameGeometry';
import { emptyRunCardPieceIndices, projectRunCardUnitSeats } from './runCardUnitProjection';
import { RunGoldTransactionAmount } from './RunResources';
import { RunSceneViewport } from './RunWorkspace';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ChromeButton } from './shared/ChromeButton';
import { InnerChromeBox } from './shared/ChromeBox';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';
import { CyclePicker } from './shared/CyclePicker';

type AttachedUnit = Readonly<{
  unit: RunArmyUnit;
  pieceIndex: number;
}>;

type ExpunctioRow = Readonly<{
  card: RunOwnedCard;
  definition: RunCardDefinition;
  units: readonly AttachedUnit[];
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
    units: projection.flatMap(({ unitId, pieceIndex }): AttachedUnit[] => {
      const unit = unitsById.get(unitId);
      return unit ? [{ unit, pieceIndex }] : [];
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
    const attached = projection.units.map(({ unit }) => unit);
    const priceTenths = cardExpunctioPriceTenths(card, attached);
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

function unitStatusLabel(status: ExpunctioRow['status'], units: readonly AttachedUnit[]): string {
  if (status === 'expuncted') return 'Removed with card';
  if (status === 'unavailable') return 'Not subject to Expunctio';
  return `${units.length} attached unit${units.length === 1 ? '' : 's'}`;
}

function ExpunctioCardTile({
  row,
  run,
  index,
  onAliene,
  onExpunct,
}: {
  row: ExpunctioRow;
  run: RunDocument;
  index: number;
  onAliene: (unitId: string, source?: HTMLImageElement | null) => void;
  onExpunct: (cardId: string) => void;
}): ReactElement {
  const { card, definition, units, emptyPieceIndices, priceTenths, status } = row;
  const cardRef = useRef<HTMLSpanElement | null>(null);
  const cardName = runCardName(definition);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const selectedIndex = units.findIndex(({ unit }) => unit.id === selectedUnitId);
  const selected = selectedIndex < 0 ? null : units[selectedIndex];
  useEffect(() => {
    if (selectedUnitId === null || units.some(({ unit }) => unit.id === selectedUnitId)) return;
    setSelectedUnitId(null);
  }, [selectedUnitId, units]);
  const paintInsets = useMemo(() => runCardFramePaintInsetRatios(
    runCardFrameGeometryForSlot(runCardFrameSlot(definition)),
  ), [definition]);
  const cycle = (offset: number): void => {
    if (!units.length) return;
    const nextIndex = selectedIndex < 0
      ? offset < 0 ? units.length - 1 : 0
      : (selectedIndex + offset + units.length) % units.length;
    setSelectedUnitId(units[nextIndex].unit.id);
  };
  const pieceSelectionLabels = definition.pieces.map((_, pieceIndex) => {
    const attached = units.find((unit) => unit.pieceIndex === pieceIndex);
    return attached ? `Select ${runUnitRosterLabel(attached.unit)} on ${cardName}` : null;
  });
  const pieceSelectionIds = definition.pieces.map((_, pieceIndex) => (
    units.find((unit) => unit.pieceIndex === pieceIndex)?.unit.id ?? null
  ));
  const unitCanAliene = status !== 'expuncted' && selected !== null && selected.unit.type !== 'king';

  const cardUnitSources = (): Map<string, HTMLImageElement> => {
    const sources = new Map<string, HTMLImageElement>();
    cardRef.current?.querySelectorAll<HTMLElement>(
      '.run-card-face-layer.is-presented [data-selection-id]',
    ).forEach((element) => {
      const unitId = element.dataset.selectionId;
      const source = element.querySelector<HTMLImageElement>('.run-card-formation-unit');
      if (unitId && source) sources.set(unitId, source);
    });
    return sources;
  };

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
      <span className="run-expunctio-card" ref={cardRef}>
        <RunCard
          card={definition}
          mode="reference"
          emptyPieceIndices={status === 'expuncted' ? [] : emptyPieceIndices}
          highlightedPieceIndex={status === 'expuncted' ? null : selected?.pieceIndex ?? null}
          pieceSelectionIds={status === 'expuncted' ? [] : pieceSelectionIds}
          pieceSelectionLabels={status === 'expuncted' ? [] : pieceSelectionLabels}
          onPieceSelect={status === 'expuncted' ? undefined : (pieceIndex) => {
            const attached = units.find((unit) => unit.pieceIndex === pieceIndex);
            if (attached) setSelectedUnitId(attached.unit.id);
          }}
        />
      </span>
      <span className="run-expunctio-companion">
        <span className="run-expunctio-copy">
          <small>{unitStatusLabel(status, units)}</small>
           <span>{status === 'expuncted'
             ? 'Every attached unit left with this card.'
             : selected
               ? 'The selected figure is marked on the card.'
               : units.length
                 ? 'Select a figure on the card, or use the arrows below.'
               : 'No units remain attached.'}</span>
        </span>

        {status !== 'expuncted' && units.length ? (
          <section className="run-expunctio-alienatio" aria-label={`Alienatio from ${cardName}`}>
            <small>Alienatio</small>
            <CyclePicker
              className="run-expunctio-unit-picker"
              buttonClassName="run-expunctio-unit-picker-key"
              ariaLabel="Attached unit"
              previousLabel={`Previous unit on ${cardName}`}
              nextLabel={`Next unit on ${cardName}`}
              previousDisabled={selected !== null && units.length < 2}
              nextDisabled={selected !== null && units.length < 2}
              onPrevious={() => cycle(-1)}
              onNext={() => cycle(1)}
            >
              <span className="run-expunctio-unit-choice" aria-live="polite">
                <strong>{selected ? runUnitDisplayName(selected.unit) : 'Select a unit'}</strong>
                <small>{selected ? runUnitIdentifier(selected.unit) : 'Figure or arrows'}</small>
              </span>
            </CyclePicker>
            <span className="run-expunctio-unit-traits-seat">
              {selected
                ? <RunUnitTraitList run={run} unit={selected.unit} compact />
                : <small className="run-unit-no-traits">No unit selected</small>}
            </span>
            <span className="run-expunctio-alienatio-action">
              <span className="run-expunctio-alienatio-return">
                <small>Alienatio return</small>
                <RunGoldTransactionAmount
                  direction="gain"
                  valueTenths={selected && selected.unit.type !== 'king'
                    ? unitAlienatioTenths(run, selected.unit)
                    : null}
                  pendingLabel={selected
                    ? 'King retained; no Alienatio return'
                    : 'Select a unit to see its Alienatio return'}
                  pendingValue={selected ? 'Retained' : '—'}
                />
              </span>
              <ChromeButton
                unit="inner-text-button"
                data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                data-ui-sfx={unitCanAliene ? 'gold' : undefined}
                className={chromeUnitClassNames(
                  'inner-text-button',
                  'app-header-button',
                  unitCanAliene && 'danger',
                )}
                disabled={!unitCanAliene}
                onClick={() => {
                  if (!selected) return;
                  const source = cardUnitSources().get(selected.unit.id) ?? null;
                  onAliene(selected.unit.id, source);
                }}
              >
                {!selected ? 'Select unit' : selected.unit.type === 'king' ? 'Retained' : 'Aliene'}
              </ChromeButton>
            </span>
          </section>
        ) : status !== 'expuncted' ? (
          <span className="run-expunctio-alienatio is-empty">
            <small>Alienatio</small>
            <span>No attached unit remains to aliene.</span>
          </span>
        ) : null}

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
          {actionLabel(status)}
        </ChromeButton>
      </span>
    </InnerChromeBox>
  );
}

export function RunExpunctioWorkspace({
  run,
  onAliene,
  onExpunct,
}: {
  run: RunDocument;
  onAliene: (unitId: string, source?: HTMLImageElement | null) => void;
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
      <p>Athetize one card, or select one of its attached units to aliene. Click a figure on the card or use the arrows.</p>
      <p className="run-expunctio-rule">
        Expunctio fee = printed card value + remaining unit value. Reset Sectio restores the complete visit.
      </p>
      <KitScroll className="run-sectio-operation-list-scroll">
        <div className="run-sectio-operation-list run-expunctio-list" aria-label="Cards and attached units">
          {rows.map((row, index) => (
            <ExpunctioCardTile
              key={row.card.id}
              row={row}
              run={run}
              index={index}
              onAliene={onAliene}
              onExpunct={onExpunct}
            />
          ))}
        </div>
      </KitScroll>
    </RunSceneViewport>
  );
}
