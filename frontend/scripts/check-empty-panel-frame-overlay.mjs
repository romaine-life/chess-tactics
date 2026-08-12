#!/usr/bin/env node
// Guard for ADR-0081/0069/0070/0093: empty outer control-panel frames must be overlays, not
// layout borders that reserve a fake colored moat; house chrome in the focused
// skirmish/editor control panels must consume outer/inner role variables instead
// of local frame paths and widths. Media bytes and candidate-source validation
// belong to the live backend; this repository guard inspects code-owned geometry
// and consumer wiring only.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(frontend, 'src/style.css'), 'utf8').replace(/\r\n/g, '\n');
const chromeLab = readFileSync(join(frontend, 'src/ui/ChromeLab.tsx'), 'utf8');
const chromeUnitAudit = readFileSync(join(frontend, 'src/ui/ChromeUnitAudit.tsx'), 'utf8');
const chromeRuntime = readFileSync(join(frontend, 'src/ui/chromeFamilyRuntime.ts'), 'utf8');
const chromeUnitRegistry = readFileSync(join(frontend, 'src/ui/chromeUnitRegistry.ts'), 'utf8');
const levelEditor = readFileSync(join(frontend, 'src/ui/LevelEditor.tsx'), 'utf8');
const levelEditorChromeConsumers = readFileSync(join(frontend, 'src/ui/LevelEditorChromeConsumers.tsx'), 'utf8');
const houseSelect = readFileSync(join(frontend, 'src/ui/shared/HouseSelect.tsx'), 'utf8');
const chromeBox = readFileSync(join(frontend, 'src/ui/shared/ChromeBox.tsx'), 'utf8');
const chromeButton = readFileSync(join(frontend, 'src/ui/shared/ChromeButton.tsx'), 'utf8');
const cyclePicker = readFileSync(join(frontend, 'src/ui/shared/CyclePicker.tsx'), 'utf8');
const chromeDividedGrid = readFileSync(join(frontend, 'src/ui/shared/ChromeDividedGrid.tsx'), 'utf8');
const skirmish = readFileSync(join(frontend, 'src/ui/Skirmish.tsx'), 'utf8');
const skirmishShell = readFileSync(join(frontend, 'src/ui/SkirmishShell.tsx'), 'utf8');
const skirmishHud = readFileSync(join(frontend, 'src/ui/SkirmishHud.tsx'), 'utf8');
// The command card is painted by the Controls tab AND by the Studio review that composes
// its marks, so the card itself is one shared component. Its assertions follow it there
// rather than pinning them to the screen it used to live on — a review that painted a
// lookalike card would prove nothing about the card.
const commandCard = readFileSync(join(frontend, 'src/ui/shared/CommandCard.tsx'), 'utf8');
const pawnPromotionPicker = readFileSync(join(frontend, 'src/ui/PawnPromotionPicker.tsx'), 'utf8');
const strategikon = readFileSync(join(frontend, 'src/ui/Strategikon.tsx'), 'utf8');
const runScreen = readFileSync(join(frontend, 'src/ui/RunScreen.tsx'), 'utf8');
const runForm = readFileSync(join(frontend, 'src/ui/RunForm.tsx'), 'utf8');
const runDeploymentCardStack = readFileSync(join(frontend, 'src/ui/RunDeploymentCardStack.tsx'), 'utf8');
const runArmyWorkspace = readFileSync(join(frontend, 'src/ui/RunArmyWorkspace.tsx'), 'utf8');
const runExpunctioWorkspace = readFileSync(join(frontend, 'src/ui/RunExpunctioWorkspace.tsx'), 'utf8');
const runLipsana = readFileSync(join(frontend, 'src/ui/Lipsana.tsx'), 'utf8');
const runWorkspace = readFileSync(join(frontend, 'src/ui/RunWorkspace.tsx'), 'utf8');
const portraitEditor = readFileSync(join(frontend, 'src/ui/PortraitEditor.tsx'), 'utf8');
const installedChromeCss = readFileSync(join(frontend, 'src/ui/useInstalledChromeCss.ts'), 'utf8');
const victoryConditionsEditor = readFileSync(join(frontend, 'src/ui/VictoryConditionsEditor.tsx'), 'utf8');
const confirmDialog = readFileSync(join(frontend, 'src/ui/shared/ConfirmDialog.tsx'), 'utf8');
const failures = [];

function sourceFilesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(absolute);
    return entry.isFile() && entry.name.endsWith('.tsx') ? [absolute] : [];
  });
}

const shellOwnerPath = join(frontend, 'src/ui/shared/ChromeBox.tsx');
const shellCallerSources = sourceFilesUnder(join(frontend, 'src/ui'))
  .filter((path) => path !== shellOwnerPath)
  .map((path) => ({ path, source: readFileSync(path, 'utf8') }));

function blockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? '';
}

function blocksTargeting(selector) {
  const targets = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectorList = match[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (selectorList.split(',').some((entry) => entry.trim().endsWith(selector))) {
      targets.push(match[2]);
    }
  }
  return targets;
}

function exportedFunctionSource(source, functionName) {
  const marker = `export function ${functionName}`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const nextExport = source.indexOf('\nexport function ', start + marker.length);
  return source.slice(start, nextExport >= 0 ? nextExport : undefined);
}

