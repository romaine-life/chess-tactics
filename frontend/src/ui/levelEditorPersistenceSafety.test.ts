// @ts-nocheck - source-structure guard; vitest runs this through esbuild.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');

describe('level editor persistence safety UI', () => {
  it('surfaces a persistence emergency outside the Status-only layer body', () => {
    const banner = source.indexOf('data-testid="le-persistence-emergency"');
    const statusBody = source.indexOf("{layer === 'status' ? (");
    expect(banner).toBeGreaterThan(0);
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
    expect(applyDocument).toContain('applyEditorBoard(levelToEditorBoard(level))');
    expect(applyDocument).not.toContain('setBoardSubterrain');

    const applyBoardStart = source.indexOf('const applyEditorBoard =');
    const applyBoard = source.slice(applyBoardStart, applyDocumentStart);
    expect(applyBoard).toContain('setBoardSubterrain(board.subterrain ?? {})');
  });
});
