// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const enchiridion = readFileSync(new URL('./Enchiridion.tsx', import.meta.url), 'utf8');
const strategikon = readFileSync(new URL('./Strategikon.tsx', import.meta.url), 'utf8');
const mainMenu = readFileSync(new URL('./MainMenu.tsx', import.meta.url), 'utf8');
const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const skirmish = readFileSync(new URL('./Skirmish.tsx', import.meta.url), 'utf8');
const hud = readFileSync(new URL('./SkirmishHud.tsx', import.meta.url), 'utf8');
const runArmy = readFileSync(new URL('./RunArmyWorkspace.tsx', import.meta.url), 'utf8');

describe('Enchiridion and Strategikon contract (ADR-0231)', () => {
  it('describes abilities without explaining how they are obtained', () => {
    const start = enchiridion.indexOf('function AbilitiesSection');
    const end = enchiridion.indexOf('function EnchiridionContent', start);
    const abilities = enchiridion.slice(start, end);
    expect(abilities).toContain('<h3>Discipline</h3>');
    expect(abilities).toContain('<h3>Positioned</h3>');
    expect(abilities).not.toMatch(/\b(?:gain|obtain|acquir|relic|upgrade)/i);
  });

  it('keeps the exact knight and bishop terrain exceptions in the shared reference', () => {
    expect(enchiridion).toContain('Knights</strong> jump over gaps, fences, and intervening obstacles');
    expect(enchiridion).toContain('Obstacles on neighboring non-diagonal tiles are ignored');
  });

  it('uses the canonical rail language for both reference layers', () => {
    expect(enchiridion).toContain('<ApparatusRailTab');
    expect(strategikon.match(/<ApparatusRailTab/g)).toHaveLength(3);
    expect(strategikon).toContain('title="The Martial Prosopography — Current Army"');
    expect(strategikon).toContain('title="The Lipsanotheca — Held Relics"');
  });

  it('uses host-owned fill composition without adding an outer box to either host', () => {
    expect(mainMenu).toMatch(/<Enchiridion[^>]*framed=\{false\}/);
    expect(enchiridion).toContain('enchiridion-panel-unframed');
    expect(enchiridion).toContain('if (framed)');
    expect(strategikon).toContain('<ChromeSurfaceFill role="outer" className="strategikon-workspace-fill" />');
    expect(strategikon).not.toContain('OuterChromeBox');
    expect(strategikon).toMatch(/<Enchiridion[\s\S]*?framed=\{false\}/);
    expect(strategikon).toMatch(/<RunArmyWorkspace[\s\S]*?framed=\{false\}/);
    expect(strategikon).toMatch(/<RelicCodex[^>]*framed=\{false\}/);
    expect(runArmy).toContain('framed = true');
    expect(runArmy).toContain('className={`${className} ${contentClassName} run-panel-unframed`}');
    // The unframed run panels must fill the Strategikon content region: without a
    // constrained block size the Prosopography ledger grows to its full content
    // height and its KitScroll never becomes scrollable.
    expect(style).toMatch(/\.strategikon-content > \.run-panel-unframed,[\s\S]{0,80}?\{[\s\S]*?block-size:\s*100%/);
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

  it('lists the full bundle deck as real card faces with routed selection', () => {
    const start = enchiridion.indexOf('export function CardCodex');
    const end = enchiridion.indexOf('function AbilitiesSection', start);
    const cardCodex = enchiridion.slice(start, end);
    // The browser lists every deck card grouped by value; the detail is the exact
    // card face the Run deals (one selection, one description — ADR-0253's shape).
    expect(cardCodex).toContain('PIECE_BUNDLE_DECK');
    expect(cardCodex).toContain('<RunBundleCard bundle={selected} mode="reference" />');
    expect(cardCodex).toContain('runCardName(bundle)');
    expect(cardCodex).toContain('bundleLabel(bundle)');
    expect(cardCodex).toMatch(/to=\{cardHref\?\.\(bundle\.id\)\}/);
    expect(cardCodex.match(/<ReferenceTrigger/g)).toHaveLength(1);
    // The main menu addresses individual cards like relic records…
    expect(mainMenu).toContain('selectedCardId={enchiridionCardFromPath(path)}');
    expect(mainMenu).toContain('cardHref={enchiridionCardHref}');
    // …and the Battle-hosted Strategikon keeps ephemeral reference selection.
    expect(strategikon).not.toContain('cardHref');
  });

  it('opens from Controls while retaining the mounted Battle field', () => {
    expect(hud).toContain('data-testid="strategikon-toggle"');
    expect(hud).toContain('const strategikonToggle = strategikonHref ? (');
    expect(hud).toMatch(/<OuterChromeHeader[\s\S]*?title="Controls"[\s\S]*?actions=\{strategikonToggle\}/);
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
    expect(skirmish).toContain("className={`skirmish-war-room${strategikonOpen ? ' has-strategikon' : ''}`}");
    expect(skirmish).toContain("className={`skirmish-field${strategikonOpen || runWorkspace ? ' is-workspace-covered' : ''}`}");
    expect(skirmish).toContain('inert={strategikonOpen || runWorkspace ? true : undefined}');
    expect(skirmish).toContain('aria-hidden={strategikonOpen || runWorkspace ? true : undefined}');
    expect(skirmish).toMatch(/className="strategikon-slot"[\s\S]*?sceneTransitionTargetAttributes\('gameplay-shell'\)[\s\S]*?\{strategikonOpen \? \(/);
    expect(skirmish.indexOf('className={`skirmish-field')).toBeLessThan(skirmish.indexOf('className="strategikon-slot"'));
    expect(style).toMatch(/\.strategikon-slot\s*\{[\s\S]*?inset:\s*0[\s\S]*?position:\s*absolute/);
    expect(style).toMatch(/\.strategikon-workspace-fill\s*\{[\s\S]*?inset:\s*0/);
    expect(style).not.toMatch(/\.skirmish-war-room\.has-strategikon > \.skirmish-field\s*\{[\s\S]*?visibility:\s*hidden/);
  });
});
