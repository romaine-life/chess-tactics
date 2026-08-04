import { useLayoutEffect, useMemo, useRef, type ReactElement, type ReactNode } from 'react';
import { defaultBackgroundSet } from '../art/backgroundSets';
import { paletteForSide, pieceSpritePath } from '../core/pieces';
import {
  ADLECTED_DISPLAY_NAME,
  CACOCHYMIC_DESCRIPTION,
  CACOCHYMIC_DISPLAY_NAME,
  EUTACTIC_DISPLAY_NAME,
  GOLD_SCALE,
  PIECE_LABEL,
  PIECE_VALUE,
  LIPSANON_BY_ID,
  hasLipsanon,
  lipsanonGrantingRunAbility,
  runAbilityDescription,
  runAbilityDisplayName,
  type RunAbility,
  type RunArmyPieceType,
  type RunArmyUnit,
  type RunDocument,
} from '../run/model';
import { installedPortraitCrops } from './portraitCrops';
import { runtimePortraitMasterSrc } from './portraitCandidates';
import { UnitPortrait, type Palette as PortraitPalette, type Piece as PortraitPiece } from './PortraitEditor';
import { RunGoldAmount } from './RunResources';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { RunSceneViewport } from './RunWorkspace';
import { InnerChromeBox } from './shared/ChromeBox';
import { HouseSelect } from './shared/HouseSelect';
import { ChromeDividedGridRow, DividedInnerChromeBox } from './shared/ChromeDividedGrid';
import { Tooltip } from './shared/InfoTip';
import { RunUnitInspectionScene } from './RunUnitInspectionScene';
import { ChromeButton } from './shared/ChromeButton';
import { RunAbilityIcon, type RunUnitState } from './shared/RunAbilityIcon';
import { KitScroll } from './KitScroll';

export type RunRosterOrder = 'type' | 'value' | 'ability' | 'acquired';
export type RunRosterTypeFilter = 'all' | RunArmyPieceType;
export type RunRosterAbilityFilter = 'all' | RunUnitTraitId;
export type RunAlienatioStateFilter = 'all' | 'alienable' | 'alienated' | 'retained';

export interface RunArmyFilters {
  order: RunRosterOrder;
  type: RunRosterTypeFilter;
  ability: RunRosterAbilityFilter;
}

export interface RunAlienatioFilters extends RunArmyFilters {
  alienatioState: RunAlienatioStateFilter;
}

export const DEFAULT_RUN_ARMY_FILTERS: RunArmyFilters = Object.freeze({
  order: 'type',
  type: 'all',
  ability: 'all',
});

export const DEFAULT_RUN_ALIENATIO_FILTERS: RunAlienatioFilters = Object.freeze({
  ...DEFAULT_RUN_ARMY_FILTERS,
  alienatioState: 'all',
});

export interface RunArmyProfileAction {
  label: string;
  onAction: (unitId: string) => void;
  isDisabled?: (unit: RunArmyUnit) => boolean;
}

const PLAYER_PORTRAIT_PALETTE = paletteForSide('player') as PortraitPalette;
// A unit identifying itself in a chrome list faces the reader, the same choice the run
// card faces and the shared piece icon make; the board's deployment facing would show a back.
const PLAYER_PIECE_FACING = 'south';
const TYPE_ORDER: readonly RunArmyPieceType[] = ['king', 'pawn', 'knight', 'bishop', 'rook', 'queen'];

export type RunUnitTraitId =
  | 'primogeniture'
  | 'adlected'
  | 'eutactic'
  | 'agminate'
  | 'cacochymic'
  | 'royal-tent'
  | 'pawn-cash-out';

/**
 * A paired unit state draws its own accepted icon; a lipsanon-derived trait is not one of
 * the four states and keeps a kit glyph (ADR-0339).
 */
export type RunUnitTraitIcon =
  | Readonly<{ state: RunUnitState }>
  | Readonly<{ glyphClass: string }>;

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

