import { useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { paletteForSide } from '../core/pieces';
import {
  PIECE_LABEL,
  PIECE_VALUE,
  LIPSANON_BY_ID,
  formatArmySize,
  hasLipsanon,
  type RunArmyPieceType,
  type RunArmyUnit,
  type RunDocument,
} from '../run/model';
import { installedPortraitCrops } from './portraitCrops';
import { runtimePortraitMasterSrc } from './portraitCandidates';
import { UnitPortrait, type Palette as PortraitPalette, type Piece as PortraitPiece } from './PortraitEditor';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { RunSceneViewport } from './RunWorkspace';
import { InnerChromeBox } from './shared/ChromeBox';
import { HouseSelect } from './shared/HouseSelect';
import { ChromeDividedGridRow, DividedInnerChromeBox } from './shared/ChromeDividedGrid';
import { Tooltip } from './shared/InfoTip';
import { RunUnitInspectionScene } from './RunUnitInspectionScene';
import { ChromeButton } from './shared/ChromeButton';
import {
  CHROME_LEAF_FILL_SURFACE,
  CHROME_STRUCTURAL_FILL_ROLE,
  leafSurfacePhase,
} from './shared/chromeSurfacePolicy';
import { KitScroll } from './KitScroll';

export type RunRosterOrder = 'type' | 'value' | 'ability' | 'acquired';
export type RunRosterTypeFilter = 'all' | RunArmyPieceType;
export type RunRosterAbilityFilter = 'all' | RunUnitTraitId;

export interface RunArmyFilters {
  order: RunRosterOrder;
  type: RunRosterTypeFilter;
  ability: RunRosterAbilityFilter;
}
export const DEFAULT_RUN_ARMY_FILTERS: RunArmyFilters = Object.freeze({
  order: 'type',
  type: 'all',
  ability: 'all',
});

export interface RunArmyProfileAction {
  label: string;
  onAction: (unitId: string) => void;
  isDisabled?: (unit: RunArmyUnit) => boolean;
}

// Read per render, not once at import: the player's color is a setting, and a value frozen into a
// module constant would keep the old set on every portrait until a reload.
const playerPortraitPalette = (): PortraitPalette => paletteForSide('player') as PortraitPalette;
// A unit identifying itself in a chrome list faces the reader, the same choice the run
// card faces and the shared piece icon make; the board's deployment facing would show a back.
const TYPE_ORDER: readonly RunArmyPieceType[] = ['king', 'pawn', 'knight', 'bishop', 'rook', 'queen'];

export type RunUnitTraitId =
  | 'royal-tent';

/**
 * A paired unit state draws its own accepted icon; a lipsanon-derived trait is not one of
 * the paired states and keeps a kit glyph (ADR-0339).
 */
export type RunUnitTraitIcon = Readonly<{ glyphClass: string }>;

export interface RunUnitTrait {
  id: RunUnitTraitId;
  label: string;
  description: string;
  source: string;
  inherited: boolean;
  icon: RunUnitTraitIcon;
}

function inheritedTrait(
  id: RunUnitTraitId,
  label: string,
  description: string,
  source: string,
  icon: RunUnitTraitIcon,
): RunUnitTrait {
  return { id, label, description, source, inherited: true, icon };
}

export function runUnitTraits(run: RunDocument, unit: RunArmyUnit): RunUnitTrait[] {
  const traits: RunUnitTrait[] = [];
  if (unit.type === 'king' && hasLipsanon(run, 'royal-tent')) {
    traits.push(inheritedTrait(
      'royal-tent',
      'Royal Tent',
      'Places up to three temporary rocks in front of the King.',
      LIPSANON_BY_ID['royal-tent'].name,
      { glyphClass: 'skirmish-icon-shield' },
    ));
  }
  return traits;
}

function optionalUnitName(unit: RunArmyUnit): string | null {
  const value = (unit as RunArmyUnit & { name?: unknown }).name;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalUnitRank(unit: RunArmyUnit): string | null {
  const value = (unit as RunArmyUnit & { rank?: unknown }).rank;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalUnitKills(unit: RunArmyUnit): number | null {
  const value = (unit as RunArmyUnit & { kills?: unknown }).kills;
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export function runUnitIdentifier(unit: RunArmyUnit): string {
  return `${PIECE_LABEL[unit.type]} ${unit.number}`;
}

export function runUnitDisplayName(unit: RunArmyUnit): string {
  return optionalUnitName(unit) ?? runUnitIdentifier(unit);
}

export function runUnitRosterLabel(unit: RunArmyUnit): string {
  const displayName = runUnitDisplayName(unit);
  const identifier = runUnitIdentifier(unit);
  return displayName === identifier ? identifier : `${displayName} — ${identifier}`;
}

function unitSourceLabel(unit: RunArmyUnit): string {
  if (unit.source === 'king') return 'Run commander';
  if (unit.source === 'starting') return 'Starting army';
  return 'Sectio Adlectio';
}

function unitRunStatus(run: RunDocument, unit: RunArmyUnit): string {
  if (run.phase === 'battle') {
    // Out of this fight, not out of the Run -- the unit recovers before the next Battle.
    if (run.battleRuntime?.observedDeadUnitIds.includes(unit.id)) return 'Wounded this Battle';
    if (run.battleRuntime?.deployedReservistUnitIds.includes(unit.id)) return 'Deployed Reservist';
    if (run.battleRuntime?.reservistPoolUnitIds.includes(unit.id)) return 'Reservist pool';
    if (run.battleRuntime?.reserveUnitIds.includes(unit.id)) return 'Reserve';
    return 'Deployed';
  }
  if (run.phase === 'deployment') {
    if (run.deployment?.unavailableUnitIds.includes(unit.id)) return 'Unavailable this combat';
    if (run.deployment?.placements[unit.id]) return 'Placed';
    if (!run.deployment?.deployingUnitIds.includes(unit.id)) return 'Not dealt';
    return 'Preparing to deploy';
  }
  if (run.phase === 'sectio') return 'Held formation';
  if (run.phase === 'victory') return 'War survivor';
  return 'Mustering';
}

function RunArmyPortrait({
  unit,
  className,
  framed = true,
}: {
  unit: RunArmyUnit;
  className: string;
  framed?: boolean;
}): ReactElement {
  const crops = installedPortraitCrops();
  const piece = unit.type as PortraitPiece;
  const palette = playerPortraitPalette();
  return (
    <UnitPortrait
      piece={piece}
      palette={palette}
      crop={crops[piece]}
      className={className}
      framed={framed}
      masterUrl={runtimePortraitMasterSrc(piece, palette)}
    />
  );
}

export function RunUnitTraitList({
  run,
  unit,
  compact = false,
}: {
  run: RunDocument;
  unit: RunArmyUnit;
  compact?: boolean;
}): ReactElement {
  const traits = runUnitTraits(run, unit);
  if (!traits.length) return <small className="run-unit-no-traits">No traits</small>;
  return (
    <span className={`run-unit-traits${compact ? ' is-compact' : ''}`}>
      {traits.map((trait) => (
        <span className="run-unit-trait" key={trait.id}>
          <Tooltip
            triggerClassName="run-unit-trait-trigger"
            popupMaxInlineSize={300}
            label={`${trait.label}. ${trait.description} ${trait.inherited ? `Inherited from ${trait.source}.` : trait.source}.`}
            title={trait.label}
            trigger={(
              <span
                className={`run-unit-trait-icon skirmish-icon ${trait.icon.glyphClass}`}
                aria-hidden="true"
              />
            )}
          >
            <span>{trait.description}</span>
            <small className="run-unit-trait-source">
              {trait.inherited ? `Inherited from ${trait.source}` : trait.source}
            </small>
          </Tooltip>
          {compact ? null : <span>{trait.label}</span>}
        </span>
      ))}
    </span>
  );
}

function RunRosterFilters({
  filters,
  onChange,
}: {
  filters: RunArmyFilters;
  onChange: (filters: RunArmyFilters) => void;
}): ReactElement {
  // The row is ONE structural field holding three terminal controls, exactly as the Cards
  // gallery's filter row is (ADR-0433/ADR-0510). Unfilled, its three oak triggers stood on the
  // vista with nothing stating that they belong to one another.
  return (
    <InnerChromeBox
      as="section"
      className="run-roster-filters"
      fillRole={CHROME_STRUCTURAL_FILL_ROLE}
      aria-label="Army filters"
    >
      <label style={{ ['--run-roster-filter-index' as string]: 0 } as CSSProperties}>
        <span>Order</span>
        <HouseSelect
          value={filters.order}
          options={[
            { value: 'type', label: 'Type' },
            { value: 'value', label: 'Value' },
            { value: 'ability', label: 'Trait' },
            { value: 'acquired', label: 'Acquisition order' },
          ]}
          onChange={(order) => onChange({ ...filters, order })}
          ariaLabel="Army order"
          fillSurface={CHROME_LEAF_FILL_SURFACE}
        />
      </label>
      <label style={{ ['--run-roster-filter-index' as string]: 1 } as CSSProperties}>
        <span>Piece</span>
        <HouseSelect
          value={filters.type}
          options={[
            { value: 'all', label: 'All types' },
            ...TYPE_ORDER.map((type) => ({ value: type, label: PIECE_LABEL[type] })),
          ]}
          onChange={(type) => onChange({ ...filters, type })}
          ariaLabel="Army piece type"
          fillSurface={CHROME_LEAF_FILL_SURFACE}
        />
      </label>
      <label style={{ ['--run-roster-filter-index' as string]: 2 } as CSSProperties}>
        <span>Trait</span>
        <HouseSelect
          value={filters.ability}
          options={[
            { value: 'all', label: 'All traits' },
            { value: 'royal-tent', label: 'Royal Tent' },
          ]}
          onChange={(ability) => onChange({ ...filters, ability })}
          ariaLabel="Army trait"
          fillSurface={CHROME_LEAF_FILL_SURFACE}
        />
      </label>
    </InnerChromeBox>
  );
}

function acquisitionOrder(run: RunDocument): Map<string, number> {
  const ids: string[] = [];
  const push = (unit: RunArmyUnit): void => {
    if (!ids.includes(unit.id)) ids.push(unit.id);
  };
  run.sectio?.entrySnapshot?.army.forEach(push);
  run.army.forEach(push);
  return new Map(ids.map((id, index) => [id, index]));
}

function filteredAndSortedUnits(
  run: RunDocument,
  units: readonly RunArmyUnit[],
  filters: RunArmyFilters,
): RunArmyUnit[] {
  const acquired = acquisitionOrder(run);
  return units
    .filter((unit) => filters.type === 'all' || unit.type === filters.type)
    .filter((unit) => (
      filters.ability === 'all'
      || runUnitTraits(run, unit).some((trait) => trait.id === filters.ability)
    ))
    .sort((left, right) => {
      if (filters.order === 'value') {
        return PIECE_VALUE[right.type] - PIECE_VALUE[left.type]
          || runUnitIdentifier(left).localeCompare(runUnitIdentifier(right));
      }
      if (filters.order === 'ability') {
        const leftAbility = runUnitTraits(run, left)[0]?.label ?? 'ZZZ';
        const rightAbility = runUnitTraits(run, right)[0]?.label ?? 'ZZZ';
        return leftAbility.localeCompare(rightAbility)
          || runUnitIdentifier(left).localeCompare(runUnitIdentifier(right));
      }
      if (filters.order === 'acquired') {
        return (acquired.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (acquired.get(right.id) ?? Number.MAX_SAFE_INTEGER);
      }
      return TYPE_ORDER.indexOf(left.type) - TYPE_ORDER.indexOf(right.type)
        || left.number - right.number;
    });
}

function RunArmyWorkspaceHost({
  children,
  className,
  contentClassName,
  'data-testid': dataTestId,
  framed,
}: {
  children: ReactNode;
  className: string;
  contentClassName: string;
  'data-testid': string;
  framed: boolean;
}): ReactElement {
  if (framed) {
    return (
      <RunSceneViewport
        scene={{
          view: 'army',
          className,
          contentClassName,
          edgeAttached: true,
          testId: dataTestId,
          ariaLabelledBy: 'run-army-workspace-title',
        }}
      >
        {children}
      </RunSceneViewport>
    );
  }
  return (
    <section
      className={`${className} ${contentClassName} run-panel-unframed`}
      data-testid={dataTestId}
      aria-labelledby="run-army-workspace-title"
    >
      {children}
    </section>
  );
}

export function RunArmyWorkspace({
  run,
  title = 'Army',
  backLabel = 'Back to Army',
  framed = true,
  filters,
  selectedUnitId,
  onFiltersChange,
  onSelectUnit,
  onBack,
  profileAction,
}: {
  run: RunDocument;
  title?: string;
  backLabel?: string;
  framed?: boolean;
  filters: RunArmyFilters;
  selectedUnitId: string | null;
  onFiltersChange: (filters: RunArmyFilters) => void;
  onSelectUnit: (unitId: string) => void;
  onBack: () => void;
  /** Adds a deliberate caller-owned action while the profile is choosing a unit. */
  profileAction?: RunArmyProfileAction;
}): ReactElement {
  const selected = selectedUnitId ? run.army.find((unit) => unit.id === selectedUnitId) ?? null : null;
  const units = useMemo(() => filteredAndSortedUnits(run, run.army, filters), [filters, run]);
  const ledgerRef = useRef<HTMLDivElement | null>(null);
  const ledgerScrollTop = useRef(0);
  useLayoutEffect(() => {
    if (!selected && ledgerRef.current) ledgerRef.current.scrollTop = ledgerScrollTop.current;
  }, [selected]);

  if (selected) {
    const rank = optionalUnitRank(selected);
    const kills = optionalUnitKills(selected);
    return (
      <RunArmyWorkspaceHost
        className="run-self-inspection-workspace run-army-workspace run-army-profile"
        contentClassName="run-self-inspection-content run-army-profile-content"
        data-testid="run-army-profile-workspace"
        framed={framed}
      >
          <header className="run-self-inspection-head">
            <h2 id="run-army-workspace-title">{runUnitDisplayName(selected)}</h2>
            <ChromeButton unit="inner-text-button"
              data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
              className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
              style={{ ['--chrome-leaf-surface-index' as string]: 0 } as CSSProperties}
              onClick={onBack}
            >
              {backLabel}
            </ChromeButton>
          </header>
          <KitScroll className="run-army-profile-scroll">
            <div className="run-army-profile-body">
              <RunUnitInspectionScene unit={selected} />
              <section className="run-army-profile-copy">
                <p className="run-army-profile-identity">
                  <strong>{runUnitIdentifier(selected)}</strong>
                  {optionalUnitName(selected) ? <span>{PIECE_LABEL[selected.type]}</span> : null}
                  {rank ? <span>{rank}</span> : null}
                </p>
                <RunUnitTraitList run={run} unit={selected} />
                <InnerChromeBox className="run-army-profile-stats" fillRole={CHROME_STRUCTURAL_FILL_ROLE}>
                  <dl>
                    <div><dt>Value</dt><dd>{PIECE_VALUE[selected.type]}</dd></div>
                    <div><dt>Status</dt><dd>{unitRunStatus(run, selected)}</dd></div>
                    <div><dt>Source</dt><dd>{unitSourceLabel(selected)}</dd></div>
                    <div><dt>Kills</dt><dd>{kills ?? '—'}</dd></div>
                  </dl>
                </InnerChromeBox>
                {profileAction ? (
                  <ChromeButton
                    unit="inner-text-button"
                    data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                    className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
                    style={{ ['--chrome-leaf-surface-index' as string]: 1 } as CSSProperties}
                    tone="primary"
                    disabled={profileAction.isDisabled?.(selected) ?? false}
                    onClick={() => profileAction.onAction(selected.id)}
                  >
                    {profileAction.label}
                  </ChromeButton>
                ) : null}
              </section>
            </div>
          </KitScroll>
      </RunArmyWorkspaceHost>
    );
  }

  return (
    <RunArmyWorkspaceHost
      className="run-self-inspection-workspace run-army-workspace run-army-ledger"
      contentClassName="run-self-inspection-content run-army-ledger-content"
      data-testid="run-army-ledger-workspace"
      framed={framed}
    >
        <header className="run-self-inspection-head">
          <h2 id="run-army-workspace-title">{title}</h2>
          <span>{formatArmySize(run.army.length)}</span>
        </header>
        <RunRosterFilters filters={filters} onChange={onFiltersChange} />
        {/* The ledger is the structural box and every row in it is a control, so the two take
            opposite materials (ADR-0433): marble on the box that establishes the region, oak on
            each row that ends the interaction tree. A row's wood is phased from its place in the
            roster the renderer is walking, never from DOM position (ADR-0063), so the column is
            cut from one plank run instead of stamping the same grain per unit. */}
        <DividedInnerChromeBox
          className="run-army-ledger-grid"
          columns={['var(--run-army-row-block-size, 158px)', 'minmax(0, 1fr)', '112px']}
          scroll
          contentRef={ledgerRef}
          fillRole={CHROME_STRUCTURAL_FILL_ROLE}
          aria-label="Persistent army"
        >
          {units.map((unit, index) => (
            <ChromeDividedGridRow
              as="button"
              className="run-army-ledger-row"
              data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
              style={leafSurfacePhase(index)}
              aria-label={`${profileAction ? 'Select' : 'Inspect'} ${runUnitDisplayName(unit)}`}
              onClick={() => {
                ledgerScrollTop.current = ledgerRef.current?.scrollTop ?? 0;
                onSelectUnit(unit.id);
              }}
              key={unit.id}
            >
              <RunArmyPortrait
                unit={unit}
                className="run-army-ledger-portrait unit-portrait--divided"
                framed={false}
              />
              <span className="run-army-ledger-copy">
                <strong>{runUnitDisplayName(unit)}</strong>
                <small>
                  {optionalUnitName(unit) ? `${runUnitIdentifier(unit)} · ` : ''}
                  {unitRunStatus(run, unit)}
                </small>
                <RunUnitTraitList run={run} unit={unit} compact />
              </span>
              <span className={profileAction ? 'run-army-ledger-select' : 'run-army-ledger-value'}>
                {profileAction ? (
                  <>
                    <strong>Select</strong>
                    <span aria-hidden="true">›</span>
                  </>
                ) : (
                  <>
                    <small>Value</small>
                    <strong>{PIECE_VALUE[unit.type]}</strong>
                  </>
                )}
              </span>
            </ChromeDividedGridRow>
          ))}
          {!units.length ? (
            <ChromeDividedGridRow className="run-army-ledger-empty">
              <p>No units match these filters.</p>
            </ChromeDividedGridRow>
          ) : null}
        </DividedInnerChromeBox>
    </RunArmyWorkspaceHost>
  );
}
