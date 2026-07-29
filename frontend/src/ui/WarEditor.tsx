import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { drawableAssets } from '@chess-tactics/board-render';
import { useCampaigns } from '../campaign/store';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import {
  mapSaveError,
  officialWorkspaceForSave,
  publishOfficialWorkspace,
  saveUserWorkspace,
  userWorkspaceForSave,
} from '../campaign/save';
import { fetchMe, goSignIn, type AuthUser } from '../net/auth';
import { isWorkspaceConflict } from '../net/campaignWorkspace';
import { createRun, snapshotWar } from '../run/model';
import { useActiveRun } from '../run/store';
import { useWars } from '../war/store';
import { navigateApp } from './navigation';
import { LevelPreviewColumn } from './LevelPreviewColumn';
import { KitScroll } from './KitScroll';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { SettingsButton, SettingsRow, SettingsSection } from './shared/SettingsControls';
import { useConfirm } from './shared/ConfirmDialog';
import { TitleBarSlot } from './shell/TitleBarSlot';

const campaignMenuModes = drawableAssets('menu-mode')
  .filter((asset) => asset.behavior.value === 'campaign-editor');
if (campaignMenuModes.length !== 1) {
  throw new Error(`War editor requires one installed campaign editor menu mode; found ${campaignMenuModes.length}`);
}
const WAR_TAB_ICON = campaignMenuModes[0].media.icon?.media.immutableUrl;
if (!WAR_TAB_ICON) throw new Error('installed campaign editor menu mode has no icon');

function userSignature(): string {
  return JSON.stringify(userWorkspaceForSave());
}