function deploymentAbilityTrait(
  run: RunDocument,
  unit: RunArmyUnit,
  ability: Extract<RunAbility, 'eutactic' | 'agminate'>,
): RunUnitTrait | null {
  const label = runAbilityDisplayName(ability);
  const icon = { state: ability } as const;
  if (unit.abilities.includes(ability)) {
    return {
      id: ability,
      label,
      description: runAbilityDescription(ability, unit.type),
      source: 'Permanent unit ability',
      inherited: false,
      icon,
    };
  }
  const lipsanonId = lipsanonGrantingRunAbility(run, unit, ability);
  return lipsanonId
    ? inheritedTrait(ability, label, runAbilityDescription(ability, unit.type), LIPSANON_BY_ID[lipsanonId].name, icon)
    : null;
}

export function runUnitTraits(run: RunDocument, unit: RunArmyUnit): RunUnitTrait[] {
  const traits: RunUnitTrait[] = [];
  if (unit.modifiers.includes('cacochymic')) {
    traits.push({
      id: 'cacochymic',
      label: CACOCHYMIC_DISPLAY_NAME,
      description: CACOCHYMIC_DESCRIPTION,
      source: 'The Great Mortality',
      inherited: false,
      icon: { state: 'cacochymic' },
    });
  }
  if (unit.abilities.includes('primogeniture')) {
    traits.push({
      id: 'primogeniture',
      label: runAbilityDisplayName('primogeniture'),
      description: runAbilityDescription('primogeniture', unit.type),
      source: 'His Grace',
      inherited: false,
      icon: { state: 'primogeniture' },
    });
  }
  if (unit.abilities.includes('adlected')) {
    traits.push({
      id: 'adlected',
      label: ADLECTED_DISPLAY_NAME,
      description: runAbilityDescription('adlected', unit.type),
      source: 'Permanent unit ability',
      inherited: false,
      icon: { state: 'adlected' },
    });
  } else if (run.deployment?.temporaryAdlectedUnitId === unit.id) {
    traits.push(inheritedTrait(
      'adlected',
      ADLECTED_DISPLAY_NAME,
      runAbilityDescription('adlected', unit.type),
      LIPSANON_BY_ID['inspirational-record'].name,
      { state: 'adlected' },
    ));
  }

  const eutactic = deploymentAbilityTrait(run, unit, 'eutactic');
  if (eutactic) traits.push(eutactic);
  const agminate = deploymentAbilityTrait(run, unit, 'agminate');
  if (agminate) traits.push(agminate);
  if (unit.type === 'king' && hasLipsanon(run, 'royal-tent')) {
    traits.push(inheritedTrait(
      'royal-tent',
      'Royal Tent',
      'Places up to three temporary rocks in front of the King.',
      LIPSANON_BY_ID['royal-tent'].name,
      { glyphClass: 'skirmish-icon-shield' },
    ));
  }
  if (unit.type === 'pawn' && hasLipsanon(run, 'mercenary-boat')) {
    traits.push(inheritedTrait(
      'pawn-cash-out',
      'Cash Out',
      'May leave the army for two gold instead of promoting.',
      LIPSANON_BY_ID['mercenary-boat'].name,
      { glyphClass: 'skirmish-icon-crossed-swords' },
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

function unitAlienatioTenths(run: RunDocument, unit: RunArmyUnit): number {
  return PIECE_VALUE[unit.type] * GOLD_SCALE * (hasLipsanon(run, 'fair-scales') ? 0.75 : 0.5);
}

function unitRunStatus(run: RunDocument, unit: RunArmyUnit): string {
  if (run.phase === 'battle') {
    if (run.battleRuntime?.observedDeadUnitIds.includes(unit.id)) return 'Fallen this Battle';
    if (run.battleRuntime?.deployedReservistUnitIds.includes(unit.id)) return 'Deployed Reservist';
    if (run.battleRuntime?.reservistPoolUnitIds.includes(unit.id)) return 'Reservist pool';
    if (run.battleRuntime?.reserveUnitIds.includes(unit.id)) return 'Reserve';
    return 'Deployed';
  }
  if (run.phase === 'deployment') {
    if (run.deployment?.unavailableUnitIds.includes(unit.id)) return 'Unavailable this combat';
    if (run.deployment?.manualPlacements[unit.id]) return `Placed with ${ADLECTED_DISPLAY_NAME}`;
    if (run.deployment?.placements[unit.id]) return 'Placed';
    if (!run.deployment?.deployingUnitIds.includes(unit.id)) return 'Not dealt';
    return 'Preparing to deploy';
  }
  if (run.phase === 'sectio') return unit.type === 'king' ? 'Permanently retained' : 'Available for Alienatio';
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
  return (
    <UnitPortrait
      piece={piece}
      palette={PLAYER_PORTRAIT_PALETTE}
      crop={crops[piece]}
      backdrop={defaultBackgroundSet().portraits[piece]}
      className={className}
      framed={framed}
      masterUrl={runtimePortraitMasterSrc(piece, PLAYER_PORTRAIT_PALETTE)}
    />
  );
}

function RunUnitTraitList({
  run,
  unit,
  compact = false,
}: {
  run: RunDocument;
  unit: RunArmyUnit;
  compact?: boolean;
}): ReactElement {
  const traits = runUnitTraits(run, unit);
  if (!traits.length) return <small className="run-unit-no-traits">No abilities</small>;
  return (
    <span className={`run-unit-traits${compact ? ' is-compact' : ''}`}>
      {traits.map((trait) => (
        <span className="run-unit-trait" key={trait.id}>
          <Tooltip
            triggerClassName="run-unit-trait-trigger"
            popupMaxInlineSize={300}
            label={`${trait.label}. ${trait.description} ${trait.inherited ? `Inherited from ${trait.source}.` : trait.source}.`}
            title={trait.label}
            trigger={'state' in trait.icon ? (
              <RunAbilityIcon ability={trait.icon.state} className="run-unit-trait-icon" />
            ) : (
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
  alienatioState = null,
  onAlienatioStateChange,
}: {
  filters: RunArmyFilters;
  onChange: (filters: RunArmyFilters) => void;
  alienatioState?: RunAlienatioStateFilter | null;
  onAlienatioStateChange?: (state: RunAlienatioStateFilter) => void;
}): ReactElement {
  return (
    <section className="run-roster-filters" aria-label="Army filters">
      <label>
        <span>Order</span>
        <HouseSelect
          value={filters.order}
          options={[
            { value: 'type', label: 'Type' },
            { value: 'value', label: 'Value' },
            { value: 'ability', label: 'Ability' },
            { value: 'acquired', label: 'Acquisition order' },
          ]}
          onChange={(order) => onChange({ ...filters, order })}
          ariaLabel="Army order"
        />
      </label>
      <label>
        <span>Piece</span>
        <HouseSelect
          value={filters.type}
          options={[
            { value: 'all', label: 'All types' },
            ...TYPE_ORDER.map((type) => ({ value: type, label: PIECE_LABEL[type] })),
          ]}
          onChange={(type) => onChange({ ...filters, type })}
          ariaLabel="Army piece type"
        />
      </label>
      <label>
        <span>Ability</span>
        <HouseSelect
          value={filters.ability}
          options={[
            { value: 'all', label: 'All abilities' },
            { value: 'adlected', label: ADLECTED_DISPLAY_NAME },
            { value: 'eutactic', label: EUTACTIC_DISPLAY_NAME },
            { value: 'agminate', label: runAbilityDisplayName('agminate') },
            { value: 'cacochymic', label: CACOCHYMIC_DISPLAY_NAME },
            { value: 'royal-tent', label: 'Royal Tent' },
            { value: 'pawn-cash-out', label: 'Cash Out' },
          ]}
          onChange={(ability) => onChange({ ...filters, ability })}
          ariaLabel="Army ability"
        />
      </label>
      {alienatioState !== null && onAlienatioStateChange ? (
        <label>
          <span>Alienatio state</span>
          <HouseSelect
            value={alienatioState}
            options={[
              { value: 'all', label: 'All units' },
              { value: 'alienable', label: 'Alienable' },
              { value: 'alienated', label: 'Alienated this visit' },
              { value: 'retained', label: 'Retained' },
            ]}
            onChange={onAlienatioStateChange}
            ariaLabel="Unit Alienatio state"
          />
        </label>
      ) : null}
    </section>
  );
}

function acquisitionOrder(run: RunDocument): Map<string, number> {
  const ids: string[] = [];
  const push = (unit: RunArmyUnit): void => {
    if (!ids.includes(unit.id)) ids.push(unit.id);
  };
  run.sectio?.entrySnapshot?.army.forEach(push);
  run.army.forEach(push);
  run.sectio?.alienatedUnits.forEach(({ unit }) => push(unit));
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

function ProfileAlienatioAction({
  run,
  unit,
  onAlienate,
}: {
  run: RunDocument;
  unit: RunArmyUnit;
  onAlienate: (unitId: string) => void;
}): ReactElement {
  const unavailableReason = unit.type === 'king'
    ? 'The King is permanently retained and cannot undergo Alienatio.'
    : run.phase !== 'sectio'
      ? 'Units can undergo Alienatio only during Sectio.'
      : null;
  const button = (
    <ChromeButton unit="inner-text-button"
      data-ui-sfx={unavailableReason ? undefined : 'gold'}
      className={chromeUnitClassNames('inner-text-button', 'app-header-button', unavailableReason ? '' : 'danger')}
      disabled={Boolean(unavailableReason)}
      onClick={() => onAlienate(unit.id)}
    >
      <span>{unit.type === 'king' ? 'Retained' : 'Alienatio'}</span>
      {unit.type !== 'king' ? (
        <RunGoldAmount valueTenths={unitAlienatioTenths(run, unit)} className="run-gold-amount--button" />
      ) : null}
    </ChromeButton>
  );
  if (!unavailableReason) return button;
  return (
    <Tooltip
      trigger={button}
      label={unavailableReason}
      popupMaxInlineSize={288}
    >
      <span>{unavailableReason}</span>
    </Tooltip>
  );
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
  onAlienate,
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
  onAlienate: (unitId: string) => void;
  /** Replaces the ordinary Alienatio control when the profile is choosing a unit for another workflow. */
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
              className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
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
                <InnerChromeBox className="run-army-profile-stats">
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
                    className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
                    tone="primary"
                    disabled={profileAction.isDisabled?.(selected) ?? false}
                    onClick={() => profileAction.onAction(selected.id)}
                  >
                    {profileAction.label}
                  </ChromeButton>
                ) : <ProfileAlienatioAction run={run} unit={selected} onAlienate={onAlienate} />}
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
          <span>{run.army.length} units</span>
        </header>
        <RunRosterFilters filters={filters} onChange={onFiltersChange} />
        <DividedInnerChromeBox
          className="run-army-ledger-grid"
          columns={['var(--run-army-row-block-size, 158px)', 'minmax(0, 1fr)', '112px']}
          scroll
          contentRef={ledgerRef}
          aria-label="Persistent army"
        >
          {units.map((unit) => (
            <ChromeDividedGridRow
              as="button"
              className="run-army-ledger-row"
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

interface AlienatioRow {
  unit: RunArmyUnit;
  status: 'alienable' | 'alienated' | 'retained';
  proceedsTenths: number;
}

function alienatioRows(run: RunDocument): AlienatioRow[] {
  const current = run.army.map((unit): AlienatioRow => ({
    unit,
    status: unit.type === 'king' ? 'retained' : 'alienable',
    proceedsTenths: unitAlienatioTenths(run, unit),
  }));
  const alienated = (run.sectio?.alienatedUnits ?? []).map(({ unit, proceedsTenths }): AlienatioRow => ({
    unit,
    status: 'alienated',
    proceedsTenths,
  }));
  return [...current, ...alienated];
}

export function RunAlienatioWorkspace({
  run,
  filters,
  onFiltersChange,
  onAlienate,
}: {
  run: RunDocument;
  filters: RunAlienatioFilters;
  onFiltersChange: (filters: RunAlienatioFilters) => void;
  onAlienate: (unitId: string) => void;
}): ReactElement {
  const rows = useMemo(() => {
    const byId = new Map(alienatioRows(run).map((row) => [row.unit.id, row]));
    return filteredAndSortedUnits(run, [...byId.values()].map((row) => row.unit), filters)
      .map((unit) => byId.get(unit.id)!)
      .filter((row) => filters.alienatioState === 'all' || row.status === filters.alienatioState);
  }, [filters, run]);

  return (
    <RunSceneViewport
      scene={{
        view: 'alienatio',
        className: 'run-alienatio-workspace',
        contentClassName: 'run-alienatio-workspace-content',
        testId: 'run-alienatio-workspace',
        ariaLabelledBy: 'run-alienatio-workspace-title',
      }}
    >
      <h2 id="run-alienatio-workspace-title">Alienatio</h2>
      <p>Alienatio applies immediately. Reset Sectio restores every act from this visit.</p>
      <RunRosterFilters
        filters={filters}
        onChange={(next) => onFiltersChange({ ...filters, ...next })}
        alienatioState={filters.alienatioState}
        onAlienatioStateChange={(alienatioState) => onFiltersChange({ ...filters, alienatioState })}
      />
      <div className="run-alienatio-list" aria-label="Units available for Alienatio">
        {rows.map(({ unit, status, proceedsTenths }) => {
          const alienatioButton = (
            <ChromeButton unit="inner-text-button"
              data-ui-sfx={status === 'alienable' ? 'gold' : undefined}
              className={chromeUnitClassNames('inner-text-button', 'app-header-button', status === 'alienable' && 'danger')}
              disabled={status !== 'alienable'}
              onClick={() => onAlienate(unit.id)}
            >
              {status === 'alienable' ? 'Alienatio' : status === 'alienated' ? 'Alienated this visit' : 'Retained'}
            </ChromeButton>
          );
          const alienatioAction = status === 'alienable' ? alienatioButton : (
            <Tooltip
              trigger={alienatioButton}
              label={status === 'alienated'
                ? `${runUnitDisplayName(unit)} underwent Alienatio during this Sectio visit. Reset Sectio to restore it.`
                : 'The King is permanently retained and cannot undergo Alienatio.'}
              popupMaxInlineSize={300}
            >
              <span>
                {status === 'alienated'
                  ? 'Alienated during this Sectio visit. Reset Sectio to restore this unit.'
                  : 'The King is permanently retained and cannot undergo Alienatio.'}
              </span>
            </Tooltip>
          );
          return (
            <InnerChromeBox className={`run-alienatio-row is-${status}`} key={unit.id}>
              <img
                className="run-alienatio-board-piece"
                src={pieceSpritePath(unit.type, PLAYER_PORTRAIT_PALETTE, PLAYER_PIECE_FACING)}
                alt=""
                draggable={false}
              />
              <span className="run-alienatio-copy">
                <strong>{runUnitDisplayName(unit)}</strong>
                <small>{runUnitIdentifier(unit)} · {unitSourceLabel(unit)} · Base value {PIECE_VALUE[unit.type]}</small>
                <RunUnitTraitList run={run} unit={unit} compact />
              </span>
              <span className="run-alienatio-return">
                <small>{status === 'alienated' ? 'Received' : 'Alienatio return'}</small>
                {unit.type === 'king'
                  ? <strong>Retained</strong>
                  : <RunGoldAmount valueTenths={proceedsTenths} />}
              </span>
              {alienatioAction}
            </InnerChromeBox>
          );
        })}
        {!rows.length ? <p>No units match these filters.</p> : null}
      </div>
    </RunSceneViewport>
  );
}
