// @ts-nocheck -- source-structure regression guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');

describe('Level Editor attributed session integration', () => {
  it('claims the page identity before recovery access or document resolution', () => {
    const bootstrapStart = editor.indexOf('const user = auth.user;');
    const pageIdentityClaim = editor.indexOf('await claimLevelEditorClientIdentity(', bootstrapStart);
    const levelRecoveryRead = editor.indexOf('const currentUnscopedDraft =', bootstrapStart);
    const documentResolution = editor.indexOf('const doc = routeParams.documentId', bootstrapStart);
    const retiredProvisionalRecoveryEnumeration = editor.indexOf(
      'listPreservedScopedLevelEditorRecoveries(provisionalDraftIdentity)',
      pageIdentityClaim,
    );
    const directDocumentFailure = editor.indexOf('const failedDocumentDraftIdentity =', documentResolution);
    const directDocumentRecoveryRead = editor.indexOf('readScopedLevelEditorDraft(failedDocumentDraftIdentity)', directDocumentFailure);
    const failureIdentity = editor.slice(directDocumentFailure, directDocumentRecoveryRead);
    const retiredProvisionalRecoveryUse = editor.indexOf(
      'for (const { sourceIdentity, recovery: sourceRecovery, sourceIsCurrentDraft } of provisionalPreservedRecoveries)',
      documentResolution,
    );
    const retiredProvisionalForwardingCheck = editor.indexOf(
      'isPreservedScopedLevelEditorRecoveryForwarded(sourceIdentity, sourceRecovery, doc.document_id)',
      retiredProvisionalRecoveryUse,
    );
    const retiredProvisionalArchive = editor.indexOf(
      'preserveScopedLevelEditorRecovery(scopedDraftIdentity, {',
      retiredProvisionalForwardingCheck,
    );
    const retiredProvisionalForwardingMark = editor.indexOf(
      'markPreservedScopedLevelEditorRecoveryForwarded(sourceIdentity, sourceRecovery, doc.document_id)',
      retiredProvisionalArchive,
    );
    const actualDocumentRecoveryList = editor.indexOf(
      'const preservedScopedRecoveries =',
      retiredProvisionalForwardingMark,
    );
    const handoffGateStart = editor.indexOf(
      'const recoveryHandoffReady = offlineSessionHandoffReady',
      actualDocumentRecoveryList,
    );
    const handoffGateEnd = editor.indexOf(';', handoffGateStart);
    const handoffGate = editor.slice(handoffGateStart, handoffGateEnd);

    expect(bootstrapStart).toBeGreaterThan(-1);
    expect(pageIdentityClaim).toBeGreaterThan(bootstrapStart);
    expect(pageIdentityClaim).toBeLessThan(levelRecoveryRead);
    expect(pageIdentityClaim).toBeLessThan(documentResolution);
    expect(retiredProvisionalRecoveryEnumeration).toBeGreaterThan(pageIdentityClaim);
    expect(retiredProvisionalRecoveryEnumeration).toBeLessThan(documentResolution);
    expect(retiredProvisionalRecoveryUse).toBeGreaterThan(documentResolution);
    expect(retiredProvisionalForwardingCheck).toBeGreaterThan(retiredProvisionalRecoveryUse);
    expect(retiredProvisionalArchive).toBeGreaterThan(retiredProvisionalForwardingCheck);
    expect(retiredProvisionalForwardingMark).toBeGreaterThan(retiredProvisionalArchive);
    expect(actualDocumentRecoveryList).toBeGreaterThan(retiredProvisionalForwardingMark);
    expect(handoffGate).toContain('provisionalPreservedHandoffReady');
    expect(editor.slice(pageIdentityClaim, levelRecoveryRead)).toContain('clientSessionId: provisionalIdentity.sessionId');
    expect(failureIdentity).toContain('const failedDocumentDraftIdentity = provisionalDraftIdentity;');
  });

  it('checks authority before enabling a signed-in editor and keeps takeover reachable', () => {
    expect(editor).toContain('await claimLevelEditorClientIdentity(doc.document_id)');
    expect(editor).toContain('const openingSession = openEditorDocumentEditSession(doc.document_id');
    expect(editor).toContain('session_key: documentClientIdentity.sessionKey');
    expect(editor).toContain("setEditAuthorityState('checking')");
    expect(editor).toContain('data-testid="le-editor-session-rail"');
    expect(editor).toContain('levelEditorSessionActorLabel(editPresence.active_editor)');
    expect(editor).toContain('levelEditorSessionActorLabel(editPresence.last_editor)');
    expect(editor).toContain('most recently had editing control');
    expect(editor).toContain('No live heartbeat ·');
    expect(editor).toContain('levelEditorSessionPresenceDetail({');
    expect(editor).toContain('data-testid="le-take-over-editing-rail"');
    expect(editor).toContain('await takeOverEditorDocumentEditSession(');
    expect(editor).toContain('The latest server-known copy from that session will be preserved');
    expect(editor).toContain('Level Editor · ${window.location.host}');
    expect(editor).toContain('tab ${documentClientIdentity.sessionId.slice(0, 8)}');
    expect(editor).toContain('browser profile ${documentClientIdentity.deviceId.slice(0, 8)}');
    expect(editor).toContain("activeEditor ? 'Take over editing' : 'Start editing here'");
    expect(editor).toContain("editPresence?.active_editor ? 'Take over editing' : 'Start editing here'");
    expect(editor).toContain('Uploaded by displaced tab · non-live checkpoint');
    expect(editor).not.toContain('Live displaced-tab upload');
    expect(editor).toContain('levelEditorSessionServerNow(editPresence.server_time)');
  });

  it('does not let an overlapping follower refresh publish stale attribution or board state', () => {
    const refreshEffectStart = editor.indexOf('// Presence polling is notification only;');
    const refreshEffectEnd = editor.indexOf('// A displaced page can upload a later in-memory checkpoint', refreshEffectStart);
    const refreshEffect = editor.slice(refreshEffectStart, refreshEffectEnd);
    const latestRefreshGuard = 'refreshSequence !== followerRefreshSequenceRef.current';

    expect(refreshEffectStart).toBeGreaterThan(-1);
    expect(refreshEffectEnd).toBeGreaterThan(refreshEffectStart);
    expect(editor).toContain('const followerRefreshSequenceRef = useRef(0);');
    expect(refreshEffect).toContain('const refreshSequence = ++followerRefreshSequenceRef.current;');
    expect(refreshEffect.match(/refreshSequence !== followerRefreshSequenceRef\.current/g)).toHaveLength(3);
    expect(refreshEffect).toContain('refreshSequence === followerRefreshSequenceRef.current');
    expect(refreshEffect.indexOf(latestRefreshGuard)).toBeLessThan(refreshEffect.indexOf('const latest = writerHere'));
    expect(refreshEffect.lastIndexOf(latestRefreshGuard)).toBeLessThan(refreshEffect.indexOf('if (isEditorDocumentEditSessionError(error))'));

    const manualRefreshStart = editor.indexOf('const followLatestWorkingCopy = async');
    const manualRefreshEnd = editor.indexOf('const takeOverEditing = async', manualRefreshStart);
    const manualRefresh = editor.slice(manualRefreshStart, manualRefreshEnd);
    expect(manualRefresh).toContain('const refreshSequence = ++followerRefreshSequenceRef.current;');
    expect(manualRefresh).toContain('if (refreshSequence !== followerRefreshSequenceRef.current) return;');
  });

  it('fences every Level Editor mutation and makes displaced tabs read-only', () => {
    const fenceStart = editor.indexOf('const currentEditFence = (): EditorDocumentEditFence | null => {');
    const fenceEnd = editor.indexOf('\n  };', fenceStart);
    const currentFence = editor.slice(fenceStart, fenceEnd);
    const lifecycleFlush = editor.slice(
      editor.indexOf('// A route change must not manufacture a 700 ms loss window.'),
      editor.indexOf('// A Test-return board is a one-shot recovery envelope.'),
    );

    expect(fenceStart).toBeGreaterThan(-1);
    expect(currentFence).toContain('const identity = editorClientIdentityRef.current;');
    expect(currentFence).not.toContain('const identity = editorClientIdentity;');
    expect(lifecycleFlush).toContain("window.addEventListener('pagehide', onPageHide)");
    expect(lifecycleFlush).toContain('const fence = currentEditFence();');
    expect(editor).toContain('const fence = currentEditFence();');
    expect(editor).toContain('edit_session_key: identity.sessionKey');
    expect(editor).toMatch(/autosaveEditorDocument\([\s\S]*?revision,[\s\S]*?fence,/);
    expect(editor).toMatch(/saveEditorDocument\([\s\S]*?campaignAssignmentId \|\| null,[\s\S]*?fence,/);
    expect(editor).toMatch(/discardEditorDocumentChanges\([\s\S]*?revision,[\s\S]*?fence,/);
    expect(editor).toContain('inert={!editorReady || saving || !editorSessionCanWrite ? true : undefined}');
    expect(editor).toContain('className="le-editor-authoring-controls" inert={!editorSessionCanWrite ? true : undefined}');
    expect(editor).toContain('const scopedDraftMatchesGeneration = Boolean(');
    expect(editor).toContain('const restoreRouteSnapshot = openedAsWriter && routeSnapshotDiverged && routeSnapshotSafe;');
    expect(editor).toContain('preserveScopedLevelEditorRecovery(recoveryIdentity, frozenDraft)');
    expect(editor).toContain('if (archived) clearScopedLevelEditorDraft(recoveryIdentity)');
    expect(editor).toContain('preserveAuthorityLoss(error.session ?? editSessionRef.current, error.recovery)');
    expect(editor).toContain('mountAcknowledgedWorkingCopy(error.document ?? await loadEditorDocument(editorDocument.document_id))');
    expect(editor).toContain('frozenAuthorityLossCandidatesRef.current.get(authorityCandidateKey)');
    expect(editor).toContain('await closeEditorDocumentEditSession(');
    expect(editor).toContain('retireLevelEditorClientIdentity(closingDocument.document_id)');
    expect(editor).toContain("sameDocumentRemountRef.current = levelEditorRouteIdentity(window.location.search)");
    expect(editor).toContain('if (!sameDocumentRemountRef.current) flushAfterCurrentWrite(false)');
  });

  it('does not invent a person from a stale browser draft or content revision', () => {
    expect(editor).toContain('Browser recovery preserved — this is not another editor');
    expect(editor).toContain('The cloud working copy is open. An older browser recovery is preserved separately below; it was not applied to this board.');
    expect(editor).toContain("const recoveredLevel = restoreRouteSnapshot");
    expect(editor).toContain(': restoreLocal && localLevel');
    expect(editor).toContain("browserRecoveryConflictRef.current?.source === 'route' && !browserRecoveryConflictRef.current.recoveryId");
    expect(editor).toContain("layer === 'status'");
    expect(editor).toContain('listEditorDocumentRecoveries(editorDocument.document_id)');
    expect(editor).toContain('const revalidateRecoveryDialogWriter = async (');
    expect(editor).toContain('browserRecoveryConflictRef.current !== expectedRecovery');
    expect(editor).toContain('if (!(await revalidateRecoveryDialogWriter(recovery))) return;');
    expect(editor).not.toContain('Another tab or device saved a newer revision.');
    expect(editor).not.toContain('Save is paused because another tab or device has a newer revision.');
  });
});
