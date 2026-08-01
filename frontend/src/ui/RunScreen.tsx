import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useSkirmish, setRunBattleTransformSink } from '../game/store';
import { defaultFacingForSide } from '../core/pieces';
import type { GameState, Piece } from '../core/types';
import { LevelPreviewColumn } from './LevelPreviewColumn';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { InnerChromeBox, ShellViewportSwap } from './shared/ChromeBox';
import { HouseSelect } from './shared/HouseSelect';
import { TitleBarStatus } from './shell/TitleBarControls';
import { PLAY_RUN_SELECTOR_HREF } from './playHubRoute';
import { Skirmish, SkirmishShell, type RunBattlePresentation } from './Skirmish';
import { navigateApp } from './navigation';
import { useConfirm } from './shared/ConfirmDialog';
import { RunWorkspace } from './RunWorkspace';
import {
  ATARAXIA_BY_TIER,
  GOLD_SCALE,
  RUN_RELIC_BY_ID,
  battleVictoryGoldTenths,
  beginBattle,
  buyCard,
  buyPaidRelic,
  canLeaveShop,
  cashOutPawn,
  hasRelic,
  leaveShop,
  markReservistDeployed,
  observeRunUnitDeath,
  openShop,
  prepareDeployment,
  resetShop,
  restartBattle,
  runBattleActivityId,
  sellArmyUnit,
  setDeploymentChoices,
  shopHasChanges,
  takeLootRelic,
  type RunDocument,
  type RunRelicId,
} from '../run/model';
import {
  deploymentOptions,
  deploymentReady,
  levelWithRunDeployment,
  normalReservistCell,
  selectedDeploymentLayout,
} from '../run/deployment';
import { useActiveRun } from '../run/store';
import { RunRelicIcon, RunRelicsWorkspace } from './RunRelics';
import { RunGoldAmount } from './RunResources';
import {
  runSelfInspectionHref,
  runSelfInspectionViewFromSearch,
  RunSelfInspectionControls,
  type RunSelfInspectionView,
} from './RunSelfInspection';
import {
  DEFAULT_RUN_ARMY_FILTERS,
  DEFAULT_RUN_SELL_FILTERS,
  RunArmyWorkspace,
  RunSellWorkspace,
  runUnitIdentifier,
  runUnitRosterLabel,
  type RunArmyFilters,
  type RunSellFilters,
} from './RunArmyWorkspace';
import { RunWorkspaceStages } from './RunWorkspaceStages';
import { RunCard } from './RunCard';
import { ChromeButton, ChromeNavButton } from './shared/ChromeButton';

type RunScreenView = 'primary' | 'sell' | RunSelfInspectionView;
// The hydration placeholder only ever exists beneath the route's own entrance gate,
// so swapping away from it needs no in-place choreography.
const RUN_HYDRATING_STAGE = 'run:hydrating';
const RUN_STAGE_PLACEHOLDERS = [RUN_HYDRATING_STAGE] as const;

function visibleRunRelicCount(run: RunDocument): number {
  return run.relics.filter((relicId) => Boolean(RUN_RELIC_BY_ID[relicId])).length;
}

function RunTitleBarStatus({ run }: { run: RunDocument }): ReactElement {
  return (
    <div className="skirmish-topbar-status">
      <TitleBarStatus className="skirmish-status-chip skirmish-turn-plate">
        <strong>{run.war.name}</strong>
        <small>{ATARAXIA_BY_TIER[run.ataraxiaTier].label}</small>
      </TitleBarStatus>
      <TitleBarStatus className="skirmish-status-chip skirmish-clock">
        <RunGoldAmount valueTenths={run.goldTenths} className="run-gold-amount--title" />
      </TitleBarStatus>
      <TitleBarStatus className="skirmish-status-chip skirmish-objective">
        <span>
          <strong>Battle {Math.min(run.battleIndex + 1, run.war.battles.length)} / {run.war.battles.length}</strong>
          <small>{run.phase === 'shop' ? 'Shop' : run.phase === 'victory' ? 'War won' : run.phase}</small>
        </span>
      </TitleBarStatus>
    </div>
  );
}

