import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendRoot, '..');
const pieces = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'];
const palettes = ['navy-blue', 'crimson', 'golden', 'emerald', 'black', 'white'];
const failures = [];

const canonicalGenerator = path.join(repoRoot, 'scripts', 'generate-unit-art.py');
const canonicalRenderers = [
  'docs/art/unit-concepts/blender-units/pawn-helmet/render_pawn_helmet.py',
  'docs/art/unit-concepts/blender-units/rook-claude/render_rook_ruinwall.py',
  'docs/art/unit-concepts/blender-units/knight-fur/render_knight_fur.py',
  'docs/art/unit-concepts/blender-units/bishop-mitre/render_bishop_mitre.py',
  'docs/art/unit-concepts/blender-units/queen-tiara/render_queen_tiara.py',
  'docs/art/unit-concepts/blender-units/king-crown/render_king_crown.py',
].map((relative) => path.join(repoRoot, relative));
const rasterResize = path.join(frontendRoot, 'src', 'ui', 'unitRasterResize.ts');
const recaptureEditor = path.join(frontendRoot, 'src', 'ui', 'UnitRecaptureEditor.tsx');
for (const requiredPath of [canonicalGenerator, rasterResize, recaptureEditor, ...canonicalRenderers]) {
  if (!fs.existsSync(requiredPath)) failures.push(`missing:${path.relative(repoRoot, requiredPath)}`);
}
if (fs.existsSync(canonicalGenerator)) {
  const source = fs.readFileSync(canonicalGenerator, 'utf8');
  for (const requiredContract of [
    'Blender owns the model, camera, contact point',
    '"authoredRaster"',
    '"deliveryRaster"',
    '"spatialResampling": False',
    'UNIT_ART_FRAME_WIDTH',
    'UNIT_ART_FRAME_HEIGHT',
  ]) {
    if (!source.includes(requiredContract)) failures.push(`generator-contract:${requiredContract}`);
  }
  for (const forbiddenContract of ['Image.Resampling', '.resize(', 'image_generation', 'restyle_prompt']) {
    if (source.includes(forbiddenContract)) failures.push(`generator-resampling:${forbiddenContract}`);
  }
}
for (const renderer of canonicalRenderers) {
  if (!fs.existsSync(renderer)) continue;
  const source = fs.readFileSync(renderer, 'utf8');
  for (const requiredContract of ['UNIT_ART_OUTPUT_DIR', 'UNIT_ART_FRAME_WIDTH', 'UNIT_ART_FRAME_HEIGHT']) {
    if (!source.includes(requiredContract)) failures.push(`renderer-contract:${path.relative(repoRoot, renderer)}:${requiredContract}`);
  }
  if (!/resolution_percentage\s*=\s*100/.test(source)) {
    failures.push(`renderer-contract:${path.relative(repoRoot, renderer)}:resolution_percentage=100`);
  }
}
if (fs.existsSync(rasterResize)) {
  const source = fs.readFileSync(rasterResize, 'utf8');
  for (const marker of ['recaptureUnitRaster', 'unitContainRect', 'alphaSum', 'sampleArea']) {
    if (!source.includes(marker)) failures.push(`recapture-contract:${marker}`);
  }
}
if (fs.existsSync(recaptureEditor)) {
  const source = fs.readFileSync(recaptureEditor, 'utf8');
  for (const marker of [
    "pipeline: 'accepted-sprite-recapture'",
    'sourceAssetId: source.id',
    'spatialResampling: true',
    'aspectRatioPreserved: true',
    "alphaMode: 'premultiplied'",
    "resampler: 'premultiplied-area-contain'",
  ]) {
    if (!source.includes(marker)) failures.push(`recapture-contract:${marker}`);
  }
}

