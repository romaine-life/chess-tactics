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
const eventsWorkspaceStart = levelEditorChromeConsumers.indexOf('export function LevelEditorEventsWorkspace');
const nextEventsWorkspaceExport = levelEditorChromeConsumers.indexOf('\nexport function ', eventsWorkspaceStart + 1);
const eventsWorkspace = eventsWorkspaceStart >= 0
  ? levelEditorChromeConsumers.slice(eventsWorkspaceStart, nextEventsWorkspaceExport >= 0 ? nextEventsWorkspaceExport : undefined)
  : '';

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
  it('uses the shell-owned board workspace for Events instead of a second outer panel', () => {
    expect(levelEditor).toMatch(/className=\{`skirmish-board-frame\$\{eventsOpen \? ' is-events-covered' : ''\}`\}[\s\S]*?inert=\{eventsOpen \? true : undefined\}[\s\S]*?aria-hidden=\{eventsOpen \|\| undefined\}/);
    expect(levelEditor).toMatch(/\{eventsOpen \? \(\s*<LevelEditorEventsWorkspace/);
    expect(levelEditor).toContain('const [eventsOpen, setEventsOpen] = useState(initialEventsOpen);');
    expect(levelEditor).toContain('eventsEditor: routeState.eventsEditor');
    expect(levelEditor).toContain("levelEditorEventsEntry: true");
    expect(levelEditor).toContain("levelEditorEventsBaseHref: baseHref");
    expect(levelEditor).toContain("if (eventsOpenRef.current) {\n      selectEventsTab(tab);\n      return;\n    }");
    expect(levelEditor).toMatch(/disabled=\{eventsOpen\}[\s\S]{0,120}?onClick=\{\(\) => openEventsEditor\('victory'\)\}/);
    expect(levelEditor).not.toContain('window.history.state?.levelEditorRules');
    expect(eventsWorkspace).toContain('<section className="le-events-workspace" data-testid="level-events-workspace" aria-labelledby="level-events-workspace-title">');
    expect(eventsWorkspace).toContain('<ChromeSurfaceFill role="outer" className="le-events-workspace-fill" />');
    expect(eventsWorkspace).toContain('<div className="le-events-workspace-content">');
    expect(eventsWorkspace).toContain('initialFocusRef.current?.focus()');
    expect(eventsWorkspace).toContain("ref={tab === 'victory' ? initialFocusRef : undefined}");
    expect(eventsWorkspace).toContain("ref={tab === 'other' ? initialFocusRef : undefined}");
    expect(eventsWorkspace).not.toContain('<OuterChromeBox');
    expect(eventsWorkspace).not.toContain('role="dialog"');
    expect(eventsWorkspace).not.toContain('events-overlay');
    expect(chromeBox).toContain('data-chrome-fill-role={role}');
    expect(styleCss).toMatch(/\.le-events-workspace\s*\{[\s\S]*?inset:\s*0;[\s\S]*?position:\s*absolute;/);
    expect(styleCss).toMatch(/\.level-editor-screen \.skirmish-board-frame\.is-events-covered\s*\{[\s\S]*?visibility:\s*hidden;/);
    expect(styleCss).toMatch(/\.skirmish-screen\.level-editor-screen\s*\{[\s\S]*?column-gap:\s*0;[\s\S]*?row-gap:\s*0;/);
    expect(styleCss).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.le-events-workspace-content\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?\.le-md\s*\{[\s\S]*?flex-direction:\s*column;/);
    expect(styleCss).not.toContain('.le-events-overlay');
  });

  it('labels scenic terrain extents with the board cardinal edges', () => {
    expect(levelEditor).toMatch(/import \{[^}]*\bsocketEdges\b[^}]*\btype EdgeName\b[^}]*\btype TileFamilyId\b[^}]*\} from '\.\.\/core\/tileSockets';/s);
    expect(levelEditor).toMatch(/SCENIC_TERRAIN_EXTENT_BY_BOARD_EDGE[\s\S]*?north: 'top',[\s\S]*?east: 'right',[\s\S]*?south: 'bottom',[\s\S]*?west: 'left'/);
    expect(levelEditor).toContain('{socketEdges.map((edge) => {');
    expect(levelEditor).toContain('const cardinalLabel = edge[0].toUpperCase() + edge.slice(1);');
    expect(levelEditor).toContain('beyond the ${edge} edge');
    expect(levelEditor).toContain('extension = extendDecorativeTerrainApron<string>(');
    expect(levelEditor).toContain("type ScenicTerrainGenerationMode = 'match-reference' | 'grass';");
    expect(levelEditor).toContain("{ value: 'match-reference', label: 'Match reference tile' }");
    expect(levelEditor).toContain("{ value: 'grass', label: 'Grass' }");
    expect(levelEditor).toContain('ariaLabel="Scenic terrain generation mode"');
    expect(levelEditor).toContain("? { kind: 'fill' as const, value: leDefaultTile().id }");
    expect(levelEditor).toContain(": { kind: 'match-reference' as const }");
    expect(levelEditor).toContain('onIncrease={() => stepScenicTerrainExtent(side, 1)}');
    expect(levelEditor).toContain('onDecrease={() => stepScenicTerrainExtent(side, -1)}');
    expect(levelEditor).toContain('<span className="le-ctrllabel">All directions</span>');
    expect(levelEditor).toContain('decreaseLabel="Reduce scenic terrain one tile in all four directions"');
    expect(levelEditor).toContain('increaseLabel="Extend scenic terrain one tile in all four directions"');
    expect(levelEditor).toContain('onDecrease={() => stepScenicTerrainExtents(SCENIC_TERRAIN_SIDES, -1)}');
    expect(levelEditor).toContain('onIncrease={() => stepScenicTerrainExtents(SCENIC_TERRAIN_SIDES, 1)}');
    expect(levelEditor).toContain('fillScenicTerrainViewportTargets,');
    expect(levelEditor).toContain('scenicTerrainTargetsForViewport,');
    expect(levelEditor).toContain("from './levelEditorViewportTerrain';");
    expect(levelEditor).toContain('onViewportSizeChange={setViewViewportSize}');
    expect(levelEditor).toContain('activeScenicCellKeys: scenicTerrainCoordinateKeys');
    expect(levelEditor).toContain('const playableGridCells = cells.filter(');
    expect(levelEditor).toContain('originCells={playableGridCells}');
    expect(levelEditor).toContain('onClick={fillVisibleScenicTerrain}');
    expect(levelEditor).toContain('>Fill visible area</button>');
    expect(levelEditor).not.toContain("(['top', 'right', 'bottom', 'left'] as const).map");
  });

  it('shares connected terrain selection with an atomic exact-tile area fill', () => {
    expect(levelEditor).toContain("import { paintTerrainArea } from './levelEditorTerrainEditing';");
    expect(levelEditor).toContain('const terrainPatchCellsAt = (x: number, y: number): string[] => {');
    expect(levelEditor).toContain("if (layer !== 'generate') {");
    expect(levelEditor).toContain('setActiveGeneratedRegionId(null);');
    expect(levelEditor).toContain('setRegionSelection(new Set(cells));');
    expect(levelEditor).toContain("setTool('brush');");
    expect(levelEditor).toContain('onRegionStart={selectTerrainArea}');
    expect(levelEditor).toContain('const next = paintTerrainArea(currentEditorBoardRef.current, regionSelection, brushAsset.id);');
    expect(levelEditor).toContain("onClick={() => setTool(tool === 'region' ? 'brush' : 'region')}");
    expect(levelEditor).toContain(">{tool === 'region' ? 'Selecting…' : 'Select area'}</button>");
    expect(levelEditor).toContain('disabled={regionSelection.size === 0}');
    expect(levelEditor).toContain('onClick={fillSelectedTileArea}');
    expect(levelEditor).toContain('>Fill selected area</button>');
    expect(levelEditor).toContain('renderCellOverlay={regionCells && regionCells.size > 0');
    expect(levelEditor).toContain("? (cell) => regionCells.has(`${cell.x},${cell.y}`)");
    expect(levelEditor.match(/<span className="le-region-cell"/g)).toHaveLength(1);
    expect(styleCss).toMatch(/\.le-region-cell\s*\{[\s\S]*?top:\s*0;/);
  });

  it('registers every audited Board view control under its semantic parent', () => {
    const controls = [
      ['adjustZoom(-0.1)', 'inner-minus-key'],
      ['adjustZoom(0.1)', 'inner-plus-key'],
      ['resetBoardView', 'inner-text-button'],
      ['setShowMoves', 'inner-text-button'],
      ['setShowEnemyAttacks', 'inner-text-button'],
      ['setShowBlocked', 'inner-text-button'],
      ['setShowPromotionZones', 'inner-text-button'],
      ['setGridScope', 'inner-text-button'],
    ] as const;
    const blocks = buttonBlocks(levelEditor);
    for (const [handler, unit] of controls) {
      const block = blocks.find((candidate) => candidate.includes(handler));
      expect(block, `expected Board view control using ${handler}`).toBeDefined();
      expectChromeUnit(block!, unit);
    }
    expect(blocks.filter((block) => block.includes('setGridScope'))).toHaveLength(2);
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
    expect(houseSelect).toContain('className="house-select-option-group" role="group"');
    expect(houseSelect).toContain('className="house-select-option-group-label"');
    expect(houseSelect).toContain('{optionIndex > 0 ? <ChromeDivider role="inner" /> : null}');
    expect(houseSelect).toContain('className={`house-select-option ${index === activeIndex ? \'is-active\' : \'\'}`.trim()}');
    expect(houseSelect).not.toContain("chromeUnitClassNames('inner-list-row', 'house-select-option'");
    expect(houseSelect).not.toContain('data-chrome-unit="inner-list-row"');
    expect(houseSelect).toContain("paintOverhang('--le-inner-atom-left-overhang')");
    expect(houseSelect).toContain("paintOverhang('--le-inner-atom-right-overhang')");
    expect(houseSelect).toContain("paintOverhang('--le-inner-atom-top-overhang')");
    expect(houseSelect).toContain("paintOverhang('--le-inner-atom-bottom-overhang')");
    expect(houseSelect).not.toContain('data-disabled=');
    expect(styleCss).not.toMatch(/\.house-select[^\n{]*(?:disabled|data-disabled)[^\n{]*::after/);
  });

  it('uses HouseSelect for every Level Editor dropdown registered as inner-dropdown', () => {
    const nativeSelectOpenings = levelEditor.match(/<select\b[^>]*>/g) ?? [];
    expect(nativeSelectOpenings).toEqual([]);
    expect(nativeSelectOpenings.some((opening) => opening.includes('data-chrome-unit="inner-dropdown"'))).toBe(false);
    expect(nativeSelectOpenings.some((opening) => opening.includes("chromeUnitClassNames('inner-dropdown'"))).toBe(false);
    expect(levelEditor).toMatch(/<HouseSelect<FactionControl>[\s\S]*?ariaLabel=\{`\$\{LE_FACTION_LABELS\[faction\]\} control`\}/);
    expect(levelEditor).toMatch(/<HouseSelect<string>[\s\S]*?ariaLabel="Saved generated region"/);
    expect(levelEditor).toMatch(/<HouseSelect<ScenicTerrainGenerationMode>[\s\S]*?ariaLabel="Scenic terrain generation mode"/);
    expect(levelEditor).toMatch(/<HouseSelect<TileFamilyId>[\s\S]*?className="le-gen-region-select"[\s\S]*?ariaLabel=\{`Region \$\{sectionIndex \+ 1\} terrain`\}/);
    expect(levelEditor).toMatch(/<HouseSelect<GroundCoverId>[\s\S]*?className="le-gen-cover-select"[\s\S]*?ariaLabel=\{`Region \$\{sectionIndex \+ 1\} cover \$\{coverIndex \+ 1\} set`\}/);
    expect(levelEditor).toMatch(/<HouseSelect<string>[\s\S]*?options=\{campaignSelectOptions\}[\s\S]*?ariaLabel="Campaign"[\s\S]*?testId="le-campaign-select"/);
    expect(levelEditor).not.toMatch(/<select[\s\S]{0,240}?aria-label="Campaign"/);
    for (const label of [
      'Victory template',
      'Other event template',
      'Spawn faction',
      'Spawn zone',
      'Promotion faction',
      'Promotion zone',
      'Selected zone',
      'Fence artwork',
      'Composite terrain footprint',
    ]) {
      expect(levelEditor).toContain(`ariaLabel="${label}"`);
      expect(nativeSelectOpenings.some((opening) => opening.includes(`aria-label="${label}"`))).toBe(false);
    }
    expect(levelEditor).toMatch(/<HouseSelect<string>\s+value=\{activeZone\?\.id \?\? ''\}[\s\S]*?disabled=\{!activeZone\}[\s\S]*?ariaLabel="Selected zone"[\s\S]*?onChange=\{selectZoneEntry\}/);
    expect(levelEditor).toContain("...(activeZone ? [] : [{ value: '', label: 'None' }]),");
    expect(levelEditor).toContain('...boardZoneEntries.map((zone, index) => ({ value: zone.id, label: zoneDisplayName(zone, index) }))');
    expect(levelEditor).toMatch(/<HouseSelect<string>\s+value=\{activeFenceArtwork\.id\}[\s\S]*?options=\{fenceArtCatalog\.map\(\(artwork\) => \(\{ value: artwork\.id, label: artwork\.label \}\)\)\}[\s\S]*?ariaLabel="Fence artwork"[\s\S]*?onChange=\{selectFenceArtwork\}/);
    expect(levelEditor).toMatch(/<HouseSelect<string>\s+ariaLabel="Composite terrain footprint"[\s\S]*?value=\{macroTileFootprint\}[\s\S]*?options=\{leMacroTileFootprints\(\)\.map\(\(footprint\) => \(\{ value: footprint, label: footprint \}\)\)\}[\s\S]*?setMacroTileFootprint\(footprint\);[\s\S]*?setMacroTileBrushId\(null\);/);
    expect(levelEditor).not.toContain('function SelectFrame');
    expect(styleCss).not.toContain('.le-layer-select');
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

  it('gives the narrow Zone selector a full row above its four action buttons', () => {
    expect(levelEditor).toContain('<div className="le-ctrlrow le-zone-selection-row">');
    expect(styleCss).toMatch(/\.le-zone-panel \.le-zone-select-controls\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);[\s\S]*?grid-template-rows:\s*var\(--le-zone-row-h\) var\(--le-zone-row-h\);[\s\S]*?height:\s*auto;/);
    expect(styleCss).toMatch(/\.le-zone-panel \.le-zone-select-controls > \.le-select-wrap\s*\{[\s\S]*?grid-column:\s*1 \/ -1;[\s\S]*?grid-row:\s*1;/);
    expect(styleCss).toMatch(/\.le-zone-panel \.le-zone-select-controls > \.le-zone-stepper-button\.settings-chrome-button\s*\{[\s\S]*?grid-row:\s*2;[\s\S]*?width:\s*100%;/);
    expect(styleCss).toMatch(/\.le-zone-panel \.le-zone-selection-row > \.le-ctrllabel\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?height:\s*var\(--le-zone-row-h\);[\s\S]*?justify-content:\s*center;[\s\S]*?text-align:\s*center;/);
  });

  it('keeps portaled confirmation actions inside an explicit chrome-family surface', () => {
    expect(confirmDialog).toContain('className="confirm-scrim chrome-family-surface"');
    expectRegisteredFamily(confirmDialog, 'le-seg-btn', 'inner-text-button');
  });

  it('registers the canonical title-bar control as an inner box', () => {
    expect(titleBarControls).toMatch(/chromeUnitClassNames\(\s*'inner-box'/);
    expect(titleBarControls).toContain('data-chrome-unit="inner-box"');
    expect(titleBarControls).not.toContain('mode-button.png');
  });
});
