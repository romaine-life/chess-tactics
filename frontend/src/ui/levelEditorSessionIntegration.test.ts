// @ts-nocheck -- source-structure regression guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const campaignEditor = readFileSync(new URL('./CampaignEditor.tsx', import.meta.url), 'utf8');

describe('Level Editor shared working-copy integration', () => {
  it('opens every authenticated owner page as an editor without acquiring a lease', () => {
    expect(editor).toContain('const openingSession = openEditorDocumentEditSession(doc.document_id');
    expect(editor).toContain('openedAsWriter = true;');
    expect(editor).toContain("setEditAuthorityState('writer')");
    expect(editor).toContain("session.state === 'observing'");
    expect(editor).toContain("session.state === 'closed'");
    expect(editor).not.toContain('takeOverEditorDocumentEditSession');
    expect(editor).not.toContain('listEditorDocumentRecoveries');
  });

  it('polls the shared working copy and merges remote edits into the visible board', () => {
    const syncStart = editor.indexOf('// Every owner page edits the same cloud working copy.');
    const syncEnd = editor.indexOf('const editorSessionCanWrite', syncStart);
    const sync = editor.slice(syncStart, syncEnd);

    expect(syncStart).toBeGreaterThan(-1);
    expect(sync).toContain('loadEditorDocument(documentId)');
    expect(sync).toContain('latest.revision <= observedRevision');
    expect(sync).toContain('mergeSharedLevel(base.level, local, latest.level)');
    expect(sync).toContain('applyLevelDocumentRef.current(merged');
    expect(sync).toContain('EDITOR_SHARED_SYNC_POLL_MS');
    expect(sync).toContain('refreshSequence !== followerRefreshSequenceRef.current');
  });

  it('sends the acknowledged base with normal and page-hide autosaves', () => {
    expect(editor).toMatch(/autosaveEditorDocument\([\s\S]*?levelAtSave,[\s\S]*?revision,[\s\S]*?baseAtSave,[\s\S]*?fence,/);
    expect(editor).toContain('autosaveEditorDocumentOnPageHide(doc.document_id, currentCandidateRef.current, revision, doc.level, fence)');
    expect(editor).toContain('mergeSharedLevel(levelAtSave, currentCandidateRef.current, doc.level)');
  });

  it('does not surface takeover, start-editing, or recovery-copy controls', () => {
    expect(editor).toContain("{ id: 'history', label: 'History' }");
    expect(editor).not.toContain('Start editing here');
    expect(editor).not.toContain('Take over editing');
    expect(editor).not.toContain('Follow latest');
    expect(editor).not.toContain('Recovery copies');
  });

  it('keeps working-copy history collapsed and unloaded until requested', () => {
    expect(editor).toContain('const [revisionHistoryExpanded, setRevisionHistoryExpanded] = useState(false);');
    expect(editor).toContain("layer !== 'history' || !revisionHistoryExpanded");
    expect(editor).toContain('aria-expanded={revisionHistoryExpanded}');
    expect(editor).toContain("revisionHistoryExpanded ? 'Hide history' : 'Show history'");
  });

  it('lets Campaign Editor actions join the same working copy without takeover', () => {
    const authorityStart = campaignEditor.indexOf('async function withRecentDraftEditingAuthority');
    const authorityEnd = campaignEditor.indexOf('export type CampaignCollection', authorityStart);
    const authority = campaignEditor.slice(authorityStart, authorityEnd);

    expect(authority).toContain('await openEditorDocumentEditSession(');
    expect(authority).toContain('return await action(editorDocumentEditFence(opened.session, identity.sessionKey));');
    expect(authority).toContain('await closeEditorDocumentEditSession(');
    expect(authority).not.toContain('takeOverEditorDocumentEditSession');
    expect(authority).not.toContain('currently has editing control');
  });
});
