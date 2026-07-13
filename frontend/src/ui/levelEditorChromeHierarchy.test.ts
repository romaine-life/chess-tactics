// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const levelEditor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const levelEditorChromeConsumers = readFileSync(new URL('./LevelEditorChromeConsumers.tsx', import.meta.url), 'utf8');
const chromeUnitAudit = readFileSync(new URL('./ChromeUnitAudit.tsx', import.meta.url), 'utf8');
const sliderRow = readFileSync(new URL('./dressing/SliderRow.tsx', import.meta.url), 'utf8');
const studioBoard = readFileSync(new URL('./studioBoard.tsx', import.meta.url), 'utf8');
const paletteSelect = readFileSync(new URL('./shared/PaletteSelect.tsx', import.meta.url), 'utf8');
const toggle = readFileSync(new URL('./shared/Toggle.tsx', import.meta.url), 'utf8');
const victoryConditions = readFileSync(new URL('./VictoryConditionsEditor.tsx', import.meta.url), 'utf8');
const stepper = readFileSync(new URL('./shared/Stepper.tsx', import.meta.url), 'utf8');
const houseSelect = readFileSync(new URL('./shared/HouseSelect.tsx', import.meta.url), 'utf8');
const chromeBox = readFileSync(new URL('./shared/ChromeBox.tsx', import.meta.url), 'utf8');
const confirmDialog = readFileSync(new URL('./shared/ConfirmDialog.tsx', import.meta.url), 'utf8');
const titleBarControls = readFileSync(new URL('./shell/TitleBarControls.tsx', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

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

  it('registers every previous and next control as a concrete mirrored chevron key', () => {
    const chevronButtons = [
      ...buttonBlocks(levelEditorChromeConsumers),
      ...buttonBlocks(levelEditor),
    ].filter((block) => block.includes('stepper-chevron'));

    expect(chevronButtons).toHaveLength(6);
    for (const block of chevronButtons) expectChromeUnit(block, 'inner-chevron-key');
    expect(chevronButtons.filter((block) => block.includes('stepper-chevron-left'))).toHaveLength(3);
    expect(chevronButtons.filter((block) => block.includes('stepper-chevron-right'))).toHaveLength(3);
    expect(styleCss).toMatch(/\.stepper-chevron::before\s*\{[\s\S]*?inset-inline-start:\s*4px;[\s\S]*?transform:\s*rotate\(45deg\);/);
    expect(styleCss).toMatch(/\.stepper-chevron-right\s*\{[\s\S]*?transform:\s*scaleX\(-1\);/);
    expect(styleCss).not.toMatch(/\.stepper-chevron-right::before\s*\{/);
    expect(chromeUnitAudit).toMatch(/unit\.id === 'inner-chevron-key'[\s\S]*?stepper-glyph stepper-chevron/);
    expect(levelEditorChromeConsumers).toContain('<OuterChromeHeader title="Controls">');
    expect(chromeBox).toContain('<span className="kit-panel-title-text">{children}</span>');
  });

  it('aligns inner rails to the contents box while atom paint gets a separate clip apron', () => {
    expect(styleCss).toMatch(/:is\(\.level-editor-screen, \.skirmish-screen, \.chrome-family-surface\) \.outer-chrome-header > :not\(\.kit-panel-title\)\s*\{[\s\S]*?margin-inline:\s*var\(--le-control-content-inset\)/);
    expect(styleCss).toMatch(/\.le-hud-scroll\s*\{[\s\S]*?margin-inline:[\s\S]*?--le-inner-atom-left-overhang[\s\S]*?--le-inner-atom-right-overhang/);
    expect(styleCss).toMatch(/\.le-hud-scroll > \.kit-scroll-content\s*\{[\s\S]*?padding-left:\s*var\(--le-inner-atom-left-overhang[\s\S]*?padding-right:\s*calc\(18px \+ var\(--le-inner-atom-right-overhang/);
    expect(styleCss).toMatch(/\.le-md-rules\s*\{[\s\S]*?margin-inline:[\s\S]*?--le-inner-atom-left-overhang[\s\S]*?padding-left:\s*var\(--le-inner-atom-left-overhang/);
    expect(styleCss).toMatch(/\.le-md-detail\s*\{[\s\S]*?margin-inline:[\s\S]*?--le-inner-atom-left-overhang[\s\S]*?padding-left:\s*var\(--le-inner-atom-left-overhang/);
    expect(styleCss).not.toContain('--le-inner-atom-left-footprint');
    expect(styleCss).not.toContain('--le-inner-atom-right-footprint');
    expect(styleCss).not.toContain('--le-visible-content-left-inset');
    expect(styleCss).not.toContain('--le-visible-content-right-inset');
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

  it('registers dropdown triggers and frames each popup as one divided inner box', () => {
    expectRegisteredFamily(paletteSelect, 'palette-select-trigger', 'inner-dropdown');
    expect(houseSelect).toContain("chromeUnitClassNames('inner-dropdown', 'house-select', 'le-select-wrap', className)");
    expect(houseSelect).toMatch(/<div\s+ref=\{rootRef\}\s+data-chrome-unit="inner-dropdown"\s+className=\{rootClass\}>/);
    expect(houseSelect).toContain('if (option.value !== value) onChange(option.value);');
    expect(houseSelect).toContain("import { KitScroll } from '../KitScroll';");
    expect(houseSelect).toMatch(/<KitScroll\s+className="house-select-menu-scroll"/);

    expectRegisteredFamily(paletteSelect, 'palette-select-option', 'inner-list-row');
    expect(houseSelect).toContain('className="house-select-menu chrome-family-surface"');
    expect(houseSelect).toContain('<InnerChromeBox');
    expect(houseSelect).toContain('className="house-select-menu-box"');
    expect(houseSelect).toContain('{index > 0 ? <ChromeDivider role="inner" /> : null}');
    expect(houseSelect).toContain('className={`house-select-option ${index === activeIndex ? \'is-active\' : \'\'}`.trim()}');
    expect(houseSelect).not.toContain("chromeUnitClassNames('inner-list-row', 'house-select-option'");
    expect(houseSelect).not.toContain('data-chrome-unit="inner-list-row"');
    expect(houseSelect).toContain("paintOverhang('--le-inner-atom-left-overhang')");
    expect(houseSelect).toContain("paintOverhang('--le-inner-atom-right-overhang')");
    expect(houseSelect).toContain("paintOverhang('--le-inner-atom-top-overhang')");
    expect(houseSelect).toContain("paintOverhang('--le-inner-atom-bottom-overhang')");
  });

  it('uses HouseSelect for every Level Editor dropdown registered as inner-dropdown', () => {
    const nativeSelectOpenings = levelEditor.match(/<select\b[^>]*>/g) ?? [];
    expect(nativeSelectOpenings.some((opening) => opening.includes('data-chrome-unit="inner-dropdown"'))).toBe(false);
    expect(nativeSelectOpenings.some((opening) => opening.includes("chromeUnitClassNames('inner-dropdown'"))).toBe(false);
    expect(levelEditor).toMatch(/<HouseSelect<FactionControl>[\s\S]*?ariaLabel=\{`\$\{LE_FACTION_LABELS\[faction\]\} control`\}/);
    expect(levelEditor).toMatch(/<HouseSelect<string>[\s\S]*?ariaLabel="Saved generated region"/);
    expect(levelEditor).toMatch(/<HouseSelect<TileFamilyId>[\s\S]*?className="le-gen-region-select"[\s\S]*?ariaLabel=\{`Region \$\{sectionIndex \+ 1\} terrain`\}/);
    expect(levelEditor).toMatch(/<HouseSelect<GroundCoverId>[\s\S]*?className="le-gen-cover-select"[\s\S]*?ariaLabel=\{`Region \$\{sectionIndex \+ 1\} cover \$\{coverIndex \+ 1\} set`\}/);
    expect(levelEditor).toContain('<div className="le-faction-fields">');
  });

  it('registers toggles and both event-list implementations', () => {
    expectRegisteredFamily(toggle, 'settings-toggle', 'inner-toggle');
    expectRegisteredFamily(levelEditor, 'le-md-item', 'inner-list-row');
    expectRegisteredFamily(victoryConditions, 'le-md-item', 'inner-list-row');
  });

  it('registers every asset and material swatch under the shared inner role', () => {
    expectRegisteredFamily(levelEditor, 'le-swatch', 'inner-asset-swatch');
  });

  it('registers the shared active-brush thumbnail as a free-form inner box', () => {
    expect(levelEditor).toMatch(/<span\s+data-chrome-unit="inner-box"\s+className=\{chromeUnitClassNames\('inner-box', 'le-brush-thumb'\)\}/);
    expect(levelEditor).toContain('<div className="le-brush-pick">');
    expect(levelEditor).toContain('<span className="le-brush-thumb-viewport">');
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
