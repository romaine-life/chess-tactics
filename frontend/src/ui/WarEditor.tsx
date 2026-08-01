import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useCampaigns } from '../campaign/store';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { fetchMe, type AuthUser } from '../net/auth';
import { createRun, snapshotWar, type AtaraxiaTier } from '../run/model';
import {
  RUN_PROGRESSION_EVENT,
  highestUnlockedAtaraxiaTier,
  readRunProgression,
} from '../run/progression';
import { useActiveRun } from '../run/store';
import { useWars } from '../war/store';
import { navigateApp } from './navigation';
import { LevelPreviewColumn } from './LevelPreviewColumn';
import { KitScroll } from './KitScroll';
import { SettingsButton, SettingsRow, SettingsSection } from './shared/SettingsControls';
import { useConfirm } from './shared/ConfirmDialog';
import { useSceneParticipant } from './shell/SceneBoundary';
import { AtaraxiaSelector } from './AtaraxiaSelector';
import { ActionList } from './shared/ActionList';

function seedForNewRun(): number {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(values);
  return values[0] || (Date.now() >>> 0);
}

export function WarEditor({ embedded = false }: { embedded?: boolean } = {}): ReactElement {
  const wars = useWars((state) => state.wars);
  const selectedWarId = useWars((state) => state.selectedWarId);
  const selectedBattleId = useWars((state) => state.selectedBattleId);
  const levels = useCampaigns((state) => state.levels);
  const activeRun = useActiveRun((state) => state.run);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(wars.length > 0);
  const [userReady, setUserReady] = useState(false);
  const [officialReady, setOfficialReady] = useState(false);
  const [status, setStatus] = useState('');
  const [progression, setProgression] = useState(readRunProgression);
  const [ataraxiaTier, setAtaraxiaTier] = useState<AtaraxiaTier>(0);
  const { ask, dialog } = useConfirm();
  const highestUnlockedTier = highestUnlockedAtaraxiaTier(progression);

  useSceneParticipant('war-editor-content', loaded ? 'painted' : 'loading');

  useEffect(() => {
    let active = true;
    void fetchMe().then((user) => {
      if (active) setMe(user);
    }).catch(() => undefined);
    void ensureCampaignsHydrated().then((hydration) => {
      if (!active) return;
      setUserReady(hydration.userWorkspace !== 'unavailable');
      setOfficialReady(hydration.officialAvailable);
      const state = useWars.getState();
      const defaultWar = state.wars.find((war) => war.origin !== 'official') ?? state.wars[0];
      if (!state.selectedWarId && defaultWar) state.selectWar(defaultWar.id);
    }).catch(() => {
      if (active) setStatus('Wars could not be loaded. Try again in a moment.');
    }).finally(() => {
      if (active) setLoaded(true);
    });
    void useActiveRun.getState().hydrate();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const sync = (): void => setProgression(readRunProgression());
    window.addEventListener(RUN_PROGRESSION_EVENT, sync);
    return () => window.removeEventListener(RUN_PROGRESSION_EVENT, sync);
  }, []);

  useEffect(() => {
    if (ataraxiaTier > highestUnlockedTier) setAtaraxiaTier(highestUnlockedTier);
  }, [ataraxiaTier, highestUnlockedTier]);

  const selectedWar = wars.find((war) => war.id === selectedWarId) ?? null;
  const orderedBattles = useMemo(
    () => selectedWar ? [...selectedWar.battles].sort((a, b) => a.ordinal - b.ordinal) : [],
    [selectedWar],
  );
  const selectedBattle = selectedWar
    ? orderedBattles.find((battle) => battle.levelId === selectedBattleId) ?? orderedBattles[0] ?? null
    : null;
  const selectedLevel = selectedBattle ? levels[selectedBattle.levelId] : null;
  const selectedBattleIndex = selectedBattle
    ? orderedBattles.findIndex((battle) => battle.levelId === selectedBattle.levelId)
    : -1;
  const isFinalBattle = selectedBattleIndex >= 0 && selectedBattleIndex === orderedBattles.length - 1;
  const isAdmin = me?.is_admin === true;
  const canEditSelected = Boolean(
    selectedWar
    && (selectedWar.origin !== 'official' ? userReady : isAdmin && officialReady),
  );

  const startSelectedWar = async (): Promise<void> => {
    if (!selectedWar) return;
    if (!orderedBattles.length) {
      setStatus('Add at least one Battle before starting this War.');
      return;
    }
    if (activeRun && !(await ask({
      title: 'Start a different Run?',
      message: 'This replaces the active Run in this browser and account.',
      confirmLabel: 'Start new Run',
      cancelLabel: 'Keep current Run',
      tone: 'danger',
    }))) return;
    if (activeRun) await useActiveRun.getState().abandon();
    try {
      useActiveRun.getState().replace(createRun(snapshotWar(selectedWar, levels), seedForNewRun(), ataraxiaTier));
      navigateApp('/run');
    } catch (error) {
      setStatus((error as Error).message);
    }
  };

  const deleteSelectedWar = async (): Promise<void> => {
    if (!selectedWar || !canEditSelected) return;
    if (!(await ask({
      title: 'Delete War?',
      message: <>Delete <b>{selectedWar.name}</b> and all of its Battles?</>,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      tone: 'danger',
    }))) return;
    useWars.getState().deleteWar(selectedWar.id);
    setStatus(`${selectedWar.origin === 'official' ? 'Publish' : 'Save'} to keep this deletion.`);
  };

  const deleteSelectedBattle = async (): Promise<void> => {
    if (!selectedWar || !selectedLevel || !canEditSelected) return;
    if (!(await ask({
      title: 'Delete Battle?',
      message: <>Delete <b>{selectedLevel.name}</b> from this War?</>,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      tone: 'danger',
    }))) return;
    useWars.getState().deleteBattle(selectedWar.id, selectedLevel.id);
  };

  const officialWars = wars.filter((war) => war.origin === 'official');
  const privateWars = wars.filter((war) => war.origin !== 'official');
  const orderedWars = [...officialWars, ...privateWars];

  const inner = (
    <>
      <main className={embedded ? 'menu-dest-col menu-dest-action ce-editor-main' : 'settings-frame settings-main-frame ce-editor-main'}>
        <h2 className="sr-only">{selectedWar?.name ?? 'War Editor'}</h2>
        <div className="ce-editor-body">
          <KitScroll className="settings-scroll ce-editor-scroll">
            <div className="settings-panel-content">
              {status ? <p className="ce-status" role="status">{status}</p> : null}
              <SettingsSection title="Wars">
                {!orderedWars.length && loaded ? (
                  <SettingsRow title="No Wars yet" description="Create a War to begin building its ordered Battles." />
                ) : null}
                {orderedWars.map((war) => {
                  const selected = war.id === selectedWarId;
                  return (
                    <SettingsRow
                      key={war.id}
                      eyebrow={war.origin === 'official' ? 'Official' : 'Private'}
                      title={war.name}
                      description={`${war.battles.length} ${war.battles.length === 1 ? 'Battle' : 'Battles'}`}
                      value={war.eligibleForRun ? <span>RUN</span> : undefined}
                    >
                      <SettingsButton
                        tone={selected ? 'primary' : 'neutral'}
                        disabled={selected}
                        onClick={() => useWars.getState().selectWar(war.id)}
                      >{selected ? 'Selected' : 'Select'}</SettingsButton>
                    </SettingsRow>
                  );
                })}
                <SettingsRow title="New War" description="Create another private War in this workspace.">
                  <SettingsButton disabled={!userReady} onClick={() => useWars.getState().newWar(false)}>+ New War</SettingsButton>
                </SettingsRow>
                {isAdmin ? (
                  <SettingsRow title="New official War" description="Create a War for the published Run pool.">
                    <SettingsButton disabled={!officialReady} onClick={() => useWars.getState().newWar(true)}>+ New Official War</SettingsButton>
                  </SettingsRow>
                ) : null}
              </SettingsSection>
              {selectedWar ? (
                <>
                  <SettingsSection title="War">
                    <SettingsRow title="Name" description="Shown when the War is selected for a Run.">
                      <input
                        className="ce-name-input"
                        value={selectedWar.name}
                        disabled={!canEditSelected}
                        aria-label="War name"
                        onChange={(event) => useWars.getState().renameWar(selectedWar.id, event.target.value)}
                      />
                    </SettingsRow>
                    <SettingsRow title="Description" description="The premise players see before choosing their opening hand." tall>
                      <textarea
                        className="ce-name-input war-description-input"
                        value={selectedWar.description}
                        disabled={!canEditSelected}
                        aria-label="War description"
                        onChange={(event) => useWars.getState().setWarDescription(selectedWar.id, event.target.value)}
                      />
                    </SettingsRow>
                    {selectedWar.origin === 'official' ? (
                      <SettingsRow
                        title="Eligible for Run"
                        description="Includes this published War in the equal-odds main Run pool."
                        value={<span>{selectedWar.eligibleForRun ? 'Included' : 'Excluded'}</span>}
                      >
                        <input
                          type="checkbox"
                          checked={selectedWar.eligibleForRun === true}
                          disabled={!canEditSelected || !orderedBattles.length}
                          aria-label="Eligible for Run"
                          onChange={(event) => useWars.getState().setWarEligible(selectedWar.id, event.target.checked)}
                        />
                      </SettingsRow>
                    ) : null}
                    <AtaraxiaSelector
                      value={ataraxiaTier}
                      highestUnlockedTier={highestUnlockedTier}
                      onChange={setAtaraxiaTier}
                    />
                    <SettingsRow
                      title="Play this War"
                      description="Private Wars can be started directly here; only eligible official Wars enter the main pool."
                    >
                      <SettingsButton disabled={!orderedBattles.length} onClick={() => void startSelectedWar()}>
                        Start Run
                      </SettingsButton>
                    </SettingsRow>
                  </SettingsSection>

                  <SettingsSection title="Battles">
                    <ActionList
                      className="war-battle-list"
                      empty={<p className="ce-empty">No Battles. Add one to begin.</p>}
                      items={orderedBattles.map((battle, index) => {
                        const level = levels[battle.levelId];
                        const selected = battle.levelId === selectedBattle?.levelId;
                        const name = level?.name ?? battle.levelId;
                        return {
                          id: battle.levelId,
                          title: name,
                          description: <small>{index === orderedBattles.length - 1 ? 'Final Battle · War ends here' : level?.battle?.loot ? 'Loot Battle' : 'Battle'}</small>,
                          leading: index + 1,
                          leadingChrome: false,
                          leadingClassName: 'war-battle-number',
                          selected,
                          className: 'war-battle-row',
                          copyClassName: 'war-battle-copy',
                          actionsClassName: 'war-battle-actions',
                          ariaLabel: `Select ${name}`,
                          onSelect: () => useWars.getState().selectBattle(battle.levelId),
                          actions: canEditSelected ? [
                            {
                              id: 'move-up',
                              label: `Move ${name} up`,
                              icon: '↑',
                              disabled: index === 0,
                              onPress: () => useWars.getState().moveBattle(selectedWar.id, battle.levelId, -1),
                            },
                            {
                              id: 'move-down',
                              label: `Move ${name} down`,
                              icon: '↓',
                              disabled: index === orderedBattles.length - 1,
                              onPress: () => useWars.getState().moveBattle(selectedWar.id, battle.levelId, 1),
                            },
                          ] : undefined,
                        };
                      })}
                    />
                    {canEditSelected ? (
                      <div className="ce-section-action">
                        <SettingsButton onClick={() => useWars.getState().addBattle(selectedWar.id)}>+ Add Battle</SettingsButton>
                      </div>
                    ) : null}
                  </SettingsSection>

                  {selectedLevel && selectedBattle ? (
                    <SettingsSection title="Battle">
                      <SettingsRow
                        title="Loot"
                        description={isFinalBattle
                          ? 'The final Battle ends the War, so there is no following shop or Loot offer.'
                          : 'After this Battle, the shop reveals three unseen relics and the player chooses one for free.'}
                        value={<span>{!isFinalBattle && selectedLevel.battle?.loot ? 'Relic choice' : 'Normal shop'}</span>}
                      >
                        <input
                          type="checkbox"
                          checked={!isFinalBattle && selectedLevel.battle?.loot === true}
                          disabled={!canEditSelected || isFinalBattle}
                          aria-label="Battle grants Loot"
                          onChange={(event) => useWars.getState().setBattleLoot(selectedLevel.id, event.target.checked)}
                        />
                      </SettingsRow>
                      <SettingsRow
                        title="Battle position"
                        description={isFinalBattle ? 'The last ordered Battle is automatically the War end.' : 'Every non-final victory opens the army shop.'}
                        value={<span>{selectedBattleIndex + 1} of {orderedBattles.length}</span>}
                      />
                      <SettingsRow title="Delete Battle" description="Removes this Battle level from the War workspace.">
                        <SettingsButton tone="danger" disabled={!canEditSelected} onClick={() => void deleteSelectedBattle()}>Delete</SettingsButton>
                      </SettingsRow>
                    </SettingsSection>
                  ) : null}

                  <SettingsSection title="War Actions">
                    <SettingsRow title="Delete War" description="Removes the War and its exclusive Battle levels on the next Save or Publish.">
                      <SettingsButton tone="danger" disabled={!canEditSelected} onClick={() => void deleteSelectedWar()}>Delete War</SettingsButton>
                    </SettingsRow>
                  </SettingsSection>
                </>
              ) : (
                <SettingsSection title="War Editor">
                  <SettingsRow title="No War selected" description="Select or create a War above." />
                </SettingsSection>
              )}
            </div>
          </KitScroll>
        </div>
      </main>

      {selectedLevel && selectedWar ? (
        <LevelPreviewColumn
          level={selectedLevel}
          title={selectedLevel.name}
          embedded={embedded}
          actions={(
            <div className="ce-preview-actions">
              <SettingsButton
                href={`/editor/level?levelId=${encodeURIComponent(selectedLevel.id)}&warId=${encodeURIComponent(selectedWar.id)}&returnTo=${encodeURIComponent('/editor/wars')}`}
              >Edit Board</SettingsButton>
            </div>
          )}
        />
      ) : null}
    </>
  );

  return <>{dialog}{inner}</>;
}
