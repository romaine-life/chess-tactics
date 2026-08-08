// @ts-nocheck - source-structure guard; vitest runs this through esbuild.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const editorDocumentSource = readFileSync(new URL('../net/editorDocuments.ts', import.meta.url), 'utf8');

describe('level editor persistence safety UI', () => {
  it('surfaces a persistence emergency outside the Status and History layer bodies', () => {
    const banner = source.indexOf('data-testid="le-persistence-emergency"');
    const historyBody = source.indexOf("{layer === 'history' ? (");
    const statusBody = source.indexOf(") : layer === 'status' ? (", historyBody);
    expect(banner).toBeGreaterThan(0);
    expect(historyBody).toBeGreaterThan(banner);
    expect(statusBody).toBeGreaterThan(banner);
  });

  it('offers an explicit recovery acknowledgement instead of a permanent sticky conflict', () => {
    expect(source).toContain('data-testid="le-keep-recovered-work"');
    expect(source).toContain('acknowledgeScopedLevelEditorRecoveryConflict');
    expect(source).toContain("setCloudSaveState('pending')");
  });

  it('puts both recovery exports directly in the editor-wide interruption', () => {
    expect(source).toContain('data-testid="le-download-browser-recovery-banner"');
    expect(source).toContain('data-testid="le-download-cloud-copy-banner"');
    expect(source).toContain("kind: 'level-editor-browser-recovery'");
    expect(source).toContain("kind: 'level-editor-cloud-working-copy'");
  });

  it('restores retained history only as a new private working-copy revision', () => {
    expect(source).toContain('Working-copy history');
    expect(source).toContain('restoreEditorDocumentRevision');
    expect(source).toContain('The canonical saved position was not changed.');
    expect(source).toContain('Preserve any edit still inside the former debounce window');
    expect(source).toContain('editorDocument?.document_id, editorDocument?.revision, layer');
  });

  it('keeps working-copy history in History and out of Status', () => {
    const historyBody = source.indexOf("{layer === 'history' ? (");
    const statusBody = source.indexOf(") : layer === 'status' ? (", historyBody);
    const statusEnd = source.indexOf(') : levelArtworkWorkspace ? (', statusBody);
    const history = source.slice(historyBody, statusBody);
    const status = source.slice(statusBody, statusEnd);

    expect(history).toContain('data-testid="le-history-overview"');
    expect(history).toContain('Working-copy history');
    expect(status).not.toContain('data-testid="le-browser-recovery"');
    expect(status).not.toContain('Working-copy history');
    expect(status).toContain('data-testid="le-save"');
  });

  it('names the retained checkpoint created when an AI artwork slot is archived', () => {
    expect(editorDocumentSource).toContain("| 'generation-attempt-archive'");
    expect(source).toContain("'generation-attempt-archive': 'Archived AI artwork slot'");
  });

  it('does not autosave merely because a stored Level needs editor projection', () => {
    expect(source).toContain('const documentSig = normalizedLevelEditorSignature(doc.level)');
    expect(source).not.toMatch(/lastCloudSyncedSigRef\.current = levelEditorLevelSignature\([^\n]*\.level\)/);
    expect(source).toContain('const serverSignature = normalizedLevelEditorSignature(serverDocument.level)');
    expect(source).toContain('const acknowledgedSig = normalizedLevelEditorSignature(doc.level)');
  });

  it('hydrates document loads through the complete board-state primitive', () => {
    const applyDocumentStart = source.indexOf('const applyLevelDocument =');
    const commitBoardStart = source.indexOf('const commitEditorBoard =', applyDocumentStart);
    const applyDocument = source.slice(applyDocumentStart, commitBoardStart);
    expect(applyDocument).toContain('const board = levelToEditorBoard(level)');
    expect(applyDocument).toContain('applyEditorBoard(board)');
    expect(applyDocument).not.toContain('setBoardSubterrain');

    const applyBoardStart = source.indexOf('const applyEditorBoard =');
    const applyBoard = source.slice(applyBoardStart, applyDocumentStart);
    expect(applyBoard).toContain('setBoardSubterrain(board.subterrain ?? {})');
  });

  it('mounts an acknowledged server body into departure-flush refs before advancing its revision', () => {
    const mountStart = source.indexOf('const mountAcknowledgedWorkingCopy =');
    const mutationErrorStart = source.indexOf('const handlePredrawnVersionMutationError', mountStart);
    const mount = source.slice(mountStart, mutationErrorStart);
    const candidateUpdate = mount.indexOf('currentCandidateRef.current = latest.level');
    const signatureUpdate = mount.indexOf('currentSigRef.current = latestSignature');
    const boardUpdate = mount.indexOf('currentEditorBoardRef.current = levelToEditorBoard(latest.level)');
    const revisionUpdate = mount.indexOf('documentRevisionRef.current = latest.revision');

    expect(candidateUpdate).toBeGreaterThan(-1);
    expect(signatureUpdate).toBeGreaterThan(candidateUpdate);
    expect(boardUpdate).toBeGreaterThan(signatureUpdate);
    expect(revisionUpdate).toBeGreaterThan(boardUpdate);
  });

  it('reports an autosave 401 as a sign-out instead of a generic write failure', () => {
    const autosaveStart = source.indexOf('const request = autosaveEditorDocument(');
    const autosaveEnd = source.indexOf('autosavePromiseRef.current = request;', autosaveStart);
    const autosave = source.slice(autosaveStart, autosaveEnd);
    const signOut = autosave.indexOf('if (reportAuthSessionFailure(error)) {');
    const genericError = autosave.indexOf("setCloudSaveState('error')");

    expect(signOut).toBeGreaterThan(-1);
    expect(autosave.indexOf('enterCloudSignOut()')).toBeGreaterThan(signOut);
    // The sign-out branch has to be reached before anything can latch the generic error state,
    // which is what previously stopped autosave for the rest of the session.
    expect(genericError).toBeGreaterThan(signOut);
  });

  it('keeps an open working copy mounted and buffering when its sign-in expires', () => {
    const resolveStart = source.indexOf('if (!sharedAuthStatus) return undefined;');
    const teardown = source.indexOf('setEditAuthorityState(\'checking\');', resolveStart);
    const guard = source.slice(resolveStart, teardown);

    // Pausing must be decided BEFORE document resolution tears the session down, otherwise the
    // signed-out branch blocks the board and every edit since the expiry is stranded in RAM.
    expect(guard).toContain('isInterruptedByCloudSignOut({');
    expect(guard).toContain('documentOpen: Boolean(editorDocumentRef.current)');
    expect(guard).toContain('enterCloudSignOut();');
    expect(guard).toContain('shouldResumeInterruptedCloudSync({');
    expect(guard).toContain('void resumeInterruptedCloudSync();');
  });

  it('addresses the browser recovery by the document owner, not the live session', () => {
    expect(source).toContain('documentOwnerEmailRef.current = ownerEmail;');
    expect(source).toContain('? activeOwnerEmail() || undefined');
    expect(source).toMatch(/const activeOwnerEmail = \(\): string => \(\s*me\?\.email\?\.trim\(\)\.toLowerCase\(\) \|\| documentOwnerEmailRef\.current \|\| ''/);
  });

  it('resumes the mounted document without repainting it from the server body', () => {
    const resumeStart = source.indexOf('const resumeInterruptedCloudSync =');
    const resumeEnd = source.indexOf('const mountAcknowledgedWorkingCopy =', resumeStart);
    const resume = source.slice(resumeStart, resumeEnd);

    expect(resume).toContain('openEditorDocumentEditSession(');
    expect(resume).toContain('lastCloudSyncedSigRef.current = normalizedLevelEditorSignature(server.level)');
    expect(resume).toContain("setCloudSaveState(server.baseline_conflict ? 'conflict' : 'pending')");
    // applyLevelDocument here would paint the pre-sign-out body over the live editor.
    expect(resume).not.toContain('applyLevelDocument');
  });

  it('offers an unadopted browser branch instead of leaving it addressable only from storage', () => {
    expect(source).toContain('data-testid="le-preserved-branch-offer"');
    expect(source).toContain('data-testid="le-restore-preserved-branch"');
    expect(source).toContain('data-testid="le-discard-preserved-branch"');
    expect(source).toContain('shouldOfferPreservedEditorBranch({');
    expect(source).toContain('const restorePreservedBranchOffer = (): void => {');
    // The export must fall back to the offered branch; a retired page session owns no scoped draft.
    expect(source).toContain('}) ?? preservedBranchOffer?.draft ?? null;');
  });

  it('gives the signed-out pause its own recoverable action and state', () => {
    expect(source).toContain('data-testid="le-sign-in-resume-banner"');
    expect(source).toContain('data-testid="le-sign-in-resume"');
    expect(source).toContain("cloudSaveState === 'signed-out'");
    expect(source).toContain('const signInToResumeCloudSync = (): void => {');
    // With no browser recovery the live board is the only copy, so sign-in must not navigate away.
    expect(source).toContain('if (localBackupAvailable === false) {');
  });
});
