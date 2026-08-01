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
const ataraxiaSelector = readFileSync(new URL('./AtaraxiaSelector.tsx', import.meta.url), 'utf8');

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

  it('lands the installed Play entry on the complete Continue surface', () => {
    expect(mainMenu).toContain('play: PLAY_SELECTOR_ROOT');
    // The installed root remains a compatibility address; settled activity
    // authority canonicalizes it to Continue and its most recent activity.
    expect(playMenu).toContain("navigateApp(PLAY_CONTINUE_SELECTOR_HREF, { replace: true, scroll: false })");
    expect(playMenu).not.toContain('navigateApp(PLAY_SKIRMISH_SELECTOR_HREF');
    expect(playMenu).toContain("playHubSelection(path) ?? { mode: 'hub' }");
    expect(playMenu).toContain('resumeInventory.defaultMode');
    expect(playMenu).toContain('playContinueSelectorHref(resumeInventory.defaultMode)');
    expect(playMenu).toContain('const continueLandingSettled =');
    expect(playMenu).toContain('&& continueLandingSettled');
    expect(playMenu).not.toContain('play-hub-neutral');
    expect(style).toContain('.play-choice-row:not(.is-selected):not(.is-disabled):hover');
    expect(style).not.toContain('.run-choice-row');
  });

  it('pins descriptor-free Continue, Skirmish, Run, and Levels above Campaigns', () => {
    const fixed = playMenu.indexOf('className="play-source-fixed"');
    const campaigns = playMenu.indexOf('className="play-campaign-region"');
    expect(fixed).toBeGreaterThan(-1);
    expect(campaigns).toBeGreaterThan(fixed);
    expect(playMenu).toContain('<KitScroll className="play-campaign-scroll">');
    expect(playMenu).toContain('testId="play-continue"');
    expect(playMenu).toContain('label="Continue"');
    expect(playMenu).not.toMatch(/label="Continue"\s+detail=/);
    expect(playMenu).toContain('index={0}');
    expect(playMenu).toContain('index={1}');
    expect(playMenu).toContain('index={2}');
    expect(playMenu).toContain('index={3}');
    expect(playMenu).toContain('index={index + 4}');
  });

  it('makes Continue a four-mode availability surface with a selected fourth-column Play action', () => {
    const playContinue = readFileSync(new URL('./playContinue.ts', import.meta.url), 'utf8');
    expect(playContinue).toContain("{ mode: 'campaign', label: 'Campaign'");
    expect(playContinue).toContain("{ mode: 'skirmish', label: 'Skirmish'");
    expect(playContinue).toContain("{ mode: 'run', label: 'Run'");
    expect(playContinue).toContain("{ mode: 'levels', label: 'Levels'");
    expect(playContinue).toContain('defaultMode: mostRecent?.mode ?? null');
    expect(playMenu).toContain("option.activity?.summary ?? 'Nothing to continue'");
    expect(playMenu).toContain('data-testid={`continue-choice-${option.mode}`}');
    expect(playMenu).toContain('data-testid="continue-detail"');
    expect(playMenu).toContain('to={selected.playHref}><span>Play</span>');
    expect(playMenu).toContain('<ContinuePanel inventory={resumeInventory} choice={selectedContinueChoice} />');
  });

  it('keeps ordinary Run preparation separate from Continue', () => {
    expect(playMenu).toContain('data-testid="run-choice-current"');
    expect(playMenu).toContain('to={PLAY_RUN_CURRENT_SELECTOR_HREF}');
    expect(playMenu).toContain('<h4>Current Run</h4>');
    expect(playMenu).toContain("'settings-row play-choice-row'");
    expect(playMenu).toContain('data-testid="run-detail-current"');
    expect(playMenu).toContain('to="/run"><span>Play</span></ChromeNavButton>');
    expect(playMenu).not.toContain('run-current-summary');
    expect(playMenu).not.toContain('>Continue Run<');
  });

  it('keeps new-Run setup in the right detail column with one scrollable Ataraxia dropdown', () => {
    expect(playMenu).not.toContain('Roguelike chess');
    expect(playMenu).not.toContain('Carry one persistent army');
    expect(playMenu).not.toContain('<h3>{run.war.name}</h3>');
    expect(playMenu).not.toContain("run.war.description || 'Active War'");
    expect(playMenu).toContain('data-testid="run-choice-new"');
    expect(playMenu).toContain('to={PLAY_RUN_NEW_SELECTOR_HREF}');
    expect(playMenu).toContain('data-testid="run-detail-new"');
    expect(playMenu).toContain("sceneTransitionTargetAttributes('run-detail', 'contents')");
    expect(playMenu).toMatch(/choice === 'new'[\s\S]*?<AtaraxiaSelector/);
    expect(ataraxiaSelector).toContain('<HouseSelect');
    expect(ataraxiaSelector).toContain('disabled: locked');
    expect(ataraxiaSelector).toContain('{definition.label} — {definition.title}');
    expect(ataraxiaSelector).toContain('Complete Ataraxia 0 to unlock');
    expect(ataraxiaSelector).toContain('<p className="run-ataraxia-effect">{ATARAXIA_BY_TIER[value].effect}</p>');
    expect(ataraxiaSelector).not.toContain('role="radiogroup"');
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
    expect(playMenu).toContain("hasDetailPreview ? ' has-detail-preview' : ''");
    expect(playMenu).toContain("selectedLevel ? ' has-level-preview' : ''");
    expect(style).toContain('.play-scene-authority.has-detail-preview .play-action-col');
  });

  it('serializes replacement of an active Run before entering the Run scene', () => {
    expect(playMenu).toContain('if (starting || syncing || !eligible.length) return;');
    expect(playMenu).toContain("tone: 'danger'");
    expect(playMenu).toMatch(/await abandon\(\);[\s\S]*?replace\(createRun\([\s\S]*?navigateApp\('\/run'\)/);
    expect(playMenu).toContain("<span>{starting ? 'Starting…' : 'Start Run'}</span>");
  });
});
