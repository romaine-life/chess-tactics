// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const enchiridion = readFileSync(new URL('./Enchiridion.tsx', import.meta.url), 'utf8');
const strategikon = readFileSync(new URL('./Strategikon.tsx', import.meta.url), 'utf8');
const mainMenu = readFileSync(new URL('./MainMenu.tsx', import.meta.url), 'utf8');
const apparatusRailTab = readFileSync(new URL('./shared/ApparatusRailTab.tsx', import.meta.url), 'utf8');
const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const skirmish = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');
const hud = readFileSync(new URL('./SkirmishHud.tsx', import.meta.url), 'utf8');
const runArmy = readFileSync(new URL('./RunArmyWorkspace.tsx', import.meta.url), 'utf8');

describe('Enchiridion and Strategikon contract (ADR-0231)', () => {
  it('describes exactly the four unit abilities without card qualifiers', () => {
    const start = enchiridion.indexOf('const UNIT_STATE_REFERENCES');
    const end = enchiridion.indexOf('export function EnchiridionReference', start);
    const abilities = enchiridion.slice(start, end);
    expect(abilities.match(/state: '(?:discipline|positioned|marshalled|plagued)'/g)).toHaveLength(4);
    expect(abilities).toContain("name: 'Discipline'");
    expect(abilities).toContain("name: 'Positioned'");
    expect(abilities).toContain('name: AGMINATE_DISPLAY_NAME');
    expect(abilities).toContain('name: CACOCHYMIC_DISPLAY_NAME');
    expect(abilities).not.toContain("name: 'Concinnous'");
    expect(abilities).not.toContain("name: 'Tactical'");
    expect(abilities).toContain('className="enchiridion-ability-card"');
    // Every glossary entry draws its own accepted unit-state icon, never a stand-in glyph.
    expect(abilities).toContain('src={runUnitStateIconUrl(state)}');
    expect(abilities).not.toMatch(/skirmish-icon-(?:shield|move|flag)/);
    expect(abilities).toContain('discounted by 0 gold for a Pawn, 1 for a Knight or Bishop, 2 for a Rook, and 3 for a Queen');
    expect(abilities).not.toContain('Upon acquisition, one unit on this card becomes Positioned.');
    expect(abilities).not.toContain('Upon acquisition, one randomly chosen unit on this card gains Discipline.');
  });

  it('keeps the exact knight and bishop terrain exceptions in the shared reference', () => {
    expect(enchiridion).toContain('Knights</strong> jump over gaps, fences, and intervening obstacles');
    expect(enchiridion).toContain('Obstacles on neighboring non-diagonal tiles are ignored');
  });

  it('uses the canonical rail language for both reference layers', () => {
    expect(mainMenu).toContain('<ApparatusRailColumn');
    expect(enchiridion).toContain('<ApparatusRailTab');
    expect(enchiridion).toContain('<ApparatusRailColumn className="enchiridion-section-rail"');
    expect(strategikon).toContain('<ApparatusRailColumn className="strategikon-rail"');
    expect(strategikon).toContain('<EnchiridionSectionRail');
    expect(strategikon.match(/<ApparatusRailTab/g)).toHaveLength(3);
    expect(strategikon).toContain('title="The Martial Prosopography — Current Army"');
    expect(strategikon).toContain('title="The Lipsanotheca — Held Relics"');
  });

  it('uses the canonical terrain-tile glyph instead of the creator-tools grid mark', () => {
    expect(enchiridion).toContain("terrain: installedUiMedia('ui-kit-icons-tileset-studio-png')");
    expect(enchiridion).toContain('iconSrc={SECTION_ICON_SRC[candidate]}');
    expect(enchiridion).not.toContain("terrain: 'ic-grid'");
    expect(style).not.toContain('.ic-terrain');
  });

  it('gives one destination one mark across every rail that offers it', () => {
    // A rail tab carries an installed media URL and nothing else. The removed
    // `iconClassName` escape hatch painted a CSS background instead of the shared
    // <img>, and the two paths sized the SAME installed icon differently — which is
    // how the Strategikon's Enchiridion tab showed a 30px crop of the 64px mark the
    // main menu drew whole. Requiring the URL makes that divergence unexpressible.
    expect(apparatusRailTab).toContain('iconSrc: string;');
    expect(apparatusRailTab).toContain('<img src={iconSrc} alt="" />');
    expect(apparatusRailTab).not.toContain('iconClassName');
    expect(style).not.toContain('.settings-tab-icon > :is(.skirmish-tab-icon');
    for (const source of [enchiridion, strategikon, mainMenu]) {
      expect(source).not.toContain('iconClassName');
    }
    // The Enchiridion destination resolves through ONE lookup for both rails.
    expect(strategikon).toContain("iconSrc={menuModeIcon('enchiridion')}");
    expect(mainMenu).toContain('icon: menuModeIcon(slug)');
    expect(mainMenu).not.toContain('asset.media.icon');
    // Every section of the shared section rail resolves to installed media.
    expect(enchiridion).toContain('const SECTION_ICON_SRC: Record<EnchiridionSection, string>');
    expect(enchiridion).not.toContain('const SECTION_ICON:');
  });

  it('uses host-owned fill composition without adding an outer box to either host', () => {
    expect(mainMenu).toMatch(/<Enchiridion[^>]*framed=\{false\}/);
    expect(enchiridion).toContain('enchiridion-panel-unframed');
    expect(enchiridion).toContain('if (framed)');
    expect(strategikon).toContain('<ShellWorkspace');
    expect(strategikon).toContain('className="strategikon-workspace"');
    expect(strategikon).toContain('contentClassName="strategikon-workspace-layout"');
    expect(strategikon).toContain('bodyClassName="strategikon-content"');
    expect(strategikon).not.toContain('<ChromeSurfaceFill');
    expect(strategikon).not.toContain('OuterChromeBox');
    // The reference body mounts WITHOUT the Enchiridion's own workspace and scene
    // slot: nesting that host inside the Strategikon's would give one visual pane two
    // competing director-owned transition targets.
    expect(strategikon).toMatch(/<EnchiridionReference[\s\S]*?framed=\{false\}/);
    expect(strategikon).not.toContain('<Enchiridion\n');
    expect(strategikon).toMatch(/<RunArmyWorkspace[\s\S]*?framed=\{false\}/);
    expect(strategikon).toMatch(/<RelicCodex[^>]*framed=\{false\}/);
    expect(runArmy).toContain('framed = true');
    expect(runArmy).toContain('className={`${className} ${contentClassName} run-panel-unframed`}');
    // The unframed run panels must fill the Strategikon content region: without a
    // constrained block size the Prosopography ledger grows to its full content
    // height and its KitScroll never becomes scrollable.
    expect(style).toMatch(/\.strategikon-pane > \.run-panel-unframed,[\s\S]{0,120}?\{[\s\S]*?block-size:\s*100%/);
  });

  it('opts the main-menu workspace back into pointer input', () => {
    const workspaceRule = style.match(/\.menu-dest > \.enchiridion-workspace\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(workspaceRule).toContain('pointer-events: auto');
  });

  it('supports tooltip-free relic views that consume the remaining main-menu canvas (ADR-0254)', () => {
    const start = enchiridion.indexOf('export function RelicCodex');
    const end = enchiridion.indexOf('function AbilitiesSection', start);
    const relicCodex = enchiridion.slice(start, end);
    expect(relicCodex).toContain("useState<RelicBrowseMode>('rows')");
    expect(relicCodex).toContain('data-testid="relic-view-rows"');
    expect(relicCodex).toContain('data-testid="relic-view-grouped"');
    expect(relicCodex).toMatch(/chromeUnitClassNames\(\s*'inner-list-row'/);
    expect(relicCodex).toContain('<InnerChromeBox className="enchiridion-relic-group">');
    expect(relicCodex).toContain('className="enchiridion-relic-group-grid"');
    expect(relicCodex).toContain('className={`enchiridion-relic-grouped-trigger');
    expect(relicCodex).toContain('className="enchiridion-relic-row-name"');
    expect(relicCodex).not.toContain('<Tooltip');
    expect(relicCodex).not.toContain('interactiveTrigger');
    expect(style).toMatch(/\.enchiridion-relic-row-name\s*\{[\s\S]*?font-size:\s*var\(--ds-text-md\)/);
    expect(style).toMatch(/\.enchiridion-relic-group-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fill,\s*64px\)/);
    expect(style).toMatch(/\.enchiridion-relic-grouped-trigger\s*\{[\s\S]*?background:\s*none[\s\S]*?border:\s*0/);
    const mainMenuWorkspaceRule = style.match(/\.menu-dest > \.enchiridion-workspace\s*\{[\s\S]*?\}/)?.[0] ?? '';
    const mainMenuContentRule = style.match(/\.menu-dest > \.enchiridion-workspace > \.enchiridion-content\s*\{[\s\S]*?\}/)?.[0] ?? '';
    expect(mainMenuWorkspaceRule).toContain('flex: none');
    expect(mainMenuWorkspaceRule).toContain('var(--layout-vw, 100vw)');
    expect(mainMenuWorkspaceRule).toContain('var(--settings-shell-w)');
    expect(mainMenuWorkspaceRule).toContain('var(--rail-pull-x)');
    expect(mainMenuWorkspaceRule).not.toContain('var(--col-action-w)');
    expect(mainMenuContentRule).toContain('flex: 1 1 auto');
    expect(mainMenuContentRule).toContain('min-inline-size: 0');
    expect(mainMenuContentRule).not.toContain('max-inline-size: var(--col-action-w)');
    expect(style).toMatch(/\.enchiridion-relic-detail\s*\{[\s\S]*?align-self:\s*start[\s\S]*?block-size:\s*auto[\s\S]*?inline-size:\s*100%[\s\S]*?min-inline-size:\s*0/);
  });

  it('routes individual relic selection where the host addresses relics (ADR-0256)', () => {
    const start = enchiridion.indexOf('function ReferenceTrigger');
    const end = enchiridion.indexOf('export function CardCodex', start);
    const relicCodex = enchiridion.slice(start, end);
    // One trigger control, two transports: NavButton when the record has an address
    // (ADR-0052 — a button that navigates, never an anchor), plain selection otherwise.
    expect(relicCodex).toContain('if (to) return <NavButton to={to}');
    expect(relicCodex).not.toContain('<a ');
    expect(relicCodex.match(/<ReferenceTrigger/g)).toHaveLength(2);
    expect(relicCodex).toMatch(/to=\{relicHref\?\.\(relic\.id\)\}/);
    // Routed hosts derive selection from the address; local state is the ephemeral fallback.
    expect(relicCodex).toContain('const selectedId = relicHref ? (selectedRelicId ?? relicIds[0] ?? RUN_RELICS[0].id) : localSelectedId;');
    // The main menu is the addressing host…
    expect(mainMenu).toContain('selectedRelicId={enchiridionRelicFromPath(path)}');
    expect(mainMenu).toContain('relicHref={enchiridionRelicHref}');
    // …and the Battle-hosted Strategikon keeps ephemeral reference selection.
    expect(strategikon).not.toContain('relicHref');
  });

  it('uses the full terminal content column as a routed gallery of real card faces', () => {
    const start = enchiridion.indexOf('export function CardCodex');
    const end = enchiridion.indexOf('type CardTypeReferenceDefinition', start);
    const cardCodex = enchiridion.slice(start, end);
    // Cards are the records themselves; there is deliberately no fourth-column
    // detail and no compact prose list duplicating those faces (ADR-0361).
    expect(cardCodex).toContain('RUN_CARD_DECK');
    expect(cardCodex).toContain('className="enchiridion-card-gallery-layout"');
    expect(cardCodex).toContain('className="enchiridion-card-gallery-grid"');
    expect(cardCodex).toContain('<RunCard card={card} mode="reference" />');
    expect(cardCodex).not.toContain('<RunCard card={selected}');
    expect(cardCodex).not.toContain('enchiridion-card-detail');
    expect(cardCodex).not.toContain('enchiridion-card-row');
    expect(cardCodex).not.toContain('CardDetailStage');
    expect(cardCodex).toContain('runCardName(card)');
    expect(cardCodex).toContain('cardContentsLabel(card)');
    expect(cardCodex).toMatch(/to=\{cardHref\?\.\(card\.id\)\}/);
    expect(cardCodex.match(/<ReferenceTrigger/g)).toHaveLength(1);
    // The main menu addresses individual cards like relic records…
    expect(mainMenu).toContain('selectedCardId={enchiridionCardFromPath(path)}');
    expect(mainMenu).toContain('cardHref={enchiridionCardHref}');
    // …and the Battle-hosted Strategikon keeps ephemeral reference selection.
    expect(strategikon).not.toContain('cardHref');
  });

  it('filters cards by intersecting gold and contained-unit choices', () => {
    const start = enchiridion.indexOf('export type CardGoldFilter');
    const end = enchiridion.indexOf('type CardTypeReferenceDefinition', start);
    const cardCodex = enchiridion.slice(start, end);
    expect(cardCodex).toContain('cardMatchesFilters(card, goldFilter, unitFilter)');
    expect(cardCodex).toContain('testId="enchiridion-card-gold-filter"');
    expect(cardCodex).toContain('testId="enchiridion-card-unit-filter"');
    expect(cardCodex).toContain('<h3>No matching cards</h3>');
    expect(cardCodex).toContain('<RunCard card={card} mode="reference" />');
    // Compact amounts reuse the exact numbered coin from the card face. The
    // contained-unit choices retain their labels and add the accepted Battle sprite.
    expect(cardCodex).toContain('<RunCardCostCoin value={Number(value)}');
    expect(cardCodex).toContain('<RunCardCostCoin value={value}');
    expect(cardCodex).not.toContain('`${value} gold`');
    expect(cardCodex).toContain('<PieceTypeIcon type={value}');
    expect(cardCodex).toContain('<span>{PIECE_LABEL[value]}</span>');
    expect(cardCodex).toContain('<KitScroll className="enchiridion-card-gallery-scroll">');
    expect(style).not.toMatch(/\.run-card-cost-coin\s*\{[^}]*clip-path:/s);
    expect(style).toMatch(/\.run-card-cost-coin-art\s*\{[^}]*inset:\s*0;[^}]*object-fit:\s*contain/s);
    expect(style).toMatch(/\.enchiridion-card-gallery-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(188px,\s*232px\)\)/s);
    expect(style).not.toContain('.enchiridion-card-detail');
    expect(style).not.toMatch(/\.enchiridion-card-gallery-browser\s*\{[^}]*overflow-y:/s);
  });

  it('selects four affected-card names in column three and previews one shared Volunteer face in column four', () => {
    const start = enchiridion.indexOf('const CARD_TYPE_REFERENCES');
    const end = enchiridion.indexOf('const UNIT_STATE_REFERENCES', start);
    const cardTypes = enchiridion.slice(start, end);
    expect(cardTypes.match(/id: '(?:pestiferous|concinnous|tactical|hieratic)'/g)).toHaveLength(4);
    expect(cardTypes).toContain("const VOLUNTEER_CARD = RUN_CARD_BY_ID.p");
    expect(cardTypes).toContain('<RunCardFace');
    expect(cardTypes).toContain('RUN_CARD_PESTIFEROUS_FRAME_SLOT');
    expect(cardTypes).toContain('RUN_CARD_TACTICAL_FRAME_SLOT');
    expect(cardTypes).toContain('RUN_CARD_HIERATIC_FRAME_SLOT');
    // Every named property row carries its own accepted symbol, not just Pestiferous.
    expect(cardTypes).toContain('src={runCardPropertyIconUrl(definition.id)}');
    expect(cardTypes).toContain('<AlphaBoundIcon');
    expect(cardTypes).toContain('className="enchiridion-card-type-row-icon"');
    // The preview face carries the qualifier as its symbol instead of an em-dash suffix.
    expect(cardTypes).toContain("typeLine: 'Units',");
    expect(cardTypes).not.toContain('typeLine: `Units — ${definition.name}`');
    // Every named card property now has installed Run mechanics, so none is provisional.
    expect(cardTypes).not.toContain('provisional: true');
    expect(cardTypes).toContain("useState('pestiferous')");
    expect(cardTypes).toContain('className="enchiridion-card-type-layout"');
    expect(cardTypes).toContain('className="enchiridion-card-type-rows"');
    expect(cardTypes).toContain('data-testid={`enchiridion-card-type-${definition.id}`}');
    expect(cardTypes).toContain('<CardTypeReference definition={selected} />');
    expect(cardTypes).not.toContain('<CardTypeReference definition={definition} key={definition.id} />');
    expect(style).toMatch(/\.enchiridion-card-type-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(280px,\s*1fr\) minmax\(232px,\s*300px\)/);
    expect(style).toMatch(/\.enchiridion-card-type-detail\s*\{[\s\S]*?container-type:\s*inline-size/);
    expect(style).toMatch(/\.enchiridion-card-type-preview\s*\{[\s\S]*?margin-block-start:\s*-4cqw/);
    expect(style).toMatch(/\.enchiridion-card-type-row-name\s*\{[\s\S]*?line-height:\s*1/);
    expect(enchiridion).toContain("if (section === 'card-types') return <CardTypesSection framed={framed} textureBatch={cardTypeTextureBatch} />;");
    // The normal screen resolves accepted public slots. An exact query-addressed
    // candidate batch remains an explicitly labeled private review override.
    expect(cardTypes).toContain('acceptedCardTypeTextureUrls(currentLiveMediaCatalog())');
    expect(cardTypes).toContain('const displayedTextureUrls = textureBatch ? textureUrls : acceptedTextureUrls;');
    expect(mainMenu).toContain("cardTypeTextureBatch={new URLSearchParams(search).get('cardTypeTextureBatch')}");
    expect(cardTypes).toContain("title={textureBatch ? 'Card Types · PixelLab candidates' : 'Card Types'}");
    expect(cardTypes).toContain('data-card-type-texture-review={textureReviewStatus}');
    expect(cardTypes).toContain('className="enchiridion-card-type-row-material"');
    expect(style).toMatch(/\.enchiridion-card-type-row-material\s*\{[\s\S]*?display:\s*flex;[\s\S]*?inset:\s*0/);
    expect(style).not.toMatch(/\.enchiridion-card-type-row-material\s*\{[^}]*\bfilter\s*:/);
    expect(style).toMatch(/\.enchiridion-card-type-row-material > img\s*\{[\s\S]*?flex:\s*0 0 128px;[\s\S]*?inline-size:\s*128px/);
    expect(style).toMatch(/\[data-card-type-texture='concinnous'\] > img\s*\{[\s\S]*?flex-basis:\s*512px;[\s\S]*?inline-size:\s*512px/);
  });

  it('uses separate installed symbols for a card property and the unit state it bestows', () => {
    expect(enchiridion).toContain('src={runCardPropertyIconUrl(definition.id)}');
    expect(enchiridion).toContain('src={runUnitStateIconUrl(state)}');
    expect(enchiridion).toContain('className="enchiridion-ability-icon"');
    // The property and state resolvers are distinct roles, never one reused for both.
    expect(enchiridion).not.toContain('runCardPropertyIconUrl(state)');
    expect(enchiridion).not.toContain('runUnitStateIconUrl(definition.id)');
  });

  it('opens from Controls while retaining the mounted Battle field', () => {
    expect(hud).toContain('data-testid="strategikon-toggle"');
    expect(hud).toContain('const strategikonToggle = strategikonHref ? (');
    expect(hud).toMatch(/<ShellControlsPanel[\s\S]*?titleActions=\{strategikonToggle\}/);
    expect(hud).not.toContain('skirmish-hud-header-actions');
    expect(hud).not.toContain('data-testid="strategikon-toggle"\n      data-chrome-unit=');
    expect(hud).toContain("installedUiMedia('ui-kit-icons-studio-catalog-png')");
    expect(hud).toContain("strategikonOpen ? 'Return to Battle' : 'Open Strategikon'");
    expect(hud).toContain('Strategikon — inspect battle references, the current army, and held relics.');
    expect(hud).toContain('Return to Battle — close Strategikon without leaving this fight.');
    expect(hud).toMatch(/data-testid="strategikon-toggle"[\s\S]*?<img[\s\S]*?<\/NavButton>/);
    expect(style).toMatch(/\.skirmish-screen \.skirmish-hud-titlebar > \.outer-chrome-header-title-actions\s*\{[\s\S]*?inset-inline-end:\s*calc\(var\(--le-control-content-inset\)\s*-\s*5px\)/);
    expect(style).toMatch(/\.skirmish-hud-title-action\s*\{[\s\S]*?background:\s*none[\s\S]*?border:\s*0[\s\S]*?box-shadow:\s*none/);
    expect(style).toMatch(/\.skirmish-hud-title-action\.active\s*\{[\s\S]*?background:\s*none[\s\S]*?border-color:\s*transparent[\s\S]*?box-shadow:\s*none/);
    expect(style).toMatch(/\.skirmish-hud-title-action:hover\s*\{[\s\S]*?filter:/);
    expect(style).not.toMatch(/\.skirmish-hud-title-action:is\(:hover,\s*\.active\)/);
    expect(style).toMatch(/\.skirmish-hud-title-action-glyph\s*\{[\s\S]*?block-size:\s*32px[\s\S]*?inline-size:\s*32px/);
    expect(skirmish).toContain('className="skirmish-war-room"');
    expect(skirmish).toMatch(/<ShellViewportSwap[\s\S]*?className="skirmish-war-room"[\s\S]*?primaryClassName="skirmish-field"[\s\S]*?workspaceOpen=\{strategikonOpen \|\| Boolean\(runWorkspace\)\}/);
    expect(skirmish).toContain('relicIds={runDeployment?.relicIds ?? runBattle?.relicIds ?? []}');
    expect(skirmish).toContain('shellWorkspaceCoversRelics={Boolean(runWorkspace) || strategikonOpen}');
    expect(skirmish).toMatch(/<GameplayWorkspaceSceneSlot[\s\S]*?className="strategikon-slot"[\s\S]*?\{strategikonOpen \? \(/);
    expect(skirmish).toMatch(/primary=\{\([\s\S]*?<div className="skirmish-board-frame">[\s\S]*?\)\}[\s\S]*?\{battleWorkspaceLayer\}/);
    // The always-mounted slot overlays every battlefield tile. Empty, it MUST be
    // pointer-transparent — with plain pointer-events it shields the whole board and
    // no unit can be selected or moved (the #552 regression). Mounted workspace
    // content takes the pointer back.
    expect(style).toMatch(/\.strategikon-slot\s*\{[\s\S]*?inset:\s*0[\s\S]*?pointer-events:\s*none[\s\S]*?position:\s*absolute/);
    expect(style).toMatch(/\.strategikon-slot\s*>\s*\*\s*\{[\s\S]*?pointer-events:\s*auto/);
    expect(style).toMatch(/\.shell-workspace-fill\s*\{[\s\S]*?inset:\s*0/);
    expect(style).toMatch(/\.skirmish-screen\s*\{[\s\S]*?column-gap:\s*0/);
    expect(style).toMatch(/\.skirmish-screen:not\(\.level-editor-screen\) \.skirmish-war-room > \.skirmish-field\s*\{[\s\S]*?margin-inline-end:\s*var\(--skirmish-board-controls-gutter\)/);
    expect(style).not.toContain('.skirmish-screen.is-run-self-inspection-open');
    expect(style).toMatch(/--main-menu-content-inset-block:\s*calc\(var\(--main-menu-frame-inset\) \+ var\(--main-menu-rail-pad-block\)\)/);
    expect(style).toMatch(/--main-menu-content-inset-inline:\s*calc\(var\(--main-menu-frame-inset\) \+ var\(--main-menu-rail-pad-inline\)\)/);
    expect(style).toMatch(/\.main-menu-twin-screen \.settings-shell\s*\{[\s\S]*?--col-top-inset:\s*var\(--main-menu-content-inset-block\);[\s\S]*?--col-side-inset:\s*var\(--main-menu-content-inset-inline\)/);
    expect(style).toMatch(/--main-menu-tab-column-w:\s*322px/);
    expect(style).toMatch(/\.apparatus-rail-column\s*\{[\s\S]*?--settings-rail-tab-gap:\s*var\(--main-menu-tab-column-gap\);[\s\S]*?gap:\s*var\(--settings-rail-tab-gap\)/);
    expect(style).toMatch(/\.apparatus-rail-column\[data-apparatus-rail-placement="open"\]\s*\{[\s\S]*?inline-size:\s*var\(--main-menu-tab-column-w\);[\s\S]*?padding-block:\s*var\(--main-menu-content-inset-block\) 0;[\s\S]*?padding-inline:\s*var\(--main-menu-content-inset-inline\) 0/);
    expect(style).toMatch(/\.strategikon-workspace-layout\s*\{[\s\S]*?display:\s*grid;[\s\S]*?gap:\s*0;[\s\S]*?grid-template-columns:\s*var\(--main-menu-tab-column-w\) minmax\(0, 1fr\)/);
    // The Enchiridion reference rail is a column of the REPLACEABLE pane, not of the
    // workspace. It belongs to the Enchiridion section and must leave with it when the
    // section rail changes, while paging through records keeps it anchored — the same
    // retained-rail rule Settings and the main-menu Enchiridion follow.
    expect(style).toMatch(/\.strategikon-pane\.has-secondary-rail\s*\{[\s\S]*?grid-template-columns:\s*var\(--main-menu-tab-column-w\) minmax\(0, 1fr\)/);
    expect(strategikon).toMatch(/<StrategikonContentSceneSlot[\s\S]*?has-secondary-rail/);
    expect(strategikon).toMatch(/<EnchiridionSectionRail[\s\S]*?<StrategikonReferenceSceneSlot/);
    expect(style).toMatch(/\.strategikon-workspace\s*\{[\s\S]*?--shell-workspace-body-inset-block:\s*var\(--main-menu-content-inset-block\);[\s\S]*?--shell-workspace-body-inset-start:\s*var\(--main-menu-content-inset-inline\)/);
    expect(style).not.toContain('grid-template-columns: 270px minmax(0, 1fr)');
    expect(style).not.toContain('.strategikon-content .enchiridion-section-rail');
    expect(style).toMatch(/\.shell-workspace-body\s*\{[\s\S]*?padding-inline-end:\s*0/);
    expect(style).not.toContain('--shell-workspace-body-inset-end');
    expect(skirmish).not.toContain('has-strategikon');
  });

  it('renders the accepted command archive through the installed application UI role', () => {
    expect(strategikon).toContain("installedUiMedia('ui-workspaces-strategikon-background-png')");
    expect(strategikon).toContain('className="strategikon-background-artwork"');
    expect(strategikon).not.toContain('strategikonBackgroundReview');
    expect(style).toMatch(/\.strategikon-background-artwork\s*\{[\s\S]*?image-rendering:\s*pixelated;[\s\S]*?object-fit:\s*cover;[\s\S]*?opacity:\s*\.68/);
  });
});
