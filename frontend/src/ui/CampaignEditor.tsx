import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { drawableAssets } from '@chess-tactics/board-render';
import { useCampaigns } from '../campaign/store';
import { useWars } from '../war/store';
import { saveUserWorkspace, publishOfficialWorkspace, userWorkspaceForSave, officialWorkspaceForSave, mapSaveError, tierOf } from '../campaign/save';
import { ensureCampaignsHydrated } from '../campaign/hydrate';
import { migrateLevelDocument, validateLevel, type Campaign, type Level } from '../core/level';
import { isWorkspaceConflict } from '../net/campaignWorkspace';
import { goSignIn } from '../net/auth';
import { reportAuthSessionFailure, useAuthSession } from '../net/authSession';
import { LevelPreviewColumn } from './LevelPreviewColumn';
import { injectStressLevels } from '../campaign/stressFixture';
import { useConfirm } from './shared/ConfirmDialog';
import { useDeleteKeyAction } from './shared/deleteKeyAction';
import { TitleBarSlot } from './shell/TitleBarSlot';
import { TitleBarControlContribution } from './shell/TitleBarControls';
import { HomepageBackdrop } from './HomepageBackdrop';
import { ArtRouteChrome } from './shell/ArtRouteChrome';
import { useSceneParticipant } from './shell/SceneBoundary';
import { ThumbnailSurface } from './shell/ThumbnailSurface';
import { KitScroll } from './KitScroll';
import { SettingsButton, SettingsSection } from './shared/SettingsControls';
// Content-column rows and controls come from the Editor column's chrome policy (marble boxes,
// oak triggers); the rail's own footer verbs stay on the plain settings button.
import {
  EDITOR_COLUMN_CONTROL_FILL_SURFACE,
  EditorButton,
  EditorRow,
} from './shared/EditorColumnControls';
import { ApparatusRailColumn } from './shared/ApparatusRailTab';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { LEVEL_NAME_MAX, normalizeLevelName } from './shared/levelNamePolicy';
import {
  autosaveEditorDocument,
  closeEditorDocumentEditSession,
  deleteNeverSavedEditorDocument,
  discardEditorDocumentChanges,
  editorDocumentEditFence,
  isEditorDocumentConflict,
  isEditorDocumentEditSessionError,
  listEditorDocuments,
  loadEditorDocument,
  openEditorDocumentEditSession,
  type EditorDocument,
  type EditorDocumentSummary,
} from '../net/editorDocuments';
import {
  CAMPAIGN_EDITOR_UNASSIGNED_RETURN_TO,
  editorDocumentContinueHref,
  editorDocumentDisplayName,
  resumableUserEditorDocuments,
} from './campaignEditorRecentDrafts';
import { clearScopedLevelEditorDraft, newLevelEditorClientIdentity, rebaseScopedLevelEditorDraft } from './levelEditorDraft';
import { levelEditorLevelSignature } from './levelEditorSignature';
import { levelEditorClientLabel } from './levelEditorSessionPresentation';
import { EditorCollectionRailTab } from './shared/EditorCollectionRailTab';
import { EditorLevelRow, EditorRowIcon } from './shared/EditorLevelRow';
import {
  campaignCollectionHref,
  editorCampaignHref,
  editorCampaignIdFromSearch,
  editorCollectionFromLocation,
  type CampaignCollection,
} from './campaignEditorRoute';
import { WarEditor } from './WarEditor';
import { navigateApp } from './navigation';
import { ChromeButton, ChromeNavButton, IconButton } from './shared/ChromeButton';
import { EditorContentSceneSlot } from './shell/AuthoredSceneSlot';

// The address grammar lives in its own route module (the shell registry reads it too, and must
// not pull this screen into the shell bundle). Re-exported here so the Editor stays the one
// import for its own vocabulary.
export {
  campaignCollectionFromSearch,
  campaignCollectionHref,
  editorCampaignHref,
  editorCampaignIdFromSearch,
  editorCollectionFromLocation,
  type CampaignCollection,
} from './campaignEditorRoute';

// The carved rail-tab icon, shared with the play-side Campaign section (PlayMenu.tsx) so a
// campaign looks identical whether you're picking one to play or one to edit.
const campaignMenuModes = drawableAssets('menu-mode')
  .filter((asset) => asset.behavior.value === 'campaign-editor');
if (campaignMenuModes.length !== 1) {
  throw new Error(`campaign editor requires one installed campaign menu mode; found ${campaignMenuModes.length}`);
}
const CAMPAIGN_TAB_ICON = campaignMenuModes[0].media.icon?.media.immutableUrl;
if (!CAMPAIGN_TAB_ICON) throw new Error('installed campaign menu mode has no icon');

async function withRecentDraftEditingAuthority<T>(
  document: EditorDocument,
  action: (fence: ReturnType<typeof editorDocumentEditFence>) => Promise<T>,
): Promise<T> {
  const identity = newLevelEditorClientIdentity();
  if (!identity) throw new Error('This browser could not create the page identity required for safe editing.');
  const opened = await openEditorDocumentEditSession(document.document_id, {
    session_id: identity.sessionId,
    session_key: identity.sessionKey,
    device_id: identity.deviceId,
    client_label: `Campaign Editor · ${window.location.host} · ${levelEditorClientLabel(window.navigator.userAgent)}`,
  });
  try {
    return await action(editorDocumentEditFence(opened.session, identity.sessionKey));
  } finally {
    await closeEditorDocumentEditSession(document.document_id, opened.session.session_id, identity.sessionKey).catch(() => undefined);
  }
}

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

