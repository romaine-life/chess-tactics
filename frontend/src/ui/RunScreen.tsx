import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useSkirmish, setRunBattleTransformSink } from '../game/store';
import { defaultFacingForSide, paletteForSide, pieceSpritePath } from '../core/pieces';
import type { GameState, Piece } from '../core/types';
import { LevelPreviewColumn } from './LevelPreviewColumn';
import { NavButton } from './shared/NavButton';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { InnerChromeBox, OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { TitleBarStatus } from './shell/TitleBarControls';
import { PLAY_RUN_SELECTOR_HREF } from './playHubRoute';
import { Skirmish, SkirmishShell, type RunBattlePresentation } from './Skirmish';
import { navigateApp } from './navigation';
import { useConfirm } from './shared/ConfirmDialog';
import {
  GOLD_SCALE,
  PIECE_BUNDLE_BY_ID,
  PIECE_LABEL,
  PIECE_VALUE,
  RUN_RELIC_BY_ID,
  battleVictoryGoldTenths,
  beginBattle,
  bundleLabel,
  buyBundle,
  buyPaidRelic,
  cashOutPawn,
  chooseDraft,
  hasRelic,
  leaveShop,
  markReservistDeployed,
  observeRunUnitDeath,
  openShop,
  prepareDeployment,
  restartBattle,
  sellArmyUnit,
  setDeploymentChoices,
  takeLootRelic,
  type RunDocument,
  type PieceBundle,
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
import { RunRelicIcon } from './RunRelics';
import { RunGoldAmount } from './RunResources';

const PLAYER_BUNDLE_PALETTE = paletteForSide('player');
const PLAYER_BUNDLE_FACING = defaultFacingForSide('player');

export function RunBundleCard({
  bundle,
  mode,
  bought = false,
  disabled = false,
  onSelect,
}: {
  bundle: PieceBundle;
  mode: 'draft' | 'shop';
  bought?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}): ReactElement {
  const label = bundleLabel(bundle);
  const actionLabel = mode === 'draft'
    ? `Take ${label}`
    : `${bought ? 'Purchased' : 'Buy'} ${label} for ${bundle.value} gold`;
  return (
    <button
      type="button"
      data-ui-sfx={mode === 'shop' ? 'card-purchase' : undefined}
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'run-bundle-card', bought && 'active is-purchased')}
      aria-label={actionLabel}
      disabled={disabled}
      onClick={onSelect}
    >
      <span
        className="run-bundle-piece-grid"
        data-piece-count={Math.min(bundle.pieces.length, 9)}
        aria-hidden="true"
      >
        {bundle.pieces.map((piece, index) => (
          <img
            className="run-bundle-board-piece"
            src={pieceSpritePath(piece, PLAYER_BUNDLE_PALETTE, PLAYER_BUNDLE_FACING)}
            alt=""
            draggable={false}
            key={`${piece}-${index}`}
          />
        ))}
      </span>
      <span className="run-bundle-card-footer" aria-hidden="true">
        {mode === 'shop' ? <RunGoldAmount valueTenths={bundle.value * GOLD_SCALE} /> : <strong>Take</strong>}
        {bought ? <strong>Purchased</strong> : null}
      </span>
    </button>
  );
}

