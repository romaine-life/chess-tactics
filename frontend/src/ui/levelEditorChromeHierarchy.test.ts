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
const cyclePicker = readFileSync(new URL('./shared/CyclePicker.tsx', import.meta.url), 'utf8');
const assetSwatchList = readFileSync(new URL('./shared/AssetSwatchList.tsx', import.meta.url), 'utf8');
const styleCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
const eventsWorkspaceStart = levelEditorChromeConsumers.indexOf('export function LevelEditorEventsWorkspace');
const eventsWorkspace = eventsWorkspaceStart >= 0
  ? levelEditorChromeConsumers.slice(eventsWorkspaceStart)
  : '';

const buttonBlocks = (source: string): string[] => source.match(/<(?:button|ChromeButton|ChromeNavButton)\b[\s\S]*?<\/(?:button|ChromeButton|ChromeNavButton)>/g) ?? [];

function familyButtons(source: string, legacyClass: string): string[] {
  const matches = buttonBlocks(source).filter((block) => block.includes(legacyClass));
  expect(matches.length, `expected at least one ${legacyClass} button`).toBeGreaterThan(0);
  return matches;
}

function expectChromeUnit(block: string, unit: string): void {
  expect(block.includes(`data-chrome-unit="${unit}"`) || block.includes(`unit="${unit}"`)).toBe(true);
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
  it('shares one shell-owned center-workspace primitive without a parallel outer panel', () => {
    expect(chromeBox).toContain('export function ShellWorkspace');
    expect(chromeBox).toContain('<section {...props} className={`shell-workspace ${className}`.trim()}>');
    expect(chromeBox).toContain('<ChromeSurfaceFill role="outer" className="shell-workspace-fill" />');
    expect(chromeBox).toContain('<div className={`shell-workspace-content ${contentClassName}`.trim()}>');
    expect(chromeBox).not.toContain('export function ShellWorkspaceBody');
    expect(chromeBox).toContain('data-shell-workspace-body=""');

    expect(eventsWorkspace).toContain('<ShellWorkspace');
    expect(eventsWorkspace).toContain('bodyClassName="le-events-workspace-content"');
    expect(eventsWorkspace).toContain('className="le-events-workspace"');
    expect(eventsWorkspace).toContain('data-testid="level-events-workspace"');
    expect(eventsWorkspace).toContain('aria-labelledby="level-events-workspace-title"');
    expect(eventsWorkspace).toContain('initialFocusRef.current?.focus()');
    expect(eventsWorkspace).toContain("ref={tab === 'victory' ? initialFocusRef : undefined}");
    expect(eventsWorkspace).toContain("ref={tab === 'deployment' ? initialFocusRef : undefined}");
    expect(eventsWorkspace).toContain("ref={tab === 'other' ? initialFocusRef : undefined}");
    expect(eventsWorkspace).not.toContain('<OuterChromeBox');
    expect(eventsWorkspace).not.toContain('role="dialog"');
    expect(eventsWorkspace).not.toContain('events-overlay');

    expect(chromeBox).toContain('export function ChromeSurfaceFill');
    expect(chromeBox).toContain('data-chrome-fill-role={role}');
    expect(chromeBox).toContain('<ChromeSurfaceFill role="outer" className="le-outer-panel-fill" />');
    expect(chromeBox).toContain('fillRole?: ChromeRole;');
    expect(chromeBox).toContain('className="inner-chrome-box-fill"');
    expect(levelEditor).toContain('<ShellWorkspace');
    expect(levelEditor).toContain('bodyClassName="le-artwork-workspace-content"');
    expect(levelEditor).toMatch(/<ShellViewportSwap[\s\S]*?className="level-editor-viewport-swap"[\s\S]*?primaryClassName="skirmish-board-frame"[\s\S]*?workspaceOpen=\{eventsOpen \|\| Boolean\(levelArtworkWorkspace\)\}/);
    expect(levelEditor).toMatch(/\{eventsOpen \? \(\s*<LevelEditorEventsWorkspace/);
    expect(levelEditor).toContain('const [eventsOpen, setEventsOpen] = useState(initialEventsOpen);');
    expect(levelEditor).toContain('eventsEditor: routeState.eventsEditor');
    expect(levelEditor).toContain("levelEditorEventsEntry: true");
    expect(levelEditor).toContain("levelEditorEventsBaseHref: baseHref");
    expect(levelEditor).toMatch(/if \(eventsOpenRef\.current\) \{\s*selectEventsTab\(tab\);\s*return;\s*\}/);
    expect(levelEditor).toMatch(/disabled=\{eventsOpen\}[\s\S]{0,200}?onClick=\{\(\) => openEventsEditor\(isWarBattle \? 'deployment' : 'victory'\)\}/);
    expect(levelEditor).not.toContain('window.history.state?.levelEditorRules');
    expect(styleCss).toMatch(/\.shell-workspace\s*\{[\s\S]*?inset:\s*0;[\s\S]*?position:\s*absolute;/);
    expect(styleCss).toMatch(/\.shell-viewport-primary\[data-shell-workspace-covered\]\s*\{[\s\S]*?visibility:\s*hidden;/);
    expect(styleCss).toMatch(/\.shell-workspace-content\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/);
    expect(styleCss).toMatch(/\.shell-workspace-body\s*\{[\s\S]*?padding-block:\s*var\(--shell-workspace-body-inset-block, 0px\);[\s\S]*?padding-inline-start:\s*var\(--shell-workspace-body-inset-start, 0px\);[\s\S]*?padding-inline-end:\s*0;/);
    expect(styleCss).toMatch(/\.level-editor-screen \.le-events-workspace\s*\{[\s\S]*?--shell-workspace-body-inset-block:\s*var\(--main-menu-content-inset-block\);[\s\S]*?--shell-workspace-body-inset-start:\s*var\(--main-menu-content-inset-inline\)/);
    expect(styleCss).toMatch(/\.skirmish-screen\.level-editor-screen\s*\{[\s\S]*?column-gap:\s*0;[\s\S]*?row-gap:\s*0;/);
    expect(styleCss).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*?\.shell-workspace-body-content\s*\{[\s\S]*?overflow-y:\s*auto;/);
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
    expect(levelEditor).toContain('>Fill visible area</ChromeButton>');
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
    expect(levelEditor).toContain(">{tool === 'region' ? 'Selecting…' : 'Select area'}</ChromeButton>");
    expect(levelEditor).toContain('disabled={regionSelection.size === 0}');
    expect(levelEditor).toContain('onClick={fillSelectedTileArea}');
    expect(levelEditor).toContain('>Fill selected area</ChromeButton>');
    expect(levelEditor).toContain('renderCellOverlay={regionCells && regionCells.size > 0');
    expect(levelEditor).toContain('? (cell) => {');
    expect(levelEditor).toContain('const key = `${cell.x},${cell.y}`;');
    expect(levelEditor).toContain('return regionCells.has(key)');
    expect(levelEditor.match(/<span\s+className="le-region-cell"/g)).toHaveLength(1);
    expect(styleCss).toMatch(/\.le-region-cell\s*\{[\s\S]*?top:\s*0;/);
  });

  it('keeps Camera as a dedicated dropdown page with audited controls', () => {
    const controls = [
      ['adjustZoom(-0.1)', 'inner-minus-key'],
      ['adjustZoom(0.1)', 'inner-plus-key'],
      ['resetBoardView', 'inner-text-button'],
      ['setShowMoves', 'inner-text-button'],
      ['setShowEnemyAttacks', 'inner-text-button'],
      ['setShowBlocked', 'inner-text-button'],
      ['setShowPromotionZones', 'inner-text-button'],
      ['setGridScope', 'inner-text-button'],
      ['setCameraBoundaryFromView', 'inner-text-button'],
      ['snapCameraBoundary', 'inner-text-button'],
    ] as const;
    const blocks = buttonBlocks(levelEditor);
    for (const [handler, unit] of controls) {
      const block = blocks.find((candidate) => candidate.includes(handler));
      expect(block, `expected Board view control using ${handler}`).toBeDefined();
      expectChromeUnit(block!, unit);
    }
    expect(blocks.filter((block) => block.includes('setGridScope'))).toHaveLength(2);
    expect(levelEditor).toContain("{ id: 'camera', label: 'Camera' }");
    expect(levelEditor).toMatch(/\) : layer === 'camera' \? \([\s\S]*?ariaLabel="Camera boundary snap preset"[\s\S]*?\) : layer === 'generate'/);
    expect(levelEditor).not.toContain('ariaLabel="Camera boundary display"');
    expect(levelEditor).toContain('ariaLabel="Camera boundary interaction mode"');
    expect(levelEditor).toContain("cameraBoundaryInteractionMode === 'edit' && editorSessionCanWrite");
    expect(levelEditor).toContain('ariaLabel="Camera boundary snap preset"');
    expect(levelEditor).toContain('>Set from view</ChromeButton>');
    expect(levelEditor).toContain('>Snap</ChromeButton>');
    expect(styleCss).toMatch(/\.le-camera-boundary-handle\s*\{[\s\S]*?all:\s*unset;/);
    expect(styleCss).toMatch(/\.le-camera-boundary-handle\.is-move\s*\{[\s\S]*?height:\s*100%;[\s\S]*?inset:\s*0;[\s\S]*?width:\s*100%;/);
    expect(levelEditor).not.toContain('app-header-button');
  });

  it('registers every previous and next control as a concrete mirrored chevron key', () => {
    // Two mirrored pairs remain: layer navigation and the fence artwork stepper. The former
    // third pair stepped the Zone selector, which is now a visible list of rows; the fourth
    // browsed server recovery branches, which no longer exist.
    expect((levelEditor + levelEditorChromeConsumers).match(/<CyclePicker\b/g)).toHaveLength(2);
    const chevronButtons = buttonBlocks(cyclePicker).filter((block) => block.includes('unit="inner-chevron-key"'));
    expect(chevronButtons).toHaveLength(2);
    expect(cyclePicker).toContain('className={`stepper-glyph stepper-chevron stepper-chevron-${direction === \'previous\' ? \'left\' : \'right\'}`}');
    expect(styleCss).toMatch(/\.stepper-chevron::before\s*\{[\s\S]*?inset-inline-start:\s*4px;[\s\S]*?transform:\s*rotate\(45deg\);/);
    expect(styleCss).toMatch(/\.stepper-chevron-right\s*\{[\s\S]*?transform:\s*scaleX\(-1\);/);
    expect(styleCss).not.toMatch(/\.stepper-chevron-right::before\s*\{/);
    expect(chromeUnitAudit).toMatch(/unit\.id === 'inner-chevron-key'[\s\S]*?stepper-glyph stepper-chevron/);
    expect(levelEditorChromeConsumers).toContain('<ShellControlsPanel');
    expect(chromeBox).toContain('<span className="kit-panel-title-text">{children}</span>');
  });

  it('aligns inner rails to the contents box while atom paint gets a separate clip apron', () => {
    expect(styleCss).toMatch(/:is\(\.level-editor-screen, \.skirmish-screen, \.chrome-family-surface\) \.outer-chrome-header > :not\(\.kit-panel-title\)\s*\{[\s\S]*?margin-inline:\s*var\(--le-control-content-inset\)/);
    expect(styleCss).toMatch(/\.le-hud-scroll\s*\{[\s\S]*?margin-inline:[\s\S]*?--le-inner-atom-left-overhang[\s\S]*?--le-inner-atom-right-overhang/);
    // The rail's share is --kit-scroll-gutter (ADR-0536) so an idle palette collapses it; the
    // atom apron beside it is unaffected and keeps the ADR-0297 content line where it was.
    expect(styleCss).toMatch(/\.le-hud-scroll > \.kit-scroll-content\s*\{[\s\S]*?padding-left:\s*var\(--le-inner-atom-left-overhang[\s\S]*?padding-right:\s*calc\(var\(--kit-scroll-gutter\) \+ var\(--le-inner-atom-right-overhang/);
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
    expect(sliderRow).toMatch(/<input type="range"[\s\S]*?onInput=\{\(event\) => set\(Number\(event\.currentTarget\.value\)\)\}/);

    const stepperButtons = buttonBlocks(stepper);
    const decrease = stepperButtons.find((block) => block.includes('aria-label={decreaseLabel}'));
    const increase = stepperButtons.find((block) => block.includes('aria-label={increaseLabel}'));
    expect(decrease).toBeDefined();
    expect(increase).toBeDefined();
    expectRegisteredButton(decrease!, 'settings-chrome-button', 'inner-minus-key');
    expectRegisteredButton(increase!, 'settings-chrome-button', 'inner-plus-key');

    expect(styleCss).toMatch(/\.pages-ctl-row\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?width:\s*100%;/);
    expect(styleCss).toMatch(/\.pages-ctl-row > input\[type="range"\]\s*\{[\s\S]*?flex-basis:\s*0;/);
    expect(styleCss).toMatch(/\.tileset-control-stack > \*,[\s\S]*?\.tileset-control-stack \.pages-ctl-row\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;/);
  });

  it('registers generator icon, disclosure, and add commands', () => {
    expectRegisteredFamily(levelEditor, 'le-gen-icon', 'inner-tool-square');
    expectRegisteredFamily(levelEditor, 'le-gen-cover-caret-btn', 'inner-tool-square');
    expectRegisteredFamily(levelEditor, 'le-gen-cover-add', 'inner-text-button');
  });

  it('keeps Town and Forest as saved rerunnable units with explicit generation', () => {
    const createTownStart = levelEditor.indexOf('const createTown = (bounds: TownBounds): void => {');
    const createTownEnd = levelEditor.indexOf('const resetTownParams', createTownStart);
    const createTown = levelEditor.slice(createTownStart, createTownEnd);
    expect(createTown).not.toContain('generateTown(');
    expect(createTown).toContain('next.towns = towns;');

    const createForestStart = levelEditor.indexOf('const createForest = (bounds: ForestGridArea): void => {');
    const createForestEnd = levelEditor.indexOf('const addForestAtView', createForestStart);
    const createForest = levelEditor.slice(createForestStart, createForestEnd);
    expect(createForest).not.toContain('generateForest(');
    expect(createForest).toContain('next.forests = forests;');

    const forestSurfaceStart = levelEditor.indexOf('data-testid="forest-placement-surface"');
    const forestSurfaceEnd = levelEditor.indexOf('data-testid="artwork-free-placement-surface"', forestSurfaceStart);
    const forestSurface = levelEditor.slice(forestSurfaceStart, forestSurfaceEnd);
    expect(forestSurface).toContain('createForest(area);');
    expect(forestSurface).not.toContain('generateForest(');

    expect(levelEditor).toContain('onClick={() => generateForest(selectedForest)}');
    expect(levelEditor).toContain("{selectedForestGenerated ? 'Regenerate' : 'Generate'}");
    expect(levelEditor).toContain("{selectedTownGenerated ? 'Regenerate' : 'Generate'}");
    expect(levelEditor).toContain('generatorSeedForRun(forest.seed, forest.fixedSeed === true)');
    expect(levelEditor).toContain('generatorSeedForRun(town.seed, town.fixedSeed === true)');
    expect(levelEditor.match(/<GeneratorSeedControl/g)).toHaveLength(2);
    expect(levelEditor).toContain('fixed={selectedForest.fixedSeed === true}');
    expect(levelEditor).toContain('fixed={selectedTown.fixedSeed === true}');
    expect(levelEditor).toContain('setBoardForests(board.forests ?? []);');
    expect(levelEditor).toContain('forests: boardForests');
  });

  it('uses container-level Forest presets to stamp explicit editable Section collections', () => {
    expect(levelEditor).toContain('>+ Add Forest art</ChromeButton>');
    expect(levelEditor).toContain('label={`How often · ${tree.weight.toFixed(1)}`}');
    expect(levelEditor).toContain('Remove this Forest art entry');
    expect(levelEditor).toContain('FOREST_ART_PRESETS.map((preset) => {');
    expect(levelEditor).toContain('forestPresetConfiguration(preset.id, forestSpeciesCatalog)');
    expect(levelEditor).toContain('configured.sections.map(({ relationship, ...approach }) => (');
    expect(levelEditor).toContain('materializeForestApproach(approach, relationship)');
    expect(levelEditor).toContain('updateForest(selectedForest.id, { sections });');
    expect(levelEditor).toContain("A preset replaces this Forest's complete Section collection.");
    const forestPreset = levelEditor.indexOf('ariaLabel="Forest presets"');
    const forestAdd = levelEditor.indexOf('>+ Add Forest art</ChromeButton>');
    expect(forestPreset).toBeGreaterThan(0);
    expect(forestPreset).toBeLessThan(forestAdd);
    expect(levelEditor).toContain("{selectedForest.sections.length ? '+ Add mixed Section' : '+ Add Section'}");
    expect(levelEditor).toContain('>+ Add distinct Section</ChromeButton>');
    expect(levelEditor).not.toContain('disabled={!section.trees.length}');
    expect(levelEditor).not.toContain('selectedForest.sections.length > 1 ?');
    expect(levelEditor).not.toContain('setForestSpecies');
  });

  it('uses container-level Town presets to stamp Plan-owning Section collections', () => {
    expect(levelEditor).toContain('TOWN_PRESETS.map((preset) => {');
    expect(levelEditor).toContain('townPresetConfiguration(preset.id, townBuildingCatalog)');
    expect(levelEditor).toContain('materializeTownApproach(approach, relationship)');
    expect(levelEditor).toContain('updateTown(selectedTown.id, { sections });');
    expect(levelEditor).toContain("A preset replaces this Town's complete Section collection.");
    const sectionPreset = levelEditor.indexOf('ariaLabel="Town presets"');
    const plan = levelEditor.indexOf('aria-label={`Section ${index + 1} plan`}');
    const townAdd = levelEditor.indexOf('>+ Add building</ChromeButton>');
    expect(sectionPreset).toBeGreaterThan(0);
    expect(sectionPreset).toBeLessThan(plan);
    expect(plan).toBeLessThan(townAdd);
    expect(levelEditor).toContain("newTownSection(selectedTown.sections.length ? 'mixed' : 'distinct')");
    expect(levelEditor).toContain("newTownSection('distinct')");
    expect(levelEditor).toContain('composeGeneratorSections(generatedTown.bounds, generatedTown.sections, generatedTown.seed)');
    expect(levelEditor).toContain('composeGeneratorSections(generatedForest.bounds, generatedForest.sections, generatedForest.seed)');
    expect(levelEditor).toContain('scopeId: section.id');
    expect(levelEditor).not.toContain('aria-label="Town plan"');
    expect(levelEditor).not.toContain('Territory weight');
    expect(levelEditor).toContain("{selectedTown.sections.length ? '+ Add mixed Section' : '+ Add Section'}");
    expect(levelEditor).not.toMatch(/aria-expanded=\{townSectionOpen\(section\)\}[\s\S]{0,120}disabled=/);
    expect(levelEditor).not.toContain('selectedTown.sections.length > 1 ?');
  });

  it('registers both facing-cell implementations as tool squares', () => {
    expectRegisteredFamily(levelEditor, 'unit-facing-cell', 'inner-tool-square');
    expectRegisteredFamily(studioBoard, 'unit-facing-cell', 'inner-tool-square');
  });

  it('offers only complete eight-way artwork and keeps its facing control in the source brush panel', () => {
    expect(levelEditor).toContain('STRUCTURE_ART_ASSETS.filter((asset) => structureArtHasCompleteTurntable(asset.id))');
    expect(levelEditor).toContain("const [artworkBrushDirection, setArtworkBrushDirection] = useState<Direction>('south');");
    expect(levelEditor).toContain('const direction = directions.includes(artworkBrushDirection)');
    expect(levelEditor).toContain('setArtworkBrushDirection(placement.direction);');
    expect(levelEditor).toContain('ariaLabel="Artwork facing"');
    expect(levelEditor).toContain('onSelect={setArtworkFacing}');
    expect(levelEditor).toContain('onRotate={rotateArtworkFacing}');
    expect(levelEditor).not.toContain('ariaLabel="Artwork direction (8-way)"');
    expect(levelEditor).not.toContain('<small>{asset.label} · {directions.length}-way</small>');
    expect(levelEditor).not.toContain('source artwork · ${artworkBrushDirections.length}-way');
  });

  it('registers dropdown triggers and frames each popup as one divided inner box', () => {
    expectRegisteredFamily(paletteSelect, 'palette-select-trigger', 'inner-dropdown');
    expect(houseSelect).toMatch(/chromeUnitClassNames\(\s*'inner-dropdown',\s*'house-select',\s*'le-select-wrap',\s*'house-select-trigger',\s*className,/);
    expect(houseSelect).toMatch(/<ChromeButton unit="inner-dropdown" \{\.\.\.triggerProps\} ref=\{buttonRef\}>/);
    // A picker SEATED in a cell of a divided box names no unit, because `inner-dropdown` IS the
    // 9-slice frame and the cell it fills has no room for one — the box's rails are its edges.
    // Only that fork may go unregistered; every free-standing picker still wears the unit.
    expect(houseSelect).toMatch(/seated\s*\?\s*\['house-select', 'house-select-trigger', 'house-select-seated', className\]/);
    expect(houseSelect).toMatch(/\{seated \? \([\s\S]*?<button \{\.\.\.triggerProps\} type="button" ref=\{buttonRef\}>/);
    expect(houseSelect).not.toContain('<div ref={rootRef} data-chrome-unit="inner-dropdown"');
    expect(houseSelect).toContain('if (option.value !== value) onChange(option.value);');
    // The menu IS the divided box, so its scroll and its gutter are the grid's own rather than a
    // KitScroll this file places and an apron it computes by hand.
    expect(houseSelect).not.toContain("import { KitScroll } from '../KitScroll';");
    expect(houseSelect).toMatch(/<DividedInnerChromeBox[\s\S]*?scroll[\s\S]*?className="house-select-menu-box"/);

    expectRegisteredFamily(paletteSelect, 'palette-select-option', 'inner-list-row');
    expect(houseSelect).toContain('className="house-select-menu chrome-family-surface"');
    expect(houseSelect).toContain('className="house-select-menu-box"');
    expect(houseSelect).toContain('className="house-select-option-group"');
    expect(houseSelect).toContain('role="group"');
    expect(houseSelect).toContain('className="house-select-option-group-label"');
    // Every rail in the menu belongs to the grid. A divider written HERE could only cap its ends as
    // though they met a frame, and the ends it actually has are row boundaries the grid owns.
    expect(houseSelect).not.toContain('<ChromeDivider');
    expect(houseSelect).toMatch(/<ChromeDividedGridRow\s+key=\{option\.value\}\s+as="button"/);
    expect(houseSelect).toContain('className={`house-select-option ${index === activeIndex ? \'is-active\' : \'\'}`.trim()}');
    expect(houseSelect).not.toContain("chromeUnitClassNames('inner-list-row', 'house-select-option'");
    expect(houseSelect).not.toContain('data-chrome-unit="inner-list-row"');
    expect(houseSelect).toContain("paintOverhang('--le-inner-atom-left-overhang')");
    expect(houseSelect).toContain("paintOverhang('--le-inner-atom-right-overhang')");
    expect(houseSelect).toContain("paintOverhang('--le-inner-atom-top-overhang')");
    expect(houseSelect).toContain("paintOverhang('--le-inner-atom-bottom-overhang')");
    expect(houseSelect).not.toContain('data-disabled=');
    expect(styleCss).toMatch(/\.house-select-menu-box > \.chrome-divided-grid__scroll\s*\{[\s\S]*?max-block-size:\s*calc\(var\(--house-select-menu-max-height, 260px\) - \(var\(--le-chrome-inner-rail-w, 7px\) \* 2\)\);/);
    expect(styleCss).not.toContain('--house-select-clip-apron-right');
    expect(styleCss).not.toMatch(/\.house-select[^\n{]*(?:disabled|data-disabled)[^\n{]*::after/);
  });

  it('uses HouseSelect for every Level Editor dropdown registered as inner-dropdown', () => {
    const nativeSelectOpenings = levelEditor.match(/<select\b[^>]*>/g) ?? [];
    expect(nativeSelectOpenings).toEqual([]);
    expect(nativeSelectOpenings.some((opening) => opening.includes('data-chrome-unit="inner-dropdown"'))).toBe(false);
    expect(nativeSelectOpenings.some((opening) => opening.includes("chromeUnitClassNames('inner-dropdown'"))).toBe(false);
    // The unit brush picks a DECLARED FACTION, never a bare colour: the option names the role and
    // carries the declaration's colour with it.
    expect(levelEditor).toMatch(/<HouseSelect<FactionRole>[\s\S]*?ariaLabel="Paint faction"/);
    expect(levelEditor).toMatch(/<HouseSelect<string>[\s\S]*?ariaLabel="Saved generated region"/);
    expect(levelEditor).toMatch(/<HouseSelect<ScenicTerrainGenerationMode>[\s\S]*?ariaLabel="Scenic terrain generation mode"/);
    expect(levelEditor).toMatch(/<HouseSelect<TileFamilyId>[\s\S]*?className="le-gen-region-select"[\s\S]*?ariaLabel=\{`Region \$\{sectionIndex \+ 1\} terrain`\}/);
    expect(levelEditor).toMatch(/<HouseSelect<GroundCoverId>[\s\S]*?className="le-gen-cover-select"[\s\S]*?ariaLabel=\{`Region \$\{sectionIndex \+ 1\} cover \$\{coverIndex \+ 1\} set`\}/);
    expect(levelEditor).toMatch(/<HouseSelect<CameraBoundaryInteractionMode>[\s\S]*?ariaLabel="Camera boundary interaction mode"/);
    expect(levelEditor).toMatch(/<HouseSelect<BoardCameraSnapMode>[\s\S]*?ariaLabel="Camera boundary snap preset"/);
    expect(levelEditor).toMatch(/<HouseSelect<string>[\s\S]*?options=\{campaignSelectOptions\}[\s\S]*?ariaLabel="Campaign"[\s\S]*?testId="le-campaign-select"/);
    expect(levelEditor).not.toMatch(/<select[\s\S]{0,240}?aria-label="Campaign"/);
    for (const label of [
      'Victory template',
      'Other event template',
      'Promotion faction',
      'Promotion zone',
      'Fence artwork',
      'Composite terrain footprint',
    ]) {
      expect(levelEditor).toContain(`ariaLabel="${label}"`);
      expect(nativeSelectOpenings.some((opening) => opening.includes(`aria-label="${label}"`))).toBe(false);
    }
    // The zone list shows only the zones that are ON the level: a dedicated deployment zone whose
    // type is not broken off is retained but hidden, and must not be selectable (ADR-0367).
    expect(levelEditor).toContain('{visibleZoneIndices.map((index) => {');
    expect(levelEditor).toMatch(/<HouseSelect<string>\s+value=\{activeFenceArtwork\.id\}[\s\S]*?options=\{fenceArtCatalog\.map\(\(artwork\) => \(\{ value: artwork\.id, label: artwork\.label \}\)\)\}[\s\S]*?ariaLabel="Fence artwork"[\s\S]*?onChange=\{selectFenceArtwork\}/);
    expect(levelEditor).toMatch(/<HouseSelect<string>\s+ariaLabel="Composite terrain footprint"[\s\S]*?value=\{macroTileFootprint\}[\s\S]*?options=\{leMacroTileFootprints\(\)\.map\(\(footprint\) => \(\{ value: footprint, label: footprint \}\)\)\}[\s\S]*?setMacroTileFootprint\(footprint\);[\s\S]*?setMacroTileBrushId\(null\);/);
    expect(levelEditor).not.toContain('function SelectFrame');
    expect(styleCss).not.toContain('.le-layer-select');
    // The declaration's colour select rides a LABELLED row, like every other editor control.
    expect(levelEditor).toMatch(/<span className="le-ctrllabel">Colour<\/span>\s*<PaletteSelect\s+className="le-faction-color-select"/);
    expect(levelEditor).not.toContain('<div className="le-faction-fields">');
  });

  it('does not substitute another fence kit for a retired or unknown review id', () => {
    expect(levelEditor).not.toMatch(/fenceArtKit\(fenceArtCatalog, selectedFenceArtworkId\)\s*\?\?\s*fenceArtCatalog\[0\]/);
    expect(levelEditor).toContain("url.searchParams.delete('artReview')");
    expect(levelEditor).toContain("url.searchParams.delete('fenceArt')");
  });

  it('registers toggles and both event-list implementations', () => {
    expectRegisteredFamily(toggle, 'settings-toggle', 'inner-toggle');
    expectRegisteredFamily(levelEditor, 'le-md-item', 'inner-list-row');
    expectRegisteredFamily(victoryConditions, 'le-md-item', 'inner-list-row');
  });

  it('registers every asset and material swatch under the shared inner role', () => {
    expect(levelEditor.match(/<AssetSwatchList\b/g)).toHaveLength(15);
    expect(assetSwatchList).toContain('unit="inner-asset-swatch"');
    expect(assetSwatchList).toContain('className={`le-swatch ${item.className ?? \'\'}`.trim()}');
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

  it('picks a zone from a visible list of registered rows, not a dropdown behind chevrons', () => {
    expectRegisteredFamily(levelEditor, 'le-zone-row', 'inner-list-row');
    expect(levelEditor).toContain('<div className="le-zone-list" role="group" aria-label="Zones">');
    expect(levelEditor).toContain('selected={index === selectedZoneIndex}');
    // Every zone's tint dot rides its own row, so the list reads as the board's legend.
    expect(levelEditor).toMatch(/<span className=\{`le-zone-dot le-zone-\$\{zoneDisplayColor\(entry\)\}`\}/);
    // The retired control: no CyclePicker, no HouseSelect, and no ± keys for the zone list.
    expect(levelEditor).not.toContain('le-zone-cycle');
    expect(levelEditor).not.toContain('le-zone-select-controls');
    expect(levelEditor).not.toContain('le-zone-stepper-button');
    expect(levelEditor).not.toContain("ariaLabel=\"Selected zone\"");
    expect(styleCss).not.toContain('.le-zone-cycle');
  });

  it('keeps a cycle picker owning its own three-column track instead of display: contents', () => {
    // `display: contents` removes the box but NOT the DOM parent, so every `.le-<host> > .le-child`
    // placement rule written against the collapsed picker silently stops matching and its keys
    // pile onto the value control. Each host lays its own chevron/value/chevron track out.
    expect(styleCss).toMatch(/\.le-layer-picker-row\s*\{[\s\S]*?grid-template-columns:\s*var\(--le-inner-square\) minmax\(0, 1fr\) var\(--le-inner-square\);/);
    expect(styleCss).toMatch(/\.le-fence-artwork-cycle\s*\{[\s\S]*?grid-template-columns:\s*28px minmax\(0, 1fr\) 28px;/);
    expect(styleCss).not.toMatch(/\.le-[\w-]*(?:cycle|picker-row)\s*\{[^}]*display:\s*contents;/);
  });

  it('keeps portaled confirmation actions inside an explicit chrome-family surface', () => {
    expect(confirmDialog).toContain('className="confirm-scrim chrome-family-surface"');
    expectRegisteredFamily(confirmDialog, 'le-seg-btn', 'inner-text-button');
  });

  it('defaults destructive confirmations to cancel instead of treating Enter as approval', () => {
    expect(confirmDialog).toContain("if (tone === 'danger') cancelButtonRef.current?.focus();");
    expect(confirmDialog).toContain("event.key === 'Enter' && tone !== 'danger'");
    expect(confirmDialog).toContain('data-testid="confirm-cancel"');
    expect(confirmDialog).toContain("event.key === 'Tab'");
  });

  it('registers the canonical title-bar control as an inner box', () => {
    expect(titleBarControls).toMatch(/chromeUnitClassNames\(\s*'inner-box'/);
    expect(titleBarControls).toContain('data-chrome-unit="inner-box"');
    expect(titleBarControls).not.toContain('mode-button.png');
  });
});
