#!/usr/bin/env node
// Guard for ADR-0081/0069/0070: empty outer control-panel frames must be overlays, not
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
const chromeLabDefaults = JSON.parse(readFileSync(join(frontend, 'config/chrome-lab-defaults.json'), 'utf8'));
const chromeUnitRegistry = readFileSync(join(frontend, 'src/ui/chromeUnitRegistry.ts'), 'utf8');
const levelEditor = readFileSync(join(frontend, 'src/ui/LevelEditor.tsx'), 'utf8');
const levelEditorChromeConsumers = readFileSync(join(frontend, 'src/ui/LevelEditorChromeConsumers.tsx'), 'utf8');
const skirmish = readFileSync(join(frontend, 'src/ui/Skirmish.tsx'), 'utf8');
const skirmishHud = readFileSync(join(frontend, 'src/ui/SkirmishHud.tsx'), 'utf8');
const installedChromeCss = readFileSync(join(frontend, 'src/ui/useInstalledChromeCss.ts'), 'utf8');
const victoryConditionsEditor = readFileSync(join(frontend, 'src/ui/VictoryConditionsEditor.tsx'), 'utf8');
const confirmDialog = readFileSync(join(frontend, 'src/ui/shared/ConfirmDialog.tsx'), 'utf8');
const registry = readFileSync(join(frontend, 'config/nine-slice-registry.json'), 'utf8');
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
  || !/:is\(\.level-editor-screen, \.skirmish-screen\) \.le-outer-panel > \.le-outer-panel-content--titled > \.le-layer-card\s*\{[\s\S]*?margin-inline\s*:\s*calc\(-1 \* var\(--le-control-content-inset\)\)\s*;/.test(css)) {
  failures.push('the titled panel shell must be an explicit full-bleed exception to the inherited contents box');
}

