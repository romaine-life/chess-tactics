import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useCampaigns } from '../campaign/store';
import { createDemoWorkspace, DEMO_SELECTED_CAMPAIGN_ID, DEMO_SELECTED_LEVEL_ID } from '../campaign/demoWorkspace';
import { validateLevel, type Campaign, type CampaignLevelRef, type Level, type ObjectiveType } from '../core/level';
import { loadWorkspace, saveWorkspace } from '../net/campaignWorkspace';
import { fetchMe, goSignIn, isUnauthorized, signInHref, type AuthUser } from '../net/auth';
import { LevelPreviewBoard } from '../render/LevelPreviewBoard';
import { campaignEditorAssetVars } from './campaignEditorAssets';

const OBJECTIVES: ObjectiveType[] = ['capture-all', 'capture-king', 'survive', 'reach'];
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const SHIELDS = ['crown', 'rook', 'crescent', 'snow', 'flame', 'lion'] as const;
const CE_ICONS = {
  menu: '/assets/ui/level-editor/icons/menu.png',
  save: '/assets/ui/level-editor/icons/save.png',
  settings: '/assets/ui/skirmish/icon-gear.png',
  up: '/assets/ui/level-editor/icons/height-up.png',
  down: '/assets/ui/level-editor/icons/height-down.png',
  delete: '/assets/ui/skirmish/icon-crossed-swords.png',
  play: '/assets/ui/level-editor/icons/play.png',
  import: '/assets/ui/level-editor/icons/upload.png',
  duplicate: '/assets/ui/level-editor/icons/download.png',
  lock: '/assets/ui/level-editor/icons/lock.png',
} as const;

const objectiveLabel: Record<ObjectiveType, string> = {
  'capture-all': 'Capture all enemy pieces',
  'capture-king': 'Capture the enemy King',
  survive: 'Survive the assault',
  reach: 'Reach the objective',
};

function workspaceSignature(ws: { campaigns: Campaign[]; levels: Record<string, Level> }): string {
  return JSON.stringify(ws);
}

function workspaceFromStore(): { campaigns: Campaign[]; levels: Record<string, Level> } {
  const state = useCampaigns.getState();
  return { campaigns: state.campaigns, levels: state.levels };
}

function validateWorkspaceImport(ws: Partial<{ campaigns: Campaign[]; levels: Record<string, Level> }>): string | null {
  if (!Array.isArray(ws.campaigns)) return 'campaigns must be an array';
  if (!ws.levels || typeof ws.levels !== 'object') return 'levels must be an object';
  for (const campaign of ws.campaigns) {
    if (!campaign || typeof campaign !== 'object') return 'campaign is not an object';
    if (typeof campaign.id !== 'string' || !campaign.id) return 'campaign id is required';
    if (typeof campaign.name !== 'string') return `campaign ${campaign.id} is missing a name`;
    if (!Array.isArray(campaign.levels)) return `campaign ${campaign.id} levels must be an array`;
    for (const ref of campaign.levels) {
      if (!ref || typeof ref.levelId !== 'string') return `campaign ${campaign.id} has an invalid level reference`;
      if (!ws.levels[ref.levelId]) return `campaign ${campaign.id} references missing level ${ref.levelId}`;
    }
  }
  for (const [id, level] of Object.entries(ws.levels)) {
    const result = validateLevel(level);
    if (!result.ok) return `level ${id} is invalid: ${result.errors[0]}`;
  }
  return null;
}

function AssetButton({
  children,
  className = '',
  danger = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }): ReactElement {
  return (
    <button type="button" className={`ce-asset-button ${danger ? 'is-danger' : ''} ${className}`.trim()} {...props}>
      <span>{children}</span>
    </button>
  );
}

