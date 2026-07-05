import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useCampaigns } from '../campaign/store';
import { saveUserWorkspace, publishOfficialWorkspace, userWorkspaceForSave, officialWorkspaceForSave, mapSaveError, tierOf } from '../campaign/save';
import { validateLevel, type Campaign, type CampaignLevelRef, type Level } from '../core/level';
import { MODE_NAME } from '../core/objectives';
import { loadWorkspace, loadOfficialCampaigns } from '../net/campaignWorkspace';
import { fetchMe, goSignIn, isUnauthorized, type AuthUser } from '../net/auth';
import { LevelThumbnail } from '../render/LevelThumbnail';
import { StudioReadOnlyBoard } from '../render/StudioReadOnlyBoard';
import { levelToEditorBoard } from '../core/levelBoard';
import { ViewPane } from './shared/ViewPane';
import { injectStressLevels } from '../campaign/stressFixture';
import { LevelInfoCompact, levelObjectiveLine } from './LevelInfoCompact';
import { NavButton } from './shared/NavButton';
import { useConfirm } from './shared/ConfirmDialog';
import { TitleBarSlot } from './shell/TitleBarSlot';
import { HomepageBackdrop } from './HomepageBackdrop';
import { ArtRouteChrome } from './shell/ArtRouteChrome';

const CE_ICONS = {
  star: '/assets/ui/kit/icons/star.png',
  'chevron-up': '/assets/ui/kit/icons/chevron-up.png',
  'chevron-down': '/assets/ui/kit/icons/chevron-down.png',
  delete: '/assets/ui/kit/icons/delete.png',
  lock: '/assets/ui/kit/icons/lock.png',
} as const;

type CampaignCollection = 'campaign' | 'unassigned';

const CAMPAIGN_EDITOR_RETURN_TO = '/campaigns-next';

function workspaceSignature(ws: { campaigns: Campaign[]; levels: Record<string, Level> }): string {
  return JSON.stringify(ws);
}

// Per-tier signatures: the user slice and the official slice are tracked separately so a
// private "Save" and an official "Publish" have independent dirty state. Both read the
// same canonical (tag-stripped) slice the corresponding PUT would send.
function userSliceSignature(): string {
  return workspaceSignature(userWorkspaceForSave());
}