function ruleContains(selector, token) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)${escaped}\\s*\\{[^}]*${escapedToken}`).test(css);
}

const rail = blockFor('.level-editor-screen .skirmish-hud');
if (!rail) failures.push('missing .level-editor-screen .skirmish-hud override');
const outerPanelSelector = ':is(.level-editor-screen, .skirmish-screen) .le-outer-panel';
const outerPanel = blockFor(outerPanelSelector);
if (!outerPanel) failures.push('missing shared Level Editor/Skirmish .le-outer-panel chrome contract');
const screen = blockFor('.level-editor-screen');
if (!screen) failures.push('missing .level-editor-screen chrome role host');
const skirmishScreen = blockFor('.skirmish-screen');
if (!skirmishScreen) failures.push('missing .skirmish-screen chrome role host');
const levelEditorScreen = blockFor('.skirmish-screen.level-editor-screen');
if (!levelEditorScreen
  || !/column-gap\s*:\s*0\s*;/.test(levelEditorScreen)
  || !/row-gap\s*:\s*0\s*;/.test(levelEditorScreen)) {
  failures.push('level editor workspace and controls must meet without exposing the scenic backdrop gap');
}
for (const token of [
  '--skirmish-chrome-outer-rail-w',
  '--skirmish-chrome-inner-rail-w',
  '--skirmish-chrome-outer-panel-image',
  '--skirmish-chrome-outer-line-image',
  '--skirmish-chrome-inner-control-image',
  '--skirmish-chrome-inner-control-active-image',
  '--skirmish-chrome-inner-control-danger-image',
  '--skirmish-chrome-inner-line-image',
  '--skirmish-chrome-inner-line-warm-image',
  '--skirmish-chrome-inner-line-success-image',
  '--skirmish-chrome-inner-line-warning-image',
  '--skirmish-chrome-inner-line-error-image',
]) {
  if (skirmishScreen && !new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(skirmishScreen)) {
    failures.push(`skirmish control-panel chrome role host must declare ${token}`);
  }
}
for (const token of [
  '--le-chrome-outer-rail-w',
  '--le-chrome-inner-rail-w',
  '--le-outer-content-padding',
]) {
  if (skirmishScreen && !new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(skirmishScreen)) {
    failures.push(`skirmish must participate in the shared outer-panel role via ${token}`);
  }
}
if (!/--le-chrome-outer-rail-w\s*:\s*12px\s*;/.test(screen)) {
  failures.push('level editor must declare the accepted rendered outer rail size');
}
if (!/--le-chrome-inner-rail-w\s*:\s*7px\s*;/.test(screen)) {
  failures.push('level editor must declare the accepted rendered inner rail size');
}
if (!/--le-outer-atom-outset\s*:\s*0px\s*;/.test(screen)) {
  failures.push('level editor must declare a default outer atom outset for fixed chrome consumers');
}
if (!/--skirmish-chrome-outer-rail-w\s*:\s*var\(--le-chrome-outer-rail-w\)\s*;/.test(screen)) {
  failures.push('level editor outer role must alias into the shared skirmish control-panel chrome host');
}
if (!/--skirmish-chrome-inner-rail-w\s*:\s*var\(--le-chrome-inner-rail-w\)\s*;/.test(screen)) {
  failures.push('level editor inner role must alias into the shared skirmish control-panel chrome host');
}
for (const token of [
  '--le-inner-control-h',
  '--le-inner-field-h',
  '--le-inner-square',
  '--le-inner-control-compact-h',
  '--le-inner-tab-compact-h',
  '--le-inner-row-h',
]) {
  if (screen && !new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(screen)) {
    failures.push(`level editor must declare the named inner size role ${token}`);
  }
}
if (!/--le-control-rail-w\s*:\s*var\(--le-chrome-outer-rail-w\)\s*;/.test(outerPanel)) {
  failures.push('level editor outer-panel class must consume the outer chrome role');
}
if (!/border\s*:\s*0\s*;/.test(outerPanel)) failures.push('level editor outer-panel class must set border: 0');
if (!/border-image\s*:\s*none\s*;/.test(outerPanel)) failures.push('level editor outer-panel class must set border-image: none');
if (!/padding\s*:\s*0\s*;/.test(outerPanel)) failures.push('level editor outer-panel class must not inherit layout padding from skirmish HUD breakpoints');
if (/border-image\s*:\s*url\(/.test(outerPanel)) failures.push('level editor outer-panel class must not draw its frame as a layout border');
if (/--le-control-fill-inset|--kit-panel-divider-frame-scale|--ns-fill-panel/.test(outerPanel)) {
  failures.push('outer-panel Fill Box must be authoritative and must not inherit legacy frame-source inset math');
}
if (!/--le-control-content-inset\s*:\s*var\(--le-outer-content-padding,\s*0px\)\s*;/.test(outerPanel)) {
  failures.push('level editor outer-panel Contents Box must be the complete content inset');
}
if (!/--kit-divider-reach\s*:\s*var\(--le-outer-content-padding,\s*0px\)\s*;/.test(outerPanel)) {
  failures.push('level editor divider reach must derive only from the authoritative Contents Box');
}
if (!/--rail-w\s*:\s*var\(--le-control-rail-w\)\s*;/.test(outerPanel)) {
  failures.push('level editor outer-panel class must provide the kit-divider derived rail-width contract');
}
if (rail && !/grid-area\s*:\s*rail\s*;/.test(rail)) failures.push('level editor control rail must only keep placement in the rail-specific block');
const outerFillLayer = blockFor(`${outerPanelSelector} > .le-outer-panel-fill`);
if (!outerFillLayer
  || !/inset\s*:\s*\n\s*var\(--le-outer-fill-box-top,\s*0px\)\s*\n\s*var\(--le-outer-fill-box-right,\s*0px\)\s*\n\s*var\(--le-outer-fill-box-bottom,\s*0px\)\s*\n\s*var\(--le-outer-fill-box-left,\s*0px\)\s*;/.test(outerFillLayer)) {
  failures.push('level editor outer-panel fill must use the Fill Box values directly as its four insets');
}

const overlay = blockFor(`${outerPanelSelector}::before`);
if (!overlay) failures.push('missing shared .le-outer-panel::before frame overlay');
for (const [re, message] of [
  [/position\s*:\s*absolute\s*;/, 'frame overlay must be absolutely positioned'],
  [/inset\s*:\s*0\s*;/, 'frame overlay must cover the shell edge-to-edge'],
  [/pointer-events\s*:\s*none\s*;/, 'frame overlay must not catch rail interactions'],
  [/border-image\s*:\s*var\(--skirmish-chrome-outer-line-image\)\s+24\s+\/\s+var\(--le-control-rail-w\)\s+round\s*;/, 'frame overlay must draw the role-owned transparent-interior outer line rail'],
]) {
  if (!re.test(overlay)) failures.push(message);
}
if (/border-image\s*:[^;]*\bfill\b/.test(overlay)) failures.push('frame overlay must not use border-image fill; fill is explicit, not implicit');
if (/\/assets\/ui\/kit\/panel\.png/.test(overlay)) failures.push('frame overlay must not use filled panel.png; its edge slices paint a navy moat');

const cards = blockFor('.level-editor-screen .skirmish-card');
if (/padding(?:-inline|-left|-right)?\s*:/.test(cards)) {
  failures.push('frameless rail sections must not recreate frame clearance with padding');
}

const outerPanelContent = blockFor(`${outerPanelSelector} > .le-outer-panel-content`);
if (!outerPanelContent
  || !/overflow\s*:\s*visible\s*;/.test(outerPanelContent)
  || !/gap\s*:\s*var\(--ds-gutter\)\s*;/.test(outerPanelContent)
  || !/padding\s*:\s*var\(--le-control-content-inset\)\s*;/.test(outerPanelContent)
  || /z-index\s*:/.test(outerPanelContent)) {
  failures.push('outer-panel must enforce its named contents inset on the shared visible chrome composition layer');
}
if (!/Chrome children, especially divider atoms, may need to sit over the frame/.test(outerPanelContent)) {
  failures.push('outer-panel composition layer must document why clipping belongs below it');
}
if (!/:is\(\.level-editor-screen, \.skirmish-screen\) \.le-outer-panel > \.le-outer-panel-content > :not\(\.le-control-divider-host\)\s*\{[\s\S]*?z-index\s*:\s*1\s*;/.test(css)) {
  failures.push('outer-panel normal contents must sit above fill but below the decorative frame');
}

if (/\.level-editor-screen \.skirmish-hud > \.le-outer-panel-content[^\{]*\{[\s\S]*?margin-inline\s*:\s*var\(--le-control-content-inset\)/.test(css)) {
  failures.push('outer-panel ordinary content must inherit wrapper padding instead of selector-specific inset margins');
}
if (!/:is\(\.level-editor-screen, \.skirmish-screen\) \.le-outer-panel > \.le-outer-panel-content--titled\s*\{[\s\S]*?padding-block-start\s*:\s*0\s*;/.test(css)
  || !/:is\(\.level-editor-screen, \.skirmish-screen, \.chrome-family-surface\) \.le-outer-panel > \.le-outer-panel-content--titled > :is\(\.outer-chrome-header, \.shell-controls-head\)\s*\{[\s\S]*?margin-inline\s*:\s*calc\(-1 \* var\(--le-control-content-inset\)\)\s*;/.test(css)) {
  failures.push('the titled panel shell must be an explicit full-bleed exception to the inherited contents box');
}

if (!/:is\(\.level-editor-screen, \.skirmish-screen, \.chrome-family-surface\) \.outer-chrome-header > :not\(\.kit-panel-title\)\s*\{[\s\S]*?margin-inline\s*:\s*var\(--le-control-content-inset\)\s*;/.test(css)) {
  failures.push('outer-panel header controls must align to the contents box while the title fill remains full-width');
}

const hudScrollBlock = blockFor('.le-hud-scroll');
const hudScrollContentBlock = blockFor('.le-hud-scroll > .kit-scroll-content');
if (!/margin-inline\s*:/.test(hudScrollBlock)
  || !hudScrollBlock.includes('--le-inner-atom-left-overhang')
  || !hudScrollBlock.includes('--le-inner-atom-right-overhang')
  || !/padding-left\s*:\s*var\(--le-inner-atom-left-overhang/.test(hudScrollContentBlock)
  // The rail's share comes off --kit-scroll-gutter (ADR-0536), never a literal, so an idle
  // palette hands that strip back to its rows while the atom apron stays exactly as wide.
  || !/padding-right\s*:\s*calc\(var\(--kit-scroll-gutter\) \+ var\(--le-inner-atom-right-overhang/.test(hudScrollContentBlock)) {
  failures.push('the Level Editor scrollport must expand a two-sided atom clip apron without moving its rail-aligned content');
}
for (const selector of ['.le-md-rules', '.le-md-detail']) {
  const block = blockFor(selector);
  if (!/margin-inline\s*:/.test(block)
    || !block.includes('--le-inner-atom-left-overhang')
    || !block.includes('--le-inner-atom-right-overhang')
    || !/overflow-x\s*:\s*hidden/.test(block)
    || !/padding-left\s*:\s*var\(--le-inner-atom-left-overhang/.test(block)
    || !block.includes('padding-right: var(--le-inner-atom-right-overhang, 0px)')) {
    failures.push(`${selector} must expose a compensating two-sided atom clip apron without moving the ADR-0297 content line`);
  }
}
if (/--le-inner-atom-(?:left|right)-footprint|--le-visible-content-(?:left|right)-inset/.test(`${css}\n${chromeRuntime}`)) {
  failures.push('atom footprint must not become control, title, or section alignment state');
}

// The break under the fixed action dock is the PANEL's: its ends are meetings with the panel's own
// frame, which nothing inside the panel can see. The consumer asks for it by handing over its fixed
// section, so there is no placement left for a screen to get wrong.
if (!/className="le-control-divider-host shell-controls-break"[\s\S]*?<ChromeDivider role="outer"\s*\/>/.test(chromeBox)) {
  failures.push('ShellControlsPanel must lay the shared outer-role break between its fixed head and its scrolling body');
}
if (!/<ShellControlsPanel[\s\S]*?fixed=\{\(/.test(levelEditorChromeConsumers)) {
  failures.push('level editor rail must hand its fixed action dock to ShellControlsPanel instead of placing the break itself');
}
if (!/data-chrome-unit="inner-box"\s+className=\{chromeUnitClassNames\('inner-box', 'le-brush-thumb'\)\}/.test(levelEditor)) {
  failures.push('shared Level Editor active-brush thumbnail must inherit the registered inner-box frame');
}
const activeBrushThumbBlock = blockFor('.le-brush-thumb');
if (/\bbackground(?:-[\w-]+)?\s*:|\bborder(?:-[\w-]+)?\s*:/.test(activeBrushThumbBlock)) {
  failures.push('active-brush thumbnail must not replace its registered inner-box frame with local CSS borders or backgrounds');
}
const activeBrushPickBlock = blockFor('.le-brush-pick');
const activeBrushViewportBlock = blockFor('.le-brush-thumb-viewport');
if (!/gap\s*:\s*calc\(8px \+ var\(--le-inner-atom-right-overhang, 0px\)\)/.test(activeBrushPickBlock)
  || !/inset\s*:\s*0/.test(activeBrushViewportBlock)
  || !/overflow\s*:\s*hidden/.test(activeBrushViewportBlock)) {
  failures.push('active-brush thumbnail must keep local atom collision clearance and clip previews inside a nested viewport');
}
if (!/<CyclePicker[\s\S]*?className="le-layer-picker-row"[\s\S]*?previousLabel="Previous editor layer"[\s\S]*?nextLabel="Next editor layer"[\s\S]*?<HouseSelect[\s\S]*?<\/CyclePicker>/.test(levelEditorChromeConsumers)
  || !/<ShellControlsPanel[\s\S]*?titleContent=/.test(levelEditorChromeConsumers)) {
  failures.push('level editor Controls header must expose registered previous/dropdown/next layer navigation');
}

const dividerHost = blockFor('.level-editor-screen .le-control-divider-host');
if (!/position\s*:\s*relative\s*;/.test(dividerHost) || !/z-index\s*:\s*4\s*;/.test(dividerHost) || !/pointer-events\s*:\s*none\s*;/.test(dividerHost)) {
  failures.push('level editor divider host must render above the frame overlay without catching interactions');
}
if (!/function\s+renderFrameEdgeTileDataUrl/.test(chromeRuntime)) {
  failures.push('Chrome Lab dividers must derive their rails from the normalized host frame edge');
}
if (/function\s+renderRailTileDataUrl/.test(chromeRuntime)) {
  failures.push('Chrome Lab divider must not flatten raw rail sources into its own tile path');
}
const roleTuneType = chromeRuntime.match(/type\s+RoleTune\s*=\s*\{[\s\S]*?\n\};/)?.[0] ?? '';
if (/\b(?:frameWidth|railX|railY)\b/.test(roleTuneType)) {
  failures.push('Chrome family authored state must not expose derived frame width or invisible rail-seat offsets');
}
if (/tune\.frameWidth|outer\.frameWidth|inner\.frameWidth/.test(chromeRuntime)
  || /Frame footprint|Rail seat [XY]/.test(chromeLab)) {
  failures.push('Chrome Lab must not reintroduce the overloaded frame-width or rail-seat controls');
}
if (!/function\s+renderedRailThickness[\s\S]*?tune\.railThickness/.test(chromeRuntime)
  || !/function\s+frameSliceForTune[\s\S]*?return renderedRailThickness\(tune\)/.test(chromeRuntime)) {
  failures.push('Chrome frame slice must be derived one-way from the rendered rail size');
}
if (!/function\s+roleContentInset[\s\S]*?tune\.contentPadding/.test(chromeRuntime)) {
  failures.push('Chrome Contents Box must have a pure content-owned inset derivation');
}
if (!/CHROME_LAB_STORAGE_VERSION\s*=\s*4/.test(chromeLab)
  || !/CHROME_LAB_PREVIOUS_STORAGE_VERSION\s*=\s*3/.test(chromeLab)
  || !/CHROME_LAB_LEGACY_STORAGE_VERSION\s*=\s*2/.test(chromeLab)) {
  failures.push('Chrome Lab must migrate v2/v3 tuning into role-owned divider geometry while dropping obsolete fields');
}
if (!/function\s+defaultRailFitForSource/.test(chromeRuntime)
  || !/function\s+borderImageRepeatForTune/.test(chromeRuntime)
  || !/export\s+function\s+dividerJointSources/.test(chromeRuntime)) {
  failures.push('Chrome runtime must preserve generic rail-fit and divider composition behavior');
}
if (!/requiredDrawableRole\('chrome-family', 'installed-chrome'\)/.test(chromeRuntime)
  || !/saveDrawableAsset/.test(chromeLab)
  || /__chrome-lab\/defaults|chrome-lab-defaults\.json/.test(chromeRuntime + chromeLab)) {
  failures.push('Chrome Lab installed tuning must load and save through the database drawable record');
}
if (!/titleVerticalAlign/.test(chromeLab)
  || !/titleHorizontalAlign/.test(chromeLab)
  || !/--le-panel-title-effective-text-y/.test(chromeRuntime + css)
  || !/--le-panel-title-align-extra-x/.test(chromeRuntime + css)) {
  failures.push('Chrome Lab must expose title text alignment modes for vertical centering and contents-box horizontal alignment');
}
if (!/drawableAssets\(['"]studio-page['"]\)/.test(chromeLab) || !/behavior\.chromeLabRoute/.test(chromeLab)) {
  failures.push('Chrome Lab must load its preview-mode page routes from the database-owned Studio page projection');
}
if (!/chromeUnitsInHierarchyOrder\(\)\.map/.test(chromeLab) || !/ChromeUnitAuditViewer/.test(chromeLab)) {
  failures.push('Chrome Lab catalog must be generated from the hierarchy-ordered chrome unit registry and open the audit viewer for unit targets');
}
if (/from\s+'\.\/ChromeLab'/.test(levelEditor)
  || !/from\s+'\.\/useInstalledChromeCss'/.test(levelEditor)
  || !/from\s+'\.\/useInstalledChromeCss'/.test(skirmishShell)) {
  failures.push('live Level Editor and Skirmish surfaces must share the chrome-family installer, never import Chrome Lab UI');
}
for (const symbol of ['composeDividerRender', 'composeFrameDataUrl', 'dividerDefault', 'frameCss', 'roleDefault']) {
  if (!installedChromeCss.includes(symbol)) {
    failures.push(`shared live chrome installer must compose family symbol: ${symbol}`);
  }
}
if (!/urlParams\.get\('chromeLab'\)\s*===\s*'1'/.test(levelEditor)
  || !/useInstalledChromeCss\(!isChromeLabPreview\)/.test(levelEditor)) {
  failures.push('live level editor must opt out of installed chrome CSS while embedded in Chrome Lab');
}
if (!/data-level-editor-chrome-family/.test(levelEditor)
  || !/dangerouslySetInnerHTML=\{\{\s*__html:\s*installedChromeCss\s*\}\}/.test(levelEditor)) {
  failures.push('live level editor must inject the installed shared chrome family CSS');
}
if (!/useInstalledChromeCss\(\)/.test(skirmishShell)
  || !/data-skirmish-chrome-family/.test(skirmishShell)
  || !/dangerouslySetInnerHTML=\{\{\s*__html:\s*installedChromeCss\s*\}\}/.test(skirmishShell)) {
  failures.push('live Skirmish must inject the same installed shared chrome family CSS');
}
if (/divider-atoms-v1/.test(chromeRuntime + chromeLab)) {
  failures.push('Chrome Lab divider picker must not expose the retired code-drawn divider-atoms-v1 placeholders');
}
for (const id of [
  'outer-panel',
  'inner-box',
  'inner-asset-swatch',
  'inner-locked-rectangle',
  'inner-text-button',
  'inner-toggle',
  'inner-list-row',
  'inner-tool-square',
  'inner-chevron-key',
  'inner-select-tool',
  'inner-brush-tool',
  'inner-erase-tool',
  'inner-move-tool',
  'inner-undo-key',
  'inner-redo-key',
  'inner-plus-key',
  'inner-minus-key',
  'inner-dropdown',
]) {
  if (!new RegExp(`id:\\s*'${id}'`).test(chromeUnitRegistry)) {
    failures.push(`chrome unit registry must expose the ${id} audit specimen`);
  }
  if (!new RegExp(`id:\\s*'${id}',\\s*\\n\\s*name:\\s*'`).test(chromeUnitRegistry)) {
    failures.push(`chrome unit registry entry ${id} must declare its code name next to the id`);
  }
  if (!new RegExp(`id:\\s*'${id}'[\\s\\S]*?catalogKind:\\s*'(?:template|implementation)'[\\s\\S]*?contentPolicy:\\s*'(?:none|slot|fixed)'`).test(chromeUnitRegistry)) {
    failures.push(`chrome unit registry entry ${id} must declare catalogKind and contentPolicy`);
  }
  if (!new RegExp(`id:\\s*'${id}'[\\s\\S]*?tone:\\s*'(?:structural|neutral|primary|danger)'[\\s\\S]*?stateModel:\\s*'(?:static|toggle|disabled-capable)'`).test(chromeUnitRegistry)) {
    failures.push(`chrome unit registry entry ${id} must declare tone and stateModel`);
  }
}
if (/CHROME_UNIT_CLASS_SEGMENTS/.test(chromeUnitRegistry) || !/\.map\(\(entry\) => entry\.name\)/.test(chromeUnitRegistry)) {
  failures.push('chrome unit class paths must be built from each registry entry name, not a parallel segment map');
}
if (!/function\s+chromeUnitClassNames/.test(chromeUnitRegistry)
  || !/\.\.\.chromeUnitAncestorChain\(unit\)\.map\(\(entry\) => entry\.name\)/.test(chromeUnitRegistry)
  || !/unit\.name/.test(chromeUnitRegistry)) {
  failures.push('registered chrome units must emit their real ancestor-to-leaf DOM classes');
}
if (!/chromeUnitRoleSelectors/.test(chromeRuntime)
  || !/chromeUnitScopedSelectors/.test(chromeRuntime)
  || !/chromeFamilyRoleSelectors\('inner'\)/.test(chromeRuntime)
  || /const\s+innerControlSelectors\s*=\s*`/.test(chromeRuntime)) {
  failures.push('generated chrome runtime must derive live inner targets from the chrome unit registry, not a parallel selector literal');
}
if (!/function\s+chromeUnitsInHierarchyOrder/.test(chromeUnitRegistry) || !/childrenByParent/.test(chromeUnitRegistry)) {
  failures.push('chrome unit registry must expose a hierarchy-order helper so parents render before children');
}
const registryIndex = (id) => chromeUnitRegistry.indexOf(`id: '${id}'`);
for (const [parent, child] of [
  ['inner-box', 'inner-asset-swatch'],
  ['inner-box', 'inner-locked-rectangle'],
  ['inner-locked-rectangle', 'inner-text-button'],
  ['inner-locked-rectangle', 'inner-toggle'],
  ['inner-locked-rectangle', 'inner-list-row'],
  ['inner-locked-rectangle', 'inner-tool-square'],
  ['inner-tool-square', 'inner-chevron-key'],
  ['inner-tool-square', 'inner-select-tool'],
  ['inner-tool-square', 'inner-brush-tool'],
  ['inner-tool-square', 'inner-erase-tool'],
  ['inner-tool-square', 'inner-move-tool'],
  ['inner-tool-square', 'inner-undo-key'],
  ['inner-tool-square', 'inner-redo-key'],
  ['inner-tool-square', 'inner-plus-key'],
  ['inner-tool-square', 'inner-minus-key'],
  ['inner-locked-rectangle', 'inner-dropdown'],
]) {
  const parentIndex = registryIndex(parent);
  const childIndex = registryIndex(child);
  if (parentIndex < 0 || childIndex < 0 || parentIndex > childIndex) {
    failures.push(`chrome unit registry order must list parent ${parent} before child ${child}`);
  }
}
if (!/id:\s*'inner-box'[\s\S]*?dimensionPolicy:\s*'free-form'[\s\S]*?controlPolicy:\s*'width-height-dividers'[\s\S]*?contentPolicy:\s*'slot'/.test(chromeUnitRegistry)) {
  failures.push('inner-box must be the owner-operable free-form divided inner chrome parent');
}
if (/id:\s*'inner-rectangle'/.test(chromeUnitRegistry)) {
  failures.push('inner rectangle must not exist as a separate class layer; locked-height-rectangle is the rectangle contract');
}
if (!/id:\s*'inner-locked-rectangle'[\s\S]*?name:\s*'locked-height-rectangle'[\s\S]*?parentId:\s*'inner-box'/.test(chromeUnitRegistry)) {
  failures.push('locked-height rectangle must inherit directly from the free-form inner-box parent');
}
if (!/id:\s*'inner-tool-square'[\s\S]*?name:\s*'tool-square'[\s\S]*?parentId:\s*'inner-locked-rectangle'/.test(chromeUnitRegistry)) {
  failures.push('inner tool square must inherit from locked-height-rectangle so it shares the height contract');
}
if (!/id:\s*'inner-chevron-key'[\s\S]*?name:\s*'chevron-key'[\s\S]*?parentId:\s*'inner-tool-square'[\s\S]*?variants:\s*\[[\s\S]*?name:\s*'previous'[\s\S]*?name:\s*'next'/.test(chromeUnitRegistry)) {
  failures.push('inner chevron key must be a previous/next implementation beneath the shared tool-square contract');
}
if (!/id:\s*'inner-text-button'[\s\S]*?name:\s*'text-button'[\s\S]*?parentId:\s*'inner-locked-rectangle'/.test(chromeUnitRegistry)) {
  failures.push('inner text button must inherit from locked-height-rectangle and be the sole wide text command unit');
}
if (!/id:\s*'inner-dropdown'[\s\S]*?name:\s*'dropdown'[\s\S]*?parentId:\s*'inner-locked-rectangle'/.test(chromeUnitRegistry)) {
  failures.push('inner dropdown must inherit from locked-height-rectangle and expose only its child class name');
}
for (const [id, kind, content] of [
  ['inner-box', 'template', 'slot'],
  ['inner-asset-swatch', 'template', 'slot'],
  ['inner-locked-rectangle', 'template', 'slot'],
  ['inner-tool-square', 'template', 'slot'],
  ['inner-chevron-key', 'implementation', 'fixed'],
  ['inner-text-button', 'template', 'slot'],
  ['inner-toggle', 'template', 'slot'],
  ['inner-list-row', 'template', 'slot'],
  ['inner-select-tool', 'implementation', 'fixed'],
  ['inner-brush-tool', 'implementation', 'fixed'],
  ['inner-erase-tool', 'implementation', 'fixed'],
  ['inner-move-tool', 'implementation', 'fixed'],
  ['inner-undo-key', 'implementation', 'fixed'],
  ['inner-redo-key', 'implementation', 'fixed'],
  ['inner-plus-key', 'implementation', 'fixed'],
  ['inner-minus-key', 'implementation', 'fixed'],
]) {
  if (!new RegExp(`id:\\s*'${id}'[\\s\\S]*?catalogKind:\\s*'${kind}'[\\s\\S]*?contentPolicy:\\s*'${content}'`).test(chromeUnitRegistry)) {
    failures.push(`chrome unit ${id} must be classified as ${kind}/${content}`);
  }
}
if (/id:\s*'inner-(?:action-button|primary-action|danger-action|toggle-action|play-test-action|clear-action)'/.test(chromeUnitRegistry)) {
  failures.push('wide text button tone/state/examples must be variants of inner-text-button, not separate catalog units');
}
if (!/id:\s*'inner-text-button'[\s\S]*?variants:\s*\[[\s\S]*?name:\s*'neutral'[\s\S]*?name:\s*'primary'[\s\S]*?name:\s*'danger'[\s\S]*?name:\s*'toggle'/.test(chromeUnitRegistry)) {
  failures.push('inner text button must declare neutral/primary/danger/toggle variants');
}
if (!/<b>Catalog<\/b><code>\{unit\.catalogKind\}<\/code>/.test(chromeLab)
  || !/<b>Content<\/b><code>\{unit\.contentPolicy\}<\/code>/.test(chromeLab)
  || !/<b>Tone<\/b><code>\{unit\.tone\}<\/code>/.test(chromeLab)
  || !/<b>State<\/b><code>\{unit\.stateModel\}<\/code>/.test(chromeLab)
  || !/<dt>Catalog<\/dt><dd>\{unit\.catalogKind\}<\/dd>/.test(chromeUnitAudit)
  || !/<dt>Content<\/dt><dd>\{unit\.contentPolicy\}<\/dd>/.test(chromeUnitAudit)
  || !/<dt>Tone<\/dt><dd>\{unit\.tone\}<\/dd>/.test(chromeUnitAudit)
  || !/<dt>State<\/dt><dd>\{unit\.stateModel\}<\/dd>/.test(chromeUnitAudit)) {
  failures.push('Chrome unit cards and audit metadata must expose catalog/content/tone/state classification');
}
if (!/chrome-unit-slot-marker/.test(chromeUnitAudit + css) || !/PLACEHOLDER_TEXT\s*=\s*'placeholder'/.test(chromeUnitAudit) || !/unit\.iconClass/.test(chromeUnitAudit)) {
  failures.push('Chrome unit template previews must use neutral slot markers/placeholders, not fake implementation icons');
}
if (!/--le-inner-square\s*:\s*var\(--le-inner-control-h\)\s*;/.test(css)) {
  failures.push('inner square size must derive from the locked-height rectangle height token');
}
const levelEditorCyclePickers = [...(levelEditor + levelEditorChromeConsumers).matchAll(/<CyclePicker\b/g)];
const cyclePickerChevronButtons = [...cyclePicker.matchAll(/<ChromeButton\b[\s\S]*?<\/ChromeButton>/g)]
  .map((match) => match[0])
  .filter((block) => block.includes('unit="inner-chevron-key"'));
if (levelEditorCyclePickers.length !== 2 || cyclePickerChevronButtons.length !== 2) {
  failures.push('all four previous/next Level Editor controls must use the concrete inner-chevron-key hierarchy leaf');
}
if (!/unit\.id === 'inner-chevron-key'[\s\S]*?stepper-glyph stepper-chevron/.test(chromeUnitAudit)) {
  failures.push('Chrome Lab must render the real previous/next chevron-key specimen instead of a generic tool-square fallback');
}
if (!/inset-inline-start:\s*4px\s*;/.test(blockFor('.stepper-chevron::before'))
  || !/transform:\s*scaleX\(-1\)\s*;/.test(blockFor('.stepper-chevron-right'))
  || blockFor('.stepper-chevron-right::before')) {
  failures.push('previous/next chevrons must share one centered drawing and mirror the complete right glyph seat');
}
if (!/\.level-editor-screen \.settings-stepper \.settings-chrome-button\s*\{[\s\S]*?block-size:\s*var\(--le-inner-square\)\s*;[\s\S]*?inline-size:\s*var\(--le-inner-square\)\s*;[\s\S]*?min-block-size:\s*var\(--le-inner-square\)\s*;[\s\S]*?min-inline-size:\s*var\(--le-inner-square\)\s*;/.test(css)) {
  failures.push('level editor stepper plus/minus keys must share the inner tool-square dimensions');
}
if (!/--le-inner-field-h\s*:\s*var\(--le-inner-control-h\)\s*;/.test(css)) {
  failures.push('inner field height must derive from the locked-height rectangle height token');
}
if (/inner-control-square|--le-inner-control-square|--le-inner-tool-square/.test(chromeUnitRegistry + css)) {
  failures.push('inner square controls must inherit from inner-box -> locked-height-rectangle -> tool-square; do not revive the retired control/tool square split');
}
for (const id of [
  'outer-panel',
  'inner-select-tool',
  'inner-brush-tool',
  'inner-erase-tool',
  'inner-move-tool',
  'inner-undo-key',
  'inner-redo-key',
  'inner-chevron-key',
  'inner-text-button',
]) {
  const selector = `[data-chrome-unit="${id}"]`;
  if (!chromeUnitRegistry.includes(selector)) {
    failures.push(`chrome unit registry must point ${id} at its data-chrome-unit selector`);
  }
  const implementationSources = id === 'outer-panel'
    ? levelEditor + levelEditorChromeConsumers + chromeBox
    : levelEditor + levelEditorChromeConsumers + cyclePicker + chromeButton;
  if (!implementationSources.includes(`data-chrome-unit="${id}"`)
    && !implementationSources.includes(`unit="${id}"`)) {
    failures.push(`level editor must tag the concrete ${id} implementation with data-chrome-unit`);
  }
}
const registryUnitIds = new Set([...chromeUnitRegistry.matchAll(/id:\s*'([^']+)'/g)].map((match) => match[1]));
for (const [label, text] of [
  ['Level Editor', levelEditor],
  ['Level Editor Chrome Consumers', levelEditorChromeConsumers],
  ['Skirmish HUD', skirmishHud],
  ['Portrait Editor', portraitEditor],
  ['Victory Conditions Editor', victoryConditionsEditor],
  ['Confirm Dialog', confirmDialog],
  ['Chrome Box primitives', chromeBox],
]) {
  const ids = [
    ...[...text.matchAll(/data-chrome-unit="([^"]+)"/g)].map((match) => match[1]),
    ...[...text.matchAll(/data-chrome-unit=\{([^}]+)\}/g)]
      .flatMap((match) => [...match[1].matchAll(/'([^']+)'/g)].map((inner) => inner[1])),
  ];
  for (const id of ids) {
    if (/^(?:inner-|outer-)/.test(id)) {
      if (!registryUnitIds.has(id)) failures.push(`${label} uses unknown data-chrome-unit id: ${id}`);
      if (!chromeUnitRegistry.includes(`[data-chrome-unit="${id}"]`)) {
        failures.push(`chrome unit registry must include a selector for data-chrome-unit id: ${id}`);
      }
    }
  }
}
for (const selector of [
  '[data-chrome-unit="outer-panel"]',
  '.level-editor-screen .le-outer-panel',
  '[data-shell-controls-panel]',
  '.le-icon-btn',
  '.le-action-toolbar .le-seg-btn',
  '.le-seg-icons .le-seg-btn',
  '.settings-stepper .settings-chrome-button',
  '.le-seg-btn',
  '.le-direction-trigger',
  '.le-board-link-input',
  '.le-select-wrap',
]) {
  if (!chromeUnitRegistry.includes(selector)) {
    failures.push(`house chrome selector must be represented in the chrome unit registry: ${selector}`);
  }
}
if (!chromeRuntime.includes("calc(-1 * var(--ds-space-3))")) {
  failures.push('content-aligned panel titles must align to the rail-owned contents boundary without atom compensation');
}
if (/id:\s*'inner-dropdown'[\s\S]*?selectors:\s*\[[\s\S]*?'\.le-(?:layer|event)-select(?:-wrap)?'/.test(chromeUnitRegistry)) {
  failures.push('inner dropdown registry must not retain retired native-select selectors');
}
// The menu is one DIVIDED inner box: options are its rows, the scrollbar sits in the framed gutter
// it rules off, and every rail between options — inside a group and between groups — is laid and
// capped by its topology. It used to be an inner box with dividers dropped between the options by
// HouseSelect itself, which could only cap them as though they met a frame.
const houseSelectMenuBlock = blockFor('.house-select-menu');
const houseSelectScrollContentBlock = blockFor('.chrome-divided-grid__scroll > .kit-scroll-content');
const houseSelectOptionBlock = blockFor('.house-select-option');
if (!/<DividedInnerChromeBox[\s\S]*?columns=\{\['minmax\(0, 1fr\)'\]\}[\s\S]*?scroll[\s\S]*?className="house-select-menu-box"/.test(houseSelect)
  || !/<ChromeDividedGridRow[\s\S]*?className=\{`house-select-option /.test(houseSelect)
  || /<ChromeDivider\b/.test(houseSelect)
  || /chromeUnitClassNames\('inner-list-row',\s*'house-select-option'/.test(houseSelect)
  || /\.house-select-option'/.test(chromeUnitRegistry)
  || !/overflow\s*:\s*visible/.test(houseSelectMenuBlock)
  || !/overflow-x\s*:\s*hidden/.test(houseSelectScrollContentBlock)
  || /overflow-x\s*:\s*(?:auto|scroll)/.test(houseSelectScrollContentBlock)
  || /--le-inner-atom-(?:left|right)-(?:overhang|footprint)/.test(houseSelectOptionBlock)) {
  failures.push('HouseSelect menus must be one divided inner box whose options are its rows, with vertical-only scrolling and no hand-placed rail');
}
// A semantic group of options draws no box, so its rows stay rows of the menu's own grid and the
// rails inside it stay the menu's. A group that boxed its options would cap rails against a frame
// it does not own — the failure the whole divided grid exists to prevent.
if (!/display\s*:\s*contents/.test(blockFor('.chrome-divided-grid__row-group'))) {
  failures.push('a divided-grid row group must generate no box, so its rows remain rows of the grid that caps their rails');
}
for (const side of ['left', 'right', 'top', 'bottom']) {
  if (!houseSelect.includes(`paintOverhang('--le-inner-atom-${side}-overhang')`)) {
    failures.push(`HouseSelect viewport placement must reserve live ${side} atom paint overhang`);
  }
}
if (!/data-chrome-unit="inner-box"/.test(chromeBox)
  || !/data-chrome-divider-role=\{role\}/.test(chromeBox)
  || !/className=\{`kit-divider chrome-divider/.test(chromeBox)) {
  failures.push('shared ChromeBox primitives must own the registered inner frame and role-keyed structural divider DOM');
}
const junctionRendererStart = chromeRuntime.indexOf('function junctionCss');
const junctionRendererEnd = chromeRuntime.indexOf('export function frameCss', junctionRendererStart);
const junctionRenderer = chromeRuntime.slice(junctionRendererStart, junctionRendererEnd);
if (junctionRendererStart < 0
  || junctionRendererEnd < 0
  || !junctionRenderer.includes('tee.upright')
  || !junctionRenderer.includes("'nesw'")
  || /\btee\.(?:left|right|top|bottom)\b/.test(junctionRenderer)) {
  failures.push('topology junctions must use one upright lit ornament; connectivity masks may not rotate or mirror its pixels');
}
if (!/function FreeBoxSpecimen[\s\S]*?<DividedInnerChromeBox[\s\S]*?columns=\{\['minmax\(0, 1fr\)', 'minmax\(0, 1fr\)'\]\}[\s\S]*?<ChromeDividedGridRow/.test(chromeUnitAudit)) {
  failures.push('Chrome Audit Inner Box must expose the shared row-and-column topology, including interior cross junctions');
}
if (!/data-chrome-unit="outer-panel"/.test(chromeBox)
  || !/data-chrome-consumer=\{chromeConsumer\}/.test(chromeBox)
  || !/chromeUnitClassNames\('outer-panel',\s*'le-outer-panel',\s*className\)/.test(chromeBox)
  || !/export\s+function\s+ChromeSurfaceFill/.test(chromeBox)
  || !/data-chrome-fill-role=\{role\}/.test(chromeBox)
  || !/<ChromeSurfaceFill role="outer" className="le-outer-panel-fill"\s*\/>/.test(chromeBox)
  || !/titled \? 'le-outer-panel-content--titled' : ''/.test(chromeBox)
  || !/className=\{`skirmish-card outer-chrome-header/.test(chromeBox)
  || !/<OuterChromeTitle>\{title\}<\/OuterChromeTitle>/.test(chromeBox)) {
  failures.push('shared ChromeBox primitives must own the complete outer-panel fill/content/header composition');
}
if (/<select\b/.test(levelEditor)) {
  failures.push('Level Editor native selects are retired; every dropdown must use HouseSelect');
}
if (!/<HouseSelect<string>[\s\S]*?ariaLabel="Saved generated region"/.test(levelEditor)
  || !/<HouseSelect<TileFamilyId>[\s\S]*?className="le-gen-region-select"[\s\S]*?ariaLabel=\{`Region \$\{sectionIndex \+ 1\} terrain`\}/.test(levelEditor)
  || !/<HouseSelect<GroundCoverId>[\s\S]*?className="le-gen-cover-select"[\s\S]*?ariaLabel=\{`Region \$\{sectionIndex \+ 1\} cover \$\{coverIndex \+ 1\} set`\}/.test(levelEditor)) {
  failures.push('Generate region, terrain, and cover selectors must use the shared HouseSelect component');
}
if (/generate-divider-atom-candidates/.test(readFileSync(join(frontend, 'package.json'), 'utf8'))) {
  failures.push('Chrome Lab divider atoms must not be regenerated from code-drawn placeholder geometry');
}
if (!/export\s+function\s+dividerJointPreviewBox/.test(chromeRuntime) || !/className="chrome-lab-divider-atom-stage"/.test(chromeLab)) {
  failures.push('Chrome Lab divider picker must lock the source preview seat to the largest available joint source');
}
if (!/function\s+sourcePreviewBox/.test(chromeRuntime) || !/className="chrome-lab-source-stage"/.test(chromeLab)) {
  failures.push('Chrome Lab source pickers must render in a locked preview seat, not resize around the selected source');
}
if (!/const\s+atomPreviewBox\s*=\s*sourcePreviewBox\(atomSources\)/.test(chromeLab) || !/<SourcePreview source=\{atomSource\} box=\{atomPreviewBox\}/.test(chromeLab)) {
  failures.push('Chrome Lab outer/inner atom pickers must lock preview size to the largest atom in their picker list');
}
if (/Joint size locked/.test(chromeLab) || !/atomSize:\s*numberFrom\(value\.atomSize,\s*defaults\.atomSize\)/.test(chromeLab)) {
  failures.push('Chrome Lab divider tuning must preserve editable divider atom size; only the source preview seat is fixed');
}
for (const [label, text] of [
  ['Chrome Lab', chromeLab],
  ['chrome family runtime', chromeRuntime],
  ['chrome unit registry', chromeUnitRegistry],
]) {
  if (/codex-parts-outer-(?:tee|divider)|codex-parts-outer-tee-natural/.test(text)) {
    failures.push(`${label} must not reference the retired cropped codex-parts outer tee/divider assets`);
  }
}
const frameSliceMatch = chromeRuntime.match(/function\s+frameSliceForTune[\s\S]*?\n\}/);
if (!frameSliceMatch) {
  failures.push('Chrome Lab must keep a centralized frameSliceForTune helper');
} else if (!/return\s+renderedRailThickness\(tune\)/.test(frameSliceMatch[0])
  || /\b(?:atomSize|railX|railY|railUnderlap|contentPadding|fillBox)\b/.test(frameSliceMatch[0])) {
  failures.push('Chrome Lab frame slice must be derived only from the visible rendered rail thickness');
}
const drawFrameBaseMatch = chromeRuntime.match(/function\s+drawFrameBase[\s\S]*?\n\}/);
if (!drawFrameBaseMatch) {
  failures.push('Chrome Lab must keep a centralized drawFrameBase helper');
} else {
  if (/\bfillAlpha\b|\bfillRect\b/.test(drawFrameBaseMatch[0])) {
    failures.push('Chrome Lab frame canvas must be edge-only; fill belongs to explicit CSS/background, not the border-image source');
  }
  if (!/\bwithClip\b/.test(drawFrameBaseMatch[0])) {
    failures.push('Chrome Lab frame rail drawing must clip rails to their edge slices so rails cannot contaminate the center fill cell');
  }
  if (!/frameSize\s*-\s*slice\s*\*\s*2\s*\+\s*underlap\s*\*\s*2/.test(drawFrameBaseMatch[0])) {
    failures.push('Chrome Lab frame rail runs must span the complete center tile plus corner underlap');
  }
}
if (!/function\s+frameCenterLengthForRail[\s\S]*?nativePeriod/.test(chromeRuntime)
  || !/frameSize\s*=\s*slice\s*\*\s*2\s*\+\s*frameCenterLengthForRail\(tune,\s*rail,\s*slice\)/.test(chromeRuntime)) {
  failures.push('Chrome Lab frame sources must preserve one complete normalized rail period in the border-image center tile');
}
if (!/sourceW\s*=\s*Math\.max[\s\S]*?drawImage\(rail,\s*0,\s*0,\s*sourceW,\s*rail\.height/.test(chromeRuntime)) {
  failures.push('Chrome Lab tiled rails must crop partial tiles instead of squeezing the full source into the remainder');
}
if (/border-image-slice:\s*\$\{[^}]+\}\s+fill\s*!important/.test(chromeRuntime)) {
  failures.push('Chrome Lab injected border-image slices must not use fill; fill must be an explicit background layer');
}
if (!/export\s+const\s+CHROME_FILL_MODE_OPTIONS/.test(chromeRuntime)
  || !/export\s+const\s+CHROME_FILL_TINTS/.test(chromeRuntime)
  || !/export\s+const\s+CHROME_FILL_SURFACES/.test(chromeRuntime)) {
  failures.push('Chrome Lab must expose role-owned fill modes, tints, and surfaces');
}
if (!/function\s+chromeFillCss/.test(chromeRuntime)
  || !/background-image:\s*\$\{hasTint/.test(chromeRuntime)
  || !/\$\{familySurface\} \[data-chrome-fill-role="outer"\] \{[\s\S]*?\$\{chromeFillCss\(outer\)\}/.test(chromeRuntime)
  || !/\$\{familySurface\} \[data-chrome-fill-role="inner"\] \{[\s\S]*?\$\{chromeFillCss\(inner\)\}/.test(chromeRuntime)
  || !/\$\{chromeFillCss\(inner\)\}/.test(chromeRuntime)) {
  failures.push('Chrome Lab must apply role fill as explicit CSS background declarations on outer/inner roles');
}
if (!/\$\{familySurface\} \[data-shell-controls-panel\] \{[\s\S]*?--app-shell-divider-fill-overlap:\s*1px;[\s\S]*?--le-outer-fill-box-top:\s*calc\(-1 \* var\(--app-shell-divider-fill-overlap\)\)\s*!important;/.test(chromeRuntime)) {
  failures.push('top-rail-less Controls fills must overlap the shared title divider without exposing a raster seam');
}
if (!/fillMode:\s*fillModeFrom/.test(chromeLab)
  || !/Fill is role-owned/.test(chromeLab)
  || !/chrome-lab-fill-preview/.test(chromeLab + css)
  || !/fillBoxLeft:\s*numberFrom/.test(chromeLab)
  || !/Fill Box/.test(chromeLab)) {
  failures.push('Chrome Lab UI must expose role-owned fill mode and fill-box controls');
}
if (!/contentPadding:\s*numberFrom\(value\.contentPadding,\s*defaults\.contentPadding\)/.test(chromeLab)
  || !/Contents Box/.test(chromeLab)
  || !/onTune\(\{ contentPadding:\s*value \}\)/.test(chromeLab)
  || !/const\s+outerContentInset\s*=\s*roleContentInset\(outer\)/.test(chromeRuntime)
  || !/--le-outer-content-padding:\s*\$\{cssPx\(outerContentInset\)\}/.test(chromeRuntime)) {
  failures.push('Chrome Lab must persist, export, and apply the outer role Contents Box breathing-room control');
}

const title = blockFor(':is(.level-editor-screen, .skirmish-screen, .chrome-family-surface) .skirmish-card h2.kit-panel-title');
if (!/margin\s*:[\s\S]*?var\(--le-outer-fill-box-top,[^)]+\)[\s\S]*?var\(--le-outer-fill-box-right,[^)]+\)[\s\S]*?var\(--ds-stack\)[\s\S]*?var\(--le-outer-fill-box-left,[^)]+\)\s*;/.test(title)) {
  failures.push('panel title fill must fit the frame fill box, not the outer footprint');
}
if (!/var\(--le-control-content-inset/.test(title)
  || !/var\(--le-outer-fill-box-left/.test(title)
  || !/var\(--le-outer-fill-box-right/.test(title)) {
  failures.push('panel title text padding must account for both the fill box and contents box');
}
if (/margin\s*:[^;]*var\(--le-control-(?:frame|rail)-w/.test(title)) {
  failures.push('panel title must not derive its fill box from rail geometry');
}

const innerRoleSelectors = [
  '.le-seg-btn',
  '.le-direction-trigger',
  '.le-board-link-input',
  '.le-violations',
  '.le-status-current',
  '.le-material-values',
  '.le-status-entry',
];
for (const selector of innerRoleSelectors) {
  const block = blockFor(selector);
  if (!block) failures.push(`missing ${selector} chrome block`);
  else if (!/var\(--le-chrome-inner-rail-w/.test(block)) {
    failures.push(`${selector} must consume the inner chrome role instead of a local rail width`);
  }
}
for (const [selector, token] of [
  ['.le-seg-btn', '--skirmish-chrome-inner-control-image'],
  ['.le-direction-trigger', '--skirmish-chrome-inner-control-image'],
  ['.le-board-link-input', '--skirmish-chrome-inner-line-image'],
  ['.le-violations', '--skirmish-chrome-inner-line-warm-image'],
  ['.le-status-current', '--skirmish-chrome-inner-line-image'],
  ['.le-material-values', '--skirmish-chrome-inner-line-image'],
  ['.le-status-entry', '--skirmish-chrome-inner-line-image'],
]) {
  const block = blockFor(selector);
  if (block && !block.includes(token)) {
    failures.push(`${selector} must consume ${token} instead of a local frame source`);
  }
}
for (const [selector, token] of [
  ['.le-seg-btn', '--le-inner-control-h'],
  ['.le-direction-trigger', '--le-inner-square'],
  ['.le-action-toolbar-divider', '--le-inner-control-h'],
  ['.le-icon-btn', '--le-inner-square'],
  ['.le-select-wrap', '--le-inner-field-h'],
  ['.le-layer-stepper-button.settings-chrome-button', '--le-inner-square'],
  ['.le-zone-row', '--le-inner-row-h'],
  ['.le-seg-icons .le-seg-btn', '--le-inner-square'],
  ['.le-action-toolbar .le-seg-btn', '--le-inner-square'],
  ['.le-cond-add .le-seg-btn', '--le-inner-control-compact-h'],
  ['.le-rule-remove', '--le-inner-control-compact-h'],
  ['.le-events-tabs .le-seg-btn,\n.le-events-done', '--le-inner-tab-compact-h'],
]) {
  if (!ruleContains(selector, token)) {
    failures.push(`${selector} must consume the named inner size role ${token}`);
  }
}
if (!/\.level-editor-screen \.settings-chrome-button,\s*\.level-editor-screen \.settings-toggle,\s*\.level-editor-screen \.settings-stepper \.settings-chrome-button\s*\{[\s\S]*?border-width\s*:\s*var\(--le-chrome-inner-rail-w\)\s*;[\s\S]*?border-image-source\s*:\s*var\(--skirmish-chrome-inner-control-image\)\s*;[\s\S]*?border-image-width\s*:\s*var\(--le-chrome-inner-rail-w\)\s*;/.test(css)) {
  failures.push('shared settings controls inside the level editor must consume the inner chrome role');
}
const shellWorkspaceRules = blocksTargeting('.shell-workspace');
const shellWorkspace = shellWorkspaceRules.find((block) => /position\s*:\s*absolute\s*;/.test(block)) ?? '';
if (!shellWorkspace) {
  failures.push('the shared chrome primitives must expose a shell-owned center-workspace surface');
} else {
  // `clip` rather than `hidden`: it clips at least as tightly and, unlike `hidden`, carries
  // the paint apron allowance checked below.
  if (!/position\s*:\s*absolute\s*;/.test(shellWorkspace)
    || !/inset\s*:\s*0\s*;/.test(shellWorkspace)
    || !/min-height\s*:\s*0\s*;/.test(shellWorkspace)
    || !/min-width\s*:\s*0\s*;/.test(shellWorkspace)
    || !/overflow\s*:\s*clip\s*;/.test(shellWorkspace)) {
    failures.push('shared shell workspaces must fill and clip to their positioned center-workspace parent');
  }
  if (shellWorkspaceRules.some((block) => /position\s*:\s*fixed|\b(?:100)?v[wh]\b|--app-header-h|--skirmish-rail-w|--skirmish-board-controls-gutter|--le-outer-atom-outset/.test(block))) {
    failures.push('shared shell workspaces must not duplicate viewport, rail, or outer-atom geometry');
  }
  if (shellWorkspaceRules.some((block) => /border(?:-image)?\s*:/.test(block))) {
    failures.push('shared shell workspaces must not draw a second outer frame');
  }
}
const boardWorkspace = blockFor('.skirmish-field');
if (!boardWorkspace || !/position\s*:\s*relative\s*;/.test(boardWorkspace)) {
  failures.push('the board workspace must remain the positioned parent for shell-owned center workspaces');
}
const shellWorkspaceContent = blockFor('.shell-workspace-content');
if (!shellWorkspaceContent
  || !/display\s*:\s*flex\s*;/.test(shellWorkspaceContent)
  || !/min-height\s*:\s*0\s*;/.test(shellWorkspaceContent)
  || !/min-width\s*:\s*0\s*;/.test(shellWorkspaceContent)
  || !/overflow\s*:\s*hidden\s*;/.test(shellWorkspaceContent)
  || /\bpadding(?:-[\w-]+)?\s*:/.test(shellWorkspaceContent)) {
  failures.push('shared shell workspaces must own one bounded layout layer without consumer perimeter padding');
}
const shellWorkspaceBody = blockFor('.shell-workspace-body');
if (!shellWorkspaceBody
  || !/display\s*:\s*flex\s*;/.test(shellWorkspaceBody)
  || !/min-height\s*:\s*0\s*;/.test(shellWorkspaceBody)
  || !/min-width\s*:\s*0\s*;/.test(shellWorkspaceBody)
  || !/padding-block\s*:\s*var\(--shell-workspace-body-inset-block,\s*0px\)\s*;/.test(shellWorkspaceBody)
  || !/padding-inline-start\s*:\s*var\(--shell-workspace-body-inset-start,\s*0px\)\s*;/.test(shellWorkspaceBody)
  || !/padding-inline-end\s*:\s*0\s*;/.test(shellWorkspaceBody)
  || css.includes('--shell-workspace-body-inset-end')
  || css.includes('--shell-workspace-content-padding')) {
  failures.push('ShellWorkspace internal body must own shared block/start insets and stay attached to Controls');
}
// The fill reaches the workspace edges AND one apron up under the title divider's transparent
// last row, so that row is not left for the screen behind. Both clipping hosts have to pass
// that apron; an `overflow: hidden` on either silently re-opens the seam.
const shellWorkspaceFill = blockFor('.shell-workspace-fill');
if (!shellWorkspaceFill
  || !/inset\s*:\s*calc\(-1 \* var\(--shell-workspace-paint-apron, 0px\)\) 0 0 0\s*;/.test(shellWorkspaceFill)) {
  failures.push('shared shell workspaces must paint the outer-role fill edge-to-edge, one apron under the title divider');
}
// The background artwork is a pixelated cover fit: growing its box to gain the apron re-scales
// the whole raster, so it stays exactly on the workspace box.
if (/--shell-workspace-paint-apron/.test(blockFor('.shell-workspace-background-artwork'))) {
  failures.push('the shell workspace background artwork must keep its exact cover box, not take the paint apron');
}
for (const host of ['.shell-workspace', '.run-workspace']) {
  const hostBlock = blockFor(host);
  if (!hostBlock
    || !/overflow\s*:\s*clip\s*;/.test(hostBlock)
    || !/overflow-clip-margin\s*:\s*var\(--shell-workspace-paint-apron, 0px\)\s*;/.test(hostBlock)) {
    failures.push(`${host} must pass the shell workspace paint apron instead of clipping the chrome seam back open`);
  }
}
// The Controls panel's workspace-facing rail borders a foreign surface, so its frame art's
// transparent bleed has to be compensated on the chrome side rather than left as a hairline.
if (!chromeRuntime.includes('border-image-outset: 0 0 0 ${FRAME_EDGE_BLEED_PX}px !important;')
  || !chromeRuntime.includes('export const FRAME_EDGE_BLEED_PX = 1;')) {
  failures.push('the Controls panel frame must outset its workspace-facing rail by the frame art edge bleed');
}
const playShellGrid = blockFor('.skirmish-screen');
const battleFieldGutter = blockFor('.skirmish-screen:not(.level-editor-screen) .skirmish-war-room > .skirmish-field');
if (!playShellGrid
  || !/column-gap\s*:\s*0\s*;/.test(playShellGrid)
  || !battleFieldGutter
  || !/margin-inline-end\s*:\s*var\(--skirmish-board-controls-gutter\)\s*;/.test(battleFieldGutter)
  || css.includes('.skirmish-screen.is-run-self-inspection-open')) {
  failures.push('Play shell workspaces must always meet Controls while only the scenic battlefield owns the internal gutter');
}
const levelEditorShellGrid = blockFor('.skirmish-screen.level-editor-screen');
if (!levelEditorShellGrid
  || !/column-gap\s*:\s*0\s*;/.test(levelEditorShellGrid)
  || !/row-gap\s*:\s*0\s*;/.test(levelEditorShellGrid)) {
  failures.push('Level Editor shell grid must not expose uncovered seams around center workspaces');
}
if (!chromeRuntime.includes('const outerAtomOutset = cssPx(outerFrame.atomOverlay?.outset ?? 0);')) {
  failures.push('generated chrome runtime must derive the outer atom outset from the rendered atom overlay');
}
if (!chromeRuntime.includes('--le-outer-atom-outset: ${outerAtomOutset} !important;')) {
  failures.push('generated chrome runtime must publish the outer atom outset to live chrome consumers');
}
if (!/const\s+familySurface\s*=\s*CHROME_FAMILY_SURFACE_SELECTOR/.test(chromeRuntime)
  || !/CHROME_FAMILY_SURFACE_SELECTOR\s*=\s*':is\(\.level-editor-screen, \.skirmish-screen, \.chrome-family-surface\)'/.test(chromeRuntime)
  || !chromeRuntime.includes('${familySurface} .le-outer-panel::before')
  || !/cornerAtomOverlayCss\(`\$\{familySurface\} \.le-outer-panel`/.test(chromeRuntime)) {
  failures.push('generated chrome runtime must target the shared outer-panel class for frame and atom rendering');
}
if (!/function\s+selectorListParts/.test(chromeRuntime)
  || !/parenDepth === 0 && bracketDepth === 0/.test(chromeRuntime)) {
  failures.push('generated atom pseudos must split only top-level selector-list commas, preserving :is() surface selectors');
}
if (/events-overlay/.test(chromeRuntime) || /events-overlay/.test(chromeUnitRegistry)) {
  failures.push('shell-owned Events must not remain in the generated outer-panel runtime or registry inventory');
}

// The audit specimen is not the product integration. The normal, ready Level Editor
// controls branch must render the same shared consumer that Chrome Audit renders. Events
// instead occupies the reusable shell-owned center workspace and must never rejoin the
// outer-panel inventory. Keep checks scoped to the owning component/function.
const levelEditorChromeImports = [
  ...levelEditor.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/LevelEditorChromeConsumers['"]/g),
];
if (!levelEditorChromeImports.some((match) => /\bLevelEditorControlsPanel\b/.test(match[1]))) {
  failures.push('live Level Editor must import LevelEditorControlsPanel from LevelEditorChromeConsumers');
}
if (!levelEditorChromeImports.some((match) => /\bLevelEditorEventsWorkspace\b/.test(match[1]))) {
  failures.push('live Level Editor must import LevelEditorEventsWorkspace from LevelEditorChromeConsumers');
}
if (!/\{editorLoadError\s*\?[\s\S]*?\)\s*:\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)*<LevelEditorControlsPanel\b/.test(levelEditor)) {
  failures.push('live Level Editor normal controls path must render the shared LevelEditorControlsPanel consumer');
}
if (!/\{eventsOpen\s*\?\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)*<LevelEditorEventsWorkspace\b/.test(levelEditor)) {
  failures.push('live Level Editor open-events path must render the shared LevelEditorEventsWorkspace');
}
const rawLevelEditorControlAside = [...levelEditor.matchAll(/<aside\b[^>]*>/g)]
  .some((match) => /\bskirmish-hud\b/.test(match[0]) && /aria-label\s*=\s*['"]Editor controls['"]/.test(match[0]));
if (rawLevelEditorControlAside) {
  failures.push('live Level Editor must not restore a raw parallel skirmish-hud controls aside; render LevelEditorControlsPanel');
}
if (!/<ShellViewportSwap[\s\S]*?className="level-editor-viewport-swap"[\s\S]*?primaryClassName="skirmish-board-frame"[\s\S]*?workspaceOpen=\{eventsOpen \|\| Boolean\(levelArtworkWorkspace\)\}/.test(levelEditor)) {
  failures.push('Level Editor board and replacement workspaces must use the shared viewport-swap owner');
}
if (!/eventsEditor:\s*routeState\.eventsEditor/.test(levelEditor)
  || !/levelEditorEventsEntry:\s*true/.test(levelEditor)
  || !/levelEditorEventsBaseHref:\s*baseHref/.test(levelEditor)
  || /window\.history\.state\?\.levelEditorRules/.test(levelEditor)) {
  failures.push('Events visibility must be URL-addressed; history state may mark only app-created return provenance');
}
const coveredPrimary = blockFor('.shell-viewport-primary[data-shell-workspace-covered]');
if (!coveredPrimary || !/visibility\s*:\s*hidden\s*;/.test(coveredPrimary)) {
  failures.push('ShellViewportSwap must visually suppress every covered primary surface');
}
if (/LevelEditorEventsOverlay|le-events-overlay|chromeConsumer="events-overlay"/.test(levelEditor)) {
  failures.push('live Level Editor must not restore the retired fixed Events overlay path');
}

const levelEditorControlsPanelStart = levelEditorChromeConsumers.indexOf('export function LevelEditorControlsPanel');
const levelEditorControlsPanelEnd = levelEditorChromeConsumers.indexOf('export function LevelEditorEventsWorkspace', levelEditorControlsPanelStart);
const levelEditorControlsPanel = levelEditorControlsPanelStart >= 0 && levelEditorControlsPanelEnd > levelEditorControlsPanelStart
  ? levelEditorChromeConsumers.slice(levelEditorControlsPanelStart, levelEditorControlsPanelEnd)
  : '';
if (!levelEditorControlsPanel) {
  failures.push('missing shared LevelEditorControlsPanel implementation');
} else if (!/<ShellControlsPanel[\s\S]*?className=\{className\}[\s\S]*?titleContent=/.test(levelEditorControlsPanel)
  || /<OuterChromeBox\b|<OuterChromeHeader\b|chromeConsumer=/.test(levelEditorControlsPanel)) {
  failures.push('LevelEditorControlsPanel must supply content to the one ShellControlsPanel owner');
}

const sharedShellWorkspace = exportedFunctionSource(chromeBox, 'ShellWorkspace');
if (!sharedShellWorkspace
  || !/<section \{\.\.\.props\} className=\{`shell-workspace \$\{className\}`\.trim\(\)\}>/.test(sharedShellWorkspace)
  || !/<ChromeSurfaceFill role="outer" className="shell-workspace-fill"\s*\/>/.test(sharedShellWorkspace)
  || !/className=\{`shell-workspace-content \$\{contentClassName\}`\.trim\(\)\}/.test(sharedShellWorkspace)
  || !/data-shell-workspace-body=""/.test(sharedShellWorkspace)
  || !/className="shell-workspace-body"/.test(sharedShellWorkspace)
  || !/data-shell-workspace-content=""/.test(sharedShellWorkspace)
  || !/data-shell-workspace-content-edge=\{edgeAttached \? '' : undefined\}/.test(sharedShellWorkspace)
  || !/className=\{`shell-workspace-body-content \$\{bodyClassName\}`\.trim\(\)\}/.test(sharedShellWorkspace)) {
  failures.push('ShellWorkspace must own the reusable fill-only center-workspace composition');
} else if (/<OuterChromeBox\b|role="dialog"|events-overlay/.test(sharedShellWorkspace)) {
  failures.push('ShellWorkspace must remain workflow-neutral and free of outer-panel/dialog semantics');
}
if (/export function ShellWorkspaceBody/.test(chromeBox)) {
  failures.push('ShellWorkspace body must remain an internal invariant, not an exported caller protocol');
}
const sharedShellViewportSwap = exportedFunctionSource(chromeBox, 'ShellViewportSwap');
if (!sharedShellViewportSwap
  || !/data-shell-viewport-swap=""/.test(sharedShellViewportSwap)
  || !/data-shell-viewport-primary=""/.test(sharedShellViewportSwap)
  || !/data-shell-workspace-covered=\{covered \? '' : undefined\}/.test(sharedShellViewportSwap)
  || !/inert=\{covered \? true : undefined\}/.test(sharedShellViewportSwap)
  || !/aria-hidden=\{covered \? true : undefined\}/.test(sharedShellViewportSwap)) {
  failures.push('ShellViewportSwap must own retained-primary visibility and accessibility state');
}
const sharedShellControlsPanel = exportedFunctionSource(chromeBox, 'ShellControlsPanel');
if (!sharedShellControlsPanel
  || !/chromeConsumer="shell-controls"/.test(sharedShellControlsPanel)
  || !/data-shell-controls-panel=""/.test(sharedShellControlsPanel)
  || !/className=\{`shell-controls-panel skirmish-hud \$\{className\}`\.trim\(\)\}/.test(sharedShellControlsPanel)
  || !/<OuterChromeHeader[\s\S]*?title="Controls"/.test(sharedShellControlsPanel)) {
  failures.push('ShellControlsPanel must own the fixed Controls title, chrome role, placement, and seam marker');
}
for (const { path, source } of shellCallerSources) {
  const relativePath = path.slice(frontend.length + 1).replaceAll('\\', '/');
  if (/ShellWorkspaceBody/.test(source)) {
    failures.push(`${relativePath} must not construct or name the internal workspace body`);
  }
  if (/chromeConsumer="(?:level-editor-controls|skirmish-hud|shell-controls)"/.test(source)
    || /data-shell-controls-panel=/.test(source)
    || /<OuterChromeHeader\b[^>]*title="Controls"/.test(source)) {
    failures.push(`${relativePath} must not reconstruct or impersonate the shared Controls panel`);
  }
  if (/is-workspace-covered|data-shell-workspace-covered=/.test(source)) {
    failures.push(`${relativePath} must not reconstruct or impersonate covered-viewport state`);
  }
  if (/data-shell-workspace-(?:body|content)(?:=|-edge=)/.test(source)) {
    failures.push(`${relativePath} must not reconstruct the ShellWorkspace body or content lane`);
  }
}
if (!/<ShellViewportSwap[\s\S]*?className=\{activity\.viewport\.className\}[\s\S]*?primaryClassName=\{activity\.viewport\.primaryClassName\}[\s\S]*?primary=\{activity\.viewport\.primary\}[\s\S]*?workspaceOpen=\{workspaceOpen\}/.test(runForm)
  || !/className: 'run-phase-workspace'[\s\S]*?primaryClassName: 'run-phase-primary'/.test(runScreen)
  || !/className: 'skirmish-war-room'[\s\S]*?primaryClassName: 'skirmish-field'/.test(skirmish)) {
  failures.push('Run and Battle replacement modes must use the shared viewport-swap owner');
}
// The layout class may be a plain string or a template literal: the Enchiridion
// reference rail's `has-secondary-rail` modifier moved from the workspace grid to the
// replaceable pane, because that rail belongs to the section and must leave with it
// (ADR-0355). What this guard is about is that the Strategikon COMPOSES the shared
// workspace rather than building its own surface, which is unchanged.
if (!/<ShellWorkspace[\s\S]*?className="strategikon-workspace"[\s\S]*?contentClassName=(?:"strategikon-workspace-layout"|\{`strategikon-workspace-layout)/.test(strategikon)
  || !/bodyClassName="strategikon-content"/.test(strategikon)
  || !/bodyClassName="strategikon-content"[\s\S]*?edgeAttached/.test(strategikon)
  || /<ChromeSurfaceFill\b|<OuterChromeBox\b/.test(strategikon)) {
  failures.push('Strategikon must compose the shared ShellWorkspace and Controls-attached body instead of a bespoke surface');
}

const levelEditorEventsWorkspace = exportedFunctionSource(levelEditorChromeConsumers, 'LevelEditorEventsWorkspace');
if (!levelEditorEventsWorkspace
  || !/<ShellWorkspace[\s\S]*?className="le-events-workspace"/.test(levelEditorEventsWorkspace)
  || !/bodyClassName="le-events-workspace-content"/.test(levelEditorEventsWorkspace)
  || !/data-testid="level-events-workspace"/.test(levelEditorEventsWorkspace)
  || !/aria-labelledby="level-events-workspace-title"/.test(levelEditorEventsWorkspace)
  || !/initialFocusRef\.current\?\.focus\(\)/.test(levelEditorEventsWorkspace)) {
  failures.push('Events workspace must wrap its workflow in ShellWorkspace with a labelled, initially focused surface');
} else if (/<OuterChromeBox\b|role="dialog"|events-overlay/.test(levelEditorEventsWorkspace)) {
  failures.push('Events workspace must not restore outer-panel or dialog semantics');
}
if (!/<ShellWorkspace[\s\S]*?className="le-artwork-workspace"[\s\S]*?bodyClassName="le-artwork-workspace-content"/.test(levelEditor)) {
  failures.push('Level Artwork must provide content to the body-owning ShellWorkspace');
}
if (!/<ShellControlsPanel[\s\S]*?className=\{className\}[\s\S]*?titleActions=\{strategikonNavigation\}[\s\S]*?titleClassName="skirmish-hud-titlebar"/.test(skirmishHud)
  || /<OuterChromeBox\b|<OuterChromeHeader\b|chromeConsumer=/.test(skirmishHud)
  || /<h2>Controls<\/h2>/.test(skirmishHud)) {
  failures.push('live Skirmish HUD must supply content and actions to the one ShellControlsPanel owner');
}
if (!/export function SkirmishShell[\s\S]*?<SkirmishHud \{\.\.\.hudProps\} controlsContent=\{controlsContent\} \/>/.test(skirmishShell)
  || !/function SkirmishSession\b[\s\S]*?return \([\s\S]*?<SkirmishShell/.test(skirmish)
  || !/export function Skirmish\b[\s\S]*?<SkirmishStoreProvider>[\s\S]*?<SkirmishSession \{\.\.\.props\} \/>[\s\S]*?<\/SkirmishStoreProvider>/.test(skirmish)) {
  failures.push('Battle must render through one instance-owned Skirmish session and the one SkirmishShell that owns SkirmishHud');
}
const runMetaControlsStart = runScreen.indexOf('function RunMetaControls');
const runMetaControlsEnd = runScreen.indexOf('\nfunction ArrangedDeploymentControls', runMetaControlsStart);
const runMetaControls = runMetaControlsStart >= 0
  ? runScreen.slice(runMetaControlsStart, runMetaControlsEnd >= 0 ? runMetaControlsEnd : undefined)
  : '';
if (!/const form = createRunForm\(\{[\s\S]*?titleBarContent:\s*shellRun\s*\?\s*\(?\s*<RunTitleBarStatus[\s\S]*?lipsanonIds: visibleLipsanonIds/.test(runScreen)
  || !/form\.add\(runActivity\(\{[\s\S]*?controlsContent: shellRun \? \([\s\S]*?<RunMetaControls[\s\S]*?run=\{shellRun\}[\s\S]*?view=\{view\}[\s\S]*?onNavigate=\{navigateRunView\}[\s\S]*?showAbandon=\{shellRun\.phase !== 'victory'\}/.test(runScreen)
  || !/<SkirmishShell[\s\S]*?titleBarContent=\{form\.titleBarContent\}[\s\S]*?controlsContent=\{activity\.controlsContent\}/.test(runForm)
  || !/<section[\s\S]*?className="run-meta-controls"[\s\S]*?aria-label="Run controls"/.test(runMetaControls)
  || /\binert=/.test(runMetaControls)
  || /function RunShell|function RunControlsRail|chromeConsumer="run-controls"|<SkirmishShell/.test(runScreen)) {
  failures.push('every Run phase must contribute controls to the one closed RunForm shell');
}
if (!/export function RunSceneViewport/.test(runWorkspace)
  || !/<main[\s\S]*?className=\{`run-workspace \$\{scene\.className \?\? ''\}`\.trim\(\)\}[\s\S]*?data-run-scene-view=\{scene\.view\}/.test(runWorkspace)
  || !/<ShellWorkspace[\s\S]*?className="run-shell-workspace"[\s\S]*?bodyClassName=\{`run-shell-workspace-content \$\{scene\.contentClassName \?\? ''\}`\.trim\(\)\}[\s\S]*?edgeAttached=\{scene\.edgeAttached \?\? false\}/.test(runWorkspace)) {
  failures.push('RunSceneViewport must supply typed scene content to the body-owning ShellWorkspace');
}
if (!/<RunSceneViewport[\s\S]*?scene=\{\{[\s\S]*?view: 'army'[\s\S]*?contentClassName,[\s\S]*?edgeAttached: true,[\s\S]*?testId: dataTestId/.test(runArmyWorkspace)) {
  failures.push('framed Run Army workspaces must use the shared edge-attached content variant');
}
const playerRunSources = `${runScreen}\n${runArmyWorkspace}\n${runExpunctioWorkspace}\n${runDeploymentCardStack}\n${runLipsana}`;
for (const testId of [
  'run-sectio-workspace',
  'run-victory-workspace',
  'run-army-ledger-workspace',
  'run-army-profile-workspace',
  'run-expunctio-workspace',
  'run-lipsana-workspace',
  'run-loading-workspace',
  'run-empty-workspace',
]) {
  if (!playerRunSources.includes(`data-testid="${testId}"`)
    && !playerRunSources.includes(`testId: '${testId}'`)) {
    failures.push(`player-facing Run destination ${testId} must use RunSceneViewport`);
  }
}
const runBattlefieldSources = `${runScreen}\n${skirmish}`;
if (!/testId=\{runDeployment \? 'run-deployment' : 'skirmish'\}/.test(skirmish)
  || !/className="skirmish-war-room"/.test(skirmish)
  || !/primaryClassName="skirmish-field"/.test(skirmish)
  || !/className="run-meta-controls run-deployment-controls run-arrangement-controls"/.test(runScreen)
  || !/renderCellOverlay:/.test(runScreen)
  // Deployment still projects its own position through the battlefield's one passive-surface
  // seam, and still outranks anything else offered there (today, a move review of the live
  // match). What this pins is that it goes through that seam at all.
  || !/surfaceState=\{presentedDeploymentSurface(?: \?\? \w+)?\}/.test(skirmish)
  || /run-deployment-workspace|<LevelPreviewColumn|Choose square…/.test(runBattlefieldSources)) {
  failures.push('Run Deployment must use the battlefield and phase-specific Controls instead of a RunWorkspace level manifest');
}
if (!/<RunDeploymentCardStack/.test(runScreen)
  || !/data-deployment-card-stage=\{deployment\?\.stage/.test(runDeploymentCardStack)
  || !/data-deployment-stack-card=\{cardId\}/.test(runDeploymentCardStack)
  // The closed stack draws the shared back through the player's chosen-back hook (ADR-0524), not a
  // slot literal, so Deployment and Sectio cannot disagree about a face-down card.
  || !/<RunCardBack mediaUrl=\{backMediaUrl\}/.test(runDeploymentCardStack)
  || !/useRunCardBackMediaUrl\(\)/.test(runDeploymentCardStack)
  || /RunSceneViewport|data-klerosis|Confirm/.test(runDeploymentCardStack)
  || /KlerosisOverlay|RunKlerosisWorkspace/.test(runScreen)) {
  failures.push('Deployment must own one hidden Controls card stack on the canonical battlefield without a separate confirmation workspace');
}
if (/<OuterChromeBox\b|<OuterChromeHeader\b|chromeConsumer="run-(?:draft|deployment|sectio|victory|army-ledger|army-profile|expunctio|empty)"/.test(playerRunSources)) {
  failures.push('player-facing Run destinations must not restore top-level outer panels');
}
if (/<select\b|type="checkbox"/.test(playerRunSources)) {
  failures.push('Run destinations must use registered shared controls instead of raw selects or checkboxes');
}
const runWorkspaceCss = blockFor('.run-workspace');
if (!runWorkspaceCss
  || !/position\s*:\s*relative\s*;/.test(runWorkspaceCss)
  || /\b(?:padding|gap)\s*:/.test(runWorkspaceCss)) {
  failures.push('RunWorkspace must position the shared fill without an exposed parent gutter');
}
if (blockFor('.skirmish-screen.run-screen')) {
  failures.push('Run must inherit the shared zero-gap shell; a route-specific shell-gap override is forbidden');
}
if (!blockFor('.run-shell-workspace-content')
  || !blockFor('.run-screen.has-lipsana .run-shell-workspace-content')
  || blockFor('.run-workspace--full')
  || blockFor('.run-screen.has-lipsana .run-workspace')) {
  failures.push('Run content spacing and lipsanon reservation must stay inside the continuous shell workspace surface');
}
const runCssStart = css.indexOf('/* ===== Run =====');
const runCssEnd = css.indexOf('/* ===== Enchiridion + Strategikon', runCssStart);
const runCss = runCssStart >= 0 && runCssEnd > runCssStart ? css.slice(runCssStart, runCssEnd) : '';
const rawRunSpacing = runCss.match(/(?:^|\n)\s*(?:margin(?:-[\w-]+)?|padding(?:-[\w-]+)?|(?:row-|column-)?gap|top|right|bottom|left|inset(?:-[\w-]+)?)\s*:[^;\n]*\b\d+(?:\.\d+)?px\b/g) ?? [];
if (!runCss || rawRunSpacing.length > 0) {
  failures.push(`Run layout spacing must use ADR-0031 tokens; found ${rawRunSpacing.length} raw-px declaration(s)`);
}
const runLipsanonRules = blocksTargeting('.run-lipsanon-strip');
const rawLipsanonSpacing = runLipsanonRules.filter((block) => /(?:margin|padding|(?:row-|column-)?gap|top|right|bottom|left|inset(?:-[\w-]+)?)\s*:[^;]*\b\d+(?:\.\d+)?px\b/.test(block));
if (rawLipsanonSpacing.length > 0) {
  failures.push('Run lipsanon overlay spacing must use ADR-0031 tokens at every responsive width');
}
if (!/\{shellWorkspaceCoversLipsana \? null : <LipsanonStrip lipsanonIds=\{lipsanonIds\} \/>\}/.test(skirmishShell)
  || !/const workspaceOpen = form\.strategikonOpen \|\| Boolean\(form\.inspectionWorkspace\)/.test(runForm)
  || !/shellWorkspaceCoversLipsana=\{workspaceOpen\}/.test(runForm)) {
  failures.push('Shell-covering workspaces must suppress the covered lipsanon strip without changing shell geometry');
}
if (!/import\s+\{\s*SkirmishHud\s*\}/.test(chromeUnitAudit)
  || !/preview\.kind === 'skirmish-hud'/.test(chromeUnitAudit)
  || !/<SkirmishHud[\s\S]*?enableGlobalShortcuts=\{false\}/.test(chromeUnitAudit)) {
  failures.push('Chrome Audit must expose the real Skirmish HUD consumer without installing match-wide shortcuts');
}
if (!/<OuterChromeBox[\s\S]*?chromeConsumer="outer-panel-specimen"[\s\S]*?titled/.test(chromeUnitAudit)
  || !/<OuterChromeHeader title=\{PLACEHOLDER_TEXT\}/.test(chromeUnitAudit)) {
  failures.push('Chrome Audit outer-panel specimen must consume the shared titled outer-panel primitives');
}

const skirmishHudBlock = blockFor('.skirmish-hud');
if (!skirmishHudBlock) {
  failures.push('missing .skirmish-hud layout block');
} else if (/border-image(?:-source|-width|-slice|-repeat)?\s*:|--skirmish-chrome-outer-(?:rail-w|panel-image)\s*:/.test(skirmishHudBlock)) {
  failures.push('.skirmish-hud must own layout only; shared OuterChromeBox owns outer frame geometry');
}

if (!/<InnerChromeBox className="skirmish-service-record">/.test(skirmishHud)
  || !/<InnerChromeBox className="unit-portrait unit-portrait--hud"/.test(skirmishHud)
  || !/<InnerChromeBox className=\{classes\}/.test(portraitEditor)
  || !/if \(!framed\) return <div className=\{classes\}/.test(portraitEditor)
  || !/className="run-army-ledger-portrait unit-portrait--divided"[\s\S]*?framed=\{false\}/.test(runArmyWorkspace)
  || !/<DividedInnerChromeBox[\s\S]*?columns=\{\['var\(--run-army-row-block-size,\s*158px\)',\s*'minmax\(0,\s*1fr\)',\s*'112px'\]\}/.test(runArmyWorkspace)
  // The grid's own rails are drawn with the PRIVATE rail part, not a public ChromeDivider with its
  // caps switched off: the grid places every junction itself from its line topology, and no call
  // site may say "no caps" any more (see check-chrome-rails.mjs).
  || !/<ChromeGridRail[\s\S]*?role="inner"[\s\S]*?orientation="vertical"/.test(chromeDividedGrid)
  || !/from '\.\/chromeRailInternals'/.test(chromeDividedGrid)) {
  failures.push('Portrait hosts must use the registered InnerChromeBox or the Run Army row’s registered vertical divider composition');
}
if (/<ChromeDivider\b/.test(runArmyWorkspace)
  || /run-army-ledger-(?:portrait|value|scroll)-divider|--run-army-ledger-apron/.test(`${runArmyWorkspace}\n${css}`)) {
  failures.push('Run Army must declare divided-grid tracks and leave all rail, junction, and scrollbar-gutter placement to the shared topology primitive');
}
for (const selector of ['.skirmish-service-record', '.unit-portrait', '.unit-portrait--roster']) {
  const block = blockFor(selector);
  if (block && /border-image(?:-source|-width|-slice|-repeat)?\s*:/.test(block)) {
    failures.push(`${selector} must not own frame geometry after migrating to InnerChromeBox`);
  }
}
if (!/<InnerChromeBox[\s\S]*?className=\{`skirmish-promotion-picker is-\$\{side\}`\}/.test(pawnPromotionPicker)
  || !/<ChromeButton[\s\S]*?unit="inner-asset-swatch"[\s\S]*?chromeUnitClassNames\('inner-asset-swatch',\s*'app-header-button',\s*'skirmish-promotion-option'\)/.test(pawnPromotionPicker)
  || /aria-label="Pawn promotion"/.test(skirmishHud)
  // The HUD's sections are COMPARTMENTS of the Controls head's divided block, not framed buttons
  // standing in a row: the panel's rails are their edges. So the pin is on the declaration that
  // hands them to the panel, and on the panel keeping the rails to itself.
  || !/titleSections=\{controlsContent === undefined \? HUD_TABS\.map/.test(skirmishHud)
  || /<ChromeButton[\s\S]*?'skirmish-hud-tab'/.test(skirmishHud)
  // A head compartment is not a registered unit either: the block already drew every edge it has,
  // so it is a bare seat carrying the leaf material, exactly like .titlebar-control--seat.
  || !/className: `shell-controls-head-section/.test(chromeBox)
  || !/'data-chrome-fill-surface': section\.press \? CHROME_LEAF_FILL_SURFACE : undefined/.test(chromeBox)
  || /<ChromeButton[\s\S]*?shell-controls-head-section/.test(chromeBox)
  // The card is ONE divided box of compartments, not fifteen framed buttons in a gapped
  // grid — that shape is what ChromeSeatGrid exists to replace, and rebuilding it here
  // would put a frame, a strip of panel and another frame between every pair of marks.
  || !/<ChromeSeatGrid\b/.test(commandCard)
  || /<ChromeButton\b|app-header-button/.test(commandCard)
  // The card carries no per-key label any more; the tip does. A key that grew one back
  // would restate the wall of type this replaced (ADR-0586).
  || /skirmish-grid-label/.test(commandCard)
  || !/tip: \{ title:/.test(commandCard)) {
  failures.push('Skirmish promotion must use its registered anchored inner composition while tab and command-grid controls inherit existing registered inner units');
}
for (const selector of ['.skirmish-hud-tab', '.skirmish-hud .app-header-button']) {
  const block = blockFor(selector);
  if (block && /border(?:-image(?:-source|-width|-slice|-repeat)?)?\s*:/.test(block)) {
    failures.push(`${selector} must not own frame geometry after migrating to the registered inner hierarchy`);
  }
}

const focusedStart = css.indexOf('.skirmish-hud {');
const focusedEnd = css.indexOf('.ic-eraser {', focusedStart);
const focused = focusedStart >= 0 && focusedEnd > focusedStart ? css.slice(focusedStart, focusedEnd) : '';
if (!focused) {
  failures.push('missing focused skirmish/editor control-panel CSS range for chrome guard');
} else {
  if (/border-image(?:-source)?\s*:\s*url\("\/assets\/ui\/(?:kit|explore\/frames)\//.test(focused)) {
    failures.push('focused control-panel chrome must not hard-code kit/explore frame PNGs; use role variables');
  }
  if (/border\s*:\s*(?:7|8|9|10|12|14)px\s+solid\s+transparent/.test(focused)) {
    failures.push('focused control-panel chrome must not hard-code local frame widths');
  }
  if (/border-image-width\s*:\s*(?:7|8|9|10|12|14)px/.test(focused)) {
    failures.push('focused control-panel chrome must not hard-code local border-image widths');
  }
  if (/--(?:le|up)-frame\s*:\s*(?:7|8|9|10|12|14)px/.test(focused) || /--up-rail-w\s*:\s*(?:7|8|9|10|12|14)px/.test(focused)) {
    failures.push('focused control-panel chrome must not declare local rail-width custom properties');
  }
}

if (failures.length) {
  console.error('\n✗ empty panel frame/chrome guard FAILED (ADR-0081/0069/0070/0093/0237):');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}

console.log('✓ empty panel frame/chrome guard OK: level editor rail is overlay-only and chrome roles are centralized.');
