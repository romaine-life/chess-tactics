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
    for (const param of ['board', 'name', 'obj', 'survive', 'time', 'inc', 'events', 'victory', 'docRev']) {
      url.searchParams.delete(param);
    }
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
