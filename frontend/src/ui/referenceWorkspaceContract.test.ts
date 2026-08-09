// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const enchiridion = read('./Enchiridion.tsx');
const route = read('./enchiridionRoute.ts');
const mainMenu = read('./MainMenu.tsx');
const strategikon = read('./Strategikon.tsx');
const cardFace = read('./RunCardFace.tsx');
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
    expect(enchiridion).toContain('<ApparatusRailColumn className="enchiridion-section-rail"');
    expect(enchiridion).toContain('<ApparatusRailTab');
    expect(strategikon).toContain('<EnchiridionSectionRail');
    expect(strategikon).toContain('<ApparatusRailColumn className="strategikon-rail"');
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
});
