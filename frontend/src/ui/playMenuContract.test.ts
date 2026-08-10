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
const runStore = readFileSync(new URL('../run/store.ts', import.meta.url), 'utf8');

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
    // Run's destinations are rail tabs, so their hover, seat, gap and stone slice are the
    // primitive's — no Run-specific row class remains in the markup (ADR-0558). One dead
    // `.play-choice-row h4` rule survives in style.css from a same-day main change that gave
    // those slabs the rail label's outline by hand; the tabs inherit that outline structurally
    // now, so the rule selects nothing. Removing it renumbers the surface-debt baseline's
    // occurrence keys across ~100 lines, which is its own reviewed change, not merge cleanup.
    expect(playMenu).not.toContain('play-choice-row');
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
    // Both destinations are the shared rail tab, which carries the family's oak itself — the
    // fill is stamped once by ApparatusRailColumn rather than per call site (ADR-0558).
    expect(playMenu).toContain('testId="run-choice-current"');
    expect(playMenu).toMatch(/<ApparatusRailTab[\s\S]*?label="Current Run"/);
    expect(playMenu).toContain('to={PLAY_RUN_CURRENT_SELECTOR_HREF}');
    expect(playMenu).not.toContain('play-choice-row');
    expect(playMenu).toContain('<ApparatusRailColumn opens="panel-beside" className="play-run-choice-rail"');
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
    // An ENABLED row is its name alone — the Battle position and Ataraxia it used to restate
    // are the detail column's first two facts (ADR-0556). The empty state keeps its sentence,
    // because nothing else on the surface says why the row cannot be taken (ADR-0334).
    expect(playMenu).toContain("detail={presentedRun ? undefined : 'No active Run'}");
    expect(playMenu).not.toContain('<p>Choose Ataraxia</p>');
  });

  it('cuts the Run destinations from one plank instead of stamping one crop twice (ADR-0034/ADR-0063)', () => {
    // A leaf's installed oak is locally attached, so a row with no offset restarts the sheet
    // at 0. Two rows like that paint the identical crop — the repeated-texture look. Each row
    // instead samples the slice one plank running down the list would give it, the same
    // recovery the rail tabs use for the `fixed` attachment Chromium forced us to drop.
    // The plank is the RAIL's now: one pitch, one derivation, shared with every other rail in
    // the app. Run states only which seat each destination holds (ADR-0558).
    expect(style).toMatch(/--settings-tab-surface-pitch:\s*calc\(61px \+ var\(--settings-rail-tab-gap, 37px\)\);/);
    expect(style).not.toContain('--play-choice-row-surface-pitch');
    // The pitch is only a constant because BOTH row states are one line — the empty state's
    // sentence is the row's end value, not a second line that would shift the plank when a Run
    // starts or ends. The seat is the main-menu button's, so the rows read as its siblings.
    // Seat and gap are not Run's to state: it mounts the same tab in the same column type as
    // every other rail, so the two stacks cannot disagree by construction (ADR-0558).
    expect(playMenu).not.toContain('--settings-section-rows-gap');
    // And no eyebrow over the one group in the column — it named the column after the only thing
    // in it, and cost the first row its alignment with the first main-menu button (ADR-0556).
    expect(playMenu).not.toContain('<h3 className="settings-section-title">Run</h3>');
    expect(playMenu).toContain('aria-label="Run"');
    // The pitch may not restate the list gap — it has to step by exactly what layout steps by.
    expect(style).toMatch(/\.settings-section-rows\s*\{[\s\S]*?--settings-section-rows-gap:\s*10px;[\s\S]*?gap:\s*var\(--settings-section-rows-gap\);/);
    // Seats are owned by the panel, never counted off the DOM: a :nth-child ladder re-cuts the
    // plank the moment a "Loading Runs…" or "Runs unavailable" row joins the list.
    expect(playMenu).not.toMatch(/index=\{\s*\w+\.indexOf/);
    expect(playMenu).toContain('const PLAY_CHOICE_ROW_SEATS = { current: 0, new: 1 } as const;');
    expect(playMenu).toContain('index={PLAY_CHOICE_ROW_SEATS.current}');
    expect(playMenu).toContain('index={PLAY_CHOICE_ROW_SEATS.new}');
  });

  it('presents Run adoption as an unboxed decision group', () => {
    expect(playMenu).toContain('className="run-adoption-conflict"');
    expect(playMenu).toContain('data-testid="run-adoption-conflict"');
    expect(playMenu).not.toContain('<InnerChromeBox className="play-level-card" role="alert">');
    expect(style).toContain('.run-adoption-conflict {');
    // The question is answered BEHIND Current Run, never in its seat: a card standing where the
    // row belongs removed an expected control from a player who was only going to start a new
    // Run (ADR-0557). So the row's presence cannot depend on the conflict, and the conflict is
    // rendered inside the detail column the row opens.
    expect(playMenu).not.toContain('!presentation.adoptionConflict &&');
    expect(playMenu).toContain("{choice === 'current' && presentation.adoptionConflict ? (");
    expect(playMenu).toMatch(/choice === 'current' && presentation\.adoptionConflict[\s\S]*?data-testid="run-adoption-conflict"/);
    // And it is stated ONCE. `adoptionConflict` is the state; a companion string in the shared
    // error channel repeated it in the choice column, beside a Start New Run the conflict has
    // never gated. Both conflict branches leave that channel clear (ADR-0557).
    expect(runStore).not.toContain('This browser and account each have an active Run.');
    expect(runStore).not.toContain('Choose which active Run this account should keep.');
    expect(runStore.match(/adoptionConflict: \{ browserRun, accountRun \}/g)).toHaveLength(2);
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
    expect(playMenu).toContain('testId="run-choice-new"');
    expect(playMenu).toMatch(/<ApparatusRailTab[\s\S]*?label="Start New Run"/);
    expect(playMenu).toContain('to={PLAY_RUN_NEW_SELECTOR_HREF}');
    expect(playMenu).toContain('data-testid="run-detail-new"');
    // No heading over it. The rail tab that opened the column already says Start New Run and the
    // verb at the bottom says it again, so a title there only spends a row repeating the press
    // that got you here. The aside's own label keeps the name for the landmark.
    expect(playMenu).not.toMatch(/<div className="ce-selected-head"><h2>Start New Run<\/h2><\/div>/);
    expect(playMenu).toMatch(/aria-label="Start New Run" data-testid="run-detail-new"/);
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
    expect(ataraxiaSelector).not.toContain('role="radiogroup"');
    // Ataraxia is a section box like Options, not a heading over a loose picker: the same frame
    // states the same ownership, and the tier's `effect` is no longer restated under it. The
    // picker already shows the selected tier, and the baseline's effect is "Standard rules." — a
    // line spent saying the default is the default, floating on live board artwork.
    expect(ataraxiaSelector).toMatch(/<SectionBox[\s\S]*?title="Ataraxia"/);
    expect(ataraxiaSelector).not.toContain('run-ataraxia-effect');
    expect(ataraxiaSelector).not.toContain('ATARAXIA_BY_TIER[value].effect');
    expect(style).not.toContain('.run-ataraxia-effect');
    const detailBodyRule = style.match(/\.play-detail-body\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(detailBodyRule).toContain('flex: 0 0 auto');
    expect(detailBodyRule).not.toContain('flex: 1 1 auto');
  });

  it('resolves Play rail icons from installed drawable membership, not retired path-shaped app-ui roles', () => {
    // Through the SHARED menuModeIcon resolver, not a private copy of it. Play carried a
    // byte-identical duplicate of that lookup, which is the drift menuModeIcon.ts documents:
    // two surfaces offering one destination under two marks, with nothing to contradict them.
    expect(playMenu).toContain("import { menuModeIcon } from './menuModeIcon'");
    expect(playMenu).not.toContain("drawableAssets('menu-mode')");
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
    // Marble, not oak: nothing in this box takes a click, and the oak is what says a surface does
    // (ADR-0433). Its neighbours above and below it are both pressable and both wear the wood.
    expect(playMenu).toMatch(/<InnerChromeBox[^>]*fillRole=\{CHROME_STRUCTURAL_FILL_ROLE\}[^>]*data-testid="run-replace-warning"/);
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
  const prepSection = readFileSync(new URL('./shared/SectionBox.tsx', import.meta.url), 'utf8');

  it('starts closed, so a normal Run never has to answer it', () => {
    expect(source).toContain('const [open, setOpen] = useState(false)');
    expect(prepSection).toContain('hidden={disclosure ? !disclosure.open : undefined}');
  });

  it('closed, states only its own name — no reassuring subtitle under it', () => {
    // "Standard formations and pricing. Most Runs want these." said nothing a Run is bound by and
    // nothing about the cost of changing one, so the box carries its name and the chevron alone.
    expect(source).not.toContain('Standard formations and pricing');
    expect(source).not.toContain('run-rules-summary');
    expect(style).not.toContain('.run-rules-summary');
  });

  it('is one box that grows, with the box itself as the thing you press', () => {
    // The name row fills the accepted InnerChromeBox rather than being a framed control seated
    // inside it, so the box's own frame is the button's edge and its name rides in it.
    expect(prepSection).toContain('const boxClassName = `section-box ${className}`.trim();');
    expect(prepSection).toMatch(/<button[\s\S]*?className="section-box-head"[\s\S]*?aria-expanded=\{disclosure\.open\}/);
    expect(prepSection).toContain('<span className="section-box-title" id={titleId}>{title}</span>');
    expect(source).toMatch(/<SectionBox[\s\S]*?title="Options"/);
    expect(source).not.toContain("unit=\"inner-text-button\"");
    // Its inset is the box's whole content padding, so the pressable area reaches the frame.
    expect(style).toMatch(/\.section-box-head \{[\s\S]*?padding: var\(--ds-inset\);/);
  });

  it('cannot be handed a rail to place itself — the box owns the space between members', () => {
    // A box of several things takes a typed member list, never children, so no caller can author
    // the gap where a rail would go. A hand-placed rail cannot know where its ends meet the frame,
    // and one shipped into Settings with no junction caps on either end. Now it is unsayable:
    // ChromeDivider has no `junctions` prop at all, and the parts that suppress caps are private.
    expect(prepSection).toContain('members: readonly SectionBoxMember[]');
    expect(prepSection).toContain('children?: never');
    // A box's members can be split into compartments, and the rail between them is the BOX's
    // column line — so it crosses every row boundary as a junction the grid places, instead of a
    // rail drawn inside a row capping itself as though it met a frame.
    expect(prepSection).toMatch(/<DividedInnerChromeBox[\s\S]*?columns=\{shape\.columns \?\? \['minmax\(0, 1fr\)'\]\}/);
    expect(prepSection).toContain('columns?: readonly string[];');
    const chromeBox = readFileSync(new URL('./shared/ChromeBox.tsx', import.meta.url), 'utf8');
    expect(chromeBox).not.toContain('junctions?:');
    expect(chromeBox).toContain('data-chrome-divider-junctions="endpoints"');
    expect(existsSync(new URL('../../scripts/check-chrome-rails.mjs', import.meta.url))).toBe(true);
  });

  it('is marble holding oak, like every box that holds other people\'s controls', () => {
    // Opened, this is a box of pickers rather than a control itself, and a wood field behind
    // wooden pickers gives them nothing to read against (ADR-0433).
    expect(prepSection).toMatch(/<InnerChromeBox[\s\S]*?fillRole=\{CHROME_STRUCTURAL_FILL_ROLE\}/);
    expect(source).toMatch(/<HouseSelect[\s\S]*?fillSurface=\{fillSurface\}/);
  });

  it('seats below Start Run, so it is not a step between the Ataraxia choice and the verb', () => {
    // It also grows when opened; last in the column means opening it extends the column
    // downward instead of pushing the verb down the screen.
    expect(playMenu).toMatch(/data-testid="run-start"[\s\S]*?<RunRulesSelector/);
    expect(playMenu).not.toMatch(/<RunRulesSelector[\s\S]*?data-testid="run-start"/);
  });

  it('states which way it moves, with the shared chevron rather than a second one', () => {
    expect(prepSection).toContain("stepper-chevron-${disclosure.open ? 'up' : 'down'}");
    expect(style).toMatch(/\.stepper-chevron-down\s*\{[\s\S]*?transform:\s*rotate\(-90deg\);/);
    expect(style).toMatch(/\.stepper-chevron-up\s*\{[\s\S]*?transform:\s*rotate\(90deg\);/);
  });

  it('gives the chevron only to a section that opens, since that is what it means', () => {
    // Ataraxia is the same box and never closes, so it takes no disclosure and gets no chevron —
    // one mark distinguishes the two, and spending it on both would erase the distinction.
    expect(prepSection).toMatch(/\{disclosure \? \(\s*<span\s+className=\{`stepper-glyph/);
    expect(ataraxiaSelector).not.toContain('disclosure');
    expect(ataraxiaSelector).not.toContain('stepper-chevron');
  });

  it('holds its own name in both states, so pressing it never relabels the control', () => {
    // The verb pair that used to be stacked in one cell to lock the control's width is gone with
    // the Change button itself: the box is named after what it holds, and only the chevron moves.
    expect(source).not.toContain('>Hide<');
    expect(source).not.toContain('>Change<');
    expect(style).not.toContain('.run-rules-toggle-label');
  });

  it('is reachable and announced, because a Run is bound to these for its life', () => {
    expect(prepSection).toContain('aria-expanded={disclosure.open}');
    expect(prepSection).toContain('aria-controls={contentId}');
    expect(source).toContain('contentId="run-rules-content"');
  });

  it('does not call the weighted option "by density", which it is not', () => {
    // Density weights the material, it does not replace it -- priced by density alone, one Pawn
    // and four Pawns would cost the same.
    expect(source).toContain("label: 'Weighted by density'");
    expect(source).not.toContain("label: 'By density'");
  });
});
