import { describe, expect, it } from 'vitest';
import type { EditorDocumentSummary } from '../net/editorDocuments';
import {
  editorDocumentContinueHref,
  editorDocumentDisplayName,
  resumableUserEditorDocuments,
} from './campaignEditorRecentDrafts';

const summary = (over: Partial<EditorDocumentSummary> = {}): EditorDocumentSummary => ({
  document_id: 'doc-a',
  level_id: 'l1',
  workspace_kind: 'user',
  workspace_id: 'campaign',
  name: 'Bridge sketch',
  revision: 3,
  saved_revision: 2,
  dirty: true,
  has_saved_baseline: true,
  never_saved: false,
  created_at: '2026-07-10T01:00:00.000Z',
  updated_at: '2026-07-10T02:00:00.000Z',
  ...over,
});

describe('Campaign Editor recent drafts', () => {
  it('keeps only dirty or never-saved user documents, newest first', () => {
    const documents = resumableUserEditorDocuments([
      summary({ document_id: 'clean', dirty: false }),
      summary({ document_id: 'official', workspace_kind: 'official' }),
      summary({ document_id: 'older', updated_at: '2026-07-10T02:00:00.000Z' }),
      summary({
        document_id: 'new',
        level_id: 'l9',
        dirty: false,
        has_saved_baseline: false,
        never_saved: true,
        updated_at: '2026-07-10T03:00:00.000Z',
      }),
    ]);

    expect(documents.map((document) => document.document_id)).toEqual(['new', 'older']);
  });

  it('links directly to the existing private document without a create/share action', () => {
    expect(editorDocumentContinueHref(summary({ document_id: 'doc/a b', level_id: 'l 2' })))
      .toBe('/editor/level?levelId=l+2&document=doc%2Fa+b&returnTo=%2Feditor');
  });

  it('gives an unnamed draft a stable human label', () => {
    expect(editorDocumentDisplayName(summary({ name: '  ' }))).toBe('Untitled level');
  });
});
