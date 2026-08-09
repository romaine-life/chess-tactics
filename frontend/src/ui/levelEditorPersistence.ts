import type { EditorDocumentWorkspaceSelector } from '../net/editorDocuments';

/**
 * Official levels live in the one canonical official workspace. User levels use
 * the backend's implicit user workspace and therefore need no selector.
 */
export function editorDocumentWorkspaceForLevelId(
  levelId: string,
): EditorDocumentWorkspaceSelector | undefined {
  return levelId.startsWith('off-')
    ? { workspace_kind: 'official', workspace_id: 'default' }
    : undefined;
}

/**
 * Browser storage is a crash/offline recovery channel, not the primary copy.
 * A matching observed revision is authoritative. Timestamps are only a compatibility fallback
 * for older scoped entries that predate revision metadata.
 */
export function shouldRestoreLocalEditorRecovery(input: {
  localSignature: string | undefined;
  documentSignature: string | undefined;
  localSavedAt: number | null | undefined;
  documentUpdatedAt: string | null | undefined;
  localDocumentRevision?: number;
  documentRevision?: number;
  localCloudSignature?: string;
  /** Pre-normalization signature written by browser recoveries from older editor builds. */
  documentSourceSignature?: string;
  localRecoveryConflict?: boolean;
}): boolean {
  const {
    localSignature,
    documentSignature,
    localSavedAt,
    documentUpdatedAt,
    localDocumentRevision,
    documentRevision,
    localCloudSignature,
    documentSourceSignature,
    localRecoveryConflict,
  } = input;

  if (
    typeof localSignature !== 'string'
    || typeof documentSignature !== 'string'
    || localSignature === documentSignature
    || localRecoveryConflict === true
  ) {
    return false;
  }

  if (localDocumentRevision !== undefined && documentRevision !== undefined) {
    return Number.isSafeInteger(localDocumentRevision)
      && Number.isSafeInteger(documentRevision)
      && localDocumentRevision === documentRevision
      && (
        localCloudSignature === undefined
        || localCloudSignature === documentSignature
        || localCloudSignature === documentSourceSignature
      );
  }

  // One-sided metadata is expected while upgrading an older browser entry. A cloud signature
  // without its matching revision is not safe to rebase; truly legacy entries use timestamps.
  if (localDocumentRevision !== undefined || localCloudSignature !== undefined) return false;

  if (
    typeof localSavedAt !== 'number'
    || !Number.isFinite(localSavedAt)
    || localSavedAt < 0
    || typeof documentUpdatedAt !== 'string'
    || documentUpdatedAt.trim().length === 0
  ) return false;

  const documentUpdatedAtMs = Date.parse(documentUpdatedAt);
  return Number.isFinite(documentUpdatedAtMs) && localSavedAt > documentUpdatedAtMs;
}

/**
 * Per-tab branches are cleared rather than offered as a take-over flow (ADR-0304), but clearing
 * one is only safe when discarding it loses nothing — its content already equals the acknowledged
 * document body. A divergent branch is work that never reached the server; it is retained, and a
 * later mount clears it once autosave has carried it into the document and the signatures agree.
 * That keeps browser storage a bounded buffer instead of a growing cleanup queue.
 */
export function preservedEditorRecoveryIsRedundant(input: {
  recoverySignature: string | undefined;
  documentSignature: string | undefined;
}): boolean {
  const { recoverySignature, documentSignature } = input;
  return typeof recoverySignature === 'string'
    && typeof documentSignature === 'string'
    && recoverySignature === documentSignature;
}

/**
 * A provisional draft is written before any document exists (signed out, or signed in before the
 * level resolves). It may only be cleared once the resolved document demonstrably holds a copy —
 * the forwarding marker. Merely arriving at a document is not proof, and the current page's own
 * draft is never a discardable branch.
 */
