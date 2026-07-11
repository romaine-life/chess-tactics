import type { EditorDocumentSummary } from '../net/editorDocuments';
import type { Level } from '../core/level';

export const CAMPAIGN_EDITOR_RECENT_DRAFT_LIMIT = 8;

/** The Campaign Editor only resumes private user work; official authoring remains in its tier. */
export function resumableUserEditorDocuments(
  documents: readonly EditorDocumentSummary[],
  limit = CAMPAIGN_EDITOR_RECENT_DRAFT_LIMIT,
): EditorDocumentSummary[] {
  return documents
    .filter((document) => document.workspace_kind === 'user' && (document.dirty || document.never_saved))
    .slice()
    .sort((left, right) => {
      const leftTime = left.updated_at ? Date.parse(left.updated_at) : 0;
      const rightTime = right.updated_at ? Date.parse(right.updated_at) : 0;
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0)
        || left.document_id.localeCompare(right.document_id);
    })
    .slice(0, Math.max(0, limit));
}

export function editorDocumentContinueHref(document: Pick<EditorDocumentSummary, 'document_id' | 'level_id'>): string {
  const params = new URLSearchParams({
    levelId: document.level_id,
    document: document.document_id,
    returnTo: '/editor',
  });
  return `/editor/level?${params.toString()}`;
}

export function editorDocumentDisplayName(document: Pick<EditorDocumentSummary, 'name'>): string {
  return document.name.trim() || 'Untitled level';
}

/**
 * Draft discovery never supplies the private working body. A list thumbnail may only use the
 * canonical level that backs Discard/Save; a never-saved document deliberately has no board
 * thumbnail yet rather than leaking its unsaved working position into canonical UI.
 */
export function savedLevelForEditorDocument(
  document: Pick<EditorDocumentSummary, 'has_saved_baseline' | 'level_id'>,
  levels: Readonly<Record<string, Level>>,
): Level | undefined {
  return document.has_saved_baseline ? levels[document.level_id] : undefined;
}
