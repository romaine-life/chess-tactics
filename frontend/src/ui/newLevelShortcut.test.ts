// @ts-nocheck - node built-ins are untyped in the app tsconfig; vitest runs this
// through esbuild, matching the repo's existing source-structure guard tests.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const menuSource = readFileSync(new URL('./MainMenu.tsx', import.meta.url), 'utf8');
const editorSource = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const campaignEditorSource = readFileSync(new URL('./CampaignEditor.tsx', import.meta.url), 'utf8');

describe('new-level shortcut and campaign assignment controls', () => {
  it('pins one New Level shortcut above New Campaign in the Editor rail', () => {
    expect(menuSource).toContain("new Set(['solo-skirmish', 'level-editor'])");
    expect(menuSource).not.toContain("'level-editor': '/editor/level?returnTo=%2F'");
    expect(menuSource).not.toContain("'level-editor': 'New Level'");

    const newLevelIndex = campaignEditorSource.indexOf('data-testid="new-level-shortcut"');
    const newCampaignIndex = campaignEditorSource.indexOf('data-testid="new-campaign"');
    expect(newLevelIndex).toBeGreaterThan(-1);
    expect(newCampaignIndex).toBeGreaterThan(newLevelIndex);
    expect(campaignEditorSource.match(/>\+ New Level<\/SettingsButton>/g)).toHaveLength(1);
    expect(campaignEditorSource).toContain(
      'href={`/editor/level?returnTo=${encodeURIComponent(CAMPAIGN_EDITOR_RETURN_TO)}`}',
    );
  });

  it('renders the campaign selector only inside the admin gate', () => {
    expect(editorSource).toMatch(
      /\{isAdmin \? \(\s*<div className="le-status-name-field le-status-campaign-field">[\s\S]*?data-testid="le-campaign-select"/,
    );
    expect(editorSource).toContain('const dirty = levelDirty || campaignAssignmentDirty;');
    expect(editorSource).toContain("const [savedCampaignAssignmentId, setSavedCampaignAssignmentId] = useState('');");
    expect(editorSource).toContain('const canSave = saveContextReady &&');
    expect(editorSource).toContain('const saved = await saveEditorDocument(');
    expect(editorSource).toContain('campaignAssignmentId || null,');
    expect(editorSource).toContain('useCampaigns.getState().assignLevelToCampaign(doc.level_id, campaignAssignmentId || null);');
    expect(editorSource).toContain('levelEditorDraftKey({ documentId: doc.document_id, ownerEmail })');
  });

  it('keeps destructive workspace controls locked when private hydration is unavailable', () => {
    expect(campaignEditorSource).toContain('disabled={!userWorkspaceReady}');
    expect(campaignEditorSource).toContain('disabled={!userWorkspaceReady || !userDirty || userSaveConflict}');
    expect(campaignEditorSource).toContain('const readOnly = !selectedTierReady ||');
  });
});