const nativeRuntimeContracts = [
  [path.join(repoRoot, 'packages', 'board-render', 'src', 'ui', 'unitCatalog.ts'), 'nativeScalePercentFromCanvas'],
  [path.join(repoRoot, 'packages', 'board-render', 'src', 'ui', 'unitCatalog.ts'), 'unitAssetProductionEligibility'],
  [path.join(repoRoot, 'packages', 'board-render', 'src', 'render', 'renderPlan.ts'), 'unit.footprint.sourceCanvasPx'],
  [path.join(frontendRoot, 'src', 'render', 'SkirmishBoard.tsx'), 'unit!.footprint.sourceCanvasPx'],
  [path.join(repoRoot, 'backend', 'server.js'), 'unit_sprite_canvas_mismatch'],
  [path.join(repoRoot, 'backend', 'server.js'), 'unit_asset_calibration_only'],
  [path.join(frontendRoot, 'src', 'ui', 'UnitAssetManager.tsx'), 'CALIBRATION_ONLY_MESSAGE'],
];
for (const [contractPath, marker] of nativeRuntimeContracts) {
  if (!fs.existsSync(contractPath) || !fs.readFileSync(contractPath, 'utf8').includes(marker)) {
    failures.push(`native-runtime-contract:${path.relative(repoRoot, contractPath)}:${marker}`);
  }
}

for (const piece of pieces) for (const palette of palettes) {
  const retiredDir = path.join(frontendRoot, 'public', 'assets', 'units', piece, palette);
  if (fs.existsSync(retiredDir)) failures.push(path.relative(repoRoot, retiredDir));
}

for (const retiredPath of [
  'backend/scripts/import-unit-assets.mjs',
  'docs/art/pixelover/rook-v1',
  'frontend/scripts/codexsheet',
  'frontend/scripts/cutout-unit-concept.mjs',
  'frontend/scripts/generate-rook-pixel-first-review.mjs',
  'frontend/scripts/generate-unit-concept-reference-sheet.mjs',
  'frontend/scripts/generate-unit-direction-review.mjs',
  'frontend/scripts/generate-unit-sprites.mjs',
  'frontend/scripts/make-rook-render-contact-sheet.mjs',
  'frontend/scripts/normalize-unit-direction-concepts.mjs',
  'frontend/scripts/postprocess-blender-unit-renders.mjs',
  'frontend/scripts/prepare-pixelover-project.mjs',
  'docs/art/unit-concepts/blender-units/rook-claude/render_versions.py',
  'tools/blender/create_unit_smoke_test.py',
  'tools/blender/scenes/export_rook_v2_glb.py',
  'tools/blender/scenes/pawn_bridge_smoke.py',
  'tools/blender/scenes/render_current_preview.py',
  'tools/blender/scenes/render_rook_v2.py',
  'tools/blender/scenes/render_rook_v2_pixel_first.py',
  'tools/blender/scenes/render_rook_v3.py',
  'tools/blender/scenes/render_unit_directions.py',
  'tools/blender/scenes/rook_bridge_smoke.py',
  'tools/blender/scenes/rook_v2.py',
  'tools/blender/scenes/rook_v3.py',
  'tools/blender/scenes/unit_set_procedural.py',
]) {
  if (fs.existsSync(path.join(repoRoot, retiredPath))) failures.push(retiredPath);
}

const forbidden = [
  /committedSpritePath/,
  /committed(?:\s+or|\/)last-good unit catalog/i,
  /\/assets\/units\/(?:pawn|rook|knight|bishop|queen|king)\/(?:navy-blue|crimson|golden|emerald|black|white)\//,
];
const sourceRoots = [
  path.join(frontendRoot, 'src'),
  path.join(repoRoot, 'packages', 'board-render', 'src'),
  path.join(repoRoot, 'backend'),
];

function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(target);
      continue;
    }
    if (!/\.(?:js|mjs|ts|tsx|json)$/.test(entry.name)) continue;
    const source = fs.readFileSync(target, 'utf8');
    if (forbidden.some((pattern) => pattern.test(source))) failures.push(path.relative(repoRoot, target));
  }
}

for (const root of sourceRoots) scan(root);

if (failures.length) {
  console.error('Committed unit-art migration guard FAILED:');
  for (const failure of [...new Set(failures)].sort()) console.error(`  ${failure}`);
  process.exit(1);
}

console.log('Committed unit-art migration guard OK: live catalog is the only board-unit art source.');
