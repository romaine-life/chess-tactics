import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactElement } from 'react';
import { useCampaigns } from '../campaign/store';
import { saveUserWorkspace, publishOfficialWorkspace, userWorkspaceForSave, officialWorkspaceForSave, mapSaveError, tierOf } from '../campaign/save';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { validateLevel, type Campaign, type CampaignLevelRef, type Level } from '../core/level';
import { MODE_NAME } from '../core/objectives';
import { isWorkspaceConflict } from '../net/campaignWorkspace';
import { fetchMe, goSignIn, type AuthUser } from '../net/auth';
import { LevelThumbnail } from '../render/LevelThumbnail';
import { LevelPreviewColumn } from './LevelPreviewColumn';
import { injectStressLevels } from '../campaign/stressFixture';
import { levelObjectiveLine } from './LevelInfoCompact';
import { NavButton } from './shared/NavButton';
import { useConfirm } from './shared/ConfirmDialog';
import { TitleBarSlot } from './shell/TitleBarSlot';
import { TitleBarActions, TitleBarButton } from './shell/TitleBarControls';
import { HomepageBackdrop } from './HomepageBackdrop';
import { ArtRouteChrome } from './shell/ArtRouteChrome';
import { KitScroll } from './KitScroll';
import { SettingsButton, SettingsRow, SettingsSection } from './shared/SettingsControls';
import { editSkirmishProfileHref, isSkirmishProfileLevel, skirmishProfileLevels } from './skirmishProfiles';
import { listEditorDocuments, type EditorDocumentSummary } from '../net/editorDocuments';
import {
  editorDocumentContinueHref,
  editorDocumentDisplayName,
  resumableUserEditorDocuments,
} from './campaignEditorRecentDrafts';

const CE_ICONS = {
  favorite: '/assets/ui/kit/icons/brand-shield.png',
  'chevron-up': '/assets/ui/kit/icons/chevron-up.png',
  'chevron-down': '/assets/ui/kit/icons/chevron-down.png',
  delete: '/assets/ui/kit/icons/delete.png',
  lock: '/assets/ui/kit/icons/lock.png',
  pencil: '/assets/ui/kit/icons/pencil.png',
} as const;

// The carved rail-tab icon, shared with the play-side Campaign section (PlayMenu.tsx) so a
// campaign looks identical whether you're picking one to play or one to edit.
const CAMPAIGN_TAB_ICON = '/assets/ui/main-menu/icons-carved/campaign-editor.png';

type CampaignCollection = 'campaign' | 'unassigned' | 'skirmish-profiles';

// The Editor is now a settings-twin at /editor (the nested board editor is /editor/level);
// returns thread back here so Back/Save round-trips land on the Editor, not the old route.
const CAMPAIGN_EDITOR_RETURN_TO = '/editor';

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