function IconButton({
  children,
  danger = false,
  selected = false,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean; selected?: boolean }): ReactElement {
  return (
    <button
      type="button"
      className={`ce-icon-button ${danger ? 'is-danger' : ''} ${selected ? 'is-selected' : ''} ${className}`.trim()}
      {...props}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

function ShieldBadge({ index, active = false }: { index: number; active?: boolean }): ReactElement {
  const shield = SHIELDS[index % SHIELDS.length];
  return <span className={`ce-shield ce-shield-${shield} ${active ? 'is-active' : ''}`.trim()} aria-hidden="true" />;
}

function Stars({ count = 0 }: { count?: number }): ReactElement {
  return (
    <span className="ce-stars" aria-label={`${count} stars`}>
      {[0, 1, 2].map((i) => <span key={i} className={i < count ? 'is-filled' : ''}>★</span>)}
    </span>
  );
}

function CampaignRow({
  campaign,
  index,
  active,
  onSelect,
  onFavorite,
}: {
  campaign: Campaign;
  index: number;
  active: boolean;
  onSelect: () => void;
  onFavorite: (event: React.MouseEvent<HTMLButtonElement>) => void;
}): ReactElement {
  const completed = campaign.levels.filter((level) => level.completed).length;
  const locked = Boolean(campaign.locked);
  const selectCampaign = () => {
    if (!locked) onSelect();
  };
  return (
    <div
      role="button"
      tabIndex={locked ? -1 : 0}
      aria-disabled={locked || undefined}
      className={`ce-campaign-row ${active ? 'is-selected' : ''} ${campaign.locked ? 'is-locked' : ''}`.trim()}
      onClick={selectCampaign}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectCampaign();
        }
      }}
    >
      <ShieldBadge index={index} active={active} />
      <span className="ce-row-copy">
        <strong>{campaign.name}</strong>
        <small>{completed} / {campaign.levels.length} levels</small>
      </span>
      {locked ? (
        <span className="ce-row-lock" aria-label={`${campaign.name} locked`} role="img">
          <CeIcon icon="lock" />
        </span>
      ) : (
        <button
          type="button"
          className={`ce-row-favorite ${campaign.favorite ? 'is-selected' : ''}`.trim()}
          aria-label={campaign.favorite ? `Unfavorite ${campaign.name}` : `Favorite ${campaign.name}`}
          onClick={onFavorite}
        >
          ★
        </button>
      )}
    </div>
  );
}

function CeIcon({ icon }: { icon: keyof typeof CE_ICONS }): ReactElement {
  return <img className="ce-icon-img" src={CE_ICONS[icon]} alt="" aria-hidden="true" draggable={false} />;
}