function useRunAbandon(run: RunDocument): {
  abandonDialog: ReactElement | null;
  abandoning: boolean;
  requestAbandon: () => Promise<void>;
} {
  const abandon = useActiveRun((state) => state.abandon);
  const [abandoning, setAbandoning] = useState(false);
  const { ask, dialog } = useConfirm();
  const requestAbandon = useCallback(async (): Promise<void> => {
    if (abandoning) return;
    const confirmed = await ask({
      title: 'Abandon this Run?',
      message: `${run.war.name} and all of its army, gold, relics, and Battle progress will be permanently removed.`,
      confirmLabel: 'Abandon Run',
      cancelLabel: 'Keep Run',
      tone: 'danger',
    });
    if (!confirmed) return;
    setAbandoning(true);
    await abandon();
    navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false });
  }, [abandon, abandoning, ask, run.war.name]);
  return { abandonDialog: dialog, abandoning, requestAbandon };
}

function RunMetaControls({
  run,
  view,
  onNavigate,
  showAbandon = true,
}: {
  run: RunDocument;
  view: RunScreenView;
  onNavigate: (view: RunScreenView) => void;
  showAbandon?: boolean;
}): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const { abandonDialog, abandoning, requestAbandon } = useRunAbandon(run);
  const shop = run.phase === 'shop' ? run.shop : null;
  const canLeave = canLeaveShop(run);
  const openingNeedsPurchase = shop?.kind === 'opening' && shop.purchasedCardOfferIds.length === 0;
  const continueHint = openingNeedsPurchase
    ? 'Buy one card before continuing.'
    : 'Choose one Loot relic before continuing.';
  const primaryLabel = run.phase === 'deployment'
      ? 'Deployment'
      : run.phase === 'battle'
        ? 'Battle'
        : run.phase === 'victory'
          ? 'Victory'
          : 'Shop';
  return (
    <>
      {abandonDialog}
      <section className="run-meta-controls" aria-label="Run controls">
        <div className="skirmish-view-group">
          <span className="skirmish-eyebrow">{shop ? 'Shop views' : 'Run views'}</span>
          <div className="run-meta-navigation">
            <ChromeButton unit="inner-text-button"
              data-testid="run-view-primary"
              className={chromeUnitClassNames('inner-text-button', 'app-header-button', view === 'primary' && 'active')}
              aria-pressed={view === 'primary'}
              onClick={() => onNavigate('primary')}
            >
              {primaryLabel}
            </ChromeButton>
            {shop ? (
              <ChromeButton unit="inner-text-button"
                data-testid="run-view-sell"
                className={chromeUnitClassNames('inner-text-button', 'app-header-button', view === 'sell' && 'active')}
                aria-pressed={view === 'sell'}
                onClick={() => onNavigate('sell')}
              >
                Sell Units
              </ChromeButton>
            ) : null}
          </div>
        </div>
        <div className="skirmish-view-group">
          <span className="skirmish-eyebrow">Self inspection</span>
          <RunSelfInspectionControls
            view={view === 'army' || view === 'relics' ? view : null}
            onNavigate={onNavigate}
          />
        </div>
        {shop ? (
          <div className="skirmish-view-group">
            <span className="skirmish-eyebrow">Shop</span>
            <div className="run-meta-navigation">
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
                disabled={!shopHasChanges(run)}
                data-testid="reset-run-shop"
                onClick={() => {
                  replace(resetShop(run));
                  onNavigate('primary');
                }}
              >
                Reset Shop
              </ChromeButton>
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
                disabled={!canLeave}
                data-testid="continue-run-shop"
                title={canLeave ? undefined : continueHint}
                onClick={() => {
                  replace(prepareDeployment(leaveShop(run)));
                  onNavigate('primary');
                }}
              >
                {shop.kind === 'opening' ? 'Continue to first Battle' : 'Continue to next Battle'}
              </ChromeButton>
            </div>
            {!canLeave ? <p className="skirmish-grid-hint">{continueHint}</p> : null}
          </div>
        ) : null}
        {showAbandon ? (
          <div className="skirmish-view-group run-meta-abandon">
            <span className="skirmish-eyebrow">Run</span>
            <div className="skirmish-view-row">
              <ChromeButton unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'danger')}
                data-testid="abandon-run"
                disabled={abandoning}
                onClick={() => { void requestAbandon(); }}
              >
                {abandoning ? 'Abandoning…' : 'Abandon Run'}
              </ChromeButton>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}