function officialSliceSignature(): string {
  return workspaceSignature(officialWorkspaceForSave());
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
  isAdmin,
  onSelect,
  onFavorite,
}: {
  campaign: Campaign;
  index: number;
  active: boolean;
  isAdmin: boolean;
  onSelect: () => void;
  onFavorite: (event: React.MouseEvent<HTMLButtonElement>) => void;
}): ReactElement {
  const isOfficial = campaign.origin === 'official';
  // Lock (and the padlock) is UI-derived: officials lock only for non-admins. An admin
  // sees officials selectable + editable, tagged "OFFICIAL" instead of a padlock.
  const locked = isOfficial && !isAdmin;
  const selectCampaign = () => {
    if (!locked) onSelect();
  };
  return (
    <div
      role="button"
      tabIndex={locked ? -1 : 0}
      aria-disabled={locked || undefined}
      className={`ce-campaign-row ${active ? 'is-selected' : ''} ${locked ? 'is-locked' : ''}`.trim()}
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
      ) : isOfficial ? (
        <span className="ce-official-badge ce-row-official-tag" aria-label={`${campaign.name} is an official campaign`}>OFFICIAL</span>
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

function UnassignedCampaignRow({
  count,
  active,
  onSelect,
}: {
  count: number;
  active: boolean;
  onSelect: () => void;
}): ReactElement {
  const levelCount = `${count} level${count === 1 ? '' : 's'}`;
  return (
    <div
      role="button"
      tabIndex={0}
      className={`ce-campaign-row ce-campaign-row-meta ${active ? 'is-selected' : ''}`.trim()}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="ce-row-copy">
        <strong>Unassigned levels</strong>
        <small>{levelCount}</small>
      </span>
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
  // The full level doc drives a direction-aware goal line (King Assault reads "Protect
  // your King" when the player holds the King); before it hydrates, fall back to the
  // ref's objective as a mode name only.
  const goalLine = level ? levelObjectiveLine(level) : MODE_NAME[levelRef.objective ?? 'capture-all'];
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
        {level ? <LevelThumbnail level={level} width={46} height={32} /> : <span className="ce-level-thumb-empty" />}
      </span>
      <span className="ce-row-copy">
        <strong>{index + 1}. {level?.name ?? levelRef.levelId}</strong>
        <small>{goalLine}</small>
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
  const [status, setStatus] = useState('');
  const [me, setMe] = useState<AuthUser | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<CampaignCollection>('campaign');
  const { ask, dialog: confirmDialog } = useConfirm();
  // Entrance readiness (ADR-0051): the shared store may already hold campaigns from a
  // /campaign or /skirmish visit this session — then there's real content at mount and
  // nothing holds; otherwise hold the fade until the officials merge settles.
  const [loaded, setLoaded] = useState(() => useCampaigns.getState().campaigns.length > 0);
  const [levelView, setLevelView] = useState<'board' | 'info'>('board');
  // Pan/zoom for the SELECTED-level live viewer (the list rows stay flat baked thumbnails).
  const [viewZoom, setViewZoom] = useState(0.5);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const currentWorkspace = useMemo(() => ({ campaigns, levels }), [campaigns, levels]);
  // Two tier-scoped dirty signals: a private "Save" and an official "Publish" are
  // independent acts, each with its own last-saved signature.
  const userSig = useMemo(() => userSliceSignature(), [currentWorkspace]);
  const officialSig = useMemo(() => officialSliceSignature(), [currentWorkspace]);
  const [savedUserSig, setSavedUserSig] = useState(() => userSig);
  const [savedOfficialSig, setSavedOfficialSig] = useState(() => officialSig);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const userDirty = userSig !== savedUserSig;
  const officialDirty = officialSig !== savedOfficialSig;
  const dirty = userDirty || officialDirty;

  const resyncSavedSignatures = () => {
    setSavedUserSig(userSliceSignature());
    setSavedOfficialSig(officialSliceSignature());
  };

  const selectFirstEditable = () => {
    // Land on the first private campaign by default so a fresh load opens on editable
    // content. Officials are now editable in place (for admins) or read-only with a
    // padlock (everyone else) — selection no longer steers around them.
    const state = useCampaigns.getState();
    const first = state.campaigns.find((c) => c.origin !== 'official') ?? state.campaigns[0];
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
      try {
        // Officials always (for everyone), then the signed-in user's own on top.
        store.mergeOfficial(await loadOfficialCampaigns());
      } finally {
        // The entrance holds on this flag (ADR-0051): without it the chrome fades in
        // over a false "No campaigns yet." and the list pops in when the fetch lands.
        // Flip it as soon as the primary content is settled — the user merge below
        // only layers rows on top.
        if (active) setLoaded(true);
      }
      if (!active) return;
      try {
        store.mergeUser(await loadWorkspace());
      } catch (e) {
        if (active && isUnauthorized(e)) setStatus('Official campaigns shown. Sign in to author your own.');
      }
      if (!active) return;
      // Dev-only perf harness: `?stress=<n>` injects a throwaway campaign of N generated levels
      // (selecting it) so scroll/thumbnail perf can be measured on a long list. No-op without the
      // flag, so it never touches normal use; the levels live only in the in-memory store.
      const injected = injectStressLevels();
      if (injected) setStatus(`Stress fixture: injected ${injected} generated levels.`);
      else selectFirstEditable();
      resyncSavedSignatures();
    })();
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

  // Re-frame the live viewer whenever the selected level changes, so each board opens centred
  // at the default zoom instead of inheriting the previous level's pan/zoom.
  useEffect(() => {
    setViewZoom(0.5);
    setViewPan({ x: 0, y: 0 });
  }, [selectedLevelId]);

  // Private "Save": frictionless, writes only the user slice (officials never enter it).
  const saveUserNow = async () => {
    try {
      await saveUserWorkspace();
      setSavedUserSig(userSliceSignature());
      setStatus('Saved to server');
    } catch (e) {
      const mapped = mapSaveError(e);
      if ('action' in mapped) { goSignIn(); return; }
      setStatus(mapped.message);
    }
  };

  // "Publish to all players": a distinct, confirmed, admin-gated write of ONLY the
  // official slice. The server's requireAdmin is the real gate (403 surfaces here).
  const publishOfficialNow = async () => {
    if (!(await ask({
      title: 'Publish to all players?',
      message: 'This updates the official campaigns. Every player will receive these changes the next time they play.',
      confirmLabel: 'Publish',
      cancelLabel: 'Cancel',
    }))) return;
    try {
      const { revision } = await publishOfficialWorkspace();
      setSavedOfficialSig(officialSliceSignature());
      setStatus(`Published (revision ${revision}).`);
    } catch (e) {
      const mapped = mapSaveError(e);
      if ('action' in mapped) { goSignIn(); return; }
      setStatus(mapped.message);
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
      setSelectedCollection('campaign');
      setStatus(`Imported ${importedCampaigns.length} campaign${importedCampaigns.length === 1 ? '' : 's'}. Save to keep them.`);
    } catch (error) {
      setStatus(`Import failed: ${(error as Error).message}`);
    }
  };

  const exportWorkspace = () => {
    // Export only the user slice (tags stripped) — never the co-mingled store, or a
    // re-import would carry origin:'official' and be silently dropped on save.
    const workspace = userWorkspaceForSave();
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

  const confirmDeleteCampaign = async (campaign: Campaign) => {
    if (await ask({
      title: `Delete campaign?`,
      message: <>Delete <b>{campaign.name}</b>? This removes it from the workspace when you save.</>,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      tone: 'danger',
    })) {
      useCampaigns.getState().deleteCampaign(campaign.id);
      setStatus('Campaign deleted. Save to keep this change.');
    }
  };

  const confirmDeleteLevel = async (level: Level) => {
    if (await ask({
      title: `Delete level?`,
      message: <>Delete <b>{level.name}</b>? This removes it from the workspace when you save.</>,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      tone: 'danger',
    })) {
      useCampaigns.getState().deleteLevel(level.id);
      setStatus('Level deleted. Save to keep this change.');
    }
  };

  const isAdmin = Boolean(me?.is_admin);
  const isUnassignedSelected = selectedCollection === 'unassigned';
  // Unassigned levels: store level docs referenced by NO campaign — typically a board authored
  // cold in the Level Editor (createUnassignedLevel) before it is filed into a campaign. They
  // live in the workspace and round-trip through campaign_workspaces just like any other level.
  const referencedLevelIds = useMemo(
    () => new Set(campaigns.flatMap((c) => c.levels.map((r) => r.levelId))),
    [campaigns],
  );
  const unassignedLevels = useMemo(
    () => Object.values(levels)
      .filter((level) => !referencedLevelIds.has(level.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id)),
    [levels, referencedLevelIds],
  );
  const unassignedLevelRefs = useMemo<CampaignLevelRef[]>(
    () => unassignedLevels.map((level, index) => ({ levelId: level.id, ordinal: index, objective: level.objective })),
    [unassignedLevels],
  );
  const camp = isUnassignedSelected ? null : campaigns.find((c) => c.id === selectedCampaignId) ?? null;
  const campIsOfficial = camp?.origin === 'official';
  // readOnly is UI-derived, never trusted from a baked tag: an official campaign is
  // read-only ONLY for non-admins. Admins edit officials in place. This drives every
  // mutation control below.
  const readOnly = campIsOfficial && !isAdmin;
  const ownCount = campaigns.filter((c) => c.origin !== 'official').length;
  const orderedLevels = camp ? camp.levels.slice().sort((a, b) => a.ordinal - b.ordinal) : [];
  const levelDoc = selectedLevelId ? levels[selectedLevelId] : null;
  // The SELECTED level's LIVE board, derived the SAME way the list thumbnails and the Level
  // Editor derive theirs (prefers boardCode, falls back to layers) — so what the viewer shows,
  // a row's baked thumbnail, and the editor all agree.
  const viewerBoard = useMemo(() => (levelDoc ? levelToEditorBoard(levelDoc) : null), [levelDoc]);
  const levelRef = !isUnassignedSelected && camp && selectedLevelId ? camp.levels.find((r) => r.levelId === selectedLevelId) : null;
  const selectedLevelIndex = orderedLevels.findIndex((r) => r.levelId === selectedLevelId);
  const selectedUnassignedLevelIndex = unassignedLevels.findIndex((level) => level.id === selectedLevelId);
  const selectedVisibleLevelIndex = isUnassignedSelected ? selectedUnassignedLevelIndex : selectedLevelIndex;
  const enemyCount = levelDoc?.layers.units.filter((unit) => unit.side === 'enemy').length ?? 0;
  const allyCount = levelDoc?.layers.units.filter((unit) => unit.side === 'player').length ?? 0;
  const selectedLevelTitle = levelDoc
    ? selectedVisibleLevelIndex >= 0
      ? `Level ${selectedVisibleLevelIndex + 1}: ${levelDoc.name}`
      : levelDoc.name
    : 'Selected Level';
  const editHrefForUnassigned = (levelId: string): string =>
    `/edit?levelId=${encodeURIComponent(levelId)}&returnTo=${encodeURIComponent(CAMPAIGN_EDITOR_RETURN_TO)}`;
  const editHref = levelDoc
    ? isUnassignedSelected
      ? editHrefForUnassigned(levelDoc.id)
      : camp
        ? `/edit?campaignId=${encodeURIComponent(camp.id)}&levelId=${encodeURIComponent(levelDoc.id)}&returnTo=${encodeURIComponent(CAMPAIGN_EDITOR_RETURN_TO)}`
        : '/edit'
    : '/edit';
  const playHref = levelDoc
    ? isUnassignedSelected
      ? `/play?levelId=${encodeURIComponent(levelDoc.id)}&mode=test&returnTo=${encodeURIComponent(CAMPAIGN_EDITOR_RETURN_TO)}`
      : camp
        ? `/play?campaignId=${encodeURIComponent(camp.id)}&levelId=${encodeURIComponent(levelDoc.id)}&mode=test&returnTo=${encodeURIComponent(CAMPAIGN_EDITOR_RETURN_TO)}`
        : '/play'
    : '/play';
  const editableCampaignsForLevel = useMemo(
    () => (isUnassignedSelected && levelDoc
      ? campaigns.filter((campaign) => !(campaign.origin === 'official' && !isAdmin) && tierOf(levelDoc.id) === tierOf(campaign.id))
      : []),
    [campaigns, isAdmin, isUnassignedSelected, levelDoc],
  );

  useEffect(() => {
    if (!isUnassignedSelected) return;
    if (selectedLevelId && unassignedLevels.some((level) => level.id === selectedLevelId)) return;
    const first = unassignedLevels[0];
    if (first) useCampaigns.getState().selectLevel(first.id);
    else useCampaigns.setState({ selectedLevelId: null });
  }, [isUnassignedSelected, selectedLevelId, unassignedLevels]);

  const selectCampaignCollection = (campaignId: string) => {
    setSelectedCollection('campaign');
    useCampaigns.getState().selectCampaign(campaignId);
  };

  const selectUnassignedCollection = () => {
    setSelectedCollection('unassigned');
    const selectedIsStillUnassigned = selectedLevelId && unassignedLevels.some((level) => level.id === selectedLevelId);
    const nextLevelId = selectedIsStillUnassigned ? selectedLevelId : unassignedLevels[0]?.id;
    if (nextLevelId) useCampaigns.getState().selectLevel(nextLevelId);
    else useCampaigns.setState({ selectedLevelId: null });
  };

  const assignSelectedUnassignedLevel = (campaignId: string) => {
    if (!levelDoc) return;
    const target = campaigns.find((campaign) => campaign.id === campaignId);
    if (!target) return;
    useCampaigns.getState().attachLevelToCampaign(campaignId, levelDoc.id);
    setSelectedCollection('campaign');
    setStatus(`Attached "${levelDoc.name}" to ${target.name}. Save to keep this change.`);
  };

  return (
    <div className="ce-screen app-shell-bar-pad" data-testid="campaign-editor">
      {confirmDialog}
      {/* Same shared backdrop as the main menu: the one continuous HomepageBackdrop (animated
          menu scene + synced rain). Mostly overlapped by the editor panels, but it keeps the
          feel consistent with the rest of the app in the gaps. */}
      <HomepageBackdrop />
      {/* Title bar lives in the app shell; the editor paints its live save-state +
          shortcuts into it via portals (workspace state stays in this component). */}
      <TitleBarSlot region="center">
        <div className="ce-topbar-stats" aria-label="Campaign workspace stats">
          <span className={`ce-save-state ${dirty ? 'is-dirty' : ''}`.trim()}>{dirty ? 'Unsaved' : 'Saved'}</span>
        </div>
      </TitleBarSlot>
      {/* Save · Publish moved OUT of the global title bar into the editor's own locked footer
          (below), beside the other workspace actions — document verbs belong in the editor, not
          global chrome. The bar keeps just brand + save-state + account cluster (matching Settings). */}

      <ArtRouteChrome as="main" className="ce-layout" ready={loaded}>
        <aside className="ce-panel ce-campaigns-panel" aria-label="Campaigns">
          <div className="ce-panel-head">
            <h2>Campaigns</h2>
            <span>{ownCount} / 20</span>
          </div>
          <AssetButton
            data-testid="new-campaign"
            className="ce-new-campaign"
            onClick={() => {
              useCampaigns.getState().newCampaign();
              setSelectedCollection('campaign');
            }}
          >
            + New Campaign
          </AssetButton>
          {/* Workspace commits (Save · Publish) live here in the workspace panel — the same panel
              that hosts New / Import and the "Sign in to save" hint — instead of the global title
              bar. (Interim placement; the footer redesign is the owner's.) Save keeps its exact
              gating: rendered always, disabled until there are unsaved changes. */}
          <div className="ce-workspace-commit">
            <AssetButton data-testid="save-workspace" disabled={!userDirty} onClick={() => void saveUserNow()}>Save</AssetButton>
            {isAdmin && officialDirty ? (
              <AssetButton data-testid="publish-officials" onClick={() => void publishOfficialNow()}>Publish to all players</AssetButton>
            ) : null}
          </div>
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
            <button type="button" data-testid="campaign-sign-in" className="ce-sign-in" onClick={() => goSignIn()}>Sign in to save</button>
          ) : null}
          <div className="ce-campaign-list">
            {campaigns.length === 0 ? <p className="ce-empty">No campaigns yet.</p> : null}
            {campaigns.map((campaign, index) => (
              <CampaignRow
                key={campaign.id}
                campaign={campaign}
                index={index}
                active={!isUnassignedSelected && campaign.id === selectedCampaignId}
                isAdmin={isAdmin}
                onSelect={() => selectCampaignCollection(campaign.id)}
                onFavorite={(event) => {
                  event.stopPropagation();
                  useCampaigns.getState().toggleCampaignFavorite(campaign.id);
                }}
              />
            ))}
            <UnassignedCampaignRow
              count={unassignedLevels.length}
              active={isUnassignedSelected}
              onSelect={selectUnassignedCollection}
            />
          </div>
          <AssetButton className="ce-import-campaign" onClick={() => importInputRef.current?.click()}>
            Import Campaign
          </AssetButton>
        </aside>

        <section className="ce-panel ce-details-panel" aria-label="Campaign details and levels">
          {isUnassignedSelected ? (
            <>
              <div className="ce-section-title">
                <h2>Unassigned Levels</h2>
                <span>{unassignedLevels.length}</span>
              </div>
              <div className="ce-levels-head">
                <h2>Levels</h2>
                <NavButton className="ce-link-button" to={`/edit?returnTo=${encodeURIComponent(CAMPAIGN_EDITOR_RETURN_TO)}`}><span>+ New Board</span></NavButton>
              </div>
              <div className="ce-level-list" data-testid="unassigned-levels">
                {unassignedLevelRefs.length === 0 ? <p className="ce-empty">No unassigned levels.</p> : null}
                {unassignedLevelRefs.map((ref, index) => (
                  <LevelRow
                    key={ref.levelId}
                    levelRef={ref}
                    level={levels[ref.levelId]}
                    index={index}
                    active={ref.levelId === selectedLevelId}
                    readOnly
                    onSelect={() => useCampaigns.getState().selectLevel(ref.levelId)}
                    onMoveUp={(event) => { event.stopPropagation(); }}
                    onMoveDown={(event) => { event.stopPropagation(); }}
                    onDelete={(event) => { event.stopPropagation(); }}
                  />
                ))}
              </div>
            </>
          ) : camp ? (
            <>
              <div className="ce-section-title">
                <h2>Campaign Details</h2>
                {readOnly
                  ? <span className="ce-official-badge">Official campaign — read-only</span>
                  : campIsOfficial
                    ? <span className="ce-official-badge">OFFICIAL</span>
                    : null}
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
            <h2>{selectedLevelTitle}</h2>
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
            {levelDoc && levelView === 'info' ? (
              <LevelInfoCompact level={levelDoc} />
            ) : levelDoc && viewerBoard ? (
              // The SELECTED viewer is a LIVE board (pan/zoom) rendered through the SAME read-only
              // renderer the editor uses, inside the shared ViewPane. Static frame (no animation
              // clock here): a preview shouldn't run a per-frame loop while the editor is open.
              <div className="ce-level-viewer">
                <ViewPane
                  kind="board"
                  ariaLabel={`${levelDoc.name} board`}
                  zoom={viewZoom}
                  pan={viewPan}
                  minZoom={0.2}
                  maxZoom={2}
                  onZoomChange={setViewZoom}
                  onPanChange={setViewPan}
                >
                  <div className="tileset-view-board-content is-board">
                    <StudioReadOnlyBoard board={viewerBoard} boardZoom={viewZoom} boardPan={viewPan} ariaLabel={`${levelDoc.name} board`} />
                  </div>
                </ViewPane>
              </div>
            ) : (
              <div className="level-preview-empty" aria-label="No level preview"><span>Select a level.</span></div>
            )}
          </div>
          {levelDoc && (levelRef || isUnassignedSelected) ? (
            <div className={`ce-preview-actions ${isUnassignedSelected ? 'has-assign' : ''}`.trim()}>
              <NavButton className="ce-link-button" to={editHref}><span>Edit Board</span></NavButton>
              <NavButton className="ce-link-button ce-link-button-ghost" to={playHref}><span>Test Play</span></NavButton>
              {isUnassignedSelected ? (
                <label className="ce-assign-field">
                  <span className="sr-only">Assign to campaign</span>
                  <select
                    value=""
                    disabled={editableCampaignsForLevel.length === 0}
                    title={editableCampaignsForLevel.length === 0 ? 'No editable campaign matches this level tier' : 'Assign selected level to campaign'}
                    onChange={(event) => {
                      const campaignId = event.currentTarget.value;
                      if (campaignId) assignSelectedUnassignedLevel(campaignId);
                    }}
                  >
                    <option value="">{editableCampaignsForLevel.length === 0 ? 'No eligible campaigns' : 'Assign to campaign'}</option>
                    {editableCampaignsForLevel.map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : (
            <p className="ce-empty ce-empty-large">Select a level.</p>
          )}
        </section>
      </ArtRouteChrome>

      <ArtRouteChrome as="footer" className="ce-footer" ready={loaded}>
        <AssetButton
          disabled={!camp || camp.origin === 'official'}
          onClick={() => {
            if (!camp) return;
            useCampaigns.getState().duplicateCampaign(camp.id);
            setSelectedCollection('campaign');
          }}
        >
          Duplicate
        </AssetButton>
        <AssetButton className="ce-footer-secondary" disabled={!campaigns.length} onClick={exportWorkspace}>Export</AssetButton>
        <AssetButton danger disabled={!camp || readOnly} onClick={() => camp && confirmDeleteCampaign(camp)}>Delete Campaign</AssetButton>
      </ArtRouteChrome>
    </div>
  );
}
