// @ts-nocheck — source-level regression guard for Editor navigation placement.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

describe('Campaign and War Editor libraries', () => {
  it('keeps one invariant Editor rail while Wars changes only the adjacent workspace', () => {
    const campaign = read('./CampaignEditor.tsx');
    const war = read('./WarEditor.tsx');
    const mainMenu = read('./MainMenu.tsx');

    expect(mainMenu).toContain('<CampaignEditor embedded path={path} search={search} sceneInstanceKey={sceneInstanceKey} />');
    expect(mainMenu).not.toContain("path === '/editor/wars' ? <WarEditor");
    expect(campaign).toContain('title="Wars"');
    expect(campaign).toContain('active={isWarsSelected}');
    expect(campaign).toContain('onSelect={selectWarsCollection}');
    expect(campaign).toContain('{isWarsSelected ? <WarEditor embedded /> : <>');
    expect(campaign).toContain("sceneTransitionTargetAttributes('editor-shell', 'contents')");
    expect(campaign).toContain("navigateApp(editorCampaignHref('/editor', campaignId))");
    expect(campaign).not.toContain('setSelectedCollection');
    expect(campaign.indexOf('<p className="campaign-rail-group">Workspace</p>')).toBeLessThan(campaign.indexOf('title="Wars"'));
    expect(campaign.indexOf('title="Wars"')).toBeLessThan(campaign.indexOf('title="Skirmish profiles"'));

    expect(war).toContain('<SettingsSection title="Wars">');
    expect(war).not.toContain('ce-editor-rail');
    expect(war).not.toContain('ce-rail-actions');
  });

  it('selects one default War and participates as content beneath the Editor scene', () => {
    const war = read('./WarEditor.tsx');
    expect(war).toContain("useSceneParticipant('war-editor-content', loaded ? 'painted' : 'loading')");
    expect(war).toContain("state.wars.find((war) => war.origin !== 'official') ?? state.wars[0]");
  });
});