function RunPhaseWorkspace({
  inspectionWorkspace,
  children,
}: {
  inspectionWorkspace: ReactElement | null;
  children: ReactElement;
}): ReactElement {
  return (
    <ShellViewportSwap
      className="run-phase-workspace"
      primaryClassName="run-phase-primary"
      primary={children}
      aria-label="Run workspace"
    >
      {inspectionWorkspace}
    </ShellViewportSwap>
  );
}

function DeploymentPanel({ run }: { run: RunDocument }): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const prepared = run.deployment ? run : prepareDeployment(run);
  useEffect(() => {
    if (run.deployment) return;
    // A departing stage may keep rendering a superseded document; only repair the live one.
    const latest = useActiveRun.getState().run;
    if (latest?.id === run.id && latest.phase === 'deployment' && !latest.deployment) {
      replace(prepareDeployment(latest));
    }
  }, [replace, run.deployment, run.id]);
  const level = prepared.war.battles[prepared.battleIndex]?.level;
  const options = useMemo(() => deploymentOptions(prepared, level), [level, prepared]);
  const layout = selectedDeploymentLayout(prepared, options);
  const previewLevel = useMemo(() => levelWithRunDeployment(prepared, level, layout), [layout, level, prepared]);
  const chosenBlocked = prepared.deployment?.chosenBlockedUnitIds ?? [];

  const toggleBlocked = (unitId: string): void => {
    const next = chosenBlocked.includes(unitId)
      ? chosenBlocked.filter((id) => id !== unitId)
      : chosenBlocked.length < options.blockedChoiceCount ? [...chosenBlocked, unitId] : chosenBlocked;
    replace(setDeploymentChoices(prepared, { chosenBlockedUnitIds: next }));
  };

  const setManual = (unitId: string, cellKey: string): void => {
    const manualPlacements = { ...(prepared.deployment?.manualPlacements ?? {}) };
    if (cellKey) manualPlacements[unitId] = cellKey;
    else delete manualPlacements[unitId];
    replace(setDeploymentChoices(prepared, { manualPlacements }));
  };

  const start = (): void => {
    if (!deploymentReady(prepared, options)) return;
    const selected = selectedDeploymentLayout(prepared, options);
    replace(beginBattle(
      prepared,
      Object.keys(selected.placements),
      selected.reserveUnitIds,
      selected.blockedUnitIds,
    ));
  };

  return (
    <RunWorkspace
      className="run-deployment-workspace"
      contentClassName="run-deployment-workspace-content"
      data-testid="run-deployment-workspace"
      aria-labelledby="run-deployment-workspace-title"
    >
      <section className="run-deployment-pane">
        <h2 id="run-deployment-workspace-title">Deploy — {level.name}</h2>
        <p>{prepared.war.description || 'An authored War Battle.'}</p>

        {options.needsBlockedChoice ? (
          <section className="run-deployment-control">
            <h3>Muster Roll</h3>
            <p>Choose exactly {options.blockedChoiceCount} unit{options.blockedChoiceCount === 1 ? '' : 's'} to sit out.</p>
            <div className="run-choice-list">
              {prepared.army.filter((unit) => unit.type !== 'king').map((unit) => {
                const selected = chosenBlocked.includes(unit.id);
                return (
                  <ChromeButton unit="inner-list-row"
                    className={chromeUnitClassNames('inner-list-row', 'run-choice-option', selected && 'active')}
                    aria-pressed={selected}
                    disabled={!selected && chosenBlocked.length >= options.blockedChoiceCount}
                    onClick={() => toggleBlocked(unit.id)}
                    key={unit.id}
                  >
                    <span>{runUnitRosterLabel(unit)}</span>
                    <small>{selected ? 'Sitting out' : 'Deploying'}</small>
                  </ChromeButton>
                );
              })}
            </div>
          </section>
        ) : options.overflowCount > 0 ? (
          <p>{options.overflowCount} excess unit{options.overflowCount === 1 ? '' : 's'} will sit out this Battle.</p>
        ) : null}

        {options.disciplineUnitIds.length > 0 ? (
          <section className="run-deployment-control">
            <h3>Discipline</h3>
            <p>Place every disciplined unit before the remaining army is dealt.</p>
            {options.disciplineUnitIds.map((unitId) => {
              const unit = prepared.army.find((candidate) => candidate.id === unitId);
              const used = new Set(Object.entries(prepared.deployment?.manualPlacements ?? {})
                .filter(([id]) => id !== unitId)
                .map(([, cell]) => cell));
              const squareOptions = [
                { value: '', label: 'Choose square…' },
                ...options.zoneCells
                  .filter((cell) => !used.has(`${cell.x},${cell.y}`))
                  .map((cell) => ({
                    value: `${cell.x},${cell.y}`,
                    label: `${String.fromCharCode(65 + cell.x)}${level.board.rows - cell.y}`,
                  })),
              ];
              return (
                <label className="run-placement-row" key={unitId}>
                  <span>{unit ? runUnitRosterLabel(unit) : unitId}</span>
                  <HouseSelect
                    value={prepared.deployment?.manualPlacements[unitId] ?? ''}
                    options={squareOptions}
                    onChange={(cellKey) => setManual(unitId, cellKey)}
                    ariaLabel={`Deployment square for ${unit ? runUnitRosterLabel(unit) : unitId}`}
                  />
                </label>
              );
            })}
          </section>
        ) : null}

        {hasRelic(prepared, 'surveyors-compass') ? (
          <section className="run-deployment-control">
            <h3>Surveyor&apos;s Compass</h3>
            <p>Choose which valid random layout to use.</p>
            <div className="run-inline-actions">
              {[0, 1].map((index) => (
                <ChromeButton unit="inner-text-button"
                  key={index}
                  className={chromeUnitClassNames('inner-text-button', 'app-header-button', prepared.deployment?.layoutChoice === index && 'active')}
                  onClick={() => replace(setDeploymentChoices(prepared, { layoutChoice: index as 0 | 1 }))}
                >
                  Layout {index + 1}
                </ChromeButton>
              ))}
            </div>
          </section>
        ) : null}

        <ChromeButton unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
          disabled={!deploymentReady(prepared, options)}
          onClick={start}
        >
          Begin Battle
        </ChromeButton>
      </section>

      <LevelPreviewColumn
        level={previewLevel}
        title={`${level.name} deployment`}
        embedded
        actions={<p className="run-preview-note">{Object.keys(layout.placements).length} deployed · {layout.blockedUnitIds.length} in reserve</p>}
      />
    </RunWorkspace>
  );
}

