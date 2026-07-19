#!/usr/bin/env node
// Guard for ADR-0081/0069/0070/0093: empty outer control-panel frames must be overlays, not
// layout borders that reserve a fake colored moat; house chrome in the focused
// skirmish/editor control panels must consume outer/inner role variables instead
// of local frame paths and widths. Media bytes and candidate-source validation
// belong to the live backend; this repository guard inspects code-owned geometry
// and consumer wiring only.
import { readFileSync } from 'node:fs';
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
const skirmish = readFileSync(join(frontend, 'src/ui/Skirmish.tsx'), 'utf8');
const skirmishHud = readFileSync(join(frontend, 'src/ui/SkirmishHud.tsx'), 'utf8');
const portraitEditor = readFileSync(join(frontend, 'src/ui/PortraitEditor.tsx'), 'utf8');
const installedChromeCss = readFileSync(join(frontend, 'src/ui/useInstalledChromeCss.ts'), 'utf8');
const victoryConditionsEditor = readFileSync(join(frontend, 'src/ui/VictoryConditionsEditor.tsx'), 'utf8');
const confirmDialog = readFileSync(join(frontend, 'src/ui/shared/ConfirmDialog.tsx'), 'utf8');
const failures = [];

function blockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? '';
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
  '--le-inner-zone-button-w',
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
  || !/:is\(\.level-editor-screen, \.skirmish-screen, \.chrome-family-surface\) \.le-outer-panel > \.le-outer-panel-content--titled > \.outer-chrome-header\s*\{[\s\S]*?margin-inline\s*:\s*calc\(-1 \* var\(--le-control-content-inset\)\)\s*;/.test(css)) {
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
  || !/padding-right\s*:\s*calc\(18px \+ var\(--le-inner-atom-right-overhang/.test(hudScrollContentBlock)) {
  failures.push('the Level Editor scrollport must expand a two-sided atom clip apron without moving its rail-aligned content');
}
for (const [selector, rightReserve] of [['.le-md-rules', '4px'], ['.le-md-detail', '6px']]) {
  const block = blockFor(selector);
  if (!/margin-inline\s*:/.test(block)
    || !block.includes('--le-inner-atom-left-overhang')
    || !block.includes('--le-inner-atom-right-overhang')
    || !/overflow-x\s*:\s*hidden/.test(block)
    || !/padding-left\s*:\s*var\(--le-inner-atom-left-overhang/.test(block)
    || !block.includes(`padding-right: calc(${rightReserve} + var(--le-inner-atom-right-overhang, 0px))`)) {
    failures.push(`${selector} must expose a two-sided atom clip apron while preserving its ${rightReserve} right reserve`);
  }
}
if (/--le-inner-atom-(?:left|right)-footprint|--le-visible-content-(?:left|right)-inset/.test(`${css}\n${chromeRuntime}`)) {
  failures.push('atom footprint must not become control, title, or section alignment state');
}

if (!/className="le-control-divider-host"[\s\S]*?<ChromeDivider role="outer"\s*\/>/.test(levelEditorChromeConsumers)) {
  failures.push('level editor rail must place the shared outer-role ChromeDivider between fixed controls and dynamic content');
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
if (!/className="le-layer-picker-row"[\s\S]*?aria-label="Previous editor layer"[\s\S]*?<HouseSelect[\s\S]*?aria-label="Next editor layer"/.test(levelEditorChromeConsumers)
  || !/<OuterChromeHeader title="Controls">/.test(levelEditorChromeConsumers)) {
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
if (!/requiredDrawableAsset\('installed-chrome', 'chrome-family'\)/.test(chromeRuntime)
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
if (!/route:\s*'\/editor\/level\?chromeLab=1'/.test(chromeLab)) {
  failures.push('Chrome Lab must load the level editor in preview mode so installed defaults do not fight live tuning CSS');
}
if (!/chromeUnitsInHierarchyOrder\(\)\.map/.test(chromeLab) || !/ChromeUnitAuditViewer/.test(chromeLab)) {
  failures.push('Chrome Lab catalog must be generated from the hierarchy-ordered chrome unit registry and open the audit viewer for unit targets');
}
if (/from\s+'\.\/ChromeLab'/.test(levelEditor)
  || !/from\s+'\.\/useInstalledChromeCss'/.test(levelEditor)
  || !/from\s+'\.\/useInstalledChromeCss'/.test(skirmish)) {
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
if (!/useInstalledChromeCss\(\)/.test(skirmish)
  || !/data-skirmish-chrome-family/.test(skirmish)
  || !/dangerouslySetInnerHTML=\{\{\s*__html:\s*installedChromeCss\s*\}\}/.test(skirmish)) {
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
const chevronButtons = [
  ...[...levelEditor.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((match) => match[0]),
  ...[...levelEditorChromeConsumers.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((match) => match[0]),
].filter((block) => block.includes('stepper-chevron'));
if (chevronButtons.length !== 6 || chevronButtons.some((block) => !block.includes('data-chrome-unit="inner-chevron-key"') || !/chromeUnitClassNames\(\s*'inner-chevron-key'/.test(block))) {
  failures.push('all six previous/next Level Editor controls must use the concrete inner-chevron-key hierarchy leaf');
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
    : levelEditor + levelEditorChromeConsumers;
  if (!implementationSources.includes(`data-chrome-unit="${id}"`)) {
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
  '[data-chrome-consumer="level-editor-controls"]',
  '[data-chrome-consumer="events-overlay"]',
  '[data-chrome-consumer="skirmish-hud"]',
  '.le-icon-btn',
  '.le-action-toolbar .le-seg-btn',
  '.le-seg-icons .le-seg-btn',
  '.settings-stepper .settings-chrome-button',
  '.le-seg-btn',
  '.le-faction-select',
  '.le-board-link-input',
  '.le-select-wrap',
  '.le-layer-select-wrap',
  '.le-event-select-wrap',
]) {
  if (!chromeUnitRegistry.includes(selector)) {
    failures.push(`house chrome selector must be represented in the chrome unit registry: ${selector}`);
  }
}
if (!chromeRuntime.includes("calc(-1 * var(--ds-space-3))")) {
  failures.push('content-aligned panel titles must align to the rail-owned contents boundary without atom compensation');
}
if (/id:\s*'inner-dropdown'[\s\S]*?selectors:\s*\[[\s\S]*?'\.le-layer-select'/.test(chromeUnitRegistry)) {
  failures.push('inner dropdown registry must frame the wrapper, not its native .le-layer-select child');
}
const houseSelectMenuBlock = blockFor('.house-select-menu');
const houseSelectScrollBlock = blockFor('.house-select-menu-scroll');
const houseSelectScrollContentBlock = blockFor('.house-select-menu-scroll > .kit-scroll-content');
const houseSelectScrollRailBlock = blockFor('.house-select-menu-scroll > .kit-scroll-rail');
const houseSelectOptionBlock = blockFor('.house-select-option');
if (!/<KitScroll\s+className="house-select-menu-scroll"/.test(houseSelect)
  || !/<InnerChromeBox[\s\S]*?className="house-select-menu-box"[\s\S]*?<ChromeDivider role="inner"/.test(houseSelect)
  || /chromeUnitClassNames\('inner-list-row',\s*'house-select-option'/.test(houseSelect)
  || /\.house-select-option'/.test(chromeUnitRegistry)
  || !/overflow\s*:\s*visible/.test(houseSelectMenuBlock)
  || !houseSelectScrollBlock.includes('--house-select-clip-apron-left')
  || !houseSelectScrollBlock.includes('--house-select-clip-apron-right')
  || !houseSelectScrollBlock.includes('--le-inner-divider-atom-left-overhang')
  || !houseSelectScrollBlock.includes('--le-inner-divider-atom-right-overhang')
  || !/padding-inline\s*:\s*var\(--house-select-clip-apron-left\) var\(--house-select-clip-apron-right\)/.test(houseSelectScrollContentBlock)
  || !/right\s*:\s*calc\(3px \+ var\(--house-select-clip-apron-right\)\)/.test(houseSelectScrollRailBlock)
  || !/overflow-x\s*:\s*hidden/.test(houseSelectScrollContentBlock)
  || /overflow-x\s*:\s*(?:auto|scroll)/.test(houseSelectScrollContentBlock)
  || /--le-inner-atom-(?:left|right)-(?:overhang|footprint)/.test(houseSelectOptionBlock)) {
  failures.push('HouseSelect menus must be one divided inner box with a joint-safe clip apron, unframed rows, and vertical-only scrolling');
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
if (!/data-chrome-unit="outer-panel"/.test(chromeBox)
  || !/data-chrome-consumer=\{chromeConsumer\}/.test(chromeBox)
  || !/chromeUnitClassNames\('outer-panel',\s*'le-outer-panel',\s*className\)/.test(chromeBox)
  || !/className="le-outer-panel-fill"/.test(chromeBox)
  || !/titled \? 'le-outer-panel-content--titled' : ''/.test(chromeBox)
  || !/className=\{`skirmish-card outer-chrome-header/.test(chromeBox)
  || !/<OuterChromeTitle>\{title\}<\/OuterChromeTitle>/.test(chromeBox)) {
  failures.push('shared ChromeBox primitives must own the complete outer-panel fill/content/header composition');
}
if ((levelEditor.match(/<select\b[^>]*>/g) ?? []).some((opening) => /data-chrome-unit="inner-dropdown"|chromeUnitClassNames\('inner-dropdown'/.test(opening))) {
  failures.push('Level Editor native selects must sit inside shared dropdown wrappers instead of wearing inner-dropdown chrome directly');
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
  || !/\$\{familySurface\} \.le-outer-panel > \.le-outer-panel-fill \{[\s\S]*?\$\{chromeFillCss\(outer\)\}/.test(chromeRuntime)
  || !/\$\{chromeFillCss\(inner\)\}/.test(chromeRuntime)) {
  failures.push('Chrome Lab must apply role fill as explicit CSS background declarations on outer/inner roles');
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
  '.le-faction-select',
  '.le-layer-select',
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
  ['.le-faction-select', '--skirmish-chrome-inner-control-image'],
  ['.le-layer-select', '--skirmish-chrome-inner-control-image'],
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
  ['.le-faction-select', '--le-inner-control-h'],
  ['.le-action-toolbar-divider', '--le-inner-control-h'],
  ['.le-icon-btn', '--le-inner-square'],
  ['.le-select-wrap,\n.le-layer-select-wrap,\n.le-event-select-wrap', '--le-inner-field-h'],
  ['.le-layer-select', '--le-inner-field-h'],
  ['.le-zone-stepper-button.settings-chrome-button', '--le-inner-square'],
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
const eventsOverlay = blockFor('.le-events-overlay');
if (eventsOverlay && /border(?:-image)?\s*:/.test(eventsOverlay)) {
  failures.push('level editor events overlay must not draw local outer chrome; it must inherit .le-outer-panel');
}
if (eventsOverlay && !/padding\s*:\s*0\s*;/.test(eventsOverlay)) {
  failures.push('level editor events overlay root must leave inset ownership to the shared outer-panel contents box');
}
if (eventsOverlay && !/left\s*:\s*var\(--le-outer-atom-outset,\s*0px\)/.test(eventsOverlay)) {
  failures.push('level editor fixed events overlay must reserve left viewport space for the outer corner atom');
}
if (eventsOverlay && !/bottom\s*:\s*var\(--le-outer-atom-outset,\s*0px\)/.test(eventsOverlay)) {
  failures.push('level editor fixed events overlay must reserve bottom viewport space for the outer corner atom');
}
if (eventsOverlay && !/right\s*:\s*calc\([^;]*--le-outer-atom-outset/.test(eventsOverlay)) {
  failures.push('level editor fixed events overlay must reserve right viewport space for the outer corner atom');
}
if (eventsOverlay && !/top\s*:\s*calc\([^;]*--le-outer-atom-outset/.test(eventsOverlay)) {
  failures.push('level editor fixed events overlay must reserve top viewport space for the outer corner atom');
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
if (/\.level-editor-screen \.le-events-overlay\s*\{[\s\S]*?border-image-source/.test(chromeRuntime)) {
  failures.push('generated chrome runtime must not keep a special events-overlay outer chrome branch');
}

// The audit specimen is not the product integration. The normal, ready Level Editor
// controls branch and events overlay must render the same shared consumers that Chrome
// Audit renders, and the controls consumer itself must own the complete outer-panel
// composition. Keep these checks scoped to the component/function that owns each
// responsibility so a fixture or sibling cannot accidentally satisfy the live contract.
const levelEditorChromeImports = [
  ...levelEditor.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]\.\/LevelEditorChromeConsumers['"]/g),
];
if (!levelEditorChromeImports.some((match) => /\bLevelEditorControlsPanel\b/.test(match[1]))) {
  failures.push('live Level Editor must import LevelEditorControlsPanel from LevelEditorChromeConsumers');
}
if (!levelEditorChromeImports.some((match) => /\bLevelEditorEventsOverlay\b/.test(match[1]))) {
  failures.push('live Level Editor must import LevelEditorEventsOverlay from LevelEditorChromeConsumers');
}
if (!/\{editorLoadError\s*\?[\s\S]*?\)\s*:\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)*<LevelEditorControlsPanel\b/.test(levelEditor)) {
  failures.push('live Level Editor normal controls path must render the shared LevelEditorControlsPanel consumer');
}
if (!/\{eventsOpen\s*\?\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)*<LevelEditorEventsOverlay\b/.test(levelEditor)) {
  failures.push('live Level Editor open-events path must render the shared LevelEditorEventsOverlay consumer');
}
const rawLevelEditorControlAside = [...levelEditor.matchAll(/<aside\b[^>]*>/g)]
  .some((match) => /\bskirmish-hud\b/.test(match[0]) && /aria-label\s*=\s*['"]Editor controls['"]/.test(match[0]));
if (rawLevelEditorControlAside) {
  failures.push('live Level Editor must not restore a raw parallel skirmish-hud controls aside; render LevelEditorControlsPanel');
}
const rawLevelEditorEventsOverlay = [...levelEditor.matchAll(/<div\b[^>]*>/g)]
  .some((match) => /\ble-events-overlay\b/.test(match[0]) && /role\s*=\s*['"]dialog['"]/.test(match[0]));
if (rawLevelEditorEventsOverlay) {
  failures.push('live Level Editor must not restore a raw parallel le-events-overlay dialog; render LevelEditorEventsOverlay');
}

const levelEditorControlsPanelStart = levelEditorChromeConsumers.indexOf('export function LevelEditorControlsPanel');
const levelEditorControlsPanelEnd = levelEditorChromeConsumers.indexOf('export function LevelEditorEventsOverlay', levelEditorControlsPanelStart);
const levelEditorControlsPanel = levelEditorControlsPanelStart >= 0 && levelEditorControlsPanelEnd > levelEditorControlsPanelStart
  ? levelEditorChromeConsumers.slice(levelEditorControlsPanelStart, levelEditorControlsPanelEnd)
  : '';
if (!levelEditorControlsPanel) {
  failures.push('missing shared LevelEditorControlsPanel implementation');
} else if (!/<OuterChromeBox[\s\S]*?chromeConsumer="level-editor-controls"[\s\S]*?titled[\s\S]*?className=\{`skirmish-hud \$\{className\}`\.trim\(\)\}/.test(levelEditorControlsPanel)
  || !/<OuterChromeHeader title="Controls">/.test(levelEditorControlsPanel)) {
  failures.push('LevelEditorControlsPanel must compose the shared titled OuterChromeBox and Controls header');
}

if (!/<OuterChromeBox as="div" chromeConsumer="events-overlay"/.test(levelEditorChromeConsumers)) {
  failures.push('events overlay must reuse OuterChromeBox while preserving its dialog div semantics');
}
if (!/<OuterChromeBox[\s\S]*?chromeConsumer="skirmish-hud"[\s\S]*?titled[\s\S]*?className=\{`skirmish-hud \$\{className\}`\.trim\(\)\}/.test(skirmishHud)
  || !/<OuterChromeHeader title="Controls">/.test(skirmishHud)
  || /<h2>Controls<\/h2>/.test(skirmishHud)) {
  failures.push('live Skirmish HUD must use the same titled OuterChromeBox and Controls header as the editor');
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
  || !/<InnerChromeBox className=\{`unit-portrait/.test(portraitEditor)) {
  failures.push('Skirmish portrait and service-record boxes must instantiate the registered InnerChromeBox primitive');
}
for (const selector of ['.skirmish-service-record', '.unit-portrait', '.unit-portrait--roster']) {
  const block = blockFor(selector);
  if (block && /border-image(?:-source|-width|-slice|-repeat)?\s*:/.test(block)) {
    failures.push(`${selector} must not own frame geometry after migrating to InnerChromeBox`);
  }
}
if (!/data-chrome-unit="inner-asset-swatch"[\s\S]*?chromeUnitClassNames\('inner-asset-swatch',\s*'app-header-button',\s*'skirmish-promotion-option'\)/.test(skirmishHud)
  || !/data-chrome-unit="inner-text-button"[\s\S]*?chromeUnitClassNames\('inner-text-button',\s*'skirmish-hud-tab'/.test(skirmishHud)
  || !/data-chrome-unit="inner-text-button"[\s\S]*?chromeUnitClassNames\('inner-text-button',\s*'app-header-button',\s*'skirmish-grid-key'/.test(skirmishHud)) {
  failures.push('Skirmish promotion, tab, and command-grid controls must inherit existing registered inner units');
}
for (const selector of ['.skirmish-hud-tab', '.skirmish-hud .app-header-button']) {
  const block = blockFor(selector);
  if (block && /border(?:-image(?:-source|-width|-slice|-repeat)?)?\s*:/.test(block)) {
    failures.push(`${selector} must not own frame geometry after migrating to the registered inner hierarchy`);
  }
}

const focusedStart = css.indexOf('.skirmish-hud {');
const focusedEnd = css.indexOf('.ic-brush {', focusedStart);
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
  console.error('\n✗ empty panel frame/chrome guard FAILED (ADR-0081/0069/0070/0093):');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}

console.log('✓ empty panel frame/chrome guard OK: level editor rail is overlay-only and chrome roles are centralized.');