export function provisionalEditorRecoveryIsRedundant(input: {
  isCurrentPageDraft: boolean;
  forwardedIntoDocument: boolean;
}): boolean {
  return !input.isCurrentPageDraft && input.forwardedIntoDocument;
}

/**
 * A 401 under an already-open working copy is an expired sign-in, not a document problem. The
 * mounted board, its page identity and its browser recovery all remain valid, so the editor pauses
 * cloud writes instead of tearing itself down — otherwise every edit made after the expiry exists
 * only in RAM and dies with the sign-in navigation.
 */
export function isInterruptedByCloudSignOut(input: {
  documentOpen: boolean;
  reachable: boolean;
  signedIn: boolean;
}): boolean {
  return input.documentOpen && input.reachable && !input.signedIn;
}

/**
 * Resume an interrupted document only for the SAME account. A different owner signing in must
 * re-resolve from scratch: adopting the mounted document and its browser buffer would hand one
 * owner's unsent work to another. An interrupted owner email is required, so a page that never
 * recorded one cannot resume by default.
 */
export function shouldResumeInterruptedCloudSync(input: {
  interruptedOwnerEmail: string | null | undefined;
  reachable: boolean;
  signedIn: boolean;
  email: string | null | undefined;
}): boolean {
  const interrupted = input.interruptedOwnerEmail?.trim().toLowerCase() ?? '';
  const current = input.email?.trim().toLowerCase() ?? '';
  return Boolean(interrupted) && input.reachable && input.signedIn && interrupted === current;
}

/**
 * A divergent browser branch that mount could not adopt is unsent work, and the gates that block
 * adoption — a dirty document, a retired page session — are exactly the cases where the owner has
 * to choose. Leaving it addressable only from storage reads as data loss, so it is offered.
 */
export function shouldOfferPreservedEditorBranch(input: {
  openedAsWriter: boolean;
  branchDiverged: boolean;
  adoptedIntoEditor: boolean;
}): boolean {
  return input.openedAsWriter && input.branchDiverged && !input.adoptedIntoEditor;
}

/**
 * Adopt an unsent branch as this page's local changes instead of opening the document body over
 * it. Offline editing — and a sign-in that re-homes the page into a fresh session, so the draft
 * arrives as another session's preserved recovery rather than this page's claimed draft — both
 * land here. A clean working copy still equals the canonical saved level, so adopting cannot
 * overwrite anything and autosave carries the branch into the durable copy. A dirty document has
 * server-side work of its own, so the branch stays preserved rather than being applied over it.
 */
export function shouldAdoptPreservedEditorBranch(input: {
  openedAsWriter: boolean;
  preservedBranchDiverged: boolean;
  documentDirty: boolean;
  restoringLocalRecovery: boolean;
  restoringRouteSnapshot: boolean;
}): boolean {
  return input.openedAsWriter
    && input.preservedBranchDiverged
    && !input.documentDirty
    && !input.restoringLocalRecovery
    && !input.restoringRouteSnapshot;
}

/**
 * Canonicalize the editor route after the backend resolves its opaque document
 * identity (and, for a new level, allocates the level id). Every other query
 * parameter remains intact. One-shot Test/recovery snapshot fields are consumed by default so a
 * later reload cannot replay an old board over a newer working copy; callers may retain them only
 * until that snapshot receives a cloud autosave acknowledgement.
 */
export function levelEditorHrefForDocument(
  currentHref: string,
  document: { levelId: string; documentId: string },
  options: { keepRecoverySnapshot?: boolean } = {},
): string {
  const url = new URL(currentHref, 'https://chess-tactics.local');
  url.searchParams.set('levelId', document.levelId);
  url.searchParams.set('document', document.documentId);
  url.searchParams.delete('map');
  if (!options.keepRecoverySnapshot) {
    for (const param of ['board', 'name', 'obj', 'survive', 'time', 'inc', 'par', 'events', 'victory', 'docRev']) {
      url.searchParams.delete(param);
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