function relicTargetRequired(relic: RunRelicId | null): boolean {
  return relic === 'conscription-notice';
}

function RelicOffer({
  run,
  relicId,
  action,
  actionLabel,
  disabled = false,
}: {
  run: RunDocument;
  relicId: RunRelicId;
  action: (targetUnitId?: string) => void;
  actionLabel: ReactNode;
  disabled?: boolean;
}): ReactElement {
  const relic = RUN_RELIC_BY_ID[relicId];
  const [target, setTarget] = useState('');
  const needsTarget = relicTargetRequired(relicId);
  return (
    <InnerChromeBox className="run-card run-relic-card">
      <header className="run-relic-card-heading">
        <RunRelicIcon relicId={relicId} />
        <h3>{relic.name}</h3>
      </header>
      <p>{relic.description}</p>
      {needsTarget ? (
        <HouseSelect
          value={target}
          options={[
            { value: '', label: 'Choose a unit…' },
            ...run.army.map((unit) => ({ value: unit.id, label: runUnitRosterLabel(unit) })),
          ]}
          onChange={setTarget}
          ariaLabel="Discipline target"
        />
      ) : null}
      <ChromeButton unit="inner-text-button"
        className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
        disabled={disabled || (needsTarget && !target)}
        onClick={() => action(target || undefined)}
      >
        {actionLabel}
      </ChromeButton>
    </InnerChromeBox>
  );
}

