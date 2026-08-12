// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const enchiridion = read('./Enchiridion.tsx');
const route = read('./enchiridionRoute.ts');
const mainMenu = read('./MainMenu.tsx');
const strategikon = read('./Strategikon.tsx');
const cardFace = read('./RunCardFace.tsx');
const heldCardCodex = read('./HeldCardCodex.tsx');
const unitInspectionScene = read('./RunUnitInspectionScene.tsx');
const chromeUnitRegistry = read('./chromeUnitRegistry.ts');
const cardProjection = read('./runCardFaceContent.ts');
const model = read('../../../packages/board-render/src/run/model.ts');
const style = read('../style.css');

describe('Enchiridion and Strategikon reference contract', () => {
  it('keeps the useful player reference sections and no ability catalog', () => {
    // Manubiae sits with Units and Terrain — the three sections about the board itself —
    // ahead of the three about the Run's economy.
    expect(route).toContain("['units', 'terrain', 'manubiae', 'cards', 'lipsana', 'ataraxia']");
    expect(route).not.toContain('card-types');
    expect(route).not.toContain('abilities');
    expect(enchiridion).not.toMatch(/AbilitiesSection|CardTypesSection|UNIT_STATE_REFERENCES|cardProperty/);
  });

  it('reads every Manubium from the model catalog rather than restating its prices', () => {
    // The Enchiridion is a reader of the economy, never a second copy of it: a price written
    // here could disagree with the one the Battle actually pays.
    expect(enchiridion).toContain('RUN_MANUBIAE.map');
    // Prices are drawn by the shared gold amount, so one reads exactly like every other
    // price in the Run rather than through a lookalike built here (ADR-0059).
    expect(enchiridion).toContain('<RunGoldAmount valueTenths={entry.goldTenths} />');
    expect(enchiridion).not.toMatch(/RUN_EN_PASSANT_BOUNTY_TENTHS|RUN_ROYAL_FORK_BOUNTY_TENTHS/);
    expect(model).toContain('export const RUN_MANUBIAE');
  });

  it('uses the shared rail in both the main-menu and Battle reference hosts', () => {
    expect(mainMenu).toContain('<ApparatusRailColumn');
    expect(enchiridion).toContain('<ApparatusRailColumn opens="panel-beside" className="enchiridion-section-rail"');
    expect(enchiridion).toContain('<ApparatusRailTab');
    expect(strategikon).toContain('<EnchiridionSectionRail');
    expect(strategikon).toContain('<ApparatusRailColumn opens="panel-beside" className="strategikon-rail"');
  });

  it('draws the complete card catalog through the one shared formation face', () => {
    expect(enchiridion).toContain('RUN_CARD_CATALOG.filter');
    expect(enchiridion).toContain('<RunCard card={card} mode="reference"');
    expect(cardProjection).toContain('formation: runCardFormation(card, options)');
    expect(cardFace).toContain('<FormationDiagram');
    expect(cardFace).not.toMatch(/RunAbility|cardProperty|unit-state|pestiferous|concinnous|legatine|hieratic/i);
  });

  it('reads the Ataraxia definition from the model and currently exposes only tier zero', () => {
    expect(enchiridion).toContain('ATARAXIA_TIERS.map');
    expect(enchiridion).toContain('ATARAXIA_BY_TIER[tier]');
    expect(model).toContain('export const INSTALLED_ATARAXIA_MAX_TIER = 0');
  });

  it('uses the installed reference artwork roles rather than CSS glyph substitutes', () => {
    expect(enchiridion).toContain("terrain: installedUiMedia('ui-kit-icons-tileset-studio-png')");
    // Cards are marked by the back of a card, which follows the player's chosen back, so the
    // table is resolved per render rather than frozen at module load.
    expect(enchiridion).toContain('iconSrc={sectionIconSrc[candidate]}');
    expect(enchiridion).toContain('const cards = useStrategikonCardsIcon();');
    expect(style).not.toContain('.ic-terrain');
  });

  it('uses the approved drawn scroll owner for long reference inventories', () => {
    expect(enchiridion).toContain('<KitScroll className="enchiridion-reference-scroll">');
    expect(enchiridion).toContain('<KitScroll className="enchiridion-card-gallery-scroll">');
    expect(style).toMatch(/\.enchiridion-reference-scroll\s*\{[\s\S]*?block-size:\s*100%/);
  });

  it('mounts reference bodies unframed inside the retained Strategikon', () => {
    expect(strategikon).toMatch(/<EnchiridionReference[\s\S]*?framed=\{false\}/);
    expect(strategikon).not.toContain('<Enchiridion\n');
    expect(strategikon).toMatch(/<RunArmyWorkspace[\s\S]*?framed=\{false\}/);
  });

  /**
   * ADR-0587. Every reference section wears ADR-0433's hierarchy: a record box takes the structural
   * marble, a control takes the oak. Adoption is declared on the shared FRAME so both transports of
   * the same gallery agree — annotating the Strategikon host alone would make one screen wear two
   * materials depending on whether it was reached from a Battle or from the main menu, which is the
   * half-adopted family ADR-0557 names.
   */
  it('declares the leaf material on the frame both reference transports wear', () => {
    const frame = enchiridion.match(
      /export function ReferenceSectionFrame\b[\s\S]*?\r?\n}\r?\n/,
    )?.[0] ?? '';
    expect(frame).toBeTruthy();
    // Framed under a host that owns no header, unframed under one that does — BOTH adopt, or the
    // main-menu Enchiridion and the Strategikon disagree about the same section.
    expect((frame.match(/data-chrome-leaf-surface=""/g) ?? [])).toHaveLength(2);
    // The Chartulary is the same kind of panel, so it inherits the adoption rather than annotating
    // its own controls (ADR-0059).
    expect(heldCardCodex).toContain('<ReferenceSectionFrame');
    expect(heldCardCodex).not.toContain('data-chrome-leaf-surface');
  });

  it('names the structural marble on every reference record box', () => {
    // A box that establishes a region for subordinate content, in every section: unit and manubium
    // cards, terrain rows, rule exceptions, Ataraxia tiers, the lipsanon group and its detail, every
    // empty state, and the no-Run notices the Strategikon shows without one.
    for (const box of [
      'enchiridion-unit-card',
      'enchiridion-terrain-row',
      'enchiridion-rule-exceptions',
      'enchiridion-lipsanon-group',
      'enchiridion-lipsanon-detail',
      'enchiridion-empty',
      'enchiridion-ataraxia-card',
      'enchiridion-card-filters',
    ]) {
      expect(enchiridion).toMatch(
        new RegExp(`${box}[^>]*?fillRole=\\{CHROME_STRUCTURAL_FILL_ROLE\\}|fillRole=\\{CHROME_STRUCTURAL_FILL_ROLE\\}[^>]*?${box}`),
      );
    }
    expect(strategikon).toContain('className="enchiridion-empty" fillRole={CHROME_STRUCTURAL_FILL_ROLE}');
    expect(heldCardCodex).toContain('className="enchiridion-empty" fillRole={CHROME_STRUCTURAL_FILL_ROLE}');
    // Not a literal 'outer': the policy module is the one place that name lives (ADR-0433).
    expect(enchiridion).not.toContain('fillRole="outer"');
  });

  /**
   * A row that IS the control wears the oak. `inner-list-row` stays a STRUCTURAL template because it
   * also serves the dropdown option rows ADR-0433 keeps teal inside the popup field that hosts them
   * — so a browse row names the leaf surface itself rather than the registry being reclassified.
   * ADR-0555's "a row's actions are the leaves, not the row" is about a row that HOSTS actions; these
   * host none, and SectionBox's `press` member already ships this exact shape.
   */
  it('wears the oak on a reference row that is itself the control, phased from its own data', () => {
    expect(chromeUnitRegistry).toMatch(/id: 'inner-list-row'[\s\S]*?material: 'structural'/);
    // Both browse views: the named row and the grouped icon seat. Each takes the phase from the
    // record's index in the list being walked, never from DOM position (ADR-0063).
    expect(enchiridion).toContain('{visibleLipsana.map((lipsanon, index) => (');
    expect((enchiridion.match(/style=\{leafSurfacePhase\(index\)\}/g) ?? [])).toHaveLength(2);
    expect((enchiridion.match(/data-chrome-fill-surface=\{CHROME_LEAF_FILL_SURFACE\}/g) ?? [])).toHaveLength(2);
    expect(enchiridion).not.toMatch(/\.enchiridion-lipsanon-(?:row|grouped-trigger):nth-child/);
    expect(style).not.toMatch(/\.enchiridion-lipsanon-(?:rows|group-grid)[^}]*:nth-child/);
  });

  /**
   * This Combat is a FILTER, and it is seated in the filter field. Standing outside it was a third
   * child of a layout that declares one row for that field and one flexible row for the gallery, so
   * it took the gallery's own track — full-lane wide — and pushed the cards into an implicit row the
   * layout clips. Flat that read as a wide button; wearing the plank it is the ADR-0557 wall.
   */
  it('seats the Chartulary narrowing inside the filter field, not in the gallery track', () => {
    expect(heldCardCodex).toContain('scope={thisCombatAvailable ? {');
    expect(heldCardCodex).toContain("label: 'This Combat',");
    // The gallery layout still declares exactly its field row and its flexible gallery row, which is
    // only true while nothing else is a child of it.
    expect(style).toMatch(/\.enchiridion-card-gallery-layout\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\);/);
    // The extra track exists only when the seat is filled, or every gallery without a fourth
    // narrowing keeps its gap and the live count wraps to a second line.
    expect(enchiridion).toContain("enchiridion-card-filters${scope ? ' has-scope' : ''}");
    expect(style).toMatch(/\.enchiridion-card-filters\.has-scope\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(132px, 1fr\)\) auto auto;/);
  });

  /**
   * ADR-0555 keeps a portrait's scene. The inspection box is a window onto a rendered board, so it
   * takes no fill at all — marble there put stone around a landscape.
   */
  it('leaves the unit inspection scene unpainted', () => {
    expect(unitInspectionScene).toContain('<InnerChromeBox className="run-army-profile-scene">');
    expect(unitInspectionScene).not.toContain('fillRole');
  });
});