function recentDraftDescription(document: Pick<EditorDocumentSummary, 'never_saved' | 'updated_at'>): string {
  const state = document.never_saved ? 'Not saved yet' : 'Unsaved changes';
  if (!document.updated_at) return state;
  const updatedAt = new Date(document.updated_at);
  if (Number.isNaN(updatedAt.getTime())) return state;
  return `${state} · Edited ${updatedAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
}

function recentDraftAccessibleDescription(document: EditorDocument): string {
  const state = document.never_saved ? 'Not saved yet' : 'Unsaved changes';
  const updatedAt = document.updated_at ? new Date(document.updated_at) : null;
  const edited = updatedAt && !Number.isNaN(updatedAt.getTime())
    ? `${state}. Edited ${updatedAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' })}.`
    : `${state}.`;
  const units = document.level.layers.units.length;
  return `${edited} ${document.level.board.cols} by ${document.level.board.rows} board with ${units} ${units === 1 ? 'unit' : 'units'}.`;
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
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'settings-tab main-menu-mode-tab ce-campaign-tab', active && 'is-active', locked && 'is-locked')}
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
          <EditorRowIcon icon="lock" />
        </span>
      ) : !isOfficial ? (
        <ChromeButton unit="inner-tool-square"
          className={chromeUnitClassNames('inner-tool-square', 'ce-tab-trail ce-row-favorite', campaign.favorite && 'active is-selected')}
          aria-label={campaign.favorite ? `Unfavorite ${campaign.name}` : `Favorite ${campaign.name}`}
          onClick={onFavorite}
        >
          <EditorRowIcon icon="favorite" />
        </ChromeButton>
      ) : null}
    </div>
  );
}

// The workspace's unassigned levels, presented as one more rail tab at the end of the list.
export function UnassignedRailTab({
  count,
  active,
  index,
  onSelect,
  title = 'Unassigned levels',
  itemName = 'level',
  hasUnsavedDrafts = false,
}: {
  count: number;
  active: boolean;
  index: number;
  onSelect: () => void;
  title?: string;
  itemName?: string;
  hasUnsavedDrafts?: boolean;
}): ReactElement {
  return (
    <EditorCollectionRailTab
      count={count}
      active={active}
      index={index}
      onSelect={onSelect}
      iconSrc={CAMPAIGN_TAB_ICON}
      title={title}
      itemName={itemName}
      hasAttention={hasUnsavedDrafts}
    />
  );
}

/**
 * A saved level that is not filed into a campaign. Its controls are deliberately
 * capability-based: Edit and Delete apply, while campaign-order controls do not.
 */
export function UnassignedLevelRow({
  level,
  index,
  active,
  canManage,
  editHref,
  onSelect,
  onDelete,
}: {
  level: Level;
  index: number;
  active: boolean;
  canManage: boolean;
  editHref: string;
  onSelect: () => void;
  onDelete: () => void;
}): ReactElement {
  const rowId = useId();
  const titleId = `${rowId}-title`;
  const descriptionId = `${rowId}-description`;
  return (
    <EditorLevelRow
      levelId={level.id}
      objective={level.objective}
      level={level}
      index={index}
      active={active}
      readOnly={!canManage}
      headingId={titleId}
      descriptionId={descriptionId}
      onPrimarySelect={onSelect}
      primaryAriaLabel={`Preview ${level.name}`}
      primaryTitle="Preview level"
      editHref={canManage ? editHref : undefined}
      onDelete={canManage ? onDelete : undefined}
    />
  );
}

function recentDraftActionError(error: unknown, action: 'rename' | 'remove'): string {
  if (isEditorDocumentEditSessionError(error)) {
    return 'Live sync could not authenticate this action. Reopen the shared working copy and try again.';
  }
  if (isEditorDocumentConflict(error)) {
    return 'The working copy has a newer server revision. The newer draft is shown; review it and try again.';
  }
  return action === 'rename'
    ? 'Rename failed. Your typed name is still here — try again.'
    : 'Could not remove this draft. Try again in a moment.';
}