function ShopPanel({
  run,
  view,
  sellWorkspace,
}: {
  run: RunDocument;
  view: RunScreenView;
  sellWorkspace: ReactElement;
}): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const shop = run.shop!;
  const opening = shop.kind === 'opening';
  const victoryGoldTenths = Number.isSafeInteger(shop.victoryGoldTenths) && shop.victoryGoldTenths >= 0
    ? shop.victoryGoldTenths
    : battleVictoryGoldTenths(run.war.battles[shop.afterBattleIndex].level);
  const pestiferousLosses = run.pestiferousLosses.filter((loss) => loss.battleIndex === shop.afterBattleIndex);
  return (
    <>
      {view === 'sell' ? sellWorkspace : (
        <RunWorkspace
          className="run-shop-workspace"
          contentClassName="run-shop-workspace-content"
          data-testid="run-shop-workspace"
          aria-labelledby="run-shop-workspace-title"
        >
        <h2 id="run-shop-workspace-title">{!opening && run.war.battles[shop.afterBattleIndex]?.loot ? 'Loot Shop' : 'Shop'}</h2>
        <div className="run-shop-rules">
          {opening ? (
            <>
              <span>Starting gold</span>
              <RunGoldAmount valueTenths={shop.entrySnapshot.goldTenths} />
            </>
          ) : (
            <>
              <span>Victory</span>
              <span aria-hidden="true">+</span>
              <RunGoldAmount valueTenths={victoryGoldTenths} />
            </>
          )}
          <span>Buy any cards you can afford</span>
        </div>
        {pestiferousLosses.length ? (
          <InnerChromeBox className="run-pestiferous-losses" role="status">
            <h3>Pestiferous attrition</h3>
            <p>These Plagued units were lost after the Battle:</p>
            <ul>
              {pestiferousLosses.map((loss) => (
                <li key={`${loss.cardId}:${loss.unit.id}`}>{loss.unit.name} · {loss.unit.type}</li>
              ))}
            </ul>
          </InnerChromeBox>
        ) : null}
        <section>
          <h3>Cards</h3>
          <div className="run-card-grid">
            {shop.cardOffers.map((offer) => {
              const purchased = shop.purchasedCardOfferIds.includes(offer.offerId);
              return (
                <RunCard
                  card={offer}
                  mode="shop"
                  purchased={purchased}
                  key={offer.offerId}
                  disabled={purchased || run.goldTenths < offer.cost * GOLD_SCALE}
                  onSelect={() => replace(buyCard(run, offer.offerId))}
                />
              );
            })}
          </div>
        </section>

        {shop.lootRelicOffers.length > 0 ? (
          <section>
            <h3>Loot — choose one</h3>
            <div className="run-card-grid">
              {shop.lootRelicOffers.map((relicId) => (
                <RelicOffer
                  key={relicId}
                  run={run}
                  relicId={relicId}
                  actionLabel={shop.chosenLootRelicId === relicId ? 'Taken' : 'Take relic'}
                  disabled={Boolean(shop.chosenLootRelicId)}
                  action={(target) => replace(takeLootRelic(run, relicId, target))}
                />
              ))}
            </div>
          </section>
        ) : null}

        {shop.paidRelicOffer ? (
          <section>
            <h3>Merchant&apos;s Shopkey</h3>
            <RelicOffer
              run={run}
              relicId={shop.paidRelicOffer}
              actionLabel={shop.paidRelicBought ? 'Sold out this Conflict' : (
                <span className="run-paid-relic-price">
                  <span>Buy</span>
                  <RunGoldAmount valueTenths={10 * GOLD_SCALE} className="run-gold-amount--button" />
                </span>
              )}
              disabled={shop.paidRelicBought || run.goldTenths < 10 * GOLD_SCALE}
              action={(target) => replace(buyPaidRelic(run, target))}
            />
          </section>
        ) : null}

        </RunWorkspace>
      )}
    </>
  );
}

function VictoryPanel({ run }: { run: RunDocument }): ReactElement {
  const abandon = useActiveRun((state) => state.abandon);
  return (
    <RunWorkspace
      className="run-victory-workspace"
      contentClassName="run-victory-workspace-content"
      data-testid="run-victory-workspace"
      aria-labelledby="run-victory-workspace-title"
    >
      <h2 id="run-victory-workspace-title">War won</h2>
      <h2>{run.war.name}</h2>
      <p>{ATARAXIA_BY_TIER[run.ataraxiaTier].label} — {ATARAXIA_BY_TIER[run.ataraxiaTier].title}</p>
      <p>{run.war.description}</p>
      <p className="run-victory-summary">
        <span>{run.army.length} persistent units</span>
        <span>{visibleRunRelicCount(run)} relics</span>
        <RunGoldAmount valueTenths={run.goldTenths} />
      </p>
      <ChromeButton unit="inner-text-button"
        className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
        onClick={() => {
          void abandon().then(() => {
            navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false });
          });
        }}
      >
        Finish Run
      </ChromeButton>
    </RunWorkspace>
  );
}