function LevelRow({
  levelRef,
  level,
  index,
  active,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  levelRef: CampaignLevelRef;
  level: Level | undefined;
  index: number;
  active: boolean;
  onSelect: () => void;
  onMoveUp: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMoveDown: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onDelete: (event: React.MouseEvent<HTMLButtonElement>) => void;
}): ReactElement {
  const objective = levelRef.objective ?? level?.objective ?? 'capture-all';
  return (
    <div
      role="button"
      tabIndex={0}
      className={`ce-level-row ${active ? 'is-selected' : ''}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="ce-level-thumb" aria-hidden="true">
        <LevelPreviewBoard level={level ?? null} compact />
      </span>
      <span className="ce-row-copy">
        <strong>{index + 1}. {level?.name ?? levelRef.levelId}</strong>
        <small>{objectiveLabel[objective]}</small>
      </span>
      <Stars count={levelRef.stars ?? 0} />
      <span className="ce-row-actions" aria-label="Level actions">
        <IconButton onClick={onMoveUp} aria-label="Move level up"><CeIcon icon="up" /></IconButton>
        <IconButton onClick={onMoveDown} aria-label="Move level down"><CeIcon icon="down" /></IconButton>
        <IconButton danger onClick={onDelete} aria-label="Delete level"><CeIcon icon="delete" /></IconButton>
      </span>
    </div>
  );
}

export function CampaignEditor() {
  const campaigns = useCampaigns((s) => s.campaigns);
  const levels = useCampaigns((s) => s.levels);
  const selectedCampaignId = useCampaigns((s) => s.selectedCampaignId);
  const selectedLevelId = useCampaigns((s) => s.selectedLevelId);
  const [status, setStatus] = useState('');
  const [me, setMe] = useState<AuthUser | null>(null);
  const currentWorkspace = useMemo(() => ({ campaigns, levels }), [campaigns, levels]);
  const currentSignature = useMemo(() => workspaceSignature(currentWorkspace), [currentWorkspace]);
  const [savedSignature, setSavedSignature] = useState(() => currentSignature);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const dirty = currentSignature !== savedSignature;

  const hydrateDemoWorkspace = (message?: string) => {
    const demo = createDemoWorkspace();
    const store = useCampaigns.getState();
    store.hydrate(demo);
    store.selectCampaign(DEMO_SELECTED_CAMPAIGN_ID);
    store.selectLevel(DEMO_SELECTED_LEVEL_ID);
    setSavedSignature(workspaceSignature(workspaceFromStore()));
    if (message) setStatus(message);
  };

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('campaign-editor-active');
    return () => shell?.classList.remove('campaign-editor-active');
  }, []);

  useEffect(() => {
    let active = true;
    fetchMe().then((user) => { if (active) setMe(user); });
    loadWorkspace()
      .then((ws) => {
        if (!active) return;
        if (ws.campaigns.length) {
          useCampaigns.getState().hydrate(ws);
          setSavedSignature(workspaceSignature(workspaceFromStore()));
        } else {
          setSavedSignature(workspaceSignature(workspaceFromStore()));
        }
      })
      .catch((e) => {
        if (isUnauthorized(e)) {
          hydrateDemoWorkspace('Demo workspace. Sign in to save.');
          return;
        }
        if (useCampaigns.getState().campaigns.length === 0) {
          hydrateDemoWorkspace('Demo workspace.');
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const saveWorkspaceNow = async () => {
    try {
      await saveWorkspace({ campaigns: useCampaigns.getState().campaigns, levels: useCampaigns.getState().levels });
      setSavedSignature(workspaceSignature(workspaceFromStore()));
      setStatus('Saved to server');
    } catch (e) {
      if (isUnauthorized(e)) { goSignIn(); return; }
      setStatus(`Save failed: ${(e as Error).message}`);
    }
  };

  const importCampaignFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<{ campaigns: Campaign[]; levels: Record<string, Level> }>;
      const validationError = validateWorkspaceImport(parsed);
      if (validationError) {
        setStatus(`Import failed: ${validationError}.`);
        return;
      }
      const importedCampaigns = parsed.campaigns!;
      const importedLevels = parsed.levels!;
      useCampaigns.getState().importWorkspace({ campaigns: importedCampaigns, levels: importedLevels });
      setStatus(`Imported ${importedCampaigns.length} campaign${importedCampaigns.length === 1 ? '' : 's'}. Save to keep them.`);
    } catch (error) {
      setStatus(`Import failed: ${(error as Error).message}`);
    }
  };

  const exportWorkspace = () => {
    const workspace = workspaceFromStore();
    const blob = new Blob([`${JSON.stringify(workspace, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeName = (camp?.name ?? 'campaign-workspace').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'campaign-workspace';
    anchor.href = url;
    anchor.download = `${safeName}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus('Exported campaign workspace JSON.');
  };

  const confirmDeleteCampaign = (campaign: Campaign) => {
    if (window.confirm(`Delete campaign "${campaign.name}"? This removes it from the workspace when you save.`)) {
      useCampaigns.getState().deleteCampaign(campaign.id);
      setStatus('Campaign deleted. Save to keep this change.');
    }
  };

  const confirmDeleteLevel = (level: Level) => {
    if (window.confirm(`Delete level "${level.name}"? This removes it from the workspace when you save.`)) {
      useCampaigns.getState().deleteLevel(level.id);
      setStatus('Level deleted. Save to keep this change.');
    }
  };

  const camp = campaigns.find((c) => c.id === selectedCampaignId) ?? null;
  const orderedLevels = camp ? camp.levels.slice().sort((a, b) => a.ordinal - b.ordinal) : [];
  const levelDoc = selectedLevelId ? levels[selectedLevelId] : null;
  const levelRef = camp && selectedLevelId ? camp.levels.find((r) => r.levelId === selectedLevelId) : null;
  const selectedLevelIndex = orderedLevels.findIndex((r) => r.levelId === selectedLevelId);
  const totalLevels = orderedLevels.length;
  const completedLevels = orderedLevels.filter((level) => level.completed).length;
  const enemyCount = levelDoc?.layers.units.filter((unit) => unit.side === 'enemy').length ?? 0;
  const allyCount = levelDoc?.layers.units.filter((unit) => unit.side === 'player').length ?? totalLevels;
  const editHref = camp && levelDoc ? `/edit?campaignId=${encodeURIComponent(camp.id)}&levelId=${encodeURIComponent(levelDoc.id)}&returnTo=${encodeURIComponent('/campaigns-next')}` : '/edit';
  const playHref = camp && levelDoc ? `/play?campaignId=${encodeURIComponent(camp.id)}&levelId=${encodeURIComponent(levelDoc.id)}&mode=test&returnTo=${encodeURIComponent('/campaigns-next')}` : '/play';

  return (
    <div className="ce-screen" data-testid="campaign-editor" style={campaignEditorAssetVars()}>
      <header className="ce-topbar">
        <a className="ce-brand" href="/" aria-label="Back to main menu">
          <img src="/assets/ui/main-menu/profile-rook-blue.png" alt="" />
          <span>
            <strong>Campaign Editor</strong>
            <small>Chess Tactics</small>
          </span>
        </a>
        <div className="ce-topbar-stats" aria-label="Campaign workspace stats">
          <span className={`ce-save-state ${dirty ? 'is-dirty' : ''}`.trim()}>{dirty ? 'Unsaved' : 'Saved'}</span>
          <span><img src="/assets/ui/main-menu/profile-rook-blue.png" alt="" />Allies <strong>{allyCount}</strong></span>
          <span><img src="/assets/ui/main-menu/profile-rook-red.png" alt="" />Enemies <strong>{enemyCount}</strong></span>
        </div>
        <nav className="ce-topbar-actions" aria-label="Editor shortcuts">
          <a href="/" aria-label="Main menu"><CeIcon icon="menu" /></a>
          <button type="button" onClick={saveWorkspaceNow} aria-label="Save workspace"><CeIcon icon="save" /></button>
          <a href="/settings" aria-label="Settings"><CeIcon icon="settings" /></a>
        </nav>
      </header>

      <main className="ce-layout">
        <aside className="ce-panel ce-campaigns-panel" aria-label="Campaigns">
          <div className="ce-panel-head">
            <h2>Campaigns</h2>
            <span>{campaigns.length} / 20</span>
          </div>
          <AssetButton data-testid="new-campaign" className="ce-new-campaign" onClick={() => useCampaigns.getState().newCampaign()}>
            + New Campaign
          </AssetButton>
          <input
            ref={importInputRef}
            className="ce-file-input"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void importCampaignFile(event.currentTarget.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
          {status ? <div data-testid="workspace-status" className="ce-status">{status}</div> : null}
          {me && !me.signed_in ? (
            <a href={signInHref()} data-testid="campaign-sign-in" className="ce-sign-in">Sign in to save</a>
          ) : null}
          <div className="ce-campaign-list">
            {campaigns.length === 0 ? <p className="ce-empty">No campaigns yet.</p> : null}
            {campaigns.map((campaign, index) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                index={index}
                active={campaign.id === selectedCampaignId}
                onSelect={() => useCampaigns.getState().selectCampaign(campaign.id)}
                onFavorite={(event) => {
                  event.stopPropagation();
                  useCampaigns.getState().toggleCampaignFavorite(campaign.id);
                }}
              />
            ))}
          </div>
          <AssetButton className="ce-import-campaign" onClick={() => importInputRef.current?.click()}>
            Import Campaign
          </AssetButton>
        </aside>

        <section className="ce-panel ce-details-panel" aria-label="Campaign details and levels">
          {camp ? (
            <>
              <div className="ce-section-title">
                <h2>Campaign Details</h2>
              </div>
              <div className="ce-campaign-summary">
                <ShieldBadge index={campaigns.findIndex((c) => c.id === camp.id)} active />
                <label className="ce-name-field">
                  <span>Campaign Name</span>
                  <input
                    data-testid="campaign-name"
                    value={camp.name}
                    onChange={(e) => useCampaigns.getState().renameCampaign(camp.id, e.target.value)}
                  />
                </label>
                <dl>
                  <div><dt>Chapters</dt><dd>{camp.chapters}</dd></div>
                  <div><dt>Levels</dt><dd>{completedLevels} / {camp.levels.length}</dd></div>
                  <div><dt>Difficulty</dt><dd>{camp.difficulty}</dd></div>
                </dl>
              </div>

              <div className="ce-levels-head">
                <h2>Levels</h2>
                <AssetButton data-testid="add-level" onClick={() => useCampaigns.getState().addLevel()}>+ Add Level</AssetButton>
              </div>
              <div className="ce-level-list">
                {orderedLevels.length === 0 ? <p className="ce-empty">No levels. Add one to begin.</p> : null}
                {orderedLevels.map((ref, index) => (
                  <LevelRow
                    key={ref.levelId}
                    levelRef={ref}
                    level={levels[ref.levelId]}
                    index={index}
                    active={ref.levelId === selectedLevelId}
                    onSelect={() => useCampaigns.getState().selectLevel(ref.levelId)}
                    onMoveUp={(event) => { event.stopPropagation(); useCampaigns.getState().moveLevel(ref.levelId, -1); }}
                    onMoveDown={(event) => { event.stopPropagation(); useCampaigns.getState().moveLevel(ref.levelId, 1); }}
                    onDelete={(event) => { event.stopPropagation(); if (levels[ref.levelId]) confirmDeleteLevel(levels[ref.levelId]); }}
                  />
                ))}
              </div>
              <div className="ce-mid-actions">
                <IconButton onClick={() => selectedLevelId && useCampaigns.getState().moveLevel(selectedLevelId, -1)} aria-label="Move selected level up"><CeIcon icon="up" /></IconButton>
                <IconButton onClick={() => selectedLevelId && useCampaigns.getState().moveLevel(selectedLevelId, 1)} aria-label="Move selected level down"><CeIcon icon="down" /></IconButton>
                <AssetButton danger onClick={() => confirmDeleteCampaign(camp)}>Delete Campaign</AssetButton>
              </div>
            </>
          ) : (
            <p className="ce-empty ce-empty-large">Select or create a campaign.</p>
          )}
        </section>

        <section className="ce-panel ce-level-panel" aria-label="Selected level">
          <div className="ce-selected-head">
            <h2>{levelDoc ? `Level ${selectedLevelIndex + 1}: ${levelDoc.name}` : 'Selected Level'}</h2>
            <span aria-hidden="true">✎</span>
          </div>
          <div className="ce-preview-frame">
            <LevelPreviewBoard level={levelDoc} />
          </div>
          {levelDoc && levelRef ? (
            <>
              <label className="ce-name-field ce-level-name-field">
                <span>Level Name</span>
                <input
                  data-testid="level-name"
                  value={levelDoc.name}
                  onChange={(e) => useCampaigns.getState().renameLevel(levelDoc.id, e.target.value)}
                />
              </label>
              <div className="ce-preview-actions">
                <a className="ce-link-button" href={editHref}><span>Edit Board</span></a>
                <a className="ce-link-button ce-link-button-ghost" href={playHref}><span>Test Play</span></a>
                <IconButton selected aria-label="Level settings"><CeIcon icon="settings" /></IconButton>
              </div>

              <div className="ce-settings-grid">
                <label className="ce-setting-card">
                  <span>Objective</span>
                  <select
                    data-testid="level-objective"
                    value={levelRef.objective ?? levelDoc.objective}
                    onChange={(e) => useCampaigns.getState().setLevelObjective(levelDoc.id, e.target.value as ObjectiveType)}
                  >
                    {OBJECTIVES.map((objective) => <option key={objective} value={objective}>{objectiveLabel[objective]}</option>)}
                  </select>
                </label>
                <label className="ce-setting-card">
                  <span>Difficulty</span>
                  <select value={levelDoc.difficulty} onChange={(e) => useCampaigns.getState().setLevelDifficulty(levelDoc.id, e.target.value)}>
                    {DIFFICULTIES.map((difficulty) => <option key={difficulty} value={difficulty}>{difficulty}</option>)}
                  </select>
                </label>
                <label className="ce-setting-card">
                  <span>Starting Funds</span>
                  <input
                    type="number"
                    value={levelDoc.economy.startingFunds}
                    onChange={(e) => useCampaigns.getState().setLevelEconomy(levelDoc.id, Number(e.target.value), levelDoc.economy.incomePerTurn)}
                  />
                </label>
                <label className="ce-setting-card">
                  <span>Income Per Turn</span>
                  <input
                    type="number"
                    value={levelDoc.economy.incomePerTurn}
                    onChange={(e) => useCampaigns.getState().setLevelEconomy(levelDoc.id, levelDoc.economy.startingFunds, Number(e.target.value))}
                  />
                </label>
              </div>

              <div className="ce-notes-card">
                <span>Notes</span>
                <textarea
                  data-testid="level-notes"
                  value={levelDoc.notes}
                  placeholder={`${objectiveLabel[levelRef.objective ?? levelDoc.objective]}. Board size ${levelDoc.board.cols} x ${levelDoc.board.rows}. Theme: ${levelDoc.theme}.`}
                  onChange={(event) => useCampaigns.getState().setLevelNotes(levelDoc.id, event.target.value)}
                />
              </div>
            </>
          ) : (
            <p className="ce-empty ce-empty-large">Select a level.</p>
          )}
        </section>
      </main>

      <footer className="ce-footer">
        <AssetButton data-testid="save-workspace" onClick={saveWorkspaceNow}>Save Campaign</AssetButton>
        <AssetButton disabled={!camp} onClick={() => camp && useCampaigns.getState().duplicateCampaign(camp.id)}>Duplicate</AssetButton>
        <AssetButton className="ce-footer-secondary" disabled={!campaigns.length} onClick={exportWorkspace}>Export</AssetButton>
        <AssetButton danger disabled={!levelDoc} onClick={() => levelDoc && confirmDeleteLevel(levelDoc)}>Delete Level</AssetButton>
      </footer>
    </div>
  );
}
