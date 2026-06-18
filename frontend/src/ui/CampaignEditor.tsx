import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useCampaigns } from '../campaign/store';
import type { Campaign, CampaignLevelRef, Level, ObjectiveType } from '../core/level';
import { loadWorkspace, saveWorkspace } from '../net/campaignWorkspace';
import { fetchMe, goSignIn, isUnauthorized, signInHref, type AuthUser } from '../net/auth';

const OBJECTIVES: ObjectiveType[] = ['capture-all', 'capture-king', 'survive', 'reach'];
const DIFFICULTIES = ['easy', 'normal', 'hard'];
const SHIELDS = ['lion', 'rook', 'crescent', 'snow', 'flame', 'crown'] as const;

const objectiveLabel: Record<ObjectiveType, string> = {
  'capture-all': 'Capture all enemy pieces',
  'capture-king': 'Capture the enemy King',
  survive: 'Survive the assault',
  reach: 'Reach the objective',
};

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

function MiniBoard({ level }: { level: Level | null }): ReactElement {
  const cells = useMemo(() => Array.from({ length: 48 }, (_, i) => i), []);
  const unitCount = level?.layers.units.length ?? 0;
  return (
    <div className="ce-mini-board" aria-label={level ? `${level.name} board preview` : 'Level board preview'}>
      <div className="ce-mini-board-grid" aria-hidden="true">
        {cells.map((cell) => (
          <span
            key={cell}
            className={[
              cell % 11 === 0 || cell % 17 === 0 ? 'is-water' : '',
              cell % 13 === 0 ? 'is-stone' : '',
              cell < unitCount * 3 ? (cell % 2 ? 'is-red-unit' : 'is-blue-unit') : '',
            ].join(' ')}
          />
        ))}
      </div>
    </div>
  );
}

function CampaignRow({
  campaign,
  index,
  active,
  onSelect,
}: {
  campaign: Campaign;
  index: number;
  active: boolean;
  onSelect: () => void;
}): ReactElement {
  return (
    <button type="button" className={`ce-campaign-row ${active ? 'is-selected' : ''}`} onClick={onSelect}>
      <ShieldBadge index={index} active={active} />
      <span className="ce-row-copy">
        <strong>{campaign.name}</strong>
        <small>{campaign.levels.length} levels</small>
      </span>
      <span className="ce-row-favorite" aria-hidden="true">★</span>
    </button>
  );
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
        <span />
      </span>
      <span className="ce-row-copy">
        <strong>{index + 1}. {level?.name ?? levelRef.levelId}</strong>
        <small>{objectiveLabel[objective]}</small>
      </span>
      <Stars count={levelRef.stars ?? (active ? 2 : 1)} />
      <span className="ce-row-actions" aria-label="Level actions">
        <IconButton onClick={onMoveUp} aria-label="Move level up">↑</IconButton>
        <IconButton onClick={onMoveDown} aria-label="Move level down">↓</IconButton>
        <IconButton danger onClick={onDelete} aria-label="Delete level">×</IconButton>
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

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('campaign-editor-active');
    return () => shell?.classList.remove('campaign-editor-active');
  }, []);

  useEffect(() => {
    let active = true;
    fetchMe().then((user) => { if (active) setMe(user); });
    loadWorkspace()
      .then((ws) => { if (ws.campaigns.length) useCampaigns.getState().hydrate(ws); })
      .catch((e) => { if (isUnauthorized(e)) setStatus('Sign in to load and save your campaigns.'); });
    return () => { active = false; };
  }, []);

  const saveWorkspaceNow = async () => {
    try {
      await saveWorkspace({ campaigns: useCampaigns.getState().campaigns, levels: useCampaigns.getState().levels });
      setStatus('Saved to server');
    } catch (e) {
      if (isUnauthorized(e)) { goSignIn(); return; }
      setStatus(`Save failed: ${(e as Error).message}`);
    }
  };

  const camp = campaigns.find((c) => c.id === selectedCampaignId) ?? null;
  const orderedLevels = camp ? camp.levels.slice().sort((a, b) => a.ordinal - b.ordinal) : [];
  const levelDoc = selectedLevelId ? levels[selectedLevelId] : null;
  const levelRef = camp && selectedLevelId ? camp.levels.find((r) => r.levelId === selectedLevelId) : null;
  const selectedLevelIndex = orderedLevels.findIndex((r) => r.levelId === selectedLevelId);
  const totalLevels = orderedLevels.length;

  return (
    <div className="ce-screen" data-testid="campaign-editor">
      <header className="ce-topbar">
        <a className="ce-brand" href="/" aria-label="Back to main menu">
          <img src="/assets/ui/main-menu/profile-rook-blue.png" alt="" />
          <span>
            <strong>Campaign Editor</strong>
            <small>Chess Tactics</small>
          </span>
        </a>
        <div className="ce-topbar-stats" aria-label="Campaign workspace stats">
          <span><img src="/assets/ui/main-menu/profile-rook-blue.png" alt="" />Allies <strong>{totalLevels || 0}</strong></span>
          <span><img src="/assets/ui/main-menu/profile-rook-red.png" alt="" />Enemies <strong>{campaigns.length}</strong></span>
        </div>
        <nav className="ce-topbar-actions" aria-label="Editor shortcuts">
          <a href="/" aria-label="Main menu">M</a>
          <button type="button" onClick={saveWorkspaceNow} aria-label="Save workspace">S</button>
          <a href="/settings" aria-label="Settings">G</a>
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
              />
            ))}
          </div>
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
                  <div><dt>Levels</dt><dd>{camp.levels.length}</dd></div>
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
                    onDelete={(event) => { event.stopPropagation(); useCampaigns.getState().deleteLevel(ref.levelId); }}
                  />
                ))}
              </div>
              <div className="ce-mid-actions">
                <IconButton onClick={() => selectedLevelId && useCampaigns.getState().moveLevel(selectedLevelId, -1)} aria-label="Move selected level up">↑</IconButton>
                <IconButton onClick={() => selectedLevelId && useCampaigns.getState().moveLevel(selectedLevelId, 1)} aria-label="Move selected level down">↓</IconButton>
                <AssetButton danger onClick={() => useCampaigns.getState().deleteCampaign(camp.id)}>Delete Campaign</AssetButton>
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
            <MiniBoard level={levelDoc} />
          </div>
          {levelDoc && levelRef ? (
            <>
              <div className="ce-preview-actions">
                <a className="ce-link-button" href="/edit">Edit Board</a>
                <a className="ce-link-button ce-link-button-ghost" href="/play">Test Play</a>
                <IconButton selected aria-label="Level settings">G</IconButton>
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
                <p>{objectiveLabel[levelRef.objective ?? levelDoc.objective]}. Board size {levelDoc.board.cols} x {levelDoc.board.rows}. Theme: {levelDoc.theme}.</p>
              </div>
            </>
          ) : (
            <p className="ce-empty ce-empty-large">Select a level.</p>
          )}
        </section>
      </main>

      <footer className="ce-footer">
        <AssetButton data-testid="save-workspace" onClick={saveWorkspaceNow}>Save Campaign</AssetButton>
        <a className="ce-footer-link" href="/edit">Open Board Editor</a>
        <AssetButton danger disabled={!levelDoc} onClick={() => levelDoc && useCampaigns.getState().deleteLevel(levelDoc.id)}>Delete Level</AssetButton>
      </footer>
    </div>
  );
}