function BattlePanel({
  run,
  routePath,
  routeSearch,
  view,
  onNavigate,
  inspectionWorkspace,
}: {
  run: RunDocument;
  view: RunScreenView;
  onNavigate: (view: RunScreenView) => void;
  inspectionWorkspace: ReactElement | null;
  routePath: string;
  routeSearch: string;
}): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const currentRun = useActiveRun((state) => state.run);
  const { abandonDialog, requestAbandon } = useRunAbandon(run);
  const baseLevel = run.war.battles[run.battleIndex].level;
  // Battle-runtime writes (including Restart) do not change deployment. Keep the
  // projected board document referentially stable across those persistence updates,
  // so Skirmish does not re-run its board-entry effect for an unchanged battle.
  const options = useMemo(
    () => deploymentOptions(run, baseLevel),
    [baseLevel, run.army, run.deployment, run.relics, run.seed],
  );
  const layout = useMemo(
    () => selectedDeploymentLayout(run, options),
    [options, run.deployment, run.relics],
  );
  const battleLevel = useMemo(
    () => levelWithRunDeployment(run, baseLevel, layout),
    [baseLevel, layout, run.army, run.relics],
  );
  const runId = run.id;
  const battleSeed = run.deployment?.seed ?? run.seed;
  const relicIds = run.relics;
  const canCashOutPawn = hasRelic(run, 'mercenary-boat');

  useEffect(() => {
    setRunBattleTransformSink((game, _events) => {
      let active = useActiveRun.getState().run;
      if (!active || active.phase !== 'battle' || active.id !== run.id || !active.battleRuntime) return game;
      const observedDeadUnitIds = active.battleRuntime.observedDeadUnitIds;
      let transformed: GameState = game;
      let changed = false;
      for (const unit of active.army) {
        const piece = transformed.pieces.find((candidate) => candidate.id === unit.id);
        if (!piece || piece.alive || observedDeadUnitIds.includes(unit.id)) continue;
        const observed = observeRunUnitDeath(active, unit.id);
        active = observed.run;
        changed = active !== useActiveRun.getState().run || changed;
        if (!observed.reservistUnitId) continue;
        const reservist = active.army.find((candidate) => candidate.id === observed.reservistUnitId);
        if (!reservist) continue;
        const occupied = new Set(transformed.pieces.filter((candidate) => candidate.alive).map((candidate) => `${candidate.x},${candidate.y}`));
        const cell = normalReservistCell(
          active,
          baseLevel,
          occupied,
          active.battleRuntime?.reinforcementSequence ?? 0,
        );
        if (!cell) continue;
        const facing = defaultFacingForSide('player');
        const spawned: Piece = {
          id: reservist.id,
          name: reservist.name,
          type: reservist.type,
          side: 'player',
          ...cell,
          alive: true,
          facing,
          startX: cell.x,
          startY: cell.y,
          ...(reservist.type === 'pawn' ? { pawnForward: facing } : {}),
        };
        transformed = { ...transformed, pieces: [...transformed.pieces, spawned] };
        active = markReservistDeployed(active, reservist.id);
        changed = true;
      }
      if (changed) useActiveRun.getState().replace(active);
      return transformed;
    });
    return () => setRunBattleTransformSink(null);
  }, [baseLevel, run.id]);

  const presentation = useMemo<RunBattlePresentation>(() => ({
    level: battleLevel,
    seed: battleSeed,
    activityId: runBattleActivityId(runId, run.battleIndex),
    relicIds,
    onVictory: (survivors) => {
      const latest = useActiveRun.getState().run;
      if (latest?.id === runId) replace(openShop(latest, survivors));
    },
    onRestart: () => {
      const latest = useActiveRun.getState().run;
      if (latest?.id === runId) replace(restartBattle(latest));
    },
    onAbandonRun: () => { void requestAbandon(); },
    onPawnCashOut: canCashOutPawn
      ? (unitId) => {
          const latest = useActiveRun.getState().run;
          if (latest?.id === runId) replace(cashOutPawn(latest, unitId));
        }
      : undefined,
  }), [battleLevel, battleSeed, canCashOutPawn, relicIds, replace, requestAbandon, run.battleIndex, runId]);

  // Subscribe to the current document so a Paid Crossing cash-out or Reservist event
  // refreshes the hook inputs without restarting the already-live matching board.
  void currentRun;
  return (
    <>
      {abandonDialog}
      <Skirmish
        runBattle={presentation}
        routePath={routePath}
        routeSearch={routeSearch}
        runWorkspace={inspectionWorkspace}
        runSelfInspectionView={view === 'army' || view === 'relics' ? view : null}
        onNavigateRunView={onNavigate}
      />
    </>
  );
}