if (!/\.level-editor-screen \.le-layer-card > :not\(\.kit-panel-title\)\s*\{[\s\S]*?margin-inline\s*:\s*\n\s*calc\(var\(--le-control-content-inset\) \+ var\(--le-visible-content-left-inset\)\)\s*\n\s*calc\(var\(--le-control-content-inset\) \+ var\(--le-visible-content-right-inset\)\)\s*;/.test(css)) {
  failures.push('layer card controls must use the contents box plus visible atom overhang while the title fill remains full-width');
}

if (!/className="le-control-divider-host"[\s\S]*?className="kit-divider"/.test(levelEditorChromeConsumers)) {
  failures.push('level editor rail must place reusable kit-divider between fixed controls and dynamic content');
}

const dividerHost = blockFor('.level-editor-screen .le-control-divider-host');
if (!/position\s*:\s*relative\s*;/.test(dividerHost) || !/z-index\s*:\s*4\s*;/.test(dividerHost) || !/pointer-events\s*:\s*none\s*;/.test(dividerHost)) {
  failures.push('level editor divider host must render above the frame overlay without catching interactions');
}
if (!/function\s+renderFrameEdgeTileDataUrl/.test(chromeRuntime)) {
  failures.push('Chrome Lab divider must derive its rail from the normalized outer frame edge');
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
if (!/CHROME_LAB_STORAGE_VERSION\s*=\s*3/.test(chromeLab)
  || !/CHROME_LAB_LEGACY_STORAGE_VERSION\s*=\s*2/.test(chromeLab)) {
  failures.push('Chrome Lab must migrate v2 tuning while dropping obsolete geometry fields');
}
if (!/function\s+defaultRailFitForSource[\s\S]*?source\.kind === 'rail-repeat'\)\s*return 'tile';/.test(chromeRuntime)
  || chromeLabDefaults.inner?.railSourceId !== 'inner-rails-repeat-v4-02'
  || chromeLabDefaults.inner?.railFit !== 'tile') {
  failures.push('Chrome Lab repeat rail sources must default to tile, not stretch-crush long seam strips into side rails');
}
if (chromeLabDefaults.outer?.railSourceId !== 'outer-rails-v3-01'
  || chromeLabDefaults.outer?.railFit !== 'stretch'
  || !/function\s+borderImageRepeatForTune[\s\S]*?tune\.railFit === 'tile'\s*\?\s*'repeat'\s*:\s*'stretch'/.test(chromeRuntime)
  || /repeat stretch/.test(chromeRuntime)) {
  failures.push('Chrome Lab accepted outer rail default must live in committed JSON and use a single explicit fit mode');
}
const dividerTuneType = chromeRuntime.match(/type\s+DividerTune\s*=\s*\{[\s\S]*?\n\};/)?.[0] ?? '';
if (/\b(?:railSourceId|railFit|railThickness|railX|railY|railUnderlap)\b/.test(dividerTuneType)) {
  failures.push('Chrome Lab divider tuning must not own rail settings; divider rail always follows outer chrome');
}
if (!/railFit:\s*RailFit/.test(chromeRuntime) || !/<DividerControls[\s\S]*railFit=\{outer\.railFit\}/.test(chromeLab)) {
  failures.push('Chrome Lab divider controls must preview the divider rail using the outer chrome fit');
}
if (!/function\s+dividerCss\(outer:\s*RoleTune,\s*outerFrame:\s*FrameRender,\s*divider:\s*DividerRender\)/.test(chromeRuntime)
  || !/\.level-editor-screen \.le-control-divider-host \.kit-divider::before\s*\{[\s\S]*?border-image-source:\s*url\("\$\{outerFrame\.url\}"\)/.test(chromeRuntime)
  || !/\.level-editor-screen \.le-control-divider-host \.kit-divider\s*\{[\s\S]*?background:\s*none !important;/.test(chromeRuntime)) {
  failures.push('Chrome Lab divider rail must render through the same outer frame border-image path, not a cropped background approximation');
}
if (!/(?:export\s+)?const\s+DEFAULT_DIVIDER_ATOM_SIZE\s*=\s*17\s*;/.test(chromeRuntime)) {
  failures.push('Chrome Lab divider atom default size must match the right-sized 17px divider cover atom family');
}
if (/DIVIDER_TEE_SOURCES/.test(chromeRuntime + chromeLab) || /divider-atoms-img2img-t-v[12]-/.test(chromeRuntime + chromeLab) || /divider-atoms-img2img-socket-v1-/.test(chromeRuntime + chromeLab)) {
  failures.push('Chrome Lab divider picker must not expose T/socket joint candidates as normal cover-atom choices');
}
if (!/divider-atoms-pixellab-cover-v1/.test(chromeRuntime)
  || !/divider-atoms-codex-style-cover-v1/.test(chromeRuntime)
  || chromeLabDefaults.divider?.atomSourceId !== 'divider-atoms-pixellab-cover-v1-21') {
  failures.push('Chrome Lab divider picker must expose native 17px PixelLab and Codex-style divider cover atoms and default to the curated cover atom');
}
if (chromeLabDefaults.outer?.atomSourceId !== 'outer-atoms-img2img-32-v1-08'
  || chromeLabDefaults.inner?.atomSourceId !== 'inner-atoms-img2img-micro-v2-10'
  || chromeLabDefaults.inner?.atomX !== -3
  || chromeLabDefaults.inner?.atomY !== -8) {
  failures.push('Chrome Lab atom defaults must use the right-sized outer atom family instead of retired oversized/undersized atoms');
}
if (!/committedChromeLabDefaults/.test(chromeRuntime)
  || !/config\/chrome-lab-defaults\.json/.test(chromeRuntime)
  || !/\/__chrome-lab\/defaults/.test(chromeLab)) {
  failures.push('Chrome Lab committed tuning must be a saved JSON source of truth, not hand-copied TypeScript literals');
}
for (const [key, value] of Object.entries({
  fillBoxLeft: chromeLabDefaults.outer?.fillBoxLeft,
  fillBoxRight: chromeLabDefaults.outer?.fillBoxRight,
  fillBoxTop: chromeLabDefaults.outer?.fillBoxTop,
  fillBoxBottom: chromeLabDefaults.outer?.fillBoxBottom,
  contentPadding: chromeLabDefaults.outer?.contentPadding,
  dividerAtomSize: chromeLabDefaults.divider?.atomSize,
  dividerAtomX: chromeLabDefaults.divider?.atomX,
  dividerAtomY: chromeLabDefaults.divider?.atomY,
})) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    failures.push(`Chrome Lab committed defaults must include numeric ${key} tuning`);
  }
}
if (!['manual', 'center'].includes(chromeLabDefaults.outer?.titleVerticalAlign)
  || !['manual', 'content-inset'].includes(chromeLabDefaults.outer?.titleHorizontalAlign)
  || !/titleVerticalAlign/.test(chromeLab)
  || !/titleHorizontalAlign/.test(chromeLab)
  || !/--le-panel-title-effective-text-y/.test(chromeRuntime + css)
  || !/--le-panel-title-align-extra-x/.test(chromeRuntime + css)) {
  failures.push('Chrome Lab must expose committed title text alignment modes for vertical centering and contents-box horizontal alignment');
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
  'inner-locked-rectangle',
  'inner-text-button',
  'inner-tool-square',
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
if (!/function\s+chromeUnitsInHierarchyOrder/.test(chromeUnitRegistry) || !/childrenByParent/.test(chromeUnitRegistry)) {
  failures.push('chrome unit registry must expose a hierarchy-order helper so parents render before children');
}
const registryIndex = (id) => chromeUnitRegistry.indexOf(`id: '${id}'`);
for (const [parent, child] of [
  ['inner-box', 'inner-locked-rectangle'],
  ['inner-locked-rectangle', 'inner-text-button'],
  ['inner-locked-rectangle', 'inner-tool-square'],
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
if (!/id:\s*'inner-box'[\s\S]*?dimensionPolicy:\s*'free-form'[\s\S]*?controlPolicy:\s*'width-height'/.test(chromeUnitRegistry)) {
  failures.push('inner-box must be the free-form inner chrome parent, not a square-specific class');
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
if (!/id:\s*'inner-text-button'[\s\S]*?name:\s*'text-button'[\s\S]*?parentId:\s*'inner-locked-rectangle'/.test(chromeUnitRegistry)) {
  failures.push('inner text button must inherit from locked-height-rectangle and be the sole wide text command unit');
}
if (!/id:\s*'inner-dropdown'[\s\S]*?name:\s*'dropdown'[\s\S]*?parentId:\s*'inner-locked-rectangle'/.test(chromeUnitRegistry)) {
  failures.push('inner dropdown must inherit from locked-height-rectangle and expose only its child class name');
}
for (const [id, kind, content] of [
  ['inner-box', 'template', 'none'],
  ['inner-locked-rectangle', 'template', 'slot'],
  ['inner-tool-square', 'template', 'slot'],
  ['inner-text-button', 'template', 'slot'],
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
  'inner-text-button',
]) {
  const selector = `[data-chrome-unit="${id}"]`;
  if (!chromeUnitRegistry.includes(selector)) {
    failures.push(`chrome unit registry must point ${id} at its data-chrome-unit selector`);
  }
  if (!(levelEditor + levelEditorChromeConsumers).includes(`data-chrome-unit="${id}"`)) {
    failures.push(`level editor must tag the concrete ${id} implementation with data-chrome-unit`);
  }
}
const registryUnitIds = new Set([...chromeUnitRegistry.matchAll(/id:\s*'([^']+)'/g)].map((match) => match[1]));
for (const [label, text] of [
  ['Level Editor', levelEditor],
  ['Level Editor Chrome Consumers', levelEditorChromeConsumers],
  ['Skirmish HUD', skirmishHud],
  ['Victory Conditions Editor', victoryConditionsEditor],
  ['Confirm Dialog', confirmDialog],
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
  '.level-editor-screen .le-control-divider-host .kit-divider',
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
  '.le-layer-select',
]) {
  if (!chromeUnitRegistry.includes(selector)) {
    failures.push(`house chrome selector must be represented in the chrome unit registry: ${selector}`);
  }
}
if (/generate-divider-atom-candidates/.test(readFileSync(join(frontend, 'package.json'), 'utf8'))) {
  failures.push('Chrome Lab divider atoms must not be regenerated from code-drawn placeholder geometry');
}
if (!/(?:export\s+)?const\s+DIVIDER_JOINT_PREVIEW_BOX\s*=/.test(chromeRuntime) || !/className="chrome-lab-divider-atom-stage"/.test(chromeLab)) {
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
  ['nine-slice registry', registry],
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

const title = blockFor('.level-editor-screen .skirmish-card h2.kit-panel-title');
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
if (!/const\s+familySurface\s*=\s*':is\(\.level-editor-screen, \.skirmish-screen\)'/.test(chromeRuntime)
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
if (!/skirmish-hud le-outer-panel/.test(levelEditorChromeConsumers) || !/le-events-overlay le-outer-panel/.test(levelEditorChromeConsumers)) {
  failures.push('level editor outer chrome consumers must instantiate the shared le-outer-panel class');
}
if (!/data-chrome-unit="outer-panel"/.test(skirmishHud)
  || !/data-chrome-consumer="skirmish-hud"/.test(skirmishHud)
  || !/skirmish-hud le-outer-panel/.test(skirmishHud)
  || !/className="le-outer-panel-fill"/.test(skirmishHud)
  || !/className="le-outer-panel-content"/.test(skirmishHud)) {
  failures.push('live Skirmish HUD must instantiate the complete shared outer-panel fill/content contract');
}
if (!/import\s+\{\s*SkirmishHud\s*\}/.test(chromeUnitAudit)
  || !/preview\.kind === 'skirmish-hud'/.test(chromeUnitAudit)
  || !/<SkirmishHud[\s\S]*?enableGlobalShortcuts=\{false\}/.test(chromeUnitAudit)) {
  failures.push('Chrome Audit must expose the real Skirmish HUD consumer without installing match-wide shortcuts');
}
if (!/data-chrome-unit="outer-panel"/.test(levelEditorChromeConsumers)) {
  failures.push('level editor outer chrome consumers must tag the concrete outer-panel implementation');
}
if ((levelEditorChromeConsumers.match(/className="le-outer-panel-fill"/g) ?? []).length < 2 || !/className="le-outer-panel-fill"/.test(chromeUnitAudit)) {
  failures.push('level editor outer-panel consumers and audit specimen must include the shared fill layer');
}
if (!/className="le-outer-panel-content le-outer-panel-content--titled"/.test(levelEditorChromeConsumers)
  || !/className="le-outer-panel-content le-outer-panel-content--titled"/.test(chromeUnitAudit)) {
  failures.push('titled outer-panel consumers and their audit specimen must declare the shared full-bleed title exception');
}

for (const [selector, tokens] of [
  ['.skirmish-hud', ['--skirmish-chrome-outer-rail-w', '--skirmish-chrome-outer-panel-image']],
  ['.skirmish-hud-tab', ['--skirmish-chrome-inner-rail-w', '--skirmish-chrome-inner-control-image']],
  ['.skirmish-hud .app-header-button', ['--skirmish-chrome-inner-rail-w', '--skirmish-chrome-inner-control-image']],
  ['.skirmish-service-record', ['--skirmish-chrome-inner-rail-w', '--skirmish-chrome-inner-control-image']],
  ['.unit-portrait', ['--skirmish-chrome-inner-rail-w', '--skirmish-chrome-inner-line-image']],
  ['.unit-portrait--roster', ['--skirmish-chrome-inner-rail-w']],
]) {
  const block = blockFor(selector);
  if (!block) failures.push(`missing ${selector} shared control-panel chrome block`);
  for (const token of tokens) {
    if (block && !block.includes(token)) {
      failures.push(`${selector} must consume ${token}`);
    }
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
  console.error('\n✗ empty panel frame/chrome guard FAILED (ADR-0081/0069/0070):');
  for (const failure of failures) console.error('  - ' + failure);
  process.exit(1);
}

console.log('✓ empty panel frame/chrome guard OK: level editor rail is overlay-only and chrome roles are centralized.');
