import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useCampaigns } from '../campaign/store';
import type { Level } from '../core/level';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { useAuthSession } from '../net/authSession';
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
import { SettingsGroup, SettingsSection } from './shared/SettingsControls';
import { SectionBox } from './shared/SectionBox';
// The Editor column's boxes are marble and its triggers are oak; both come from these
// (see shared/EditorColumnControls), never from a raw SettingsRow/SettingsButton here.
import {
  EDITOR_COLUMN_CONTROL_FILL_SURFACE,
  EditorButton,
  EditorRow,
} from './shared/EditorColumnControls';
import { useConfirm } from './shared/ConfirmDialog';
import { useDeleteKeyAction } from './shared/deleteKeyAction';
import { useSceneParticipant } from './shell/SceneBoundary';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ChromeNavButton } from './shared/ChromeButton';
import { AtaraxiaSelector } from './AtaraxiaSelector';
import { levelObjectiveLine } from './LevelInfoCompact';
import { EditorLevelRow } from './shared/EditorLevelRow';

function seedForNewRun(): number {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(values);
  return values[0] || (Date.now() >>> 0);
}

const WAR_EDITOR_RETURN_TO = '/editor/wars';

function editBattleBoardHref(warId: string, levelId: string): string {
  return `/editor/level?levelId=${encodeURIComponent(levelId)}&warId=${encodeURIComponent(warId)}`
    + `&returnTo=${encodeURIComponent(WAR_EDITOR_RETURN_TO)}`;
}