export function RunScreen({
  routePath = window.location.pathname,
  routeSearch = window.location.search,
}: {
  routePath?: string;
  routeSearch?: string;
} = {}): ReactElement {
  const run = useActiveRun((state) => state.run);
  const hydrated = useActiveRun((state) => state.hydrated);
  const hydrate = useActiveRun((state) => state.hydrate);
  const replace = useActiveRun((state) => state.replace);
  const viewScope = run
    ? `${run.id}:${run.phase}:${run.phase === 'shop' ? run.shop?.afterBattleIndex ?? run.battleIndex : run.battleIndex}`
    : 'no-run';
  const filterScope = run?.phase === 'shop'
    ? `${run.id}:shop:${run.shop?.afterBattleIndex ?? run.battleIndex}`
    : run
      ? `${run.id}:outside-shop`
      : 'no-run';
  const [viewState, setViewState] = useState<{ scope: string; view: RunScreenView }>({
    scope: 'no-run',
    view: 'primary',
  });
  const [selectedState, setSelectedState] = useState<{ scope: string; unitId: string | null }>({
    scope: 'no-run',
    unitId: null,
  });
  const [armyFilterState, setArmyFilterState] = useState<{ scope: string; filters: RunArmyFilters }>({
    scope: 'no-run',
    filters: { ...DEFAULT_RUN_ARMY_FILTERS },
  });
  const [sellFilterState, setSellFilterState] = useState<{ scope: string; filters: RunSellFilters }>({
    scope: 'no-run',
    filters: { ...DEFAULT_RUN_SELL_FILTERS },
  });
  const requestedInspectionView = runSelfInspectionViewFromSearch(
    typeof window === 'undefined' ? '' : window.location.search,
  );
  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => {
    if (
      hydrated
      && routePath.startsWith('/run/strategikon/')
      && run?.phase !== 'battle'
    ) {
      navigateApp(`/run${routeSearch}`, { replace: true, scroll: false });
    }
  }, [hydrated, routePath, routeSearch, run?.phase]);

  // The pre-hydration document may exist from browser storage, but the screen treats
  // the Run as absent until hydrate() has arbitrated browser and account copies.
  const shellRun = hydrated ? run : null;
  const rawView = viewState.scope === viewScope
    ? viewState.view
    : requestedInspectionView ?? 'primary';
  const view = shellRun?.phase !== 'shop' && rawView === 'sell' ? 'primary' : rawView;
  const selectedUnitId = selectedState.scope === viewScope ? selectedState.unitId : null;
  const armyFilters = armyFilterState.scope === filterScope
    ? armyFilterState.filters
    : { ...DEFAULT_RUN_ARMY_FILTERS };
  const sellFilters = sellFilterState.scope === filterScope
    ? sellFilterState.filters
    : { ...DEFAULT_RUN_SELL_FILTERS };
  const navigateRunView = (nextView: RunScreenView): void => {
    const nextInspectionView = nextView === 'army' || nextView === 'relics' ? nextView : null;
    const nextHref = runSelfInspectionHref(window.location.href, nextInspectionView);
    window.history.replaceState(window.history.state, '', nextHref);
    setViewState({ scope: viewScope, view: nextView });
    if (nextView !== 'army') setSelectedState({ scope: viewScope, unitId: null });
  };
  const sellUnit = (unitId: string): void => {
    if (!shellRun) return;
    const latest = useActiveRun.getState().run;
    if (!latest || latest.id !== shellRun.id) return;
    const sold = sellArmyUnit(latest, unitId);
    if (sold !== latest) replace(sold);
    setSelectedState({ scope: viewScope, unitId: null });
  };
  const armyWorkspace = shellRun ? (
    <RunArmyWorkspace
      run={shellRun}
      filters={armyFilters}
      selectedUnitId={selectedUnitId}
      onFiltersChange={(filters) => setArmyFilterState({ scope: filterScope, filters })}
      onSelectUnit={(unitId) => setSelectedState({ scope: viewScope, unitId })}
      onBack={() => setSelectedState({ scope: viewScope, unitId: null })}
      onSell={sellUnit}
    />
  ) : null;
  const relicsWorkspace = shellRun ? <RunRelicsWorkspace relicIds={shellRun.relics} /> : null;
  const inspectionWorkspace = view === 'army'
    ? armyWorkspace
    : view === 'relics'
      ? relicsWorkspace
      : null;
  const sellWorkspace = shellRun ? (
    <RunSellWorkspace
      run={shellRun}
      filters={sellFilters}
      onFiltersChange={(filters) => setSellFilterState({ scope: filterScope, filters })}
      onSell={sellUnit}
    />
  ) : null;
  if (shellRun?.phase === 'battle') {
    return (
      <BattlePanel
        run={shellRun}
        routePath={routePath}
        routeSearch={routeSearch}
        view={view}
        onNavigate={navigateRunView}
        inspectionWorkspace={inspectionWorkspace}
      />
    );
  }
  // Every non-Battle destination shares ONE persistent shell: title-bar status, relic
  // strip, and the Controls rail stay mounted across phase changes, while the staged
  // workspace host below choreographs the only part that actually changes.
  const workspace = !hydrated
    ? (
      <RunWorkspace
        className="run-loading-workspace"
        contentClassName="run-status-workspace-content"
        data-testid="run-loading-workspace"
        role="status"
      >
        <p>Loading Run…</p>
      </RunWorkspace>
    )
    : !shellRun
      ? (
        <RunWorkspace
          className="run-empty-workspace"
          contentClassName="run-status-workspace-content"
          data-testid="run-empty-workspace"
          aria-labelledby="run-empty-workspace-title"
        >
          <h2 id="run-empty-workspace-title">No active Run</h2>
          <p>Start a Run from Play, or direct-play one of your Wars from the War Editor.</p>
          <ChromeNavButton unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
            to={PLAY_RUN_SELECTOR_HREF}
          >
            Back to Run
          </ChromeNavButton>
        </RunWorkspace>
      )
      : shellRun.phase === 'deployment'
          ? <DeploymentPanel run={shellRun} />
          : shellRun.phase === 'shop' && shellRun.shop
            ? <ShopPanel run={shellRun} view={view} sellWorkspace={sellWorkspace!} />
            : <VictoryPanel run={shellRun} />;
  const stageKey = !hydrated ? RUN_HYDRATING_STAGE : shellRun ? viewScope : 'run:none';
  return (
    <SkirmishShell
      className={`run-screen${shellRun && visibleRunRelicCount(shellRun) ? ' has-relics' : ''}`}
      testId="run-screen"
      ownsGameplaySceneTarget
      titleBarContent={shellRun ? <RunTitleBarStatus run={shellRun} /> : null}
      relicIds={shellRun ? shellRun.relics : []}
      shellWorkspaceCoversRelics={Boolean(inspectionWorkspace)}
      controlsContent={shellRun
        ? <RunMetaControls run={shellRun} view={view} onNavigate={navigateRunView} showAbandon={shellRun.phase !== 'victory'} />
        : null}
      readyToCompose={hydrated}
      hudProps={{ enableGlobalShortcuts: false }}
    >
      <RunPhaseWorkspace inspectionWorkspace={inspectionWorkspace}>
        <RunWorkspaceStages stageKey={stageKey} placeholderKeys={RUN_STAGE_PLACEHOLDERS}>
          {workspace}
        </RunWorkspaceStages>
      </RunPhaseWorkspace>
    </SkirmishShell>
  );
}
