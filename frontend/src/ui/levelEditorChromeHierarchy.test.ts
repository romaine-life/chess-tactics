// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const levelEditor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const sliderRow = readFileSync(new URL('./dressing/SliderRow.tsx', import.meta.url), 'utf8');
const studioBoard = readFileSync(new URL('./studioBoard.tsx', import.meta.url), 'utf8');
const paletteSelect = readFileSync(new URL('./shared/PaletteSelect.tsx', import.meta.url), 'utf8');
const toggle = readFileSync(new URL('./shared/Toggle.tsx', import.meta.url), 'utf8');
const victoryConditions = readFileSync(new URL('./VictoryConditionsEditor.tsx', import.meta.url), 'utf8');
const stepper = readFileSync(new URL('./shared/Stepper.tsx', import.meta.url), 'utf8');
const houseSelect = readFileSync(new URL('./shared/HouseSelect.tsx', import.meta.url), 'utf8');
const confirmDialog = readFileSync(new URL('./shared/ConfirmDialog.tsx', import.meta.url), 'utf8');
const titleBarControls = readFileSync(new URL('./shell/TitleBarControls.tsx', import.meta.url), 'utf8');

const buttonBlocks = (source: string): string[] => source.match(/<button\b[\s\S]*?<\/button>/g) ?? [];

function familyButtons(source: string, legacyClass: string): string[] {
  const matches = buttonBlocks(source).filter((block) => block.includes(legacyClass));
  expect(matches.length, `expected at least one ${legacyClass} button`).toBeGreaterThan(0);
  return matches;
}

function expectChromeUnit(block: string, unit: string): void {
  expect(block).toContain(`data-chrome-unit="${unit}"`);
  expect(block).toMatch(new RegExp(`chromeUnitClassNames\\(\\s*'${unit}'`));
}

function expectRegisteredButton(block: string, legacyClass: string, unit: string): void {
  expectChromeUnit(block, unit);
  expect(block).toContain(`'${legacyClass}'`);
}

function expectRegisteredFamily(source: string, legacyClass: string, unit: string): void {
  for (const block of familyButtons(source, legacyClass)) {
    expectRegisteredButton(block, legacyClass, unit);
  }
}

describe('Level Editor chrome hierarchy', () => {
  it('registers every audited Board view control under its semantic parent', () => {
    const controls = [
      ['adjustZoom(-0.1)', 'inner-minus-key'],
      ['adjustZoom(0.1)', 'inner-plus-key'],
      ['resetBoardView', 'inner-text-button'],
      ['setShowMoves', 'inner-text-button'],
      ['setShowEnemyAttacks', 'inner-text-button'],
      ['setShowBlocked', 'inner-text-button'],
      ['setShowPromotionZones', 'inner-text-button'],
      ['setShowGrid', 'inner-text-button'],
    ] as const;
    const blocks = buttonBlocks(levelEditor);
    for (const [handler, unit] of controls) {
      const block = blocks.find((candidate) => candidate.includes(handler));
      expect(block, `expected Board view control using ${handler}`).toBeDefined();
      expectChromeUnit(block!, unit);
    }
    expect(levelEditor).not.toContain('app-header-button');
  });

  it('registers shared steppers, sliders, and reset controls', () => {
    for (const block of familyButtons(sliderRow, 'pages-step')) {
      const unit = block.includes('aria-label="Decrease"') ? 'inner-minus-key' : 'inner-plus-key';
      expectRegisteredButton(block, 'pages-step', unit);
    }
    expectRegisteredFamily(sliderRow, 'pages-mini-reset', 'inner-text-button');

    const stepperButtons = buttonBlocks(stepper);
    const decrease = stepperButtons.find((block) => block.includes('aria-label={decreaseLabel}'));
    const increase = stepperButtons.find((block) => block.includes('aria-label={increaseLabel}'));
    expect(decrease).toBeDefined();
    expect(increase).toBeDefined();
    expectRegisteredButton(decrease!, 'settings-chrome-button', 'inner-minus-key');
    expectRegisteredButton(increase!, 'settings-chrome-button', 'inner-plus-key');
  });

  it('registers generator icon, disclosure, and add commands', () => {
    expectRegisteredFamily(levelEditor, 'le-gen-icon', 'inner-tool-square');
    expectRegisteredFamily(levelEditor, 'le-gen-cover-caret-btn', 'inner-tool-square');
    expectRegisteredFamily(levelEditor, 'le-gen-cover-add', 'inner-text-button');
  });

  it('registers both facing-cell implementations as tool squares', () => {
    expectRegisteredFamily(levelEditor, 'unit-facing-cell', 'inner-tool-square');
    expectRegisteredFamily(studioBoard, 'unit-facing-cell', 'inner-tool-square');
  });

  it('registers dropdown triggers, wrappers, and popup option rows', () => {
    expectRegisteredFamily(paletteSelect, 'palette-select-trigger', 'inner-dropdown');
    expect(houseSelect).toContain("chromeUnitClassNames('inner-dropdown', 'house-select', 'le-select-wrap', className)");
    expect(houseSelect).toMatch(/<div\s+ref=\{rootRef\}\s+data-chrome-unit="inner-dropdown"\s+className=\{rootClass\}>/);

    expectRegisteredFamily(paletteSelect, 'palette-select-option', 'inner-list-row');
    expectRegisteredFamily(houseSelect, 'house-select-option', 'inner-list-row');
    expect(houseSelect).toContain('className="house-select-menu chrome-family-surface"');
  });

  it('registers toggles and both event-list implementations', () => {
    expectRegisteredFamily(toggle, 'settings-toggle', 'inner-toggle');
    expectRegisteredFamily(levelEditor, 'le-md-item', 'inner-list-row');
    expectRegisteredFamily(victoryConditions, 'le-md-item', 'inner-list-row');
  });

  it('registers every asset and material swatch under the shared inner role', () => {
    expectRegisteredFamily(levelEditor, 'le-swatch', 'inner-asset-swatch');
  });

  it('uses the registered dropdown hierarchy for zone color instead of tiny framed swatches', () => {
    expect(levelEditor).toMatch(/<HouseSelect<ZoneColor>[\s\S]*?className="le-zone-color-select"[\s\S]*?ariaLabel=\{`Zone color, selected \$\{activeZoneColorLabel\}`\}[\s\S]*?onChange=\{setActiveZoneColor\}/);
    expect(levelEditor).not.toContain('le-zone-color-button');
    expect(levelEditor).not.toContain('le-zone-color-swatches');
  });

  it('keeps portaled confirmation actions inside an explicit chrome-family surface', () => {
    expect(confirmDialog).toContain('className="confirm-scrim chrome-family-surface"');
    expectRegisteredFamily(confirmDialog, 'le-seg-btn', 'inner-text-button');
  });

  it('keeps the approved title-bar controls on their separate family contract', () => {
    expect(titleBarControls).toContain("'titlebar-control'");
    expect(titleBarControls).not.toContain('data-chrome-unit=');
    expect(titleBarControls).not.toContain('chromeUnitClassNames(');
  });
});
