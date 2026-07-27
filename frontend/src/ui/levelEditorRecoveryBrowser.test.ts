import { describe, expect, it } from 'vitest';
import type { EditorDocumentRecovery } from '../net/editorDocuments';
import {
  serverRecoveryCursorAfterRemoval,
  serverRecoveryCursorIndex,
  serverRecoveryReasonLabel,
  stepServerRecoveryCursor,
} from './levelEditorRecoveryBrowser';

const recovery = (id: string, reason: EditorDocumentRecovery['reason'] = 'takeover'): EditorDocumentRecovery => ({
  recovery_id: id,
  document_id: 'document-1',
  source_session_id: `session-${id}`,
  displaced_by_session_id: null,
  source_editor: { session_id: `session-${id}`, name: 'Nelson', email: 'nelson@example.com', client_label: 'Chrome on Windows' },
  level: {} as EditorDocumentRecovery['level'],
  document_revision: 4,
  edit_generation: 2,
  capture_source: 'server-acknowledged',
  body_checkpoint_at: '2026-07-20T12:00:00.000Z',
  reason,
  created_at: '2026-07-20T12:00:00.000Z',
  resolved_at: null,
});

describe('Level Editor recovery browser', () => {
  const recoveries = [recovery('newest'), recovery('middle'), recovery('oldest')];

  it('starts on the newest copy and steps without wrapping', () => {
    expect(serverRecoveryCursorIndex(recoveries, null)).toBe(0);
    expect(stepServerRecoveryCursor(recoveries, null, -1)).toBe('newest');
    expect(stepServerRecoveryCursor(recoveries, null, 1)).toBe('middle');
    expect(stepServerRecoveryCursor(recoveries, 'oldest', 1)).toBe('oldest');
  });

  it('retains the selected id when a newer recovery is prepended', () => {
    expect(serverRecoveryCursorIndex([recovery('later'), ...recoveries], 'middle')).toBe(2);
  });

  it('selects the adjacent copy after deletion', () => {
    expect(serverRecoveryCursorAfterRemoval(recoveries, 'middle', 'middle')).toBe('oldest');
    expect(serverRecoveryCursorAfterRemoval(recoveries, 'oldest', 'oldest')).toBe('middle');
    expect(serverRecoveryCursorAfterRemoval([recovery('only')], 'only', 'only')).toBeNull();
  });

  it('explains why each copy exists in plain language', () => {
    expect(serverRecoveryReasonLabel(recovery('a', 'takeover'))).toContain('editing moved');
    expect(serverRecoveryReasonLabel(recovery('b', 'lease-expired'))).toContain('session expired');
    expect(serverRecoveryReasonLabel(recovery('c', 'displaced-upload'))).toContain('previous tab');
    expect(serverRecoveryReasonLabel(recovery('d', 'pre-restore'))).toContain('before another copy');
  });
});