function recentDraftDescription(document: EditorDocumentSummary): string {
  const state = document.never_saved ? 'Not saved yet' : 'Unsaved changes';
  if (!document.updated_at) return state;
  const updatedAt = new Date(document.updated_at);
  if (Number.isNaN(updatedAt.getTime())) return state;
  return `${state} · Edited ${updatedAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
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

function IconButton({
  children,
  danger = false,
  selected = false,
  className = '',
  onKeyDown,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean; selected?: boolean }): ReactElement {
  return (
    <button
      type="button"
      className={`ce-icon-button ${danger ? 'is-danger' : ''} ${selected ? 'is-selected' : ''} ${className}`.trim()}
      {...props}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        event.stopPropagation();
      }}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}

function IconNavButton({
  children,
  selected = false,
  className = '',
  onClick,
  onKeyDown,
  ...props
}: ComponentProps<typeof NavButton> & { selected?: boolean }): ReactElement {
  return (
    <NavButton
      {...props}
      className={`ce-icon-button ${selected ? 'is-selected' : ''} ${className}`.trim()}
      onClick={(event) => {
        onClick?.(event);
        event.stopPropagation();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        event.stopPropagation();
      }}
    >
      <span aria-hidden="true">{children}</span>
    </NavButton>
  );
}

// A campaign as a settings-style rail tab — the same carved chrome the main menu's mode
// tabs and the play-side Campaign screen use (ADR-0059), extended to a icon | name | trail
// grid so the favorite control / padlock sits at the tab's end. Kept as a
// role=button div (not a <button>) because the favorite is a nested interactive control:
// selection + keyboard activation mirror the original row exactly.
function CampaignRailTab({
  campaign,
  active,
  index,
  isAdmin,
  onSelect,
  onFavorite,
}: {
  campaign: Campaign;
  active: boolean;
  index: number;
  isAdmin: boolean;
  onSelect: () => void;
  onFavorite: (event: React.MouseEvent<HTMLButtonElement>) => void;
}): ReactElement {
  const isOfficial = campaign.origin === 'official';
  // Lock (and the padlock) is UI-derived: officials lock only for non-admins. An admin
  // sees officials selectable + editable; the rail group title carries the official tier.
  const locked = isOfficial && !isAdmin;
  const selectCampaign = () => {
    if (!locked) onSelect();
  };
  return (
    <div
      role="button"
      tabIndex={locked ? -1 : 0}
      aria-current={active ? 'page' : undefined}
      aria-disabled={locked || undefined}
      // --tab-index drives the shared stone-continuity slice so the rail's stone reads as
      // one sheet however many campaigns there are (counted continuously past the Unassigned
      // tab), matching the menu / Settings / Campaign rails.
      style={{ ['--tab-index' as string]: index }}
      className={`settings-tab main-menu-mode-tab ce-campaign-tab ${active ? 'is-active' : ''} ${locked ? 'is-locked' : ''}`.trim()}
      onClick={selectCampaign}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectCampaign();
        }
      }}
    >
      <span className="settings-tab-icon" aria-hidden="true">
        <img src={CAMPAIGN_TAB_ICON} alt="" />
      </span>
      <span className="ce-campaign-tab-copy">
        <strong>{campaign.name}</strong>
        <small>{campaign.levels.length} levels</small>
      </span>
      {locked ? (
        <span className="ce-tab-trail ce-row-lock" aria-label={`${campaign.name} locked`} role="img">
          <CeIcon icon="lock" />
        </span>
      ) : !isOfficial ? (
        <button
          type="button"
          className={`ce-tab-trail ce-row-favorite ${campaign.favorite ? 'is-selected' : ''}`.trim()}
          aria-label={campaign.favorite ? `Unfavorite ${campaign.name}` : `Favorite ${campaign.name}`}
          onClick={onFavorite}
        >
          <CeIcon icon="favorite" />
        </button>
      ) : null}
    </div>
  );
}

// The workspace's unassigned levels, presented as one more rail tab at the end of the list.
function UnassignedRailTab({
  count,
  active,
  index,
  onSelect,
  title = 'Unassigned levels',
  itemName = 'level',
}: {
  count: number;
  active: boolean;
  index: number;
  onSelect: () => void;
  title?: string;
  itemName?: string;
}): ReactElement {
  const levelCount = `${count} ${itemName}${count === 1 ? '' : 's'}`;
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? 'page' : undefined}
      style={{ ['--tab-index' as string]: index }}
      className={`settings-tab main-menu-mode-tab ce-campaign-tab ce-campaign-tab-meta ${active ? 'is-active' : ''}`.trim()}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="settings-tab-icon" aria-hidden="true">
        <img src={CAMPAIGN_TAB_ICON} alt="" />
      </span>
      <span className="ce-campaign-tab-copy">
        <strong>{title}</strong>
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
  editHref,
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
  editHref?: string;
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
      aria-current={active ? 'true' : undefined}
      className={`settings-row ce-editor-level-row ${active ? 'is-selected' : ''} ${readOnly ? 'is-read-only' : ''}`.trim()}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="settings-row-thumb" aria-hidden="true">
        {level ? <LevelThumbnail level={level} width={68} height={44} /> : <span className="settings-row-thumb-empty" />}
      </span>
      <div className="settings-row-copy ce-editor-level-copy">
        <div className="ce-editor-level-heading">
          <h4>{index + 1}. {level?.name ?? levelRef.levelId}</h4>
        </div>
        <p>{goalLine}</p>
      </div>
      {readOnly ? null : (
        <div className="settings-row-control ce-row-actions" aria-label="Level actions">
          {editHref ? (
            <IconNavButton to={editHref} aria-label={`Edit ${level?.name ?? levelRef.levelId}`}>
              <CeIcon icon="pencil" />
            </IconNavButton>
          ) : null}
          <IconButton onClick={onMoveUp} aria-label="Move level up"><CeIcon icon="chevron-up" /></IconButton>
          <IconButton onClick={onMoveDown} aria-label="Move level down"><CeIcon icon="chevron-down" /></IconButton>
          <IconButton danger onClick={onDelete} aria-label="Delete level"><CeIcon icon="delete" /></IconButton>
        </div>
      )}
    </div>
  );
}

export function CampaignEditor({ embedded = false }: { embedded?: boolean } = {}) {
  const campaigns = useCampaigns((s) => s.campaigns);
  const levels = useCampaigns((s) => s.levels);
  const selectedCampaignId = useCampaigns((s) => s.selectedCampaignId);
  const selectedLevelId = useCampaigns((s) => s.selectedLevelId);
  const [status, setStatus] = useState('');
  const [me, setMe] = useState<AuthUser | null>(null);
  const [recentDrafts, setRecentDrafts] = useState<EditorDocumentSummary[]>([]);
  // A stale whole-workspace body must never be paired with the newer revision from a 409 and
  // retried. Keep the local work visible, stop that tier's writes, and require a deliberate reload.
  const [userSaveConflict, setUserSaveConflict] = useState(false);
  const [officialSaveConflict, setOfficialSaveConflict] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<CampaignCollection>('campaign');
  const { ask, dialog: confirmDialog } = useConfirm();
  // Entrance readiness (ADR-0051): the shared store may already hold campaigns from a
  // /play/select visit this session — then there's real content at mount and
  // nothing holds; otherwise hold the fade until the officials merge settles.
  const [loaded, setLoaded] = useState(() => useCampaigns.getState().campaigns.length > 0);
  const [userWorkspaceHydration, setUserWorkspaceHydration] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [officialWorkspaceHydration, setOfficialWorkspaceHydration] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const userWorkspaceReady = userWorkspaceHydration === 'ready';
  const officialWorkspaceReady = officialWorkspaceHydration === 'ready';
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
    // The Editor is a settings-twin now (like the play-side Campaign screen), so it takes
    // the same shell host class — full-bleed menu layout over the shared scene backdrop.
    if (embedded) return; // the persistent menu shell (MainMenu) owns .main-menu-active + the backdrop
    const shell = document.querySelector('.shell');
    shell?.classList.add('main-menu-active');
    return () => shell?.classList.remove('main-menu-active');
  }, [embedded]);

  useEffect(() => {
    let active = true;
    void fetchMe().then(async (user) => {
      if (!active) return;
      setMe(user);
      if (!user.signed_in) {
        setRecentDrafts([]);
        setStatus('Official campaigns shown. Sign in to author your own.');
        return;
      }
      try {
        const result = await listEditorDocuments({ status: 'all', limit: 100 });
        if (active) setRecentDrafts(resumableUserEditorDocuments(result.documents));
      } catch {
        // Discovery is optional UI. Workspace authoring remains available when the private list
        // endpoint is temporarily unavailable, and no fallback may invent or expose documents.
      }
    }).catch(() => {});
    void (async () => {
      let userReady = false;
      let officialReady = false;
      try {
        // One shared hydration spine loads officials first and the signed-in user's workspace
        // second. Joining it keeps a quick New Level navigation from observing the half-merged
        // official-only store and saving over a still-loading private workspace.
        const hydration = await ensureCampaignsHydrated();
        userReady = hydration.userWorkspace !== 'unavailable';
        officialReady = hydration.officialAvailable;
        if (active && !userReady) {
          setStatus('Your workspace could not be loaded. Reopen the Editor to retry before saving.');
        }
        if (active && !officialReady) {
          setStatus('Official campaigns could not be loaded. Private editing is still available.');
        }
      } catch {
        if (active) setStatus('Campaigns could not be loaded. Try again in a moment.');
      } finally {
        // The entrance holds on this flag (ADR-0051): without it the chrome fades in
        // over a false "No campaigns yet." and the list pops in when the fetch lands.
        // Flip it once the shared official + user hydration attempt has settled.
        if (active) setLoaded(true);
      }
      if (!active) return;
      setUserWorkspaceHydration(userReady ? 'ready' : 'unavailable');
      setOfficialWorkspaceHydration(officialReady ? 'ready' : 'unavailable');
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

  // Private "Save": frictionless, writes only the user slice (officials never enter it).
  const saveUserNow = async () => {
    if (userSaveConflict) {
      setStatus('Save remains paused after a workspace conflict. Reload the Editor before saving again.');
      return;
    }
    if (!userWorkspaceReady) {
      setStatus('Your workspace is unavailable. Reopen the Editor to retry before saving.');
      return;
    }
    try {
      await saveUserWorkspace();
      setSavedUserSig(userSliceSignature());
      setStatus('Saved to server');
    } catch (e) {
      if (isWorkspaceConflict(e)) {
        setUserSaveConflict(true);
        setStatus(e.code === 'workspace_level_reserved'
          ? 'Save stopped: a new board already reserves one of these level IDs. Reload the Editor; your local changes remain in this tab.'
          : 'Save stopped: this workspace changed elsewhere. Reload the Editor before saving; your local changes remain in this tab.');
        return;
      }
      const mapped = mapSaveError(e);
      if ('action' in mapped) { goSignIn(); return; }
      setStatus(mapped.message);
    }
  };

  // "Publish to all players": a distinct, confirmed, admin-gated write of ONLY the
  // official slice. The server's requireAdmin is the real gate (403 surfaces here).
  const publishOfficialNow = async () => {
    if (officialSaveConflict) {
      setStatus('Publish remains paused after an official workspace conflict. Reload the Editor before publishing again.');
      return;
    }
    if (!officialWorkspaceReady) {
      setStatus('Official campaigns are unavailable. Reopen the Editor to retry before publishing.');
      return;
    }
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
      if (isWorkspaceConflict(e)) {
        setOfficialSaveConflict(true);
        setStatus('Publish stopped: official campaigns changed elsewhere. Reload the Editor before publishing; your local changes remain in this tab.');
        return;
      }
      const mapped = mapSaveError(e);
      if ('action' in mapped) { goSignIn(); return; }
      setStatus(mapped.message);
    }
  };

  const importCampaignFile = async (file: File | undefined) => {
    if (!file) return;
    if (!userWorkspaceReady) {
      setStatus('Your workspace is unavailable. Reopen the Editor to retry before importing.');
      return;
    }
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
  const isSkirmishProfilesSelected = selectedCollection === 'skirmish-profiles';
  const isMetaCollectionSelected = isUnassignedSelected || isSkirmishProfilesSelected;
  // Unassigned levels: store level docs referenced by NO campaign — typically a board authored
  // cold in the Level Editor (createUnassignedLevel) before it is filed into a campaign. They
  // live in the workspace and round-trip through campaign_workspaces just like any other level.
  const referencedLevelIds = useMemo(
    () => new Set(campaigns.flatMap((c) => c.levels.map((r) => r.levelId))),
    [campaigns],
  );
  const unassignedLevels = useMemo(
    () => Object.values(levels)
      .filter((level) => !referencedLevelIds.has(level.id) && !isSkirmishProfileLevel(level))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id)),
    [levels, referencedLevelIds],
  );
  const profileLevels = useMemo(() => skirmishProfileLevels(levels), [levels]);
  const unassignedLevelRefs = useMemo<CampaignLevelRef[]>(
    () => unassignedLevels.map((level, index) => ({ levelId: level.id, ordinal: index, objective: level.objective })),
    [unassignedLevels],
  );
  const profileLevelRefs = useMemo<CampaignLevelRef[]>(
    () => profileLevels.map((level, index) => ({ levelId: level.id, ordinal: index, objective: level.objective })),
    [profileLevels],
  );
  const camp = isMetaCollectionSelected ? null : campaigns.find((c) => c.id === selectedCampaignId) ?? null;
  const campIsOfficial = camp?.origin === 'official';
  // readOnly is UI-derived, never trusted from a baked tag: an official campaign is
  // read-only for non-admins. A tier whose remote source is unavailable is also locked:
  // retrying hydration later must never merge over interim edits made against partial data.
  const selectedTierReady = campIsOfficial ? officialWorkspaceReady : userWorkspaceReady;
  const readOnly = !selectedTierReady || (campIsOfficial && !isAdmin);
  const officialCampaigns = campaigns.filter((c) => c.origin === 'official');
  const userCampaigns = campaigns.filter((c) => c.origin !== 'official');
  const ownCount = userCampaigns.length;
  const orderedLevels = camp ? camp.levels.slice().sort((a, b) => a.ordinal - b.ordinal) : [];
  const levelDoc = selectedLevelId ? levels[selectedLevelId] : null;
  const levelRef = !isMetaCollectionSelected && camp && selectedLevelId ? camp.levels.find((r) => r.levelId === selectedLevelId) : null;
  const selectedLevelIndex = orderedLevels.findIndex((r) => r.levelId === selectedLevelId);
  const selectedUnassignedLevelIndex = unassignedLevels.findIndex((level) => level.id === selectedLevelId);
  const selectedProfileLevelIndex = profileLevels.findIndex((level) => level.id === selectedLevelId);
  const selectedVisibleLevelIndex = isUnassignedSelected
    ? selectedUnassignedLevelIndex
    : isSkirmishProfilesSelected
      ? selectedProfileLevelIndex
      : selectedLevelIndex;
  const enemyCount = levelDoc?.layers.units.filter((unit) => unit.side === 'enemy').length ?? 0;
  const allyCount = levelDoc?.layers.units.filter((unit) => unit.side === 'player').length ?? 0;
  const selectedLevelTitle = levelDoc
    ? selectedVisibleLevelIndex >= 0
      ? `${isSkirmishProfilesSelected ? 'Profile' : 'Level'} ${selectedVisibleLevelIndex + 1}: ${levelDoc.name}`
      : levelDoc.name
    : 'Selected Level';
  const editHrefForCampaignLevel = (campaignId: string, levelId: string): string =>
    `/editor/level?campaignId=${encodeURIComponent(campaignId)}&levelId=${encodeURIComponent(levelId)}&returnTo=${encodeURIComponent(CAMPAIGN_EDITOR_RETURN_TO)}`;
  const editHrefForUnassigned = (levelId: string): string =>
    `/editor/level?levelId=${encodeURIComponent(levelId)}&returnTo=${encodeURIComponent(CAMPAIGN_EDITOR_RETURN_TO)}`;
  const editHref = levelDoc
    ? isSkirmishProfilesSelected
      ? editSkirmishProfileHref(levelDoc.id, CAMPAIGN_EDITOR_RETURN_TO)
      : isUnassignedSelected
      ? editHrefForUnassigned(levelDoc.id)
      : camp
        ? editHrefForCampaignLevel(camp.id, levelDoc.id)
        : '/editor/level'
    : '/editor/level';
  const playHref = levelDoc
    ? isMetaCollectionSelected
      ? `/play?levelId=${encodeURIComponent(levelDoc.id)}&mode=test&returnTo=${encodeURIComponent(CAMPAIGN_EDITOR_RETURN_TO)}`
      : camp
        ? `/play?campaignId=${encodeURIComponent(camp.id)}&levelId=${encodeURIComponent(levelDoc.id)}&mode=test&returnTo=${encodeURIComponent(CAMPAIGN_EDITOR_RETURN_TO)}`
        : '/play'
    : '/play';
  const editableCampaignsForLevel = useMemo(
    () => (isUnassignedSelected && !isSkirmishProfilesSelected && levelDoc
      ? campaigns.filter((campaign) => (
        (campaign.origin === 'official' ? officialWorkspaceReady && isAdmin : userWorkspaceReady)
        && tierOf(levelDoc.id) === tierOf(campaign.id)
      ))
      : []),
    [campaigns, isAdmin, isSkirmishProfilesSelected, isUnassignedSelected, levelDoc, officialWorkspaceReady, userWorkspaceReady],
  );

  useEffect(() => {
    if (!isUnassignedSelected) return;
    if (selectedLevelId && unassignedLevels.some((level) => level.id === selectedLevelId)) return;
    const first = unassignedLevels[0];
    if (first) useCampaigns.getState().selectLevel(first.id);
    else useCampaigns.setState({ selectedLevelId: null });
  }, [isUnassignedSelected, selectedLevelId, unassignedLevels]);

  useEffect(() => {
    if (!isSkirmishProfilesSelected) return;
    if (selectedLevelId && profileLevels.some((level) => level.id === selectedLevelId)) return;
    const first = profileLevels[0];
    if (first) useCampaigns.getState().selectLevel(first.id);
    else useCampaigns.setState({ selectedLevelId: null });
  }, [isSkirmishProfilesSelected, profileLevels, selectedLevelId]);

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

  const selectSkirmishProfilesCollection = () => {
    if (!userWorkspaceReady) {
      setStatus('Your workspace is unavailable. Reopen the Editor to retry.');
      return;
    }
    setSelectedCollection('skirmish-profiles');
    const selectedIsStillProfile = selectedLevelId && profileLevels.some((level) => level.id === selectedLevelId);
    const nextLevelId = selectedIsStillProfile ? selectedLevelId : profileLevels[0]?.id;
    if (nextLevelId) useCampaigns.getState().selectLevel(nextLevelId);
    else useCampaigns.setState({ selectedLevelId: null });
  };

  const assignSelectedUnassignedLevel = (campaignId: string) => {
    if (!levelDoc) return;
    const target = campaigns.find((campaign) => campaign.id === campaignId);
    if (!target) return;
    if (target.origin === 'official' ? !officialWorkspaceReady || !isAdmin : !userWorkspaceReady) return;
    useCampaigns.getState().attachLevelToCampaign(campaignId, levelDoc.id);
    setSelectedCollection('campaign');
    setStatus(`Attached "${levelDoc.name}" to ${target.name}. Save to keep this change.`);
  };

  // Live workspace save-state — portaled to the title bar's center slot (renders nowhere inline).
  const centerSlot = (
    <TitleBarSlot region="center">
      <div className="ce-topbar-stats" aria-label="Workspace state">
        <span className={`ce-save-state ${dirty ? 'is-dirty' : ''}`.trim()}>{dirty ? 'Unsaved' : 'Saved'}</span>
      </div>
    </TitleBarSlot>
  );
  // The two editor columns — the campaigns rail (a tab column) + the selected campaign's editor panel
  // (an action column). Shared by the standalone route AND the embedded-in-shell render.
  const inner = (
    <>
      {/* ── RAIL: the campaigns navigator (fold 1 of the old 3-panel layout) ── */}
      <aside className={embedded ? 'menu-dest-col menu-dest-tabs ce-editor-rail' : 'settings-frame settings-rail-frame ce-editor-rail'} aria-label="Campaigns">
            <KitScroll className="ce-rail-scroll">
              <div className="ce-rail-list">
                {campaigns.length === 0 ? <p className="ce-empty">No campaigns yet.</p> : null}
                {officialCampaigns.length > 0 ? (
                  <>
                    <p className="campaign-rail-group">Official campaigns</p>
                    {officialCampaigns.map((campaign, index) => (
                      <CampaignRailTab
                        key={campaign.id}
                        campaign={campaign}
                        index={index}
                        active={!isMetaCollectionSelected && campaign.id === selectedCampaignId}
                        isAdmin={isAdmin}
                        onSelect={() => selectCampaignCollection(campaign.id)}
                        onFavorite={(event) => {
                          event.stopPropagation();
                          if (!officialWorkspaceReady || !isAdmin) return;
                          useCampaigns.getState().toggleCampaignFavorite(campaign.id);
                        }}
                      />
                    ))}
                  </>
                ) : null}
                {userCampaigns.length > 0 ? (
                  <>
                    <p className="campaign-rail-group">
                      <span>Your campaigns</span>
                      <span className="ce-rail-count">{ownCount} / 20</span>
                    </p>
                    {userCampaigns.map((campaign, index) => (
                      <CampaignRailTab
                        key={campaign.id}
                        campaign={campaign}
                        index={officialCampaigns.length + index}
                        active={!isMetaCollectionSelected && campaign.id === selectedCampaignId}
                        isAdmin={isAdmin}
                        onSelect={() => selectCampaignCollection(campaign.id)}
                        onFavorite={(event) => {
                          event.stopPropagation();
                          if (!userWorkspaceReady) return;
                          useCampaigns.getState().toggleCampaignFavorite(campaign.id);
                        }}
                      />
                    ))}
                  </>
                ) : null}
                <p className="campaign-rail-group">Workspace</p>
                {/* Continue the stone slice past the campaign tabs so the rail stays one sheet. */}
                <UnassignedRailTab
                  title="Skirmish profiles"
                  itemName="profile"
                  count={profileLevels.length}
                  index={campaigns.length}
                  active={isSkirmishProfilesSelected}
                  onSelect={selectSkirmishProfilesCollection}
                />
                <UnassignedRailTab
                  count={unassignedLevels.length}
                  index={campaigns.length + 1}
                  active={isUnassignedSelected}
                  onSelect={selectUnassignedCollection}
                />
              </div>
            </KitScroll>
            {/* Pinned rail footer — creation first, then workspace verbs (whole-workspace /
                collection scope): New Level · New Campaign · Import · Save · Publish · Sign-in ·
                status. Starting a standalone level never requires a hydrated user workspace. */}
            <div className="ce-rail-actions">
              <SettingsButton
                data-testid="new-level-shortcut"
                href={`/editor/level?returnTo=${encodeURIComponent(CAMPAIGN_EDITOR_RETURN_TO)}`}
              >+ New Level</SettingsButton>
              <SettingsButton
                data-testid="new-campaign"
                disabled={!userWorkspaceReady}
                onClick={() => {
                  if (!userWorkspaceReady) return;
                  useCampaigns.getState().newCampaign();
                  setSelectedCollection('campaign');
                }}
              >+ New Campaign</SettingsButton>
              <SettingsButton disabled={!userWorkspaceReady} onClick={() => importInputRef.current?.click()}>Import</SettingsButton>
              <SettingsButton
                tone="primary"
                data-testid="save-workspace"
                disabled={!userWorkspaceReady || !userDirty || userSaveConflict}
                title={userSaveConflict
                  ? 'Reload the Editor to resolve the workspace revision conflict.'
                  : !userWorkspaceReady
                  ? 'Your workspace must finish loading before it can be saved.'
                  : undefined}
                onClick={() => void saveUserNow()}
              >Save</SettingsButton>
              {isAdmin && officialDirty ? (
                <SettingsButton
                  tone="primary"
                  data-testid="publish-officials"
                  disabled={!officialWorkspaceReady || officialSaveConflict}
                  title={officialSaveConflict
                    ? 'Reload the Editor to resolve the official workspace revision conflict.'
                    : !officialWorkspaceReady
                    ? 'Official campaigns must finish loading before publishing.'
                    : undefined}
                  onClick={() => void publishOfficialNow()}
                >Publish to all players</SettingsButton>
              ) : null}
              {me && !me.signed_in ? (
                <SettingsButton data-testid="campaign-sign-in" onClick={() => goSignIn()}>Sign in to save</SettingsButton>
              ) : null}
              {status ? <p className="ce-status" data-testid="workspace-status">{status}</p> : null}
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
            </div>
          </aside>

          {/* ── CONTENT: the selected campaign — a single scrolling stack of SettingsSection
              groups (Campaign · Levels · Actions), now the full column height. The live level
              preview used to pin above this scroll; it's its own column now (see below). ── */}
          <main className={embedded ? 'menu-dest-col menu-dest-action ce-editor-main' : 'settings-frame settings-main-frame ce-editor-main'}>
            <h2 className="sr-only">{isSkirmishProfilesSelected ? 'Skirmish Profiles' : isUnassignedSelected ? 'Unassigned Levels' : camp?.name ?? 'Editor'}</h2>
            <div className="ce-editor-body">
              <KitScroll className="settings-scroll ce-editor-scroll">
                <div className="settings-panel-content">
                  {recentDrafts.length > 0 ? (
                    <SettingsSection title="Continue editing">
                      <div className="ce-recent-drafts" data-testid="recent-editor-documents">
                        {recentDrafts.map((document) => (
                          <SettingsRow
                            key={document.document_id}
                            title={editorDocumentDisplayName(document)}
                            description={recentDraftDescription(document)}
                          >
                            <SettingsButton href={editorDocumentContinueHref(document)}>Continue</SettingsButton>
                          </SettingsRow>
                        ))}
                      </div>
                    </SettingsSection>
                  ) : null}
                  {isSkirmishProfilesSelected ? (
                    <SettingsSection title="Skirmish Profiles">
                      <div className="ce-level-list" data-testid="skirmish-profiles">
                        {profileLevelRefs.length === 0 ? <p className="ce-empty">No authored skirmish profiles.</p> : null}
                        {profileLevelRefs.map((ref, index) => (
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
                    </SettingsSection>
                  ) : isUnassignedSelected ? (
                    <SettingsSection title="Unassigned Levels">
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
                    </SettingsSection>
                  ) : camp ? (
                    <>
                      <SettingsSection title="Campaign">
                        {campIsOfficial ? (
                          <SettingsRow
                            title="Official campaign"
                            description={readOnly ? 'Read-only — published content. Sign in as an admin to edit.' : 'Editing the official, published campaign.'}
                            value={<span className="ce-official-badge">OFFICIAL</span>}
                          />
                        ) : null}
                        <SettingsRow title="Name" description="Shown to players in the campaign list.">
                          <input
                            className="ce-name-input"
                            data-testid="campaign-name"
                            value={camp.name}
                            disabled={readOnly}
                            aria-label="Campaign name"
                            onChange={(e) => useCampaigns.getState().renameCampaign(camp.id, e.target.value)}
                          />
                        </SettingsRow>
                        <SettingsRow title="Chapters" value={<span>{camp.chapters}</span>} />
                        <SettingsRow title="Levels" value={<span>{camp.levels.length}</span>} />
                        <SettingsRow title="Difficulty" value={<span>{camp.difficulty}</span>} />
                      </SettingsSection>

                      <SettingsSection title="Levels">
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
                              editHref={levels[ref.levelId] ? editHrefForCampaignLevel(camp.id, ref.levelId) : undefined}
                              onMoveUp={(event) => { event.stopPropagation(); useCampaigns.getState().moveLevel(ref.levelId, -1); }}
                              onMoveDown={(event) => { event.stopPropagation(); useCampaigns.getState().moveLevel(ref.levelId, 1); }}
                              onDelete={(event) => { event.stopPropagation(); if (levels[ref.levelId]) confirmDeleteLevel(levels[ref.levelId]); }}
                            />
                          ))}
                        </div>
                        {readOnly ? null : (
                          <div className="ce-section-action">
                            <SettingsButton data-testid="add-level" onClick={() => useCampaigns.getState().addLevel()}>+ Add Level</SettingsButton>
                          </div>
                        )}
                      </SettingsSection>

                      <SettingsSection title="Campaign Actions">
                        <SettingsRow title="Duplicate" description="Copy this campaign and its levels into a new private campaign.">
                          <SettingsButton
                            disabled={camp.origin === 'official' || readOnly}
                            onClick={() => {
                              useCampaigns.getState().duplicateCampaign(camp.id);
                              setSelectedCollection('campaign');
                            }}
                          >Duplicate</SettingsButton>
                        </SettingsRow>
                        <SettingsRow title="Export" description="Download the workspace (your campaigns + levels) as JSON.">
                          <SettingsButton disabled={!userWorkspaceReady || !campaigns.length} onClick={exportWorkspace}>Export</SettingsButton>
                        </SettingsRow>
                        <SettingsRow title="Delete campaign" description="Remove this campaign from the workspace on the next save.">
                          <SettingsButton tone="danger" disabled={readOnly} onClick={() => confirmDeleteCampaign(camp)}>Delete</SettingsButton>
                        </SettingsRow>
                      </SettingsSection>
                    </>
                  ) : (
                    <SettingsSection title="Editor">
                      <SettingsRow title="No campaign selected" description="Select a campaign in the rail, or create one with + New Campaign." />
                    </SettingsSection>
                  )}
                </div>
              </KitScroll>
            </div>
          </main>

          {/* ── PREVIEW COLUMN (col 4, top-right) — the shared LevelPreviewColumn (same one the
              play-side Campaign screen uses). Lifted OUT of the main scroll into its OWN column;
              renders ONLY when a level is selected, so nothing shows until you click a level. The
              editor's verbs (Edit Board / Test Play, plus the unassigned Assign picker) ride in as
              its actions slot. ── */}
          {levelDoc ? (
            <LevelPreviewColumn
              level={levelDoc}
              title={selectedLevelTitle}
              embedded={embedded}
              actions={(levelRef || isMetaCollectionSelected) ? (
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
              ) : null}
            />
          ) : null}
    </>
  );

  // Embedded in the persistent menu shell (MainMenu's second column): render just the two columns
  // plus the (portal/modal) confirm dialog + save-state slot; the shell owns the backdrop + wrapper.
  if (embedded) return <>{confirmDialog}{centerSlot}{inner}</>;

  return (
    // A settings-twin of the main menu / play-side Campaign screen: the reveal classes are declared
    // up front (the cold-reveal director's opt-OUT gates otherwise hide any .main-menu-layer, #238).
    <div
      className="menu-layer main-menu-layer is-ready ce-editor-layer"
      data-testid="campaign-editor"
      data-reveal-bg=""
      data-reveal-buttons=""
    >
      {confirmDialog}
      {/* One continuous HomepageBackdrop (scene + synced rain), shared across the menu family. */}
      <HomepageBackdrop />
      {/* ‹ Back to the menu — trailing actions slot (the brand lockup remains the leading anchor). */}
      <TitleBarSlot region="actions">
        <TitleBarActions aria-label="Editor navigation">
          <TitleBarButton variant="return" data-testid="editor-back" to="/" title="Back to the menu">‹ Back</TitleBarButton>
        </TitleBarActions>
      </TitleBarSlot>
      {centerSlot}
      <div className="settings-screen main-menu-twin-screen ce-editor-screen app-shell-bar-pad">
        <ArtRouteChrome className="settings-shell ce-editor-shell" ready={loaded}>
          {inner}
        </ArtRouteChrome>
      </div>
    </div>
  );
}
