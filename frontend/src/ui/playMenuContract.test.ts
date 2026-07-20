// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainMenu = readFileSync(new URL('./MainMenu.tsx', import.meta.url), 'utf8');
const playMenu = readFileSync(new URL('./PlayMenu.tsx', import.meta.url), 'utf8');
const profiles = readFileSync(new URL('./skirmishProfiles.ts', import.meta.url), 'utf8');
const livePlay = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');

describe('unified Play menu contract (ADR-0074)', () => {
  it('has one top-level Play entry and no retired picker destinations', () => {
    expect(mainMenu).toContain("drawableAssets('menu-mode')");
    expect(mainMenu).not.toMatch(/MENU_TABS[^=]*=\s*\[/);
    expect(mainMenu).not.toContain("href: '/campaign'");
    expect(mainMenu).not.toContain("'solo-skirmish': '/skirmish'");
    expect(mainMenu).not.toContain("ShellDest = 'settings' | 'campaign'");
    expect(readFileSync(new URL('../test/drawableCatalog.ts', import.meta.url), 'utf8'))
      .toContain("['play', 'Play', '/play/select/skirmish'");
  });

  it('pins Skirmish and Levels above one drawn-scroll Campaign collection', () => {
    const fixed = playMenu.indexOf('className="play-source-fixed"');
    const campaigns = playMenu.indexOf('className="play-campaign-region"');
    expect(fixed).toBeGreaterThan(-1);
    expect(campaigns).toBeGreaterThan(fixed);
    expect(playMenu).toContain('<KitScroll className="play-campaign-scroll">');
    expect(playMenu).toContain('index={0}');
    expect(playMenu).toContain('index={1}');
    expect(playMenu).toContain('index={index + 2}');
  });

  it('resolves Play rail icons from installed drawable membership, not retired path-shaped app-ui roles', () => {
    expect(playMenu).toContain("drawableAssets('menu-mode')");
    expect(playMenu).toContain("installedUiMedia('ui-kit-icons-design-index-png')");
    expect(playMenu).not.toContain('ui-main-menu-icons-carved-solo-skirmish-png');
    expect(playMenu).not.toContain('ui-main-menu-icons-carved-level-editor-png');
    expect(playMenu).not.toContain('ui-main-menu-icons-carved-lobbies-png');
  });

  it('deletes the split picker implementations instead of retaining parallels', () => {
    expect(existsSync(new URL('./Campaign.tsx', import.meta.url))).toBe(false);
    expect(existsSync(new URL('./SkirmishMapPicker.tsx', import.meta.url))).toBe(false);
  });

  it('does not synthesize missing Skirmish content or a missing live level', () => {
    expect(profiles).not.toContain('createBlankLevel');
    expect(profiles).not.toContain('ensureDefaultSkirmishProfileLevel');
    expect(livePlay).not.toContain('startOrResume(routeLevelId, null)');
    expect(livePlay).not.toContain("routeParams.get('random')");
    expect(livePlay).toContain('This level isn’t available');
  });

  it('distinguishes unavailable private content from a settled empty workspace', () => {
    const normalized = playMenu.replace(/\s+/g, ' ');
    expect(playMenu).toContain('setUserWorkspaceAvailable(isUserWorkspaceAvailable(result.userWorkspace))');
    expect(playMenu).toContain('officialAvailable && userWorkspaceAvailable && levels.length === 0');
    expect(playMenu).toContain('officialAvailable && userWorkspaceAvailable && campaigns.length === 0');
    expect(normalized).toContain("!loading && officialAvailable && userWorkspaceAvailable && selection.mode === 'campaign'");
    expect(playMenu).toContain('Your workspace is unavailable');
  });

  it('canonicalizes invalid selector paths and returns standalone play to Levels', () => {
    expect(playMenu).toContain('if (!playHubSelection(path))');
    expect(playMenu.match(/if \(!isPlaySelectorPath\(path\)\) return/g)).toHaveLength(2);
    expect(playMenu).toContain('if (!nextSelection)');
    expect(playMenu).toContain('playSkirmishLevelHref(level.id, PLAY_LEVELS_SELECTOR_HREF)');
  });
});