function RunTitleBarStatus({ run }: { run: RunDocument }): ReactElement {
  return (
    <div className="skirmish-topbar-status">
      <TitleBarStatus className="skirmish-status-chip skirmish-turn-plate">
        <strong>{run.war.name}</strong>
        <small>Run</small>
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

function RunArmyControls({
  run,
  selling = false,
  showAbandon = true,
}: {
  run: RunDocument;
  selling?: boolean;
  showAbandon?: boolean;
}): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const { abandonDialog, abandoning, requestAbandon } = useRunAbandon(run);
  return (
    <>
      {abandonDialog}
      <section className="run-army" aria-label="Persistent army">
        <h3>Army</h3>
        <div className="run-army-list">
          {run.army.map((unit) => {
            const sale = PIECE_VALUE[unit.type] * (hasRelic(run, 'fair-scales') ? 0.75 : 0.5);
            return (
              <div className="run-army-unit" key={unit.id}>
                <span>{PIECE_LABEL[unit.type]}</span>
                {unit.abilities.includes('discipline') ? <small>Discipline</small> : null}
                {selling && unit.type !== 'king' ? (
                  <button
                    type="button"
                    data-ui-sfx="gold-sell"
                    data-chrome-unit="inner-text-button"
                    className={chromeUnitClassNames('inner-text-button', 'app-header-button')}
                    onClick={() => replace(sellArmyUnit(run, unit.id))}
                  >
                    <span>Sell</span>
                    <RunGoldAmount valueTenths={sale * GOLD_SCALE} className="run-gold-amount--button" />
                  </button>
                ) : unit.type === 'king' ? <small>Retained</small> : null}
              </div>
            );
          })}
        </div>
        {showAbandon ? (
          <div className="skirmish-view-group">
            <span className="skirmish-eyebrow">Run</span>
            <div className="skirmish-view-row">
              <button
                type="button"
                data-chrome-unit="inner-text-button"
                className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'danger')}
                data-testid="abandon-run"
                disabled={abandoning}
                onClick={() => { void requestAbandon(); }}
              >
                {abandoning ? 'Abandoning…' : 'Abandon Run'}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}

function DraftPanel({ run }: { run: RunDocument }): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  return (
    <SkirmishShell
      className={`run-screen${run.relics.length ? ' has-relics' : ''}`}
      testId="run-screen"
      titleBarContent={<RunTitleBarStatus run={run} />}
      relicIds={run.relics}
      controlsContent={<RunArmyControls run={run} />}
      hudProps={{ enableGlobalShortcuts: false }}
    >
      <main className="run-workspace">
        <OuterChromeBox chromeConsumer="run-draft" titled className="run-panel">
          <OuterChromeHeader title="Muster your army" />
          <p>Your King and three Pawns are ready. Choose one of the two dealt six-point reinforcements.</p>
          <div className="run-card-grid" aria-label="Opening draft">
            {run.draftOffers.map((offer) => (
              <RunBundleCard
                bundle={offer}
                mode="draft"
                key={offer.draftId}
                onSelect={() => replace(prepareDeployment(chooseDraft(run, offer.draftId)))}
              />
            ))}
          </div>
        </OuterChromeBox>
      </main>
    </SkirmishShell>
  );
}

function DeploymentPanel({ run }: { run: RunDocument }): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const prepared = run.deployment ? run : prepareDeployment(run);
  useEffect(() => {
    if (!run.deployment) replace(prepared);
  }, [prepared, replace, run.deployment]);
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
    <SkirmishShell
      className={`run-screen${prepared.relics.length ? ' has-relics' : ''}`}
      testId="run-screen"
      titleBarContent={<RunTitleBarStatus run={prepared} />}
      relicIds={prepared.relics}
      controlsContent={<RunArmyControls run={prepared} />}
      hudProps={{ enableGlobalShortcuts: false }}
    >
      <main className="run-workspace">
        <OuterChromeBox chromeConsumer="run-deployment" titled className="run-panel run-deployment-panel">
        <OuterChromeHeader title={`Deploy — ${level.name}`} />
        <p>{prepared.war.description || 'An authored War Battle.'}</p>

        {options.needsBlockedChoice ? (
          <section className="run-deployment-control">
            <h3>Muster Roll</h3>
            <p>Choose exactly {options.blockedChoiceCount} unit{options.blockedChoiceCount === 1 ? '' : 's'} to sit out.</p>
            <div className="run-choice-list">
              {prepared.army.filter((unit) => unit.type !== 'king').map((unit) => (
                <label key={unit.id}>
                  <input
                    type="checkbox"
                    checked={chosenBlocked.includes(unit.id)}
                    onChange={() => toggleBlocked(unit.id)}
                  />
                  {PIECE_LABEL[unit.type]}
                </label>
              ))}
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
              return (
                <label className="run-placement-row" key={unitId}>
                  <span>{unit ? PIECE_LABEL[unit.type] : unitId}</span>
                  <select
                    value={prepared.deployment?.manualPlacements[unitId] ?? ''}
                    onChange={(event) => setManual(unitId, event.target.value)}
                  >
                    <option value="">Choose square…</option>
                    {options.zoneCells.filter((cell) => !used.has(`${cell.x},${cell.y}`)).map((cell) => (
                      <option value={`${cell.x},${cell.y}`} key={`${cell.x},${cell.y}`}>
                        {String.fromCharCode(65 + cell.x)}{level.board.rows - cell.y}
                      </option>
                    ))}
                  </select>
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
                <button
                  type="button"
                  key={index}
                  data-chrome-unit="inner-text-button"
                  className={chromeUnitClassNames('inner-text-button', 'app-header-button', prepared.deployment?.layoutChoice === index && 'active')}
                  onClick={() => replace(setDeploymentChoices(prepared, { layoutChoice: index as 0 | 1 }))}
                >
                  Layout {index + 1}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <button
          type="button"
          data-chrome-unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
          disabled={!deploymentReady(prepared, options)}
          onClick={start}
        >
          Begin Battle
        </button>
        </OuterChromeBox>

        <LevelPreviewColumn
          level={previewLevel}
          title={`${level.name} deployment`}
          embedded
          actions={<p className="run-preview-note">{Object.keys(layout.placements).length} deployed · {layout.blockedUnitIds.length} in reserve</p>}
        />
      </main>
    </SkirmishShell>
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
        <select value={target} onChange={(event) => setTarget(event.target.value)} aria-label="Discipline target">
          <option value="">Choose a unit…</option>
          {run.army.map((unit) => (
            <option key={unit.id} value={unit.id}>{PIECE_LABEL[unit.type]}</option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        data-chrome-unit="inner-text-button"
        className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
        disabled={disabled || (needsTarget && !target)}
        onClick={() => action(target || undefined)}
      >
        {actionLabel}
      </button>
    </InnerChromeBox>
  );
}

function ShopPanel({ run }: { run: RunDocument }): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const shop = run.shop!;
  const victoryGoldTenths = Number.isSafeInteger(shop.victoryGoldTenths) && shop.victoryGoldTenths >= 0
    ? shop.victoryGoldTenths
    : battleVictoryGoldTenths(run.war.battles[shop.afterBattleIndex].level);
  const canLeave = shop.lootRelicOffers.length === 0 || shop.chosenLootRelicId !== null;
  return (
    <SkirmishShell
      className={`run-screen${run.relics.length ? ' has-relics' : ''}`}
      testId="run-screen"
      titleBarContent={<RunTitleBarStatus run={run} />}
      relicIds={run.relics}
      controlsContent={<RunArmyControls run={run} selling />}
      hudProps={{ enableGlobalShortcuts: false }}
    >
      <main className="run-workspace">
        <OuterChromeBox chromeConsumer="run-shop" titled className="run-panel run-shop-panel">
        <OuterChromeHeader title={run.war.battles[shop.afterBattleIndex]?.loot ? 'Loot Shop' : 'Shop'} />
        <div className="run-shop-rules">
          <span>Victory</span>
          <span aria-hidden="true">+</span>
          <RunGoldAmount valueTenths={victoryGoldTenths} />
          <span>Choose one bundle</span>
        </div>
        <section>
          <h3>Piece bundles</h3>
          <div className="run-card-grid">
            {shop.bundleOfferIds.map((id) => {
              const bundle = PIECE_BUNDLE_BY_ID[id];
              if (!bundle) return null;
              const bought = shop.purchasedBundleId === id;
              return (
                <RunBundleCard
                  bundle={bundle}
                  mode="shop"
                  bought={bought}
                  key={id}
                  disabled={Boolean(shop.purchasedBundleId) || run.goldTenths < bundle.value * GOLD_SCALE}
                  onSelect={() => replace(buyBundle(run, id))}
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

        <button
          type="button"
          data-chrome-unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
          disabled={!canLeave}
          onClick={() => replace(prepareDeployment(leaveShop(run)))}
        >
          Continue to next Battle
        </button>
        </OuterChromeBox>
      </main>
    </SkirmishShell>
  );
}

function VictoryPanel({ run }: { run: RunDocument }): ReactElement {
  const abandon = useActiveRun((state) => state.abandon);
  return (
    <SkirmishShell
      className={`run-screen${run.relics.length ? ' has-relics' : ''}`}
      testId="run-screen"
      titleBarContent={<RunTitleBarStatus run={run} />}
      relicIds={run.relics}
      controlsContent={<RunArmyControls run={run} showAbandon={false} />}
      hudProps={{ enableGlobalShortcuts: false }}
    >
      <main className="run-workspace">
        <OuterChromeBox chromeConsumer="run-victory" titled className="run-panel run-victory-panel">
          <OuterChromeHeader title="War won" />
          <h2>{run.war.name}</h2>
          <p>{run.war.description}</p>
          <p className="run-victory-summary">
            <span>{run.army.length} persistent units</span>
            <span>{run.relics.length} relics</span>
            <RunGoldAmount valueTenths={run.goldTenths} />
          </p>
          <button
            type="button"
            data-chrome-unit="inner-text-button"
            className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
            onClick={() => {
              void abandon().then(() => {
                navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false });
              });
            }}
          >
            Finish Run
          </button>
        </OuterChromeBox>
      </main>
    </SkirmishShell>
  );
}

function BattlePanel({ run }: { run: RunDocument }): ReactElement {
  const replace = useActiveRun((state) => state.replace);
  const currentRun = useActiveRun((state) => state.run);
  const { abandonDialog, requestAbandon } = useRunAbandon(run);
  const baseLevel = run.war.battles[run.battleIndex].level;
  const options = useMemo(() => deploymentOptions(run, baseLevel), [baseLevel, run]);
  const layout = useMemo(() => selectedDeploymentLayout(run, options), [options, run]);
  const battleLevel = useMemo(() => levelWithRunDeployment(run, baseLevel, layout), [baseLevel, layout, run]);

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
    seed: run.deployment?.seed ?? run.seed,
    relicIds: run.relics,
    onVictory: (survivors) => {
      const latest = useActiveRun.getState().run;
      if (latest?.id === run.id) replace(openShop(latest, survivors));
    },
    onRestart: () => {
      const latest = useActiveRun.getState().run;
      if (latest?.id === run.id) replace(restartBattle(latest));
    },
    onAbandonRun: () => { void requestAbandon(); },
    onPawnCashOut: hasRelic(run, 'mercenary-boat')
      ? (unitId) => {
          const latest = useActiveRun.getState().run;
          if (latest?.id === run.id) replace(cashOutPawn(latest, unitId));
        }
      : undefined,
  }), [battleLevel, replace, requestAbandon, run]);

  // Subscribe to the current document so a Mercenary Boat cash-out or Reservist event
  // refreshes the hook inputs without restarting the already-live matching board.
  void currentRun;
  return <>{abandonDialog}<Skirmish runBattle={presentation} /></>;
}

export function RunScreen(): ReactElement {
  const run = useActiveRun((state) => state.run);
  const hydrated = useActiveRun((state) => state.hydrated);
  const hydrate = useActiveRun((state) => state.hydrate);
  useEffect(() => { void hydrate(); }, [hydrate]);

  if (!hydrated) {
    return (
      <SkirmishShell
        className="run-screen"
        testId="run-screen"
        titleBarContent={null}
        controlsContent={null}
        readyToCompose={false}
        hudProps={{ enableGlobalShortcuts: false }}
      >
        <main className="run-workspace"><InnerChromeBox className="run-panel" role="status">Loading Run…</InnerChromeBox></main>
      </SkirmishShell>
    );
  }
  if (!run) {
    return (
      <SkirmishShell
        className="run-screen"
        testId="run-screen"
        titleBarContent={null}
        controlsContent={null}
        hudProps={{ enableGlobalShortcuts: false }}
      >
        <main className="run-workspace">
          <OuterChromeBox chromeConsumer="run-empty" titled className="run-panel">
            <OuterChromeHeader title="No active Run" />
            <p>Start a Run from Play, or direct-play one of your Wars from the War Editor.</p>
            <NavButton
              data-chrome-unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'active')}
              to={PLAY_RUN_SELECTOR_HREF}
            >
              Back to Run
            </NavButton>
          </OuterChromeBox>
        </main>
      </SkirmishShell>
    );
  }
  if (run.phase === 'draft') return <DraftPanel run={run} />;
  if (run.phase === 'deployment') return <DeploymentPanel run={run} />;
  if (run.phase === 'battle') return <BattlePanel run={run} />;
  if (run.phase === 'shop' && run.shop) return <ShopPanel run={run} />;
  return <VictoryPanel run={run} />;
}
