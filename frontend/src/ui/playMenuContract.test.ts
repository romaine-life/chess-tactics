// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainMenu = readFileSync(new URL('./MainMenu.tsx', import.meta.url), 'utf8');
const playMenu = readFileSync(new URL('./PlayMenu.tsx', import.meta.url), 'utf8');
const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const campaignEditor = readFileSync(new URL('./CampaignEditor.tsx', import.meta.url), 'utf8');
const headerAccountCluster = readFileSync(new URL('./shared/HeaderAccountCluster.tsx', import.meta.url), 'utf8');
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
      .toContain("['play', 'Play', '/play/select']");
  });

  it('lands Play on the resumable activity or the neutral hub root (ADR-0256)', () => {
    expect(mainMenu).toContain('play: PLAY_SELECTOR_ROOT');
    // Canonicalization and the missing-campaign fallback return to the neutral
    // root; nothing in the landing path manufactures a skirmish selection.
    expect(playMenu).toContain("navigateApp(PLAY_SELECTOR_ROOT, { replace: true, scroll: false })");
    expect(playMenu).not.toContain('navigateApp(PLAY_SKIRMISH_SELECTOR_HREF');
    expect(playMenu).toContain("playHubSelection(path) ?? { mode: 'hub' }");
    // The root resumes the one in-progress activity only after content and Run
    // authority settle, and holds composition while that decision is pending.
    expect(playMenu).toContain('if (selection.mode !== \'hub\' || loading || !runHydrated) return;');
    expect(playMenu).toContain('if (resumable) navigateApp(resumable.href, { replace: true, scroll: false });');
    expect(playMenu).toContain('const hubLandingSettled =');
    expect(playMenu).toContain('&& hubLandingSettled');
    expect(playMenu).toContain('play-hub-neutral');
  });

  it('leads with a resumable activity, then pins Skirmish, Run, and Levels above Campaigns', () => {
    const fixed = playMenu.indexOf('className="play-source-fixed"');
    const campaigns = playMenu.indexOf('className="play-campaign-region"');
    expect(fixed).toBeGreaterThan(-1);
    expect(campaigns).toBeGreaterThan(fixed);
    expect(playMenu).toContain('<KitScroll className="play-campaign-scroll">');
    expect(playMenu).toContain('testId="play-continue"');
    expect(playMenu).toContain("label={resumable.label}");
    expect(playMenu).toContain("detail={resumable.detail}");
    expect(playMenu).toContain('index={0}');
    expect(playMenu).toContain('index={resumable ? 1 : 0}');
    expect(playMenu).toContain('index={resumable ? 2 : 1}');
    expect(playMenu).toContain('index={resumable ? 3 : 2}');
    expect(playMenu).toContain('index={index + 3 + (resumable ? 1 : 0)}');
  });

  it('selects the Run submenu before its nested Play action enters the active Run', () => {
    expect(readFileSync(new URL('./playContinue.ts', import.meta.url), 'utf8'))
      .toContain('href: PLAY_RUN_SELECTOR_HREF');
    expect(playMenu).toContain('to="/run">Play</NavButton>');
    expect(playMenu).not.toContain('to="/run">Continue Run</NavButton>');
  });

  it('resolves Play rail icons from installed drawable membership, not retired path-shaped app-ui roles', () => {
    expect(playMenu).toContain("drawableAssets('menu-mode')");
    expect(playMenu).toContain("installedUiMedia('ui-kit-icons-design-index-png')");
    expect(playMenu).not.toContain('ui-main-menu-icons-carved-solo-skirmish-png');
    expect(playMenu).not.toContain('ui-main-menu-icons-carved-level-editor-png');
    expect(playMenu).not.toContain('ui-main-menu-icons-carved-lobbies-png');
  });

  it('resolves every shared carved navigation icon from its installed menu record', () => {
    expect(campaignEditor).toContain("drawableAssets('menu-mode')");
    expect(campaignEditor).toContain("asset.behavior.value === 'campaign-editor'");
    expect(campaignEditor).not.toContain('ui-main-menu-icons-carved-campaign-editor-png');
    expect(headerAccountCluster).toContain("requiredDrawableRole('menu-mode', 'settings')");
    expect(headerAccountCluster).not.toContain('ui-main-menu-icons-carved-settings-png');
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

  it('renders only from the director-mounted path and returns standalone play to Levels', () => {
    expect(playMenu).toContain('if (!playHubSelection(path))');
    expect(playMenu.match(/if \(!isPlaySelectorPath\(path\)\) return/g)).toHaveLength(1);
    expect(playMenu).toContain('playHubSelection(path) ??');
    expect(playMenu).not.toContain('APP_NAVIGATION_EVENT');
    expect(playMenu).not.toContain('window.location');
    expect(playMenu).not.toContain('setSelection');
    expect(playMenu).toContain('playSkirmishLevelHref(level.id, PLAY_LEVELS_SELECTOR_HREF)');
  });

  it('keeps level selection stable and delegates its paint wait to the preview', () => {
    expect(playMenu).toContain('const selection: PlayHubSelection = useMemo(');
    expect(playMenu).toContain('() => playHubSelection(path) ??');
    expect(playMenu).toContain('[path],');
    expect(playMenu).not.toContain('useEffect(() => setLevelPreviewPainted(false)');
    expect(playMenu).not.toContain('&& (!selectedLevel || levelPreviewPainted)');
    expect(playMenu).not.toContain("selectedLevelId ?? '',");
    expect(playMenu).toContain('<LevelPreviewColumn');
    expect(playMenu).toContain("selectedLevel ? ' has-level-preview' : ''");
    expect(style).toContain('.play-scene-authority.has-level-preview .play-action-col');
  });

  it('serializes replacement of an active Run before entering the Run scene', () => {
    expect(playMenu).toContain('if (starting || syncing || !eligible.length) return;');
    expect(playMenu).toContain("tone: 'danger'");
    expect(playMenu).toMatch(/await abandon\(\);[\s\S]*?replace\(createRun\([\s\S]*?navigateApp\('\/run'\)/);
    expect(playMenu).toContain("starting ? 'Starting…' : run ? 'Start a new Run' : 'Start Run'");
  });
});