export function RecentDraftLevelRow({
  document,
  ownerEmail,
  onDocumentChange,
  onRemove,
}: {
  document: EditorDocument;
  ownerEmail?: string | null;
  onDocumentChange: (document: EditorDocument) => void;
  onRemove: (document: EditorDocument) => Promise<void>;
}): ReactElement {
  const name = editorDocumentDisplayName(document);
  const continueHref = editorDocumentContinueHref(document);
  const rowId = useId();
  const titleId = `${rowId}-title`;
  const statusId = `${rowId}-status`;
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(name);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectRenameInputRef = useRef(false);
  const refocusRenameInputRef = useRef(false);
  const restoreRenameButtonRef = useRef(false);

  useEffect(() => {
    if (!renaming) setRenameDraft(name);
  }, [name, renaming]);

  useEffect(() => {
    if (renaming && !busy) {
      if (selectRenameInputRef.current) {
        selectRenameInputRef.current = false;
        renameInputRef.current?.select();
      } else if (refocusRenameInputRef.current) {
        refocusRenameInputRef.current = false;
        renameInputRef.current?.focus();
      }
      return;
    }
    if (!renaming && !busy && restoreRenameButtonRef.current) {
      restoreRenameButtonRef.current = false;
      renameButtonRef.current?.focus();
    }
  }, [busy, renaming]);

  const finishRename = () => {
    selectRenameInputRef.current = false;
    refocusRenameInputRef.current = false;
    restoreRenameButtonRef.current = true;
    setRenaming(false);
  };

  const cancelRename = () => {
    setRenameDraft(name);
    setActionError('');
    finishRename();
  };

  const commitRename = async () => {
    if (busy) return;
    const nextName = normalizeLevelName(renameDraft);
    if (nextName === name) {
      setActionError('');
      finishRename();
      return;
    }
    setBusy(true);
    setActionError('');
    try {
      const updated = await withRecentDraftEditingAuthority(
        document,
        (fence) => autosaveEditorDocument(
          document.document_id,
          { ...document.level, name: nextName },
          document.revision,
          document.level,
          fence,
        ),
      );
      rebaseScopedLevelEditorDraft(
        { documentId: document.document_id, ownerEmail },
        {
          expectedDocumentRevision: document.revision,
          expectedCloudSignature: levelEditorLevelSignature(document.level),
          nextDocumentRevision: updated.revision,
          nextCloudSignature: levelEditorLevelSignature(updated.level),
          levelName: updated.level.name,
        },
      );
      onDocumentChange(updated);
      finishRename();
    } catch (error) {
      if (isEditorDocumentConflict(error)) onDocumentChange(error.document);
      refocusRenameInputRef.current = true;
      setActionError(recentDraftActionError(error, 'rename'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    setActionError('');
    try {
      await onRemove(document);
    } catch (error) {
      if (isEditorDocumentConflict(error)) onDocumentChange(error.document);
      setActionError(recentDraftActionError(error, 'remove'));
    } finally {
      setBusy(false);
    }
  };

  const renameHeading = renaming ? (
    <>
      <h4 id={titleId} className="sr-only">{name}</h4>
      <form
        className="ce-draft-rename"
        aria-label={`Rename ${name}`}
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          void commitRename();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape' && !busy) {
            event.preventDefault();
            cancelRename();
          }
        }}
      >
        <input
          ref={renameInputRef}
          className="ce-name-input ce-draft-name-input"
          value={renameDraft}
          maxLength={LEVEL_NAME_MAX}
          aria-label="Level name"
          readOnly={busy}
          onChange={(event) => setRenameDraft(event.target.value)}
        />
        <IconButton data-chrome-fill-surface={EDITOR_COLUMN_CONTROL_FILL_SURFACE}
          className="ce-draft-rename-button"
          aria-label={`Save name for ${name}`}
          title="Save name"
          disabled={busy}
          onClick={() => {
            void commitRename();
          }}
        ><EditorRowIcon icon="save" /></IconButton>
        <IconButton data-chrome-fill-surface={EDITOR_COLUMN_CONTROL_FILL_SURFACE}
          className="ce-draft-rename-button ce-draft-cancel-button"
          aria-label={`Cancel renaming ${name}`}
          title="Cancel"
          disabled={busy}
          onClick={cancelRename}
        >×</IconButton>
      </form>
    </>
  ) : undefined;

  return (
    <EditorLevelRow
      levelId={document.level_id}
      objective={document.level.objective}
      level={document.level}
      index={0}
      active={false}
      displayName={name}
      description={(
        <>
          <span aria-hidden="true">{actionError || recentDraftDescription(document)}</span>
          <span className="sr-only" aria-live="polite">
            {actionError || recentDraftAccessibleDescription(document)}
          </span>
        </>
      )}
      heading={renameHeading}
      actions={(
        <>
          <IconButton data-chrome-fill-surface={EDITOR_COLUMN_CONTROL_FILL_SURFACE}
            buttonRef={renameButtonRef}
            aria-label={`Rename ${name}`}
            title="Rename"
            disabled={busy || renaming}
            onClick={() => {
              selectRenameInputRef.current = true;
              refocusRenameInputRef.current = false;
              restoreRenameButtonRef.current = false;
              setRenameDraft(name);
              setRenaming(true);
              setActionError('');
            }}
          ><EditorRowIcon icon="pencil" /></IconButton>
          <IconButton data-chrome-fill-surface={EDITOR_COLUMN_CONTROL_FILL_SURFACE}
            tone="danger"
            aria-label={document.never_saved ? `Delete unsaved ${name}` : `Discard changes to ${name}`}
            title={document.never_saved ? 'Delete unsaved level' : 'Discard changes'}
            disabled={busy}
            onClick={() => {
              void remove();
            }}
          ><EditorRowIcon icon="delete" /></IconButton>
        </>
      )}
      showOrdinal={false}
      headingId={titleId}
      descriptionId={statusId}
      primaryHref={!renaming && !busy ? continueHref : undefined}
      primaryAriaLabel={`Continue editing ${name}`}
      primaryTitle="Continue editing"
      actionsLabel={`Actions for ${name}`}
    />
  );
}

