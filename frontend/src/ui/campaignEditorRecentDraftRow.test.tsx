import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createBlankLevel } from '../core/level';
import type { EditorDocumentSummary } from '../net/editorDocuments';
import { RecentDraftLevelRow } from './CampaignEditor';

const document: EditorDocumentSummary = {
  document_id: '36bb67ae-f2a2-44e0-91dd-71f4ef981a91',
  level_id: 'l2',
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
};

describe('Campaign Editor recent draft row', () => {
  it('is one full-size navigable level card with the saved-position thumbnail', () => {
    const markup = renderToStaticMarkup(
      <RecentDraftLevelRow document={document} savedLevel={createBlankLevel('l2', 'Saved position')} />,
    );

    expect(markup).toContain('<button type="button"');
    expect(markup).toContain('class="settings-row ce-editor-level-row ce-editor-draft-row"');
    expect(markup).toContain('data-nav="/editor/level?levelId=l2&amp;document=36bb67ae-f2a2-44e0-91dd-71f4ef981a91&amp;returnTo=%2Feditor"');
    expect(markup).toContain('class="level-thumbnail');
    expect(markup).toContain('Continue editing Bridge sketch');
  });

  it('keeps the thumbnail footprint honest when no saved position exists', () => {
    const markup = renderToStaticMarkup(
      <RecentDraftLevelRow
        document={{ ...document, has_saved_baseline: false, never_saved: true }}
        savedLevel={undefined}
      />,
    );

    expect(markup).toContain('settings-row-thumb-empty ce-draft-thumb-empty');
    expect(markup).toContain('Not saved');
    expect(markup).not.toContain('class="level-thumbnail');
  });
});
