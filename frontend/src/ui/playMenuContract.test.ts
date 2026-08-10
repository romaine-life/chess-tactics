// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainMenu = readFileSync(new URL('./MainMenu.tsx', import.meta.url), 'utf8');
const playMenu = readFileSync(new URL('./PlayMenu.tsx', import.meta.url), 'utf8');
const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const campaignEditor = readFileSync(new URL('./CampaignEditor.tsx', import.meta.url), 'utf8');
const headerAccountCluster = readFileSync(new URL('./shared/HeaderAccountCluster.tsx', import.meta.url), 'utf8');
const livePlay = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');
const ataraxiaSelector = readFileSync(new URL('./AtaraxiaSelector.tsx', import.meta.url), 'utf8');
const authoredSceneSlots = readFileSync(new URL('./shell/AuthoredSceneSlot.tsx', import.meta.url), 'utf8');
const playModeAvailability = readFileSync(new URL('./playModeAvailability.ts', import.meta.url), 'utf8');

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

  it('lands the installed Play entry on Run preparation', () => {
    expect(mainMenu).toContain('play: PLAY_SELECTOR_ROOT');
    // The installed root remains a compatibility address; settled Run authority
    // canonicalizes it to the sole player-facing mode.
    expect(playMenu).toContain("navigateApp(PLAY_RUN_SELECTOR_HREF, { replace: true, scroll: false })");
    expect(playMenu).not.toContain('navigateApp(PLAY_SKIRMISH_SELECTOR_HREF');
    expect(playMenu).toContain("? { mode: 'run', choice: null }");
    expect(playMenu).toContain('const primaryRunLandingSettled =');
    expect(playMenu).toContain('&& primaryRunLandingSettled');
    expect(playMenu).not.toContain('play-hub-neutral');
    expect(style).toContain('.play-choice-row:not(.is-selected):not(.is-disabled):hover');
    expect(style).not.toContain('.run-choice-row');
  });

  it('removes the redundant source rail when Run is the only player-facing mode', () => {
    const fixed = playMenu.indexOf('className="play-source-fixed"');
    const campaigns = playMenu.indexOf('className="play-campaign-region"');
    expect(fixed).toBeGreaterThan(-1);
    expect(campaigns).toBeGreaterThan(fixed);
    expect(playModeAvailability).toMatch(/campaign:\s*false,[\s\S]*run:\s*true,[\s\S]*levels:\s*false,/);
    expect(playModeAvailability).toContain('export const PLAY_SOURCE_RAIL_ENABLED');
    expect(playMenu).toContain('{PLAY_SOURCE_RAIL_ENABLED ? <ApparatusRailColumn');
    expect(playMenu).toContain("' is-source-rail-collapsed'");
    expect(style).toContain('.play-scene-authority:not(.is-source-rail-collapsed).has-detail-preview .play-action-col');
    expect(playMenu).toContain('<KitScroll className="play-campaign-scroll">');
    expect(playMenu).toContain('testId="play-continue"');
    expect(playMenu).toContain('label="Continue"');
    expect(playMenu).toContain('index={playModeRailIndex(\'run\')}');
    expect(playMenu).toContain('index={playModeRailIndex(\'levels\')}');
    expect(playMenu).toContain('index={index + CAMPAIGN_RAIL_START_INDEX}');
  });

  it('keeps dormant Campaign and Levels implementations and direct routes intact', () => {
    const route = readFileSync(new URL('./playHubRoute.ts', import.meta.url), 'utf8');
    expect(playMenu).toContain('function CampaignTab(');
    expect(playMenu).toContain('<CampaignLevelsPanel');
    expect(playMenu).toContain('<StandaloneLevelsPanel');
    expect(route).toContain('export function playCampaignSelectorHref');
    expect(route).toContain("if (path === PLAY_LEVELS_SELECTOR_HREF) return { mode: 'levels' };");
    expect(route).toContain("return { mode: 'campaign', campaignId: decodeURIComponent(campaignMatch[1]) };");
  });

  it('resumes exactly one activity — the most recent — inside Continue’s own column (ADR-0356)', () => {
    const playContinue = readFileSync(new URL('./playContinue.ts', import.meta.url), 'utf8');
    // The inventory carries resumable work only — never a placeholder row per mode.
    expect(playContinue).toContain('activities: readonly ContinueActivity[]');
    expect(playContinue).toContain('defaultMode: ordered[0]?.mode ?? null');
    expect(playContinue).not.toContain('ContinueOption');
    expect(playMenu).not.toContain("?? 'Nothing to continue'");
    expect(playMenu).not.toContain('inventory.options');
    // Continue's action column is the resume card itself: facts plus one self-labeling Continue verb.
    expect(playMenu).toContain('const selected = inventory.activities[0] ?? null;');
    expect(playMenu).toContain('data-testid="continue-detail"');
    expect(playMenu).toContain('className="play-detail-facts"');
    expect(playMenu).toContain('to={selected.playHref}><span>Continue</span>');
    expect(playMenu).toContain('<ContinuePanel inventory={resumeInventory} />');
    expect(style).toContain('.continue-resume {');
    // No fourth column for Continue, so the action column must not narrow for one.
    expect(playMenu).toContain('const hasDetailPreview = Boolean(selectedLevel || hasRunDetail);');
    expect(playMenu).not.toContain('selectedContinueActivity');
    // Nothing else is offered here: no second activity, no mode list, no choice rows.
    expect(playMenu).not.toContain('continue-choice-');
    expect(playMenu).not.toContain('Also unfinished');
    // Any other Continue address is stale by construction and canonicalizes onto the one.
    expect(playMenu).toContain('if (path !== canonicalHref) navigateApp(canonicalHref, { replace: true, scroll: false });');
    // An empty Continue says so once instead of listing modes.
    expect(playMenu).toContain('data-testid="continue-empty"');
    expect(playMenu).toContain('<h4>Nothing to continue</h4>');
  });

  it('makes Run preparation the ordinary Play surface while retaining direct Continue', () => {
    expect(playMenu).toContain('data-testid="run-choice-current"');
    expect(playMenu).toMatch(/<ChromeNavButton[^>]*data-chrome-fill-surface=\{CHROME_LEAF_FILL_SURFACE\}[^>]*data-testid="run-choice-current"/);
    expect(playMenu).toContain('to={PLAY_RUN_CURRENT_SELECTOR_HREF}');
    expect(playMenu).toContain('<h4>Current Run</h4>');
    expect(playMenu).toContain("'settings-row play-choice-row'");
    expect(playMenu).toContain('data-testid="run-detail-current"');
    expect(playMenu).toContain('to="/run"><span>Play</span></ChromeNavButton>');
    // Every leaf control on the Run surface carries the oak leaf material (ADR-0433).
    // The Current Run detail's Play sits where Start Run sits on the sibling tab; a bare
    // one there frames the live vista instead of a button.
    expect(playMenu).toMatch(/<ChromeNavButton[^>]*data-chrome-fill-surface=\{CHROME_LEAF_FILL_SURFACE\}[^>]*to="\/run">/);
    expect(playMenu).not.toContain('run-current-summary');
    expect(playMenu).not.toContain('>Continue Run<');
    // The Current Run row is an availability surface, not an existence surface: with
    // no active Run it stays in place disabled (like Continue's "Nothing to continue"
    // rows), keeping the resume point spatially learnable.
    expect(playMenu).toContain('disabled={!presentedRun}');
    expect(playMenu).toContain("'No active Run'");
  });

  it('cuts the Run destinations from one plank instead of stamping one crop twice (ADR-0034/ADR-0063)', () => {
    // A leaf's installed oak is locally attached, so a row with no offset restarts the sheet
    // at 0. Two rows like that paint the identical crop — the repeated-texture look. Each row
    // instead samples the slice one plank running down the list would give it, the same
    // recovery the rail tabs use for the `fixed` attachment Chromium forced us to drop.
    expect(style).toMatch(/\.play-choice-row\s*\{[\s\S]*?--play-choice-row-surface-pitch:\s*calc\(96px \+ var\(--settings-section-rows-gap, 10px\)\);[\s\S]*?--chrome-surface-position-y:\s*calc\(var\(--play-choice-row-index, 0\) \* -1 \* var\(--play-choice-row-surface-pitch\)\);/);
    // The pitch may not restate the list gap — it has to step by exactly what layout steps by.
    expect(style).toMatch(/\.settings-section-rows\s*\{[\s\S]*?--settings-section-rows-gap:\s*10px;[\s\S]*?gap:\s*var\(--settings-section-rows-gap\);/);
    // Seats are owned by the panel, never counted off the DOM: a :nth-child ladder re-cuts the
    // plank the moment a "Loading Runs…" or "Runs unavailable" row joins the list.
    expect(style).not.toMatch(/\.play-choice-row:nth-child\(/);
    expect(playMenu).toContain('const PLAY_CHOICE_ROW_SEATS = { current: 0, new: 1 } as const;');
    expect(playMenu).toContain("['--play-choice-row-index' as string]: PLAY_CHOICE_ROW_SEATS.current");
    expect(playMenu).toContain("['--play-choice-row-index' as string]: PLAY_CHOICE_ROW_SEATS.new");
  });

  it('presents Run adoption as an unboxed decision group', () => {
    expect(playMenu).toContain('className="run-adoption-conflict"');
    expect(playMenu).toContain('data-testid="run-adoption-conflict"');
    expect(playMenu).not.toContain('<InnerChromeBox className="play-level-card" role="alert">');
    expect(style).toContain('.run-adoption-conflict {');
    // Unboxed does not mean unmaterialed: the two decision buttons are leaf controls over
    // the live vista, so they carry the same oak as every other Run leaf (ADR-0433).
    expect(playMenu).toMatch(/<ChromeButton[^>]*data-chrome-fill-surface=\{CHROME_LEAF_FILL_SURFACE\}[^>]*data-testid="run-keep-account"/);
    expect(playMenu).toMatch(/<ChromeButton[^>]*data-chrome-fill-surface=\{CHROME_LEAF_FILL_SURFACE\}[^>]*data-testid="run-adopt-browser"/);
  });

  it('keeps new-Run setup in the right detail column with one scrollable Ataraxia dropdown', () => {
    expect(playMenu).not.toContain('Roguelike chess');
    expect(playMenu).not.toContain('Carry one persistent army');
    expect(playMenu).not.toContain('<h3>{run.war.name}</h3>');
    expect(playMenu).not.toContain("run.war.description || 'Active War'");
    expect(playMenu).toContain('data-testid="run-choice-new"');
    expect(playMenu).toMatch(/<ChromeNavButton[^>]*data-chrome-fill-surface=\{CHROME_LEAF_FILL_SURFACE\}[^>]*data-testid="run-choice-new"/);
    expect(playMenu).toContain('to={PLAY_RUN_NEW_SELECTOR_HREF}');
    expect(playMenu).toContain('data-testid="run-detail-new"');
    expect(playMenu).toContain('<RunDetailContentSceneSlot');
    expect(authoredSceneSlots).toContain('region="run-detail" mode="contents"');
    expect(playMenu).not.toContain("sceneTransitionTargetAttributes('run-detail'");
    expect(playMenu).toMatch(/choice === 'new'[\s\S]*?<AtaraxiaSelector/);
    expect(playMenu).toMatch(/<AtaraxiaSelector[\s\S]*?fillSurface=\{CHROME_LEAF_FILL_SURFACE\}/);
    expect(ataraxiaSelector).toContain('fillSurface={fillSurface}');
    expect(ataraxiaSelector).toContain('<HouseSelect');
    expect(ataraxiaSelector).toContain('disabled: locked');
    expect(ataraxiaSelector).toContain('{definition.label} — {definition.title}');
    // The unlock note names the rung below from the model rather than hard-coding the
    // baseline's label, so renumbering the ladder cannot leave a stale sentence here.
    expect(ataraxiaSelector).toContain('Complete ${ATARAXIA_BY_TIER[(tier - 1) as AtaraxiaTier].label} to unlock');
    expect(ataraxiaSelector).not.toContain("'Complete Ataraxia 0 to unlock'");
    expect(ataraxiaSelector).toContain('<p className="run-ataraxia-effect">{ATARAXIA_BY_TIER[value].effect}</p>');
    expect(ataraxiaSelector).not.toContain('role="radiogroup"');
    const detailBodyRule = style.match(/\.play-detail-body\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(detailBodyRule).toContain('flex: 0 0 auto');
    expect(detailBodyRule).not.toContain('flex: 1 1 auto');
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

  it('retires Skirmish profiles instead of keeping a dead collection', () => {
    // The id-prefixed level class and both of its surfaces are gone; the levels themselves
    // survive as ordinary unassigned/standalone levels (ADR-0529).
    expect(existsSync(new URL('./skirmishProfiles.ts', import.meta.url))).toBe(false);
    expect(playMenu).not.toContain('SkirmishProfilesPanel');
    expect(campaignEditor).not.toContain('skirmish-profiles');
    expect(readFileSync(new URL('./playHubRoute.ts', import.meta.url), 'utf8'))
      .not.toContain('PLAY_SKIRMISH_SELECTOR_HREF');
  });

  it('does not synthesize a missing live level', () => {
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

  it('renders only from the director-mounted path and retains dormant standalone routes', () => {
    expect(playMenu).toContain('const addressedSelection = playHubSelection(path);');
    expect(playMenu.match(/if \(!isPlaySelectorPath\(path\)\) return/g)).toHaveLength(1);
    expect(playMenu).toContain('() => playHubSelection(path)');
    expect(playMenu).not.toContain('APP_NAVIGATION_EVENT');
    expect(playMenu).not.toContain('window.location');
    expect(playMenu).not.toContain('setSelection');
    expect(playMenu).toContain('playSkirmishLevelHref(level.id, PLAY_LEVELS_SELECTOR_HREF)');
  });

  it('keeps level selection stable and delegates its paint wait to the preview', () => {
    expect(playMenu).toContain('const routeSelection = useMemo(');
    expect(playMenu).toContain('const selection: PlayHubSelection = !routeSelection');
    expect(playMenu).toContain('[path],');
    expect(playMenu).not.toContain('useEffect(() => setLevelPreviewPainted(false)');
    expect(playMenu).not.toContain('&& (!selectedLevel || levelPreviewPainted)');
    expect(playMenu).not.toContain("selectedLevelId ?? '',");
    expect(playMenu).toContain('<LevelPreviewColumn');
    expect(playMenu).toContain("hasDetailPreview ? ' has-detail-preview' : ''");
    expect(playMenu).toContain("selectedLevel ? ' has-level-preview' : ''");
    expect(style).toContain('.play-scene-authority:not(.is-source-rail-collapsed).has-detail-preview .play-action-col');
  });

  it('serializes replacement of an active Run before entering the Run scene', () => {
    expect(playMenu).toContain('if (starting || syncing || !eligible.length) return;');
    expect(playMenu).toContain('if (run) await abandon();');
    expect(playMenu).toMatch(/await abandon\(\);[\s\S]*?replace\(createRun\([\s\S]*?navigateApp\('\/run'\)/);
    expect(playMenu).toContain("<span>{starting ? 'Starting…' : 'Start Run'}</span>");
    expect(playMenu).toMatch(/<ChromeButton[^>]*data-chrome-fill-surface=\{CHROME_LEAF_FILL_SURFACE\}[^>]*data-testid="run-start"/);
  });

  it('freezes the confirmed Play presentation until the outgoing scene retires', () => {
    expect(playMenu).toContain('const startingPresentationRef = useRef<');
    expect(playMenu).toContain('const presentedRun = presentation.run;');
    expect(playMenu).toContain('startingPresentationRef.current = { run, persistenceError, adoptionConflict, syncing };');
    expect(playMenu).toContain("navigationAccepted = navigateApp('/run');");
    expect(playMenu).toMatch(/if \(!navigationAccepted\) \{[\s\S]*?setStarting\(false\);/);
    expect(playMenu).not.toContain('finally {\n      setStarting(false);');
  });

  it('confirms Run replacement inline in the detail column instead of a popup', () => {
    // The disclosure card states the stakes before any click; the first Start Run click
    // arms an explicit Keep Run / Abandon and Start pair in the same actions row.
    expect(playMenu).not.toContain('useConfirm');
    expect(playMenu).toContain('data-testid="run-replace-warning"');
    expect(playMenu).toMatch(/<InnerChromeBox[^>]*fillSurface=\{CHROME_LEAF_FILL_SURFACE\}[^>]*data-testid="run-replace-warning"/);
    expect(playMenu).toContain('This cannot be undone.');
    expect(playMenu).toContain('if (presentedRun) { setArmed(true); return; }');
    expect(playMenu).toContain('data-testid="run-keep"');
    expect(playMenu).toContain('data-testid="run-abandon-and-start"');
    expect(playMenu).toMatch(/<ChromeButton[^>]*data-chrome-fill-surface=\{CHROME_LEAF_FILL_SURFACE\}[^>]*data-testid="run-keep"/);
    expect(playMenu).toMatch(/<ChromeButton[^>]*data-chrome-fill-surface=\{CHROME_LEAF_FILL_SURFACE\}[^>]*data-testid="run-abandon-and-start"/);
    // Danger tone rides the ce-family's registered variant over the shared oak surface.
    expect(playMenu).toContain("'ce-asset-button', 'is-danger'");
    expect(playMenu).toContain('keepRunButtonRef.current?.focus();');
    expect(style).toContain('.run-replace-note');
  });
});

describe('Run rule options are a departure from the defaults, not a step in setup', () => {
  const source = readFileSync(new URL('./RunRulesSelector.tsx', import.meta.url), 'utf8');

  it('starts closed, so a normal Run never has to answer it', () => {
    expect(source).toContain('const [open, setOpen] = useState(false)');
    expect(source).toContain('hidden={!open}');
  });

  it('says the defaults are already right while it is closed', () => {
    expect(source).toContain('Standard formations and pricing. Most Runs want these.');
  });

  it('is reachable and announced, because a Run is bound to these for its life', () => {
    expect(source).toContain('aria-expanded={open}');
    expect(source).toContain('aria-controls="run-rules-content"');
  });

  it('does not call the weighted option "by density", which it is not', () => {
    // Density weights the material, it does not replace it -- priced by density alone, one Pawn
    // and four Pawns would cost the same.
    expect(source).toContain("label: 'Weighted by density'");
    expect(source).not.toContain("label: 'By density'");
  });
});
