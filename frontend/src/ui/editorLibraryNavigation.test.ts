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
    expect(campaign).toContain('<EditorContentSceneSlot');
    expect(campaign).toContain("navigateApp(editorCampaignHref('/editor', campaignId))");
    expect(campaign).not.toContain('setSelectedCollection');
    expect(campaign.indexOf('<p className="campaign-rail-group">Workspace</p>')).toBeLessThan(campaign.indexOf('title="Wars"'));
    // Wars, then the Unassigned catch-all. Skirmish profiles is retired (ADR-0529).
    expect(campaign.indexOf('title="Wars"')).toBeLessThan(campaign.indexOf('count={unassignedLevels.length}'));
    expect(campaign).not.toContain('Skirmish profiles');

    expect(war).toContain('<SettingsSection title="Wars">');
    expect(war).not.toContain('ce-editor-rail');
    expect(war).not.toContain('ce-rail-actions');
  });

  it('gives War Battles the same authored level row the Campaign library uses', () => {
    const campaign = read('./CampaignEditor.tsx');
    const war = read('./WarEditor.tsx');
    // A Battle is a level in an ordered container, so both libraries mount one row
    // primitive — thumbnail, goal line, and carved edit / reorder / delete (ADR-0529).
    for (const source of [campaign, war]) {
      expect(source).toContain("from './shared/EditorLevelRow'");
      expect(source).toContain('<EditorLevelRow');
    }
    expect(war).toContain('editHref={level ? editBattleBoardHref(selectedWar.id, battle.levelId) : undefined}');
    expect(war).toContain('onDelete={level ? () => { void confirmDeleteBattle(level); } : undefined}');
    expect(war).toContain('canMoveUp={index > 0}');
    expect(war).toContain('canMoveDown={index < orderedBattles.length - 1}');
    // No typed arrow glyphs: the reorder controls draw the installed carved chevrons.
    expect(war).not.toContain("icon: '↑'");
    expect(war).not.toContain("icon: '↓'");
  });

  it('does not advertise campaigns in the rail, and does not retire them either', () => {
    const campaign = read('./CampaignEditor.tsx');
    // Runs replaced campaigns as how the game is played (ADR-0529), so a standing campaign
    // row is a button nobody presses. The rail lists only the campaign the ADDRESS names,
    // which keeps + New Campaign and a direct ?campaign= link landing somewhere visible.
    expect(campaign).toContain('const railCampaigns = campaigns.filter((campaign) => campaign.id === routeCampaignId);');
    expect(campaign).toContain('const officialCampaigns = railCampaigns.filter');
    expect(campaign).toContain('const userCampaigns = railCampaigns.filter');
    // A bare /editor must not auto-open a campaign — that would put the row back.
    expect(campaign).toContain('useCampaigns.setState({ selectedCampaignId: null, selectedLevelId: null });');
    expect(campaign).not.toContain("state.campaigns.find((c) => c.origin !== 'official') ?? state.campaigns[0]");
    // This is a display rule, not a retirement: the campaign editor, its verbs, and the
    // private quota over every campaign in the workspace all remain.
    expect(campaign).toContain("const ownCount = campaigns.filter((c) => c.origin !== 'official').length;");
    expect(campaign).toContain('data-testid="new-campaign"');
    expect(campaign).toContain('<SettingsSection title="Campaign Actions">');
    // Stone continuity counts the rows actually drawn.
    expect(campaign).toContain('index={railCampaigns.length}');
    expect(campaign).toContain('index={railCampaigns.length + 1}');
  });

  it('selects one default War and participates as content beneath the Editor scene', () => {
    const war = read('./WarEditor.tsx');
    expect(war).toContain("useSceneParticipant('war-editor-content', loaded ? 'painted' : 'loading')");
    expect(war).toContain("state.wars.find((war) => war.origin !== 'official') ?? state.wars[0]");
  });
});
