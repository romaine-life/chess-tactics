import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useCampaigns } from '../campaign/store';
import { validateLevel, type Campaign, type CampaignLevelRef, type Level, type ObjectiveType } from '../core/level';
import { loadWorkspace, saveWorkspace, loadOfficialCampaigns, saveOfficialCampaigns, type Workspace } from '../net/campaignWorkspace';
import { fetchMe, goSignIn, isUnauthorized, signInHref, type AuthUser } from '../net/auth';
import { LevelPreviewBoard } from '../render/LevelPreviewBoard';
import { LevelInfoCompact } from './LevelInfoCompact';
import { BrandLockup } from './shared/BrandLockup';

const CE_ICONS = {
  star: '/assets/ui/kit/icons/star.png',
  'chevron-up': '/assets/ui/kit/icons/chevron-up.png',
  'chevron-down': '/assets/ui/kit/icons/chevron-down.png',
  delete: '/assets/ui/kit/icons/delete.png',
  lock: '/assets/ui/kit/icons/lock.png',
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

function Stars({ count = 0 }: { count?: number }): ReactElement {
  return (
    <span className="ce-stars" aria-label={`${count} stars`}>
      {[0, 1, 2].map((i) => <img key={i} className={`ce-star ${i < count ? 'is-filled' : ''}`.trim()} src={CE_ICONS.star} alt="" aria-hidden="true" />)}
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
      <span className="ce-row-copy">
        <strong>{campaign.name}</strong>
        <small>{campaign.levels.length} levels</small>
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
          <img className="ce-star" src={CE_ICONS.star} alt="" aria-hidden="true" />
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
  readOnly = false,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  levelRef: CampaignLevelRef;
  level: Level | undefined;
  index: number;
  active: boolean;
  readOnly?: boolean;
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
      {readOnly ? null : (
        <span className="ce-row-actions" aria-label="Level actions">
          <IconButton onClick={onMoveUp} aria-label="Move level up"><CeIcon icon="chevron-up" /></IconButton>
          <IconButton onClick={onMoveDown} aria-label="Move level down"><CeIcon icon="chevron-down" /></IconButton>
          <IconButton danger onClick={onDelete} aria-label="Delete level"><CeIcon icon="delete" /></IconButton>
        </span>
      )}
    </div>
  );
}

export function CampaignEditor() {
  const campaigns = useCampaigns((s) => s.campaigns);
  const levels = useCampaigns((s) => s.levels);
  const selectedCampaignId = useCampaigns((s) => s.selectedCampaignId);
  const selectedLevelId = useCampaigns((s) => s.selectedLevelId);
  const officialMode = useCampaigns((s) => s.officialMode);
  const [status, setStatus] = useState('');
  const [me, setMe] = useState<AuthUser | null>(null);
  const [levelView, setLevelView] = useState<'board' | 'info'>('board');
  const currentWorkspace = useMemo(() => ({ campaigns, levels }), [campaigns, levels]);
  const currentSignature = useMemo(() => workspaceSignature(currentWorkspace), [currentWorkspace]);
  const [savedSignature, setSavedSignature] = useState(() => currentSignature);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const dirty = currentSignature !== savedSignature;

  // Strip the in-memory tier tags before any PUT, so persisted bodies stay identical
  // to the canonical Workspace shape (ADR-0038).
  const stripTiers = (list: Campaign[]): Campaign[] =>
    list.map(({ origin: _origin, readOnly: _readOnly, ...rest }) => rest);

  // The per-user save EXCLUDES officials (they share the store array) — this single
  // filter is what keeps `off-` ids out of campaign_workspaces.
  const userWorkspaceForSave = (): Workspace => {
    const state = useCampaigns.getState();
    return {
      campaigns: stripTiers(state.campaigns.filter((c) => c.origin !== 'official')),
      levels: Object.fromEntries(Object.entries(state.levels).filter(([id]) => !id.startsWith('off-'))),
    };
  };

  const officialWorkspaceForSave = (): Workspace => {
    const state = useCampaigns.getState();
    return { campaigns: stripTiers(state.campaigns), levels: state.levels };
  };

  const selectFirstEditable = () => {
    // Only auto-select an EDITABLE (own) campaign. Officials are locked in normal mode;
    // leaving none selected shows "Select or create a campaign" rather than exposing
    // live level controls on a read-only official.
    const state = useCampaigns.getState();
    const first = state.campaigns.find((c) => c.origin !== 'official');
    if (first) state.selectCampaign(first.id);
  };

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('campaign-editor-active');
    return () => shell?.classList.remove('campaign-editor-active');
  }, []);

  useEffect(() => {
    let active = true;
    fetchMe().then((user) => { if (active) setMe(user); });
    (async () => {
      const store = useCampaigns.getState();
      // Officials always (for everyone), then the signed-in user's own on top.
      store.mergeOfficial(await loadOfficialCampaigns());
      if (!active) return;
      try {
        store.mergeUser(await loadWorkspace());
      } catch (e) {
        if (active && isUnauthorized(e)) setStatus('Official campaigns shown. Sign in to author your own.');
      }
      if (!active) return;
      selectFirstEditable();
      setSavedSignature(workspaceSignature(workspaceFromStore()));
    })();
    return () => { active = false; };
  }, []);

  const enterOfficialEditing = async () => {
    if (dirty && !window.confirm('Discard unsaved changes and edit OFFICIAL campaigns?')) return;
    useCampaigns.getState().hydrateOfficialForEditing(await loadOfficialCampaigns());
    setSavedSignature(workspaceSignature(workspaceFromStore()));
    setStatus('Editing OFFICIAL campaigns — Publish writes to every player.');
  };

  const exitOfficialEditing = async () => {
    if (dirty && !window.confirm('Discard unpublished official changes?')) return;
    const store = useCampaigns.getState();
    store.setOfficialMode(false);
    store.mergeOfficial(await loadOfficialCampaigns());
    try { store.mergeUser(await loadWorkspace()); } catch { /* unauth ⇒ officials only */ }
    selectFirstEditable();
    setSavedSignature(workspaceSignature(workspaceFromStore()));
    setStatus('');
  };

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
      if (useCampaigns.getState().officialMode) {
        const { revision } = await saveOfficialCampaigns(officialWorkspaceForSave());
        setSavedSignature(workspaceSignature(workspaceFromStore()));
        setStatus(`Published official campaigns (revision ${revision}).`);
      } else {
        await saveWorkspace(userWorkspaceForSave());
        setSavedSignature(workspaceSignature(workspaceFromStore()));
        setStatus('Saved to server');
      }
    } catch (e) {
      if (isUnauthorized(e)) { goSignIn(); return; }
      if ((e as { status?: number }).status === 403) { setStatus('Admin access required to publish official campaigns.'); return; }
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
    // Export only the tier you author (tags stripped) — never the co-mingled store, or
    // a re-import would carry origin:'official' and be silently dropped on save.
    const workspace = useCampaigns.getState().officialMode ? officialWorkspaceForSave() : userWorkspaceForSave();
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
  // Official campaigns are read-only in normal mode (locked); in officialMode they're
  // editable (readOnly is cleared by hydrateOfficialForEditing). This drives every
  // mutation control below so a read-only official can never be edited in-place.
  const readOnly = Boolean(camp?.readOnly);
  const ownCount = campaigns.filter((c) => c.origin !== 'official').length;
  const orderedLevels = camp ? camp.levels.slice().sort((a, b) => a.ordinal - b.ordinal) : [];
  const levelDoc = selectedLevelId ? levels[selectedLevelId] : null;
  const levelRef = camp && selectedLevelId ? camp.levels.find((r) => r.levelId === selectedLevelId) : null;
  const selectedLevelIndex = orderedLevels.findIndex((r) => r.levelId === selectedLevelId);
  const totalLevels = orderedLevels.length;
  const enemyCount = levelDoc?.layers.units.filter((unit) => unit.side === 'enemy').length ?? 0;
  const allyCount = levelDoc?.layers.units.filter((unit) => unit.side === 'player').length ?? 0;
  const editHref = camp && levelDoc ? `/edit?campaignId=${encodeURIComponent(camp.id)}&levelId=${encodeURIComponent(levelDoc.id)}&returnTo=${encodeURIComponent('/campaigns-next')}` : '/edit';
  const playHref = camp && levelDoc ? `/play?campaignId=${encodeURIComponent(camp.id)}&levelId=${encodeURIComponent(levelDoc.id)}&mode=test&returnTo=${encodeURIComponent('/campaigns-next')}` : '/play';

  return (
    <div className="ce-screen" data-testid="campaign-editor">
      <header className="app-titlebar settings-header-frame ce-topbar">
        <BrandLockup screenName="Campaign Editor" />
        <div className="ce-topbar-stats" aria-label="Campaign workspace stats">
          {officialMode ? <span className="ce-save-state ce-official-badge">OFFICIAL</span> : null}
          <span className={`ce-save-state ${dirty ? 'is-dirty' : ''}`.trim()}>{dirty ? 'Unsaved' : 'Saved'}</span>
        </div>
        <nav className="ce-topbar-actions" aria-label="Editor shortcuts">
          {me?.is_admin ? (
            officialMode
              ? <button type="button" data-testid="exit-officials" className="app-header-button" onClick={() => void exitOfficialEditing()}>Exit Officials</button>
              : <button type="button" data-testid="edit-officials" className="app-header-button" onClick={() => void enterOfficialEditing()}>Edit Officials</button>
          ) : null}
          <button type="button" data-testid="save-workspace" className="app-header-button app-header-button-active" onClick={saveWorkspaceNow}>{officialMode ? 'Publish' : 'Save'}</button>
          <a className="app-header-button" href="/settings">Settings</a>
        </nav>
      </header>

      <main className="ce-layout">
        <aside className="ce-panel ce-campaigns-panel" aria-label="Campaigns">
          <div className="ce-panel-head">
            <h2>Campaigns</h2>
            <span>{officialMode ? `${campaigns.length} official` : `${ownCount} / 20`}</span>
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
                {readOnly ? <span className="ce-official-badge">Official campaign — read-only</span> : null}
              </div>
              <div className="ce-campaign-summary">
                <label className="ce-name-field">
                  <span>Campaign Name</span>
                  <input
                    data-testid="campaign-name"
                    value={camp.name}
                    disabled={readOnly}
                    onChange={(e) => useCampaigns.getState().renameCampaign(camp.id, e.target.value)}
                  />
                </label>
                <dl className="ce-stat-rows">
                  <div className="ce-stat-row"><dt>Chapters</dt><dd>{camp.chapters}</dd></div>
                  <div className="ce-stat-row"><dt>Levels</dt><dd>{camp.levels.length}</dd></div>
                  <div className="ce-stat-row"><dt>Difficulty</dt><dd>{camp.difficulty}</dd></div>
                </dl>
              </div>

              <div className="ce-levels-head">
                <h2>Levels</h2>
                {readOnly ? null : <AssetButton data-testid="add-level" onClick={() => useCampaigns.getState().addLevel()}>+ Add Level</AssetButton>}
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
                    readOnly={readOnly}
                    onSelect={() => useCampaigns.getState().selectLevel(ref.levelId)}
                    onMoveUp={(event) => { event.stopPropagation(); useCampaigns.getState().moveLevel(ref.levelId, -1); }}
                    onMoveDown={(event) => { event.stopPropagation(); useCampaigns.getState().moveLevel(ref.levelId, 1); }}
                    onDelete={(event) => { event.stopPropagation(); if (levels[ref.levelId]) confirmDeleteLevel(levels[ref.levelId]); }}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="ce-empty ce-empty-large">Select or create a campaign.</p>
          )}
        </section>

        <section className="ce-panel ce-level-panel" aria-label="Selected level">
          <div className="ce-selected-head">
            <h2>{levelDoc ? `Level ${selectedLevelIndex + 1}: ${levelDoc.name}` : 'Selected Level'}</h2>
            {levelDoc ? (
              <div className="ce-force-readout" aria-label="Level forces">
                <span className="ce-force ce-force-ally"><img src="/assets/ui/main-menu/profile-rook-blue.png" alt="" />Allies <strong>{allyCount}</strong></span>
                <span className="ce-force ce-force-enemy"><img src="/assets/ui/main-menu/profile-rook-red.png" alt="" />Enemies <strong>{enemyCount}</strong></span>
              </div>
            ) : null}
          </div>
          <div className="ce-preview-frame">
            {levelDoc ? (
              <div className="ce-level-view-toggle" role="tablist" aria-label="Preview mode">
                <button type="button" role="tab" aria-selected={levelView === 'board'} className={levelView === 'board' ? 'is-active' : ''} onClick={() => setLevelView('board')}>Board</button>
                <button type="button" role="tab" aria-selected={levelView === 'info'} className={levelView === 'info' ? 'is-active' : ''} onClick={() => setLevelView('info')}>Info</button>
              </div>
            ) : null}
            {levelDoc && levelView === 'info'
              ? <LevelInfoCompact level={levelDoc} />
              : <LevelPreviewBoard level={levelDoc} />}
          </div>
          {levelDoc && levelRef ? (
            <div className="ce-preview-actions">
              <a className="ce-link-button" href={editHref}><span>Edit Board</span></a>
              <a className="ce-link-button ce-link-button-ghost" href={playHref}><span>Test Play</span></a>
            </div>
          ) : (
            <p className="ce-empty ce-empty-large">Select a level.</p>
          )}
        </section>
      </main>

      <footer className="ce-footer">
        <AssetButton disabled={!camp || camp.origin === 'official'} onClick={() => camp && useCampaigns.getState().duplicateCampaign(camp.id)}>Duplicate</AssetButton>
        <AssetButton className="ce-footer-secondary" disabled={!campaigns.length} onClick={exportWorkspace}>Export</AssetButton>
        <AssetButton danger disabled={!camp || readOnly} onClick={() => camp && confirmDeleteCampaign(camp)}>Delete Campaign</AssetButton>
      </footer>
    </div>
  );
}
