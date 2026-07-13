import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import type { EditorDocument } from '../net/editorDocuments';
import { RecentDraftLevelRow } from './CampaignEditor';

const document: EditorDocument = {
  document_id: '36bb67ae-f2a2-44e0-91dd-71f4ef981a91',
  level_id: 'l2',
  workspace_kind: 'user',
  workspace_id: 'campaign',
  level: createBlankLevel('l2', 'Bridge sketch'),
  revision: 3,
  saved_revision: 2,
  dirty: true,
  has_saved_baseline: true,
  never_saved: false,
  baseline_conflict: false,
  created_at: '2026-07-10T01:00:00.000Z',
  updated_at: '2026-07-10T02:00:00.000Z',
};

const rowCallbacks = {
  onDocumentChange: () => undefined,
  onRemove: async () => undefined,
};

describe('Campaign Editor recent draft row', () => {
  it('is one full-size navigable level card with its private working-copy thumbnail and controls', () => {
    const markup = renderToStaticMarkup(
      <RecentDraftLevelRow document={document} {...rowCallbacks} />,
    );

    expect(markup).not.toContain('<div role="button"');
    expect(markup).toContain('class="settings-row ce-editor-level-row is-neutral"');
    expect(markup).not.toContain('ce-editor-draft-row');
    expect(markup).toContain('class="level-thumbnail');
    expect(markup.match(/<button/g)).toHaveLength(3);
    expect(markup.match(/aria-label="Continue editing Bridge sketch"/g)).toHaveLength(1);
    expect(markup).toContain('class="ce-editor-level-primary"');
    const statusId = markup.match(/<p id="([^"]+-status)"/)?.[1];
    expect(statusId).toBeTruthy();
    expect(markup).toContain(`aria-describedby="${statusId}"`);
    expect(markup).toContain('role="group" aria-label="Actions for Bridge sketch"');
    expect(markup).toContain('Rename Bridge sketch');
    expect(markup).toContain('Discard changes to Bridge sketch');
    expect(markup).toContain('board with 0 units.');
    expect(markup).not.toContain('/assets/ui/kit/icons/wrench.png');
  });

  it('shows a working thumbnail and an explicit delete control for a never-saved document', () => {
    const markup = renderToStaticMarkup(
      <RecentDraftLevelRow
        document={{ ...document, has_saved_baseline: false, never_saved: true }}
        {...rowCallbacks}
      />,
    );

    expect(markup).toContain('class="level-thumbnail');
    expect(markup).toContain('Delete unsaved Bridge sketch');
    expect(markup).not.toContain('ce-draft-thumb-empty');
  });
});