export function WarEditor({ embedded = false }: { embedded?: boolean } = {}): ReactElement {
  const wars = useWars((state) => state.wars);
  const selectedWarId = useWars((state) => state.selectedWarId);
  const selectedBattleId = useWars((state) => state.selectedBattleId);
  const levels = useCampaigns((state) => state.levels);
  const activeRun = useActiveRun((state) => state.run);
  const authStatus = useAuthSession((session) => session.status);
  const me = authStatus?.reachable ? authStatus.user : null;
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
      useActiveRun.getState().replace(createRun(
        snapshotWar(selectedWar, levels),
        seedForNewRun(),
        ataraxiaTier,
      ));
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

  const confirmDeleteBattle = async (level: Level): Promise<void> => {
    if (!selectedWar || !canEditSelected) return;
    if (!(await ask({
      title: 'Delete Battle?',
      message: <>Delete <b>{level.name}</b> from this War?</>,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      tone: 'danger',
    }))) return;
    useWars.getState().deleteBattle(selectedWar.id, level.id);
  };

  // Delete = the selected Battle's own Delete button. It stops at the Battle: a keypress must not
  // be able to take the War and every other Battle in it, so "Delete War" stays a button-only verb.
  useDeleteKeyAction(selectedLevel && canEditSelected ? () => { void confirmDeleteBattle(selectedLevel); } : null);

  const officialWars = wars.filter((war) => war.origin === 'official');
  const privateWars = wars.filter((war) => war.origin !== 'official');
  const orderedWars = [...officialWars, ...privateWars];

  const inner = (
    <>
      <main className={embedded ? 'menu-dest-col menu-dest-action ce-editor-main' : 'settings-frame settings-main-frame ce-editor-main'}>
        <h2 className="sr-only">{selectedWar?.name ?? 'War Editor'}</h2>
        <div className="ce-editor-body">
          {/* No ThumbnailSurface here. That primitive gates the scene on the FIRST VIEWPORT's
              thumbnails, and the Battles list sits below the Wars / War / Ataraxia sections —
              with no row on screen it falls back to demanding the first one, which the lazy
              thumbnail never paints, and the entrance never settles. Battle thumbnails are
              opportunistic below-fold content; they paint as the column scrolls. */}
          <KitScroll className="settings-scroll ce-editor-scroll">
            <div className="settings-panel-content">
              {status ? <p className="ce-status" role="status">{status}</p> : null}
              {/* No War picker. There is ONE War, and the store already lands on it, so a list to
                  choose from plus New War plus New official War were three slabs above the work
                  that only ever restated "this one". Bring them back with the second War. */}
              {selectedWar ? (
                <>
                  <SettingsGroup
                    title="War"
                    titleId="war-editor-war-title"
                    members={[
                      {
                        id: 'name',
                        content: (
                          <EditorRow framed={false} title="Name" description="Shown when the War is selected for a Run.">
                            <input
                              className="ce-name-input"
                              value={selectedWar.name}
                              disabled={!canEditSelected}
                              aria-label="War name"
                              onChange={(event) => useWars.getState().renameWar(selectedWar.id, event.target.value)}
                            />
                          </EditorRow>
                        ),
                      },
                      {
                        id: 'description',
                        content: (
                          <EditorRow framed={false} title="Description" description="The premise players see before choosing their opening hand." tall>
                            <textarea
                              className="ce-name-input war-description-input"
                              value={selectedWar.description}
                              disabled={!canEditSelected}
                              aria-label="War description"
                              onChange={(event) => useWars.getState().setWarDescription(selectedWar.id, event.target.value)}
                            />
                          </EditorRow>
                        ),
                      },
                      ...(selectedWar.origin === 'official' ? [{
                        id: 'eligible',
                        content: (
                          <EditorRow
                            framed={false}
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
                          </EditorRow>
                        ),
                      }] : []),
                      {
                        // The Ataraxia picker is a member row here, not a box of its own: it is one
                        // of the War's settings, and its own box inside this one would draw the
                        // same marble twice.
                        id: 'ataraxia',
                        content: (
                          <EditorRow framed={false} title="Ataraxia" description="The rung this War is played at.">
                            <AtaraxiaSelector
                              framed={false}
                              value={ataraxiaTier}
                              highestUnlockedTier={highestUnlockedTier}
                              onChange={setAtaraxiaTier}
                              fillSurface={EDITOR_COLUMN_CONTROL_FILL_SURFACE}
                            />
                          </EditorRow>
                        ),
                      },
                      {
                        id: 'play',
                        content: (
                          <EditorRow
                            framed={false}
                            title="Play this War"
                            description="Private Wars can be started directly here; only eligible official Wars enter the main pool."
                          >
                            <EditorButton disabled={!orderedBattles.length} onClick={() => void startSelectedWar()}>
                              Start Run
                            </EditorButton>
                          </EditorRow>
                        ),
                      },
                    ]}
                  />

                  {/* A Battle is an authored level in an ordered container, exactly like a campaign
                      level, so it takes the same row: board thumbnail, goal line, and the carved
                      info / edit / reorder / delete verbs (ADR-0529). Each is a MEMBER, so the box
                      lays the rail between them and caps it where it meets the frame. */}
                  <SectionBox
                    title="Battles"
                    titleId="war-editor-battles-title"
                    className="war-battles-box"
                    members={[
                      ...(orderedBattles.length === 0 ? [{
                        id: 'empty',
                        content: <p className="ce-empty">No Battles. Add one to begin.</p>,
                      }] : []),
                      ...orderedBattles.map((battle, index) => {
                        const level = levels[battle.levelId];
                        const name = level?.name ?? battle.levelId;
                        const role = index === orderedBattles.length - 1
                          ? 'Final Battle · War ends here'
                          : level?.battle?.loot ? 'Loot Battle' : 'Battle';
                        return {
                          id: battle.levelId,
                          content: (
                            <EditorLevelRow
                              levelId={battle.levelId}
                              objective={level?.objective}
                              level={level}
                              index={index}
                              framed={false}
                              active={battle.levelId === selectedBattle?.levelId}
                              readOnly={!canEditSelected}
                              description={level ? `${role} · ${levelObjectiveLine(level)}` : role}
                              ariaLabel={`Select ${name}`}
                              onInfo={() => useWars.getState().selectBattle(battle.levelId)}
                              infoLabel={`Details for ${name}`}
                              editHref={level ? editBattleBoardHref(selectedWar.id, battle.levelId) : undefined}
                              onMoveUp={() => useWars.getState().moveBattle(selectedWar.id, battle.levelId, -1)}
                              onMoveDown={() => useWars.getState().moveBattle(selectedWar.id, battle.levelId, 1)}
                              canMoveUp={index > 0}
                              canMoveDown={index < orderedBattles.length - 1}
                              onDelete={level ? () => { void confirmDeleteBattle(level); } : undefined}
                              deleteLabel={`Delete Battle ${name}`}
                              deleteTitle="Delete Battle"
                            />
                          ),
                        };
                      }),
                      ...(canEditSelected ? [{
                        id: 'add-battle',
                        className: 'ce-section-action',
                        content: (
                          <EditorButton onClick={() => useWars.getState().addBattle(selectedWar.id)}>+ Add Battle</EditorButton>
                        ),
                      }] : []),
                    ]}
                  />

                  {selectedLevel && selectedBattle ? (
                    <SettingsGroup
                      title="Battle"
                      titleId="war-editor-battle-title"
                      members={[
                        {
                          id: 'loot',
                          content: (
                            <EditorRow
                              framed={false}
                              title="Loot"
                              description={isFinalBattle
                                ? 'The final Battle ends the War, so there is no following Sectio or lipsanon offer.'
                                : 'After this Battle, Bona Vacantia reveals three unseen lipsana and the player chooses one for free.'}
                              value={<span>{!isFinalBattle && selectedLevel.battle?.loot ? 'Lipsanon choice' : 'Normal Sectio'}</span>}
                            >
                              <input
                                type="checkbox"
                                checked={!isFinalBattle && selectedLevel.battle?.loot === true}
                                disabled={!canEditSelected || isFinalBattle}
                                aria-label="Battle grants Loot"
                                onChange={(event) => useWars.getState().setBattleLoot(selectedLevel.id, event.target.checked)}
                              />
                            </EditorRow>
                          ),
                        },
                        {
                          id: 'position',
                          content: (
                            <EditorRow
                              framed={false}
                              title="Battle position"
                              description={isFinalBattle ? 'The last ordered Battle is automatically the War end.' : 'Every non-final victory eventually opens the next Sectio.'}
                              value={<span>{selectedBattleIndex + 1} of {orderedBattles.length}</span>}
                            />
                          ),
                        },
                        {
                          id: 'delete',
                          content: (
                            <EditorRow framed={false} title="Delete Battle" description="Removes this Battle level from the War workspace.">
                              <EditorButton tone="danger" disabled={!canEditSelected} onClick={() => void confirmDeleteBattle(selectedLevel)}>Delete</EditorButton>
                            </EditorRow>
                          ),
                        },
                      ]}
                    />
                  ) : null}

                  <SettingsSection>
                    <EditorRow title="Delete War" description="Removes the War and its exclusive Battle levels on the next Save or Publish.">
                      <EditorButton tone="danger" disabled={!canEditSelected} onClick={() => void deleteSelectedWar()}>Delete War</EditorButton>
                    </EditorRow>
                  </SettingsSection>
                </>
              ) : (
                <SettingsSection>
                  <EditorRow title="No War selected" description="Select or create a War above." />
                </SettingsSection>
              )}
            </div>
          </KitScroll>
        </div>
      </main>

      {selectedLevel && selectedWar ? (
        <LevelPreviewColumn
          level={selectedLevel}
          title={selectedBattleIndex >= 0 ? `Battle ${selectedBattleIndex + 1}: ${selectedLevel.name}` : selectedLevel.name}
          embedded={embedded}
          actions={(
            <div className="ce-preview-actions">
              <ChromeNavButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'ce-link-button')} data-chrome-fill-surface={EDITOR_COLUMN_CONTROL_FILL_SURFACE} to={editBattleBoardHref(selectedWar.id, selectedLevel.id)}><span>Edit Board</span></ChromeNavButton>
              <ChromeNavButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'ce-link-button ce-link-button-ghost')} data-chrome-fill-surface={EDITOR_COLUMN_CONTROL_FILL_SURFACE} to={`/play?levelId=${encodeURIComponent(selectedLevel.id)}&mode=test&returnTo=${encodeURIComponent(WAR_EDITOR_RETURN_TO)}`}><span>Test Play</span></ChromeNavButton>
            </div>
          )}
        />
      ) : null}
    </>
  );

  return <>{dialog}{inner}</>;
}
