// @ts-nocheck - source-structure guard; vitest runs this through esbuild.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const editorDocumentSource = readFileSync(new URL('../net/editorDocuments.ts', import.meta.url), 'utf8');

describe('level editor persistence safety UI', () => {
  it('surfaces a persistence emergency outside the Status and Recovery layer bodies', () => {
    const banner = source.indexOf('data-testid="le-persistence-emergency"');
    const recoveryBody = source.indexOf("{layer === 'recovery' ? (");
    const statusBody = source.indexOf(") : layer === 'status' ? (", recoveryBody);
    expect(banner).toBeGreaterThan(0);
    expect(recoveryBody).toBeGreaterThan(banner);
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

  it('keeps recovery controls in Recovery and out of Status', () => {
    const recoveryBody = source.indexOf("{layer === 'recovery' ? (");
    const statusBody = source.indexOf(") : layer === 'status' ? (", recoveryBody);
    const statusEnd = source.indexOf(') : levelArtworkWorkspace ? (', statusBody);
    const recovery = source.slice(recoveryBody, statusBody);
    const status = source.slice(statusBody, statusEnd);

    expect(recovery).toContain('data-testid="le-recovery-overview"');
    expect(recovery).toContain('data-testid="le-download-browser-recovery"');
    expect(recovery).toContain('Working-copy history');
    expect(status).not.toContain('data-testid="le-browser-recovery"');
    expect(status).not.toContain('data-testid="le-download-browser-recovery"');
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
});
