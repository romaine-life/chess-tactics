// @ts-nocheck -- source-structure regression guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const editor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const pickerMountStart = editor.indexOf('{predrawnPickerOpen && predrawnPreview');
const pickerMountEnd = editor.indexOf('{predrawnGenerationFrameOpen', pickerMountStart);
const pickerMount = editor.slice(pickerMountStart, pickerMountEnd);

describe('Level Editor pre-drawn picker mount', () => {
  it('waits for hydration without silently hiding candidate review in a follower tab', () => {
    expect(pickerMountStart).toBeGreaterThan(-1);
    expect(pickerMountEnd).toBeGreaterThan(pickerMountStart);
    expect(pickerMount).toContain(
      '{predrawnPickerOpen && predrawnPreview && editorReady ? (',
    );
    expect(pickerMount).not.toContain('editorSessionCanWrite');
  });

  it('reinitializes picker-owned state when the candidate or hydrated board size changes', () => {
    expect(pickerMount).toContain('key={`${predrawnPreview}:${boardCols}x${boardRows}`}');
    expect(pickerMount).toContain('src={predrawnPreview}');
    expect(pickerMount).toContain('columns={boardCols}');
    expect(pickerMount).toContain('rows={boardRows}');
  });

  it('exposes the owner-scoped version instrument and distinguishes mounted input from installed output', () => {
    expect(editor).toContain('{targetLevelId && editorDocument ? (');
    expect(editor).not.toContain('{isAdmin && targetLevelId ? (');
    expect(editor).toContain('initialSourceSrc={predrawnPreview ?? (currentVersionedPredrawnSurface ? undefined : editorPredrawnPlate?.src)}');
    expect(editor).toContain('canonicalSurface={canonicalVersionedPredrawnSurface}');
    expect(editor).toContain('workingCopySyncState={cloudSaveState}');
  });

  it('does not expose the retired Codex handoff from the editor picker', () => {
    expect(pickerMount).toContain('showCodexHandoff={false}');
  });
});