function officialSignature(): string {
  return JSON.stringify(officialWorkspaceForSave());
}

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
  const campaigns = useCampaigns((state) => state.campaigns);
  const activeRun = useActiveRun((state) => state.run);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [loaded, setLoaded] = useState(wars.length > 0);
  const [userReady, setUserReady] = useState(false);
  const [officialReady, setOfficialReady] = useState(false);
  const [status, setStatus] = useState('');
  const [userSaveConflict, setUserSaveConflict] = useState(false);
  const [officialSaveConflict, setOfficialSaveConflict] = useState(false);
  const { ask, dialog } = useConfirm();

  const workspaceSignal = useMemo(() => ({ wars, levels, campaigns }), [campaigns, levels, wars]);
  const currentUserSig = useMemo(() => userSignature(), [workspaceSignal]);
  const currentOfficialSig = useMemo(() => officialSignature(), [workspaceSignal]);
  const [savedUserSig, setSavedUserSig] = useState(currentUserSig);
  const [savedOfficialSig, setSavedOfficialSig] = useState(currentOfficialSig);
  const userDirty = currentUserSig !== savedUserSig;
  const officialDirty = currentOfficialSig !== savedOfficialSig;
  const dirty = userDirty || officialDirty;

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
      if (!state.selectedWarId && state.wars[0]) state.selectWar(state.wars[0].id);
      setSavedUserSig(userSignature());
      setSavedOfficialSig(officialSignature());
    }).catch(() => {
      if (active) setStatus('Wars could not be loaded. Try again in a moment.');
    }).finally(() => {
      if (active) setLoaded(true);
    });
    void useActiveRun.getState().hydrate();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

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

  const saveMine = async (): Promise<void> => {
    if (!userReady || userSaveConflict) return;
    try {
      await saveUserWorkspace();
      setSavedUserSig(userSignature());
      setStatus('Wars saved.');
    } catch (error) {
      if (isWorkspaceConflict(error)) {
        setUserSaveConflict(true);
        setStatus('Save stopped because this workspace changed elsewhere. Reload before saving again.');
        return;
      }
      const mapped = mapSaveError(error);
      if ('action' in mapped) goSignIn();
      else setStatus(mapped.message);
    }
  };

  const publish = async (): Promise<void> => {
    if (!isAdmin || !officialReady || officialSaveConflict) return;
    if (!(await ask({
      title: 'Publish official Wars?',
      message: 'This updates the War pool available to every player.',
      confirmLabel: 'Publish',
      cancelLabel: 'Cancel',
    }))) return;
    try {
      const saved = await publishOfficialWorkspace();
      setSavedOfficialSig(officialSignature());
      setStatus(`Official Wars published (revision ${saved.revision}).`);
    } catch (error) {
      if (isWorkspaceConflict(error)) {
        setOfficialSaveConflict(true);
        setStatus('Publish stopped because official content changed elsewhere. Reload before publishing again.');
        return;
      }
      const mapped = mapSaveError(error);
      if ('action' in mapped) goSignIn();
      else setStatus(mapped.message);
    }
  };

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
      useActiveRun.getState().replace(createRun(snapshotWar(selectedWar, levels), seedForNewRun()));
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
  const centerSlot = (
    <TitleBarSlot region="center">
      <div className="ce-topbar-stats" aria-label="War workspace state">
        <span className={`ce-save-state ${dirty ? 'is-dirty' : ''}`.trim()}>{dirty ? 'Unsaved' : 'Saved'}</span>
      </div>
    </TitleBarSlot>
  );

  const inner = (
    <>
      <aside className={embedded ? 'menu-dest-col menu-dest-tabs ce-editor-rail' : 'settings-frame settings-rail-frame ce-editor-rail'} aria-label="Wars">
        <KitScroll className="ce-rail-scroll">
          <div className="ce-rail-list">
            {officialWars.length ? <p className="campaign-rail-group">Official Wars</p> : null}
            {officialWars.map((war, index) => (
              <button
                type="button"
                data-chrome-unit="inner-box"
                className={chromeUnitClassNames('inner-box', 'settings-tab ce-campaign-tab', war.id === selectedWarId && 'is-active')}
                style={{ ['--tab-index' as string]: index }}
                key={war.id}
                onClick={() => useWars.getState().selectWar(war.id)}
              >
                <span className="settings-tab-icon" aria-hidden="true"><img src={WAR_TAB_ICON} alt="" /></span>
                <span className="ce-campaign-tab-copy"><strong>{war.name}</strong><small>{war.battles.length} Battles</small></span>
                <span className="ce-tab-trail">{war.eligibleForRun ? 'RUN' : 'OFFICIAL'}</span>
              </button>
            ))}
            {privateWars.length ? <p className="campaign-rail-group">Your Wars</p> : null}
            {privateWars.map((war, index) => (
              <button
                type="button"
                data-chrome-unit="inner-box"
                className={chromeUnitClassNames('inner-box', 'settings-tab ce-campaign-tab', war.id === selectedWarId && 'is-active')}
                style={{ ['--tab-index' as string]: officialWars.length + index }}
                key={war.id}
                onClick={() => useWars.getState().selectWar(war.id)}
              >
                <span className="settings-tab-icon" aria-hidden="true"><img src={WAR_TAB_ICON} alt="" /></span>
                <span className="ce-campaign-tab-copy"><strong>{war.name}</strong><small>{war.battles.length} Battles</small></span>
              </button>
            ))}
            {!wars.length && loaded ? <p className="ce-empty">No Wars yet.</p> : null}
          </div>
        </KitScroll>
        <div className="ce-rail-actions">
          <SettingsButton href="/editor">Campaign Editor</SettingsButton>
          <SettingsButton
            disabled={!userReady}
            onClick={() => useWars.getState().newWar(false)}
          >+ New War</SettingsButton>
          {isAdmin ? (
            <SettingsButton
              disabled={!officialReady}
              onClick={() => useWars.getState().newWar(true)}
            >+ New Official War</SettingsButton>
          ) : null}
          <SettingsButton
            tone="primary"
            disabled={!userReady || !userDirty || userSaveConflict}
            onClick={() => void saveMine()}
          >Save</SettingsButton>
          {isAdmin ? (
            <SettingsButton
              tone="primary"
              disabled={!officialReady || !officialDirty || officialSaveConflict}
              onClick={() => void publish()}
            >Publish to all players</SettingsButton>
          ) : null}
          {me && !me.signed_in ? <SettingsButton onClick={goSignIn}>Sign in to save</SettingsButton> : null}
          {status ? <p className="ce-status" role="status">{status}</p> : null}
        </div>
      </aside>

      <main className={embedded ? 'menu-dest-col menu-dest-action ce-editor-main' : 'settings-frame settings-main-frame ce-editor-main'}>
        <h2 className="sr-only">{selectedWar?.name ?? 'War Editor'}</h2>
        <div className="ce-editor-body">
          <KitScroll className="settings-scroll ce-editor-scroll">
            <div className="settings-panel-content">
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
                    <div className="war-battle-list">
                      {!orderedBattles.length ? <p className="ce-empty">No Battles. Add one to begin.</p> : null}
                      {orderedBattles.map((battle, index) => {
                        const level = levels[battle.levelId];
                        const selected = battle.levelId === selectedBattle?.levelId;
                        return (
                          <div
                            data-chrome-unit="inner-box"
                            className={chromeUnitClassNames('inner-box', 'settings-row war-battle-row', selected && 'is-selected')}
                            key={battle.levelId}
                          >
                            <button
                              type="button"
                              className="war-battle-select"
                              onClick={() => useWars.getState().selectBattle(battle.levelId)}
                            >
                              <span className="war-battle-number">{index + 1}</span>
                              <span><strong>{level?.name ?? battle.levelId}</strong><small>{index === orderedBattles.length - 1 ? 'Final Battle · War ends here' : level?.battle?.loot ? 'Loot Battle' : 'Battle'}</small></span>
                            </button>
                            {canEditSelected ? (
                              <div className="war-battle-actions">
                                <button
                                  type="button"
                                  data-chrome-unit="inner-tool-square"
                                  className={chromeUnitClassNames('inner-tool-square', 'ce-icon-button')}
                                  disabled={index === 0}
                                  aria-label={`Move ${level?.name ?? 'Battle'} up`}
                                  onClick={() => useWars.getState().moveBattle(selectedWar.id, battle.levelId, -1)}
                                >↑</button>
                                <button
                                  type="button"
                                  data-chrome-unit="inner-tool-square"
                                  className={chromeUnitClassNames('inner-tool-square', 'ce-icon-button')}
                                  disabled={index === orderedBattles.length - 1}
                                  aria-label={`Move ${level?.name ?? 'Battle'} down`}
                                  onClick={() => useWars.getState().moveBattle(selectedWar.id, battle.levelId, 1)}
                                >↓</button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
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
                  <SettingsRow title="No War selected" description="Choose a War in the rail or create one." />
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

  if (embedded) return <>{dialog}{centerSlot}{inner}</>;
  return <>{dialog}{centerSlot}<div className="settings-shell ce-editor-shell">{inner}</div></>;
}