export function CampaignEditor({
  embedded = false,
  path = typeof window === 'undefined' ? '/editor' : window.location.pathname,
  search = typeof window === 'undefined' ? '' : window.location.search,
  sceneInstanceKey = 'campaign-editor/campaign',
}: {
  embedded?: boolean;
  path?: string;
  search?: string;
  sceneInstanceKey?: string;
} = {}) {
  const campaigns = useCampaigns((s) => s.campaigns);
  const levels = useCampaigns((s) => s.levels);
  const wars = useWars((s) => s.wars);
  const selectedCampaignId = useCampaigns((s) => s.selectedCampaignId);
  const selectedLevelId = useCampaigns((s) => s.selectedLevelId);
  const [status, setStatus] = useState('');
  const sharedAuthStatus = useAuthSession((session) => session.status);
  const authIdentityKey = sharedAuthStatus?.reachable
    ? `${sharedAuthStatus.user.signed_in}:${sharedAuthStatus.user.email ?? ''}`
    : null;
  const me = sharedAuthStatus?.reachable ? sharedAuthStatus.user : null;
  const [recentDrafts, setRecentDrafts] = useState<EditorDocument[]>([]);
  const [draftsSettled, setDraftsSettled] = useState(false);
  // A stale whole-workspace body must never be paired with the newer revision from a 409 and
  // retried. Keep the local work visible, stop that tier's writes, and require a deliberate reload.
  const [userSaveConflict, setUserSaveConflict] = useState(false);
  const [officialSaveConflict, setOfficialSaveConflict] = useState(false);
  // The director-mounted route is the visible-content authority. Every collection and
  // campaign selection occupies the authored editor-content slot; local state must not
  // replace that navigable region ahead of its accepted fade.
  const selectedCollection = editorCollectionFromLocation(path, search);
  const routeCampaignId = editorCampaignIdFromSearch(search);
  const { ask, dialog: confirmDialog } = useConfirm();
  // Entrance readiness (ADR-0051): the shared store may already hold campaigns from a
  // /play/select visit this session — then there's real content at mount and
  // nothing holds; otherwise hold the fade until the officials merge settles.
  const [loaded, setLoaded] = useState(() => useCampaigns.getState().campaigns.length > 0);
  useSceneParticipant('campaign-editor', loaded && draftsSettled ? 'painted' : 'loading');
  const [userWorkspaceHydration, setUserWorkspaceHydration] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [officialWorkspaceHydration, setOfficialWorkspaceHydration] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const userWorkspaceReady = userWorkspaceHydration === 'ready';
  const officialWorkspaceReady = officialWorkspaceHydration === 'ready';
  const currentWorkspace = useMemo(() => ({ campaigns, levels, wars }), [campaigns, levels, wars]);
  const campaignThumbnailLevels = useMemo(() => Object.values(levels), [levels]);
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
    // A bare /editor no longer auto-opens a campaign. The rail lists only the campaign the
    // address names, so auto-selecting one would paint content behind a row that isn't
    // there — and put back the very button the rail stopped advertising.
    useCampaigns.setState({ selectedCampaignId: null, selectedLevelId: null });
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
    if (!sharedAuthStatus?.reachable) return undefined;
    let active = true;
    const user = sharedAuthStatus.user;
    void (async () => {
      if (!user.signed_in) {
        setRecentDrafts([]);
        setStatus('Official campaigns shown. Sign in to author your own.');
        return;
      }
      try {
        const result = await listEditorDocuments({ status: 'all', limit: 100 });
        const summaries = resumableUserEditorDocuments(result.documents);
        const loaded = await Promise.all(summaries.map(async (summary) => {
          try {
            return await loadEditorDocument(summary.document_id);
          } catch {
            return null;
          }
        }));
        if (active) {
          setRecentDrafts(loaded.filter((document): document is EditorDocument => Boolean(
            document
            && document.workspace_kind === 'user'
            && (document.dirty || document.never_saved),
          )));
        }
      } catch {
        // Discovery is optional UI. Workspace authoring remains available when the private list
        // endpoint is temporarily unavailable, and no fallback may invent or expose documents.
      }
    })().finally(() => {
      if (active) setDraftsSettled(true);
    });
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
  }, [authIdentityKey]);

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
      if ('action' in mapped) { reportAuthSessionFailure(e); goSignIn(); return; }
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
      if ('action' in mapped) { reportAuthSessionFailure(e); goSignIn(); return; }
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
      const parsed = JSON.parse(await file.text()) as Partial<{ campaigns: Campaign[]; levels: Record<string, unknown> }>;
      if (parsed.levels && typeof parsed.levels === 'object') {
        parsed.levels = Object.fromEntries(Object.entries(parsed.levels).map(([id, level]) => [
          id,
          migrateLevelDocument(level),
        ]));
      }
      const validationError = validateWorkspaceImport(
        parsed as Partial<{ campaigns: Campaign[]; levels: Record<string, Level> }>,
      );
      if (validationError) {
        setStatus(`Import failed: ${validationError}.`);
        return;
      }
      const importedCampaigns = parsed.campaigns!;
      const importedLevels = parsed.levels as Record<string, Level>;
      const previousCampaignId = useCampaigns.getState().selectedCampaignId;
      useCampaigns.getState().importWorkspace({ campaigns: importedCampaigns, levels: importedLevels });
      const importedCampaignId = useCampaigns.getState().selectedCampaignId;
      if (previousCampaignId && importedCampaignId !== previousCampaignId) {
        useCampaigns.getState().selectCampaign(previousCampaignId);
      }
      if (importedCampaignId) navigateApp(editorCampaignHref('/editor', importedCampaignId));
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
      const nextCampaignId = useCampaigns.getState().selectedCampaignId;
      navigateApp(nextCampaignId ? editorCampaignHref('/editor', nextCampaignId) : '/editor');
      setStatus('Campaign deleted. Save to keep this change.');
    }
  };

  const confirmDeleteLevel = async (level: Level) => {
    const persistenceVerb = tierOf(level.id) === 'official' ? 'Publish' : 'Save';
    if (await ask({
      title: 'Delete saved level?',
      message: <>Delete <b>{level.name}</b> from the workspace? This removes it when you {persistenceVerb}.</>,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      tone: 'danger',
    })) {
      useCampaigns.getState().deleteLevel(level.id);
      setStatus(`Level deleted. ${persistenceVerb} to keep this change.`);
    }
  };

  const updateRecentDraft = (updated: EditorDocument) => {
    setRecentDrafts((documents) => (
      updated.dirty || updated.never_saved
        ? documents.map((document) => (document.document_id === updated.document_id ? updated : document))
        : documents.filter((document) => document.document_id !== updated.document_id)
    ));
  };

  const removeRecentDraft = async (document: EditorDocument) => {
    const name = editorDocumentDisplayName(document);
    const deleteForever = document.never_saved;
    const confirmed = await ask(deleteForever ? {
      title: 'Delete unsaved level?',
      message: <><b>{name}</b> has never been saved. This permanently deletes its working copy.</>,
      confirmLabel: 'Delete',
      cancelLabel: 'Keep',
      tone: 'danger',
    } : {
      title: 'Discard unsaved changes?',
      message: <>Restore <b>{name}</b> to its last saved position? The saved level remains available.</>,
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      await withRecentDraftEditingAuthority(document, async (fence) => {
        if (deleteForever) {
          await deleteNeverSavedEditorDocument(document.document_id, document.revision, fence);
        } else {
          await discardEditorDocumentChanges(document.document_id, document.revision, fence);
        }
      });
      clearScopedLevelEditorDraft({ documentId: document.document_id, ownerEmail: me?.email });
      setRecentDrafts((documents) => documents.filter((candidate) => candidate.document_id !== document.document_id));
      setStatus(deleteForever ? `Deleted unsaved level “${name}”.` : `Discarded unsaved changes to “${name}”.`);
    } catch (error) {
      if (isEditorDocumentConflict(error)) updateRecentDraft(error.document);
      throw error;
    }
  };

  const isAdmin = Boolean(me?.is_admin);
  const isWarsSelected = selectedCollection === 'wars';
  const isUnassignedSelected = selectedCollection === 'unassigned';
  const isMetaCollectionSelected = isWarsSelected || isUnassignedSelected;
  // Unassigned levels: store level docs referenced by NO campaign or War — typically a board
  // authored cold in the Level Editor (createUnassignedLevel) before it is filed into one. They
  // live in the workspace and round-trip through campaign_workspaces just like any other level.
  const referencedLevelIds = useMemo(
    () => new Set([
      ...campaigns.flatMap((c) => c.levels.map((r) => r.levelId)),
      ...wars.flatMap((war) => war.battles.map((battle) => battle.levelId)),
    ]),
    [campaigns, wars],
  );
  const unassignedLevels = useMemo(
    () => Object.values(levels)
      .filter((level) => !referencedLevelIds.has(level.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id)),
    [levels, referencedLevelIds],
  );
  const visibleCampaignId = isMetaCollectionSelected
    ? null
    : routeCampaignId && campaigns.some((campaign) => campaign.id === routeCampaignId)
      ? routeCampaignId
      : selectedCampaignId;
  const camp = visibleCampaignId ? campaigns.find((campaign) => campaign.id === visibleCampaignId) ?? null : null;
  const campIsOfficial = camp?.origin === 'official';
  // readOnly is UI-derived, never trusted from a baked tag: an official campaign is
  // read-only for non-admins. A tier whose remote source is unavailable is also locked:
  // retrying hydration later must never merge over interim edits made against partial data.
  const selectedTierReady = campIsOfficial ? officialWorkspaceReady : userWorkspaceReady;
  const readOnly = !selectedTierReady || (campIsOfficial && !isAdmin);
  // The Editor rail does not advertise campaigns. Runs replaced them as how the game is
  // played (ADR-0529), so a standing campaign row is a button nobody presses. This hides
  // rows and nothing else: the campaigns, their levels, `?campaign=<id>` and + New Campaign
  // all still work, and the campaign the address actually names stays listed so those paths
  // land somewhere visible. It is a display rule, not a retirement — no content is deleted
  // and restoring the rows is one filter.
  const railCampaigns = campaigns.filter((campaign) => campaign.id === routeCampaignId);
  const officialCampaigns = railCampaigns.filter((c) => c.origin === 'official');
  const userCampaigns = railCampaigns.filter((c) => c.origin !== 'official');
  // The quota counts every private campaign in the workspace, listed or not.
  const ownCount = campaigns.filter((c) => c.origin !== 'official').length;
  const orderedLevels = camp ? camp.levels.slice().sort((a, b) => a.ordinal - b.ordinal) : [];
  const selectedLevelBelongsToVisibleCollection = selectedLevelId ? (
    isUnassignedSelected
      ? unassignedLevels.some((level) => level.id === selectedLevelId)
      : Boolean(camp?.levels.some((ref) => ref.levelId === selectedLevelId))
  ) : false;
  const levelDoc = selectedLevelBelongsToVisibleCollection && selectedLevelId ? levels[selectedLevelId] : null;
  const levelRef = !isMetaCollectionSelected && camp && selectedLevelId ? camp.levels.find((r) => r.levelId === selectedLevelId) : null;
  const selectedLevelIndex = orderedLevels.findIndex((r) => r.levelId === selectedLevelId);
  const selectedUnassignedLevelIndex = unassignedLevels.findIndex((level) => level.id === selectedLevelId);
  const selectedVisibleLevelIndex = isUnassignedSelected ? selectedUnassignedLevelIndex : selectedLevelIndex;
  // Delete = the selected level row's own Delete button, with the same permission gate that button
  // uses. It deliberately stops there: a keypress must not be able to delete the campaign the
  // selection lives in, which is why "Delete campaign" stays a button-only verb.
  const selectedLevelDeletable = Boolean(levelDoc) && (
    isUnassignedSelected
      ? (levelDoc && tierOf(levelDoc.id) === 'official' ? officialWorkspaceReady && isAdmin : userWorkspaceReady)
      : !readOnly
  );
  useDeleteKeyAction(levelDoc && selectedLevelDeletable ? () => { void confirmDeleteLevel(levelDoc); } : null);
  const enemyCount = levelDoc?.layers.units.filter((unit) => unit.side === 'enemy').length ?? 0;
  const allyCount = levelDoc?.layers.units.filter((unit) => unit.side === 'player').length ?? 0;
  const selectedLevelTitle = levelDoc
    ? selectedVisibleLevelIndex >= 0
      ? `Level ${selectedVisibleLevelIndex + 1}: ${levelDoc.name}`
      : levelDoc.name
    : 'Selected Level';
  const collectionReturnTo = selectedCollection === 'campaign' && camp
    ? editorCampaignHref('/editor', camp.id)
    : campaignCollectionHref('/editor', selectedCollection);
  const editHrefForCampaignLevel = (campaignId: string, levelId: string): string =>
    `/editor/level?campaignId=${encodeURIComponent(campaignId)}&levelId=${encodeURIComponent(levelId)}&returnTo=${encodeURIComponent(collectionReturnTo)}`;
  const editHrefForUnassigned = (levelId: string): string =>
    `/editor/level?levelId=${encodeURIComponent(levelId)}&returnTo=${encodeURIComponent(collectionReturnTo)}`;
  const editHref = levelDoc
    ? isUnassignedSelected
      ? editHrefForUnassigned(levelDoc.id)
      : camp
        ? editHrefForCampaignLevel(camp.id, levelDoc.id)
        : '/editor/level'
    : '/editor/level';
  const playHref = levelDoc
    ? isMetaCollectionSelected
      ? `/play?levelId=${encodeURIComponent(levelDoc.id)}&mode=test&returnTo=${encodeURIComponent(collectionReturnTo)}`
      : camp
        ? `/play?campaignId=${encodeURIComponent(camp.id)}&levelId=${encodeURIComponent(levelDoc.id)}&mode=test&returnTo=${encodeURIComponent(collectionReturnTo)}`
        : '/play'
    : '/play';
  const editableCampaignsForLevel = useMemo(
    () => (isUnassignedSelected && levelDoc
      ? campaigns.filter((campaign) => (
        (campaign.origin === 'official' ? officialWorkspaceReady && isAdmin : userWorkspaceReady)
        && tierOf(levelDoc.id) === tierOf(campaign.id)
      ))
      : []),
    [campaigns, isAdmin, isUnassignedSelected, levelDoc, officialWorkspaceReady, userWorkspaceReady],
  );

  useEffect(() => {
    if (selectedCollection !== 'campaign' || !routeCampaignId) return;
    if (routeCampaignId === selectedCampaignId) return;
    if (campaigns.some((campaign) => campaign.id === routeCampaignId)) {
      useCampaigns.getState().selectCampaign(routeCampaignId);
    }
  }, [campaigns, routeCampaignId, selectedCampaignId, selectedCollection]);

  useEffect(() => {
    if (!isUnassignedSelected) return;
    if (selectedLevelId && unassignedLevels.some((level) => level.id === selectedLevelId)) return;
    const first = unassignedLevels[0];
    if (first) useCampaigns.getState().selectLevel(first.id);
    else useCampaigns.setState({ selectedLevelId: null });
  }, [isUnassignedSelected, selectedLevelId, unassignedLevels]);

  const selectCampaignCollection = (campaignId: string) => {
    navigateApp(editorCampaignHref('/editor', campaignId));
  };

  const selectWarsCollection = () => {
    navigateApp(campaignCollectionHref('/editor', 'wars'));
  };

  const selectUnassignedCollection = () => {
    navigateApp(campaignCollectionHref('/editor', 'unassigned'));
  };

  const assignSelectedUnassignedLevel = (campaignId: string) => {
    if (!levelDoc) return;
    const target = campaigns.find((campaign) => campaign.id === campaignId);
    if (!target) return;
    if (target.origin === 'official' ? !officialWorkspaceReady || !isAdmin : !userWorkspaceReady) return;
    useCampaigns.getState().attachLevelToCampaign(campaignId, levelDoc.id);
    navigateApp(editorCampaignHref('/editor', campaignId));
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
      <ApparatusRailColumn
        className={embedded ? 'menu-dest-col menu-dest-tabs ce-editor-rail' : 'settings-frame settings-rail-frame ce-editor-rail'}
        placement={embedded ? 'open' : 'framed'}
        aria-label="Campaigns"
      >
            <KitScroll className="ce-rail-scroll">
              <div className="ce-rail-list">
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
                {/* Continue the stone slice past both content libraries and through the
                    workspace collections; the pinned footer is reserved for verbs. */}
                <UnassignedRailTab
                  title="Wars"
                  itemName="War"
                  count={wars.length}
                  index={railCampaigns.length}
                  active={isWarsSelected}
                  onSelect={selectWarsCollection}
                />
                <UnassignedRailTab
                  count={unassignedLevels.length}
                  index={railCampaigns.length + 1}
                  active={isUnassignedSelected}
                  hasUnsavedDrafts={recentDrafts.length > 0}
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
                href={`/editor/level?returnTo=${encodeURIComponent(CAMPAIGN_EDITOR_UNASSIGNED_RETURN_TO)}`}
              >+ New Level</SettingsButton>
              <SettingsButton
                data-testid="new-campaign"
                disabled={!userWorkspaceReady}
                onClick={() => {
                  if (!userWorkspaceReady) return;
                  const previousCampaignId = useCampaigns.getState().selectedCampaignId;
                  useCampaigns.getState().newCampaign();
                  const createdCampaignId = useCampaigns.getState().selectedCampaignId;
                  if (previousCampaignId && createdCampaignId !== previousCampaignId) {
                    useCampaigns.getState().selectCampaign(previousCampaignId);
                  }
                  if (createdCampaignId) navigateApp(editorCampaignHref('/editor', createdCampaignId));
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
          </ApparatusRailColumn>

          <EditorContentSceneSlot
            className="editor-destination-content"
            sceneInstance={sceneInstanceKey}
          >
          {isWarsSelected ? <WarEditor embedded /> : <>
          {/* ── CONTENT: the selected campaign — a single scrolling stack of SettingsSection
              groups (Campaign · Levels · Actions), now the full column height. The live level
              preview used to pin above this scroll; it's its own column now (see below). ── */}
          <main className={embedded ? 'menu-dest-col menu-dest-action ce-editor-main' : 'settings-frame settings-main-frame ce-editor-main'}>
            <h2 className="sr-only">{isUnassignedSelected ? 'Unassigned Levels' : camp?.name ?? 'Editor'}</h2>
            <div className="ce-editor-body">
              <KitScroll className="settings-scroll ce-editor-scroll">
                <ThumbnailSurface
                  levels={campaignThumbnailLevels}
                  participantId="campaign-list-thumbnails"
                  viewportSelector=".settings-scroll"
                >
                <div className="settings-panel-content">
                  {isUnassignedSelected ? (
                    <>
                      {recentDrafts.length > 0 ? (
                        <SettingsSection title="Continue editing">
                          <div className="ce-recent-drafts" data-testid="recent-editor-documents">
                            {recentDrafts.map((document) => (
                              <RecentDraftLevelRow
                                key={document.document_id}
                                document={document}
                                ownerEmail={me?.email}
                                onDocumentChange={updateRecentDraft}
                                onRemove={removeRecentDraft}
                              />
                            ))}
                          </div>
                        </SettingsSection>
                      ) : null}
                      <SettingsSection title="Unassigned Levels">
                        <div className="ce-level-list" data-testid="unassigned-levels">
                          {unassignedLevels.length === 0 ? <p className="ce-empty">No unassigned levels.</p> : null}
                          {unassignedLevels.map((level, index) => (
                            <UnassignedLevelRow
                              key={level.id}
                              level={level}
                              index={index}
                              active={level.id === selectedLevelId}
                              canManage={tierOf(level.id) === 'official'
                                ? officialWorkspaceReady && isAdmin
                                : userWorkspaceReady}
                              editHref={editHrefForUnassigned(level.id)}
                              onSelect={() => useCampaigns.getState().selectLevel(level.id)}
                              onDelete={() => { void confirmDeleteLevel(level); }}
                            />
                          ))}
                        </div>
                      </SettingsSection>
                    </>
                  ) : camp ? (
                    <>
                      <SettingsSection title="Campaign">
                        {campIsOfficial ? (
                          <EditorRow
                            title="Official campaign"
                            description={readOnly ? 'Read-only — published content. Sign in as an admin to edit.' : 'Editing the official, published campaign.'}
                            value={<span className="ce-official-badge">OFFICIAL</span>}
                          />
                        ) : null}
                        <EditorRow title="Name" description="Shown to players in the campaign list.">
                          <input
                            className="ce-name-input"
                            data-testid="campaign-name"
                            value={camp.name}
                            disabled={readOnly}
                            aria-label="Campaign name"
                            onChange={(e) => useCampaigns.getState().renameCampaign(camp.id, e.target.value)}
                          />
                        </EditorRow>
                        <EditorRow title="Chapters" value={<span>{camp.chapters}</span>} />
                        <EditorRow title="Levels" value={<span>{camp.levels.length}</span>} />
                        <EditorRow title="Difficulty" value={<span>{camp.difficulty}</span>} />
                      </SettingsSection>

                      <SettingsSection title="Levels">
                        <div className="ce-level-list">
                          {orderedLevels.length === 0 ? <p className="ce-empty">No levels. Add one to begin.</p> : null}
                          {orderedLevels.map((ref, index) => (
                            <EditorLevelRow
                              key={ref.levelId}
                              levelId={ref.levelId}
                              objective={ref.objective}
                              level={levels[ref.levelId]}
                              index={index}
                              active={ref.levelId === selectedLevelId}
                              readOnly={readOnly}
                              canMoveUp={index > 0}
                              canMoveDown={index < orderedLevels.length - 1}
                              onSelect={() => useCampaigns.getState().selectLevel(ref.levelId)}
                              editHref={levels[ref.levelId] ? editHrefForCampaignLevel(camp.id, ref.levelId) : undefined}
                              onMoveUp={() => useCampaigns.getState().moveLevel(ref.levelId, -1)}
                              onMoveDown={() => useCampaigns.getState().moveLevel(ref.levelId, 1)}
                              onDelete={() => { if (levels[ref.levelId]) confirmDeleteLevel(levels[ref.levelId]); }}
                            />
                          ))}
                        </div>
                        {readOnly ? null : (
                          <div className="ce-section-action">
                            <EditorButton data-testid="add-level" onClick={() => useCampaigns.getState().addLevel()}>+ Add Level</EditorButton>
                          </div>
                        )}
                      </SettingsSection>

                      <SettingsSection title="Campaign Actions">
                        <EditorRow title="Duplicate" description="Copy this campaign and its levels into a new private campaign.">
                          <EditorButton
                            disabled={camp.origin === 'official' || readOnly}
                            onClick={() => {
                              const previousCampaignId = useCampaigns.getState().selectedCampaignId;
                              useCampaigns.getState().duplicateCampaign(camp.id);
                              const duplicatedCampaignId = useCampaigns.getState().selectedCampaignId;
                              if (previousCampaignId && duplicatedCampaignId !== previousCampaignId) {
                                useCampaigns.getState().selectCampaign(previousCampaignId);
                              }
                              if (duplicatedCampaignId) navigateApp(editorCampaignHref('/editor', duplicatedCampaignId));
                            }}
                          >Duplicate</EditorButton>
                        </EditorRow>
                        <EditorRow title="Export" description="Download the workspace (your campaigns + levels) as JSON.">
                          <EditorButton disabled={!userWorkspaceReady || !campaigns.length} onClick={exportWorkspace}>Export</EditorButton>
                        </EditorRow>
                        <EditorRow title="Delete campaign" description="Remove this campaign from the workspace on the next save.">
                          <EditorButton tone="danger" disabled={readOnly} onClick={() => confirmDeleteCampaign(camp)}>Delete</EditorButton>
                        </EditorRow>
                      </SettingsSection>
                    </>
                  ) : (
                    <SettingsSection title="Editor">
                      <EditorRow
                        title="No campaign selected"
                        description="Levels live under Unassigned levels and Wars. Create a campaign with + New Campaign, or open an existing one by its address."
                      />
                    </SettingsSection>
                  )}
                </div>
                </ThumbnailSurface>
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
                  <ChromeNavButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'ce-link-button')} to={editHref}><span>Edit Board</span></ChromeNavButton>
                  <ChromeNavButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'ce-link-button ce-link-button-ghost')} to={playHref}><span>Test Play</span></ChromeNavButton>
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
          </>}
          </EditorContentSceneSlot>
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
      <TitleBarControlContribution
        ariaLabel="Editor navigation"
        controls={[{
          id: 'editor-back',
          kind: 'navigation',
          presentation: 'return',
          label: '‹ Back',
          destination: '/',
          title: 'Back to the menu',
          testId: 'editor-back',
        }]}
      />
      {centerSlot}
      <div className="settings-screen main-menu-twin-screen ce-editor-screen app-shell-bar-pad">
        <ArtRouteChrome className="settings-shell ce-editor-shell" ready={loaded}>
          {inner}
        </ArtRouteChrome>
      </div>
    </div>
  );
}
