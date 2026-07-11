// Provenance regression gate for ADR-0040 fence art.
//
// Fence geometry may be deterministic, but shipped RGB must continue to come
// from generated/source art. This catches the concrete failure that prompted the
// fence replacement: a tiny hard-coded palette baked into flat Pillow shapes.
// The archived run record points to the generating Codex rollout; this guard
// verifies that recorded proof claim but does not attempt a new generation run.
// This is deliberately NOT ADR-0076 native-size acceptance: the current spatially
// resized fence pixels remain a named calibration bridge until regenerated at 1x.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import {
  extractActiveFenceCandidateProfiles,
  measureRailProjection,
  sha256File,
  validateBoardEdgeRailPair,
  validateFenceRealignmentLiveProof,
} from './fence-projection-guard.mjs';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(FRONTEND, '..');
const BAKE = path.join(FRONTEND, 'scripts', 'build-fence-tiles.py');
const ASSETS = path.join(FRONTEND, 'public', 'assets', 'tiles', 'feature');
const SOURCES = path.join(ROOT, 'docs', 'art', 'fence-concepts', 'SOURCES.md');
const RUN = path.join(ROOT, 'docs', 'art', 'fence-concepts', 'runs', 'fence-art-runs-2026-07-10.json');
const CANDIDATE_RUN = path.join(ROOT, 'docs', 'art', 'fence-concepts', 'runs', 'fence-native-candidates-2026-07-10.json');
const CANDIDATE_ROOT = path.join(ROOT, 'docs', 'art', 'fence-concepts', 'candidates', '2026-07-10');
const CANDIDATE_BUILD = path.join(CANDIDATE_ROOT, 'build_game_surface_previews.py');
const PROJECTION_ACCEPTANCE = path.join(CANDIDATE_ROOT, 'projection-acceptance.json');
const PIXELLAB_MANIFEST = path.join(CANDIDATE_ROOT, 'pixellab', 'manifest.json');
const CODEX_MANIFEST = path.join(CANDIDATE_ROOT, 'codex', 'manifest.json');
const REALIGNMENT_ROOT = path.join(ROOT, 'docs', 'art', 'fence-concepts', 'candidates', '2026-07-10-realignment');
const REALIGNMENT_BUILD = path.join(REALIGNMENT_ROOT, 'build_game_surface_previews.py');
const REALIGNMENT_MANIFEST = path.join(REALIGNMENT_ROOT, 'manifest.json');
const REALIGNMENT_RUN = path.join(ROOT, 'docs', 'art', 'fence-concepts', 'runs', 'fence-realignment-2026-07-10.json');
const CANDIDATE_PROFILES = path.join(FRONTEND, 'src', 'ui', 'fenceCandidateProfiles.ts');
const ART_REVIEW = path.join(FRONTEND, 'src', 'ui', 'fenceArtReview.ts');
const LEVEL_EDITOR = path.join(FRONTEND, 'src', 'ui', 'LevelEditor.tsx');
const TILE_PREVIEW = path.join(FRONTEND, 'src', 'ui', 'TilePreview.tsx');
const CANDIDATE_ASSETS = path.join(ASSETS, 'candidates', '2026-07-10');
const failures = [];

const required = [BAKE, SOURCES, RUN, CANDIDATE_RUN, CANDIDATE_BUILD, PROJECTION_ACCEPTANCE, PIXELLAB_MANIFEST, CODEX_MANIFEST, REALIGNMENT_BUILD, REALIGNMENT_MANIFEST, REALIGNMENT_RUN, CANDIDATE_PROFILES, ART_REVIEW, LEVEL_EDITOR, TILE_PREVIEW];
for (const file of required) if (!fs.existsSync(file)) failures.push(`missing fence pipeline record: ${path.relative(ROOT, file)}`);

if (fs.existsSync(BAKE)) {
  const source = fs.readFileSync(BAKE, 'utf8');
  for (const token of ['MATERIAL_INPUTS', 'POST_INPUTS', 'prepare_material', 'apply_mask']) {
    if (!source.includes(token)) failures.push(`fence bake no longer uses required generated/source stage: ${token}`);
  }
  if (/\bPALETTES?\s*=/.test(source)) failures.push('fence bake contains a hard-coded palette table');
}

if (fs.existsSync(RUN)) {
  const run = JSON.parse(fs.readFileSync(RUN, 'utf8'));
  const posts = Array.isArray(run.posts) ? run.posts : [];
  if (posts.length !== 2 || posts.some((entry) => !String(entry.gate ?? '').includes('image_generation_call'))) {
    failures.push('fence post run record must method-gate both generated posts');
  }
  if (run.production_status !== 'calibration_bridge_non_production_under_ADR_0076') {
    failures.push('resampled fence art must remain explicitly labeled non-production under ADR-0076');
  }
  if (run.native_scale_audit?.result !== 'fail') {
    failures.push('current resized fence pipeline must not claim a passing native-scale audit');
  }
}

if (fs.existsSync(CANDIDATE_RUN)) {
  const run = JSON.parse(fs.readFileSync(CANDIDATE_RUN, 'utf8'));
  const claimsReviewReady = String(run.production_status ?? '').includes('review_ready');
  if (claimsReviewReady) {
    const proof = run.game_surface_proof;
    const expectedIds = ['blender-stone', 'pixellab-wood', 'pixellab-stone', 'codex-wood', 'codex-stone'];
    if (proof?.status !== 'ready') failures.push('review-ready fence batch needs a ready game_surface_proof');
    if (proof?.kind !== 'studio_game_map' && proof?.kind !== 'level_editor_document') failures.push('fence candidate proof must be a game-rendered board surface');
    if (!String(proof?.route ?? '').startsWith('/studio?') && !String(proof?.route ?? '').startsWith('/editor/level?')) failures.push('fence candidate proof needs an exact app deep link');
    if (proof?.kind === 'level_editor_document') {
      const route = String(proof.route ?? '');
      if (!route.includes('document=') || !route.includes('levelId=') || !route.includes('artReview=fence-native-candidates-2026-07-10')) {
        failures.push('Level Editor fence proof must identify its durable document, level, and exact review-art mode');
      }
      if (!route.includes('fenceArt=')) {
        failures.push('Level Editor fence proof must select an exact drawable fence-art kit');
      }
      if (proof.private_account_document !== true) failures.push('Level Editor fence proof must use the durable private editor-document system');
      if (!route.includes(`document=${String(proof.document_id ?? '')}`) || !route.includes(`levelId=${String(proof.level_id ?? '')}`)) {
        failures.push('Level Editor fence proof route must match its recorded document and level identities');
      }
      if (proof.selector !== '[data-testid=level-editor]') failures.push('Level Editor fence proof must focus the drawable board and its editor controls');
    }
    if (proof?.canonical_scale !== 1) failures.push('fence candidate map proof must declare canonical scale 1');
    if (proof?.mounting !== 'isolated_review_assets_not_runtime_promotion') failures.push('candidate mounting must remain isolated review art');
    if (JSON.stringify(proof?.artwork_brush?.candidate_ids) !== JSON.stringify(expectedIds)) failures.push('game-surface proof must cover every fence candidate id');
    const screenshot = path.resolve(ROOT, String(proof?.screenshot ?? ''));
    if (!proof?.screenshot || !fs.existsSync(screenshot)) failures.push('review-ready fence batch needs a focused live-route screenshot');
    if (run.supplementary_proof == null) failures.push('contact sheet must be labeled supplementary, not used as the game-surface proof');
  }
}

if (fs.existsSync(CANDIDATE_PROFILES)) {
  const source = fs.readFileSync(CANDIDATE_PROFILES, 'utf8');
  for (const id of ['blender-stone', 'pixellab-wood', 'pixellab-stone', 'codex-wood', 'codex-stone']) {
    if (!source.includes(`id: '${id}'`)) failures.push(`fence review profiles are missing candidate: ${id}`);
  }
  for (const token of ['FENCE_ART_KITS', 'fenceArtKit', 'cycleFenceArtKit']) {
    if (!source.includes(token)) failures.push(`fence artwork registry is missing required interactive hook: ${token}`);
  }
  for (const retired of ['FENCE_LIVE_ART_KITS', "id: 'live-wood'", "id: 'live-stone'"]) {
    if (source.includes(retired)) failures.push(`retired procedural runtime kit re-entered the fence review catalog: ${retired}`);
  }
}

if (fs.existsSync(ART_REVIEW) && fs.existsSync(LEVEL_EDITOR)) {
  const reviewSource = fs.readFileSync(ART_REVIEW, 'utf8');
  const editorSource = fs.readFileSync(LEVEL_EDITOR, 'utf8');
  for (const token of ['transformFenceArtReviewOps', 'FENCE_ART_REVIEW_ID', 'resolveFenceOverlays', 'resolveFencePosts']) {
    if (!reviewSource.includes(token)) failures.push(`fence editor review is missing required live-board hook: ${token}`);
  }
  if (!editorSource.includes("urlParams.get('artReview') === FENCE_ART_REVIEW_ID")) {
    failures.push('Level Editor must gate candidate art behind the exact artReview route parameter');
  }
  for (const token of ['selectFenceArtwork', 'stepFenceArtwork', 'transformFenceArtReviewOps', "urlParams.get('fenceArt')"]) {
    if (!editorSource.includes(token)) failures.push(`Level Editor is missing required interactive fence-art hook: ${token}`);
  }
}

if (fs.existsSync(ART_REVIEW) && fs.existsSync(TILE_PREVIEW)) {
  const reviewSource = fs.readFileSync(ART_REVIEW, 'utf8');
  const studioSource = fs.readFileSync(TILE_PREVIEW, 'utf8');
  for (const token of ['findFenceArtReviewDocument', 'fenceArtReviewEditorHref']) {
    if (!reviewSource.includes(token)) failures.push(`fence document launcher is missing durable helper: ${token}`);
  }
  if (!studioSource.includes('listEditorDocuments') || !studioSource.includes('findFenceArtReviewDocument')) {
    failures.push('Studio fence launcher must resolve the private durable editor document');
  }
  if (studioSource.includes('FENCE_ART_REVIEW_MAP_PUBLIC_ID') || studioSource.includes('listEditorMaps')) {
    failures.push('Studio fence launcher must not retain the retired public-map fallback');
  }
}

const PIXELLAB_STONE_PINS = [
  {
    role: 'source',
    path: 'docs/art/fence-concepts/candidates/2026-07-10/pixellab/stone-rail-48x32-v2.png',
    sha256: '4bdbc2f4bdfff0e736b4de98796363b0415aae3f35517f2e3c356c05c48b6998',
  },
  {
    role: 'E',
    path: 'frontend/public/assets/tiles/feature/candidates/2026-07-10/pixellab-stone-rail-e.png',
    sha256: 'b5895225c48b8e281a269dd3a0843b93ae1747f24f00f415a9219f6e5c456f6e',
  },
  {
    role: 'S',
    path: 'frontend/public/assets/tiles/feature/candidates/2026-07-10/pixellab-stone-rail-s.png',
    sha256: 'fa56aa41713a16d16879ee143ef67464b5ebca3fec5bc1d9231e4c6b4ef84748',
  },
];

function verifyPinnedFile(pin, label) {
  if (!pin || typeof pin.path !== 'string' || typeof pin.sha256 !== 'string') {
    failures.push(`${label} must record a path and sha256`);
    return;
  }
  const file = path.resolve(ROOT, pin.path);
  if (!fs.existsSync(file)) {
    failures.push(`${label} is missing: ${pin.path}`);
    return;
  }
  const actual = sha256File(file);
  if (actual !== pin.sha256) failures.push(`${label} hash changed: ${actual}, expected ${pin.sha256}`);
}

function publicUrlForRecordedPath(recordedPath) {
  const normalized = String(recordedPath ?? '').replaceAll('\\', '/');
  const prefix = 'frontend/public';
  return normalized.startsWith(`${prefix}/`) ? normalized.slice(prefix.length) : null;
}

if (fs.existsSync(PROJECTION_ACCEPTANCE) && fs.existsSync(CANDIDATE_RUN)) {
  const acceptance = JSON.parse(fs.readFileSync(PROJECTION_ACCEPTANCE, 'utf8'));
  const run = JSON.parse(fs.readFileSync(CANDIDATE_RUN, 'utf8'));
  if (run.projection_acceptance_manifest !== path.relative(ROOT, PROJECTION_ACCEPTANCE).replaceAll('\\', '/')) {
    failures.push('fence candidate run must point at the projection acceptance manifest');
  }

  const expectedIds = run.game_surface_proof?.artwork_brush?.candidate_ids ?? [];
  const entries = Array.isArray(acceptance.candidates) ? acceptance.candidates : [];
  const ids = entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) failures.push('projection acceptance manifest contains duplicate candidate ids');
  if (JSON.stringify([...ids].sort()) !== JSON.stringify([...expectedIds].sort())) {
    failures.push('projection acceptance manifest must classify every shown generated candidate exactly once');
  }

  const contract = acceptance.board_edge_contract;
  for (const entry of entries) {
    if (entry.board_edge_alignment === 'claimed') {
      const railE = path.resolve(ROOT, String(entry.rails?.E?.path ?? ''));
      const railS = path.resolve(ROOT, String(entry.rails?.S?.path ?? ''));
      if (!fs.existsSync(railE) || !fs.existsSync(railS)) {
        failures.push(`${entry.id} claims board-edge alignment without both shown E/S rail files`);
        continue;
      }
      failures.push(...validateBoardEdgeRailPair({ id: entry.id, railE, railS, contract }));
    } else if (entry.board_edge_alignment === 'not_claimed') {
      if (!entry.reason) failures.push(`${entry.id} must explain why it does not claim standard board-edge alignment`);
    } else {
      failures.push(`${entry.id} has invalid board_edge_alignment classification`);
    }
  }

  const pixelLabStone = entries.find((entry) => entry.id === 'pixellab-stone');
  const accepted = pixelLabStone?.acceptance;
  if (accepted?.status !== 'accepted_for_future_use' || accepted?.scope !== 'future_bishop_passable_art' || accepted?.standard_board_edge_use !== false) {
    failures.push('accepted PixelLab stone rail must remain scoped only to future bishop-passable art, not standard board edges');
  }
  const recordedPins = [accepted?.pixel_identity?.source, ...(accepted?.pixel_identity?.shown_outputs ?? [])];
  for (const expected of PIXELLAB_STONE_PINS) {
    const recorded = recordedPins.find((pin) => (pin.direction ?? 'source') === expected.role);
    if (recorded?.path !== expected.path || recorded?.sha256 !== expected.sha256) {
      failures.push(`accepted PixelLab stone ${expected.role} identity pin changed`);
    }
    verifyPinnedFile(expected, `accepted PixelLab stone ${expected.role}`);
  }
}

if (fs.existsSync(PIXELLAB_MANIFEST)) {
  const manifest = JSON.parse(fs.readFileSync(PIXELLAB_MANIFEST, 'utf8'));
  const source = manifest.candidates?.find((candidate) => candidate.key === 'stone_rail_v2');
  if (source?.sha256 !== PIXELLAB_STONE_PINS[0].sha256) failures.push('PixelLab stone source manifest hash no longer matches the accepted identity pin');
  if (source?.acceptance?.scope !== 'future_bishop_passable_art' || source?.acceptance?.board_edge_alignment_claim !== false || source?.acceptance?.pixel_identity_frozen !== true) {
    failures.push('PixelLab provider manifest must preserve the accepted stone rail future-use scope without claiming board-edge alignment');
  }
}

if (fs.existsSync(CODEX_MANIFEST) && fs.existsSync(CANDIDATE_RUN) && fs.existsSync(CANDIDATE_BUILD)) {
  const manifest = JSON.parse(fs.readFileSync(CODEX_MANIFEST, 'utf8'));
  const run = JSON.parse(fs.readFileSync(CANDIDATE_RUN, 'utf8'));
  const lane = run.lanes?.find((entry) => entry.id === 'codex_wood_and_stone');
  const builder = fs.readFileSync(CANDIDATE_BUILD, 'utf8');
  const builderSpatiallyResamples = builder.includes('rail_preview = fit(') && builder.includes('Image.Resampling.LANCZOS');
  if (!builderSpatiallyResamples) failures.push('Codex shown-preview guard can no longer identify the recorded spatial resampling step');
  if (manifest.transform_chain_scope !== 'high_resolution_source_sheets_only') {
    failures.push('Codex no-spatial-transform chain must be explicitly scoped to the high-resolution source sheets');
  }
  if (manifest.shown_game_surface_preview?.spatial_resampling !== builderSpatiallyResamples) {
    failures.push('Codex manifest spatial-resampling metadata disagrees with the shown-preview builder');
  }
  if (lane?.spatial_resampling !== builderSpatiallyResamples || lane?.spatial_resampling_scope !== 'shown_game_surface_previews_only') {
    failures.push('Codex candidate-run lane must disclose spatial resampling in the shown game-surface previews');
  }
}

const PIXELLAB_WOOD_OUTPUT_PINS = [
  { role: 'rail_e', path: 'frontend/public/assets/tiles/feature/candidates/2026-07-10-realignment/pixellab-wood-canonical-r2-rail-e.png', sha256: '964013ff71b3c341f3d33db602d24e4fe19ed7d01dc23bc3553863bb92eebd7e' },
  { role: 'rail_s', path: 'frontend/public/assets/tiles/feature/candidates/2026-07-10-realignment/pixellab-wood-canonical-r2-rail-s.png', sha256: '78dc3d432d4b5329c5e8e44663b8336a35e56aae9976868243a757d27d75d995' },
  { role: 'post', path: 'frontend/public/assets/tiles/feature/candidates/2026-07-10-realignment/pixellab-wood-canonical-r2-post.png', sha256: '67e6085a6a70de18f4d884376807ddeabe2fb550736486240f53161df8e9fa30' },
];

if (fs.existsSync(REALIGNMENT_MANIFEST) && fs.existsSync(REALIGNMENT_BUILD) && fs.existsSync(CANDIDATE_PROFILES)) {
  const manifest = JSON.parse(fs.readFileSync(REALIGNMENT_MANIFEST, 'utf8'));
  const builder = fs.readFileSync(REALIGNMENT_BUILD, 'utf8');
  const profileSource = fs.readFileSync(CANDIDATE_PROFILES, 'utf8');
  const profiles = extractActiveFenceCandidateProfiles(profileSource);
  const profileIds = profiles.map((profile) => profile.id);
  const activeIds = Array.isArray(manifest.active_kits) ? manifest.active_kits : [];
  if (JSON.stringify(profileIds) !== JSON.stringify(activeIds)) {
    failures.push(`realignment active ids disagree with FENCE_CANDIDATE_PROFILES: manifest=${activeIds.join(',')} profiles=${profileIds.join(',')}`);
  }

  const assets = Array.isArray(manifest.active_kit_assets) ? manifest.active_kit_assets : [];
  const assetIds = assets.map((entry) => entry.id);
  if (new Set(assetIds).size !== assetIds.length || JSON.stringify(assetIds) !== JSON.stringify(activeIds)) {
    failures.push('realignment active_kit_assets must cover the four active kits exactly once and in cycle order');
  }

  const contractSource = manifest.canonical_board_edge_contract ?? {};
  const contract = {
    frame: contractSource.frame,
    expected_abs_midline_slope: contractSource.absolute_midline_slope,
    midline_slope_tolerance: contractSource.accepted_guard_tolerance,
    alpha_x_ranges: contractSource.alpha_x_ranges,
  };
  const claimedIds = assets.filter((entry) => entry.board_edge_alignment === 'claimed').map((entry) => entry.id);
  const expectedClaimedIds = ['pixellab-wood-canonical-r2', 'codex-wood-canonical-r2', 'codex-stone-canonical-r2'];
  if (JSON.stringify(claimedIds) !== JSON.stringify(expectedClaimedIds)) {
    failures.push('realignment projection claims must be exactly PixelLab wood canonical and both Codex canonical kits');
  }

  for (const entry of assets) {
    const profile = profiles.find((candidate) => candidate.id === entry.id);
    for (const [field, pin] of [['railE', entry.rails?.E], ['railS', entry.rails?.S]]) {
      verifyPinnedFile(pin, `${entry.id} selected ${field}`);
      const expectedUrl = publicUrlForRecordedPath(pin?.path);
      if (!expectedUrl || profile?.[field] !== expectedUrl) {
        failures.push(`${entry.id} ${field} in FENCE_CANDIDATE_PROFILES does not match its selected manifest asset`);
      }
    }
    if (entry.post == null) {
      if (entry.id !== 'pixellab-stone-rail-r2' || entry.post_policy !== 'intentionally_none' || profile?.post !== null) {
        failures.push(`${entry.id} may omit its post only as the explicit PixelLab stone rail-only owner decision`);
      }
    } else {
      verifyPinnedFile(entry.post.source, `${entry.id} selected post source`);
      verifyPinnedFile(entry.post.selected_output, `${entry.id} selected post`);
      const expectedPostUrl = publicUrlForRecordedPath(entry.post.selected_output?.path);
      if (!expectedPostUrl || profile?.post !== expectedPostUrl) {
        failures.push(`${entry.id} post in FENCE_CANDIDATE_PROFILES does not match its selected manifest asset`);
      }
      const postFile = path.resolve(ROOT, String(entry.post.selected_output?.path ?? ''));
      if (fs.existsSync(postFile)) {
        const post = measureRailProjection(postFile);
        const lastAlphaY = post.bbox ? post.bbox[3] - 1 : -1;
        if (post.width !== 96 || post.height !== 180 || lastAlphaY !== entry.post.frame_anchor_y || lastAlphaY !== 68) {
          failures.push(`${entry.id} selected post frame/anchor is ${post.width}x${post.height} y=${lastAlphaY}, expected 96x180 y=68`);
        }
      }
    }
    if (entry.board_edge_alignment === 'claimed') {
      const railE = path.resolve(ROOT, String(entry.rails?.E?.path ?? ''));
      const railS = path.resolve(ROOT, String(entry.rails?.S?.path ?? ''));
      if (fs.existsSync(railE) && fs.existsSync(railS)) {
        failures.push(...validateBoardEdgeRailPair({ id: entry.id, railE, railS, contract }));
      }
    }
  }

  const frozen = manifest.owner_decisions?.pixellab_stone_rail;
  if (frozen?.decision !== 'accepted_and_frozen' || frozen?.scope !== 'future_bishop_passable_art' || frozen?.changed_in_this_batch !== false) {
    failures.push('realignment manifest must preserve the PixelLab stone rail as unchanged future bishop-passable art');
  }
  for (const pin of PIXELLAB_STONE_PINS) {
    const recordedHash = pin.role === 'source' ? frozen?.source_sha256 : frozen?.[`shown_${pin.role.toLowerCase()}_sha256`];
    if (recordedHash !== pin.sha256) failures.push(`realignment frozen PixelLab stone ${pin.role} hash disagrees with the original acceptance pin`);
  }
  const acceptedStone = assets.find((candidate) => candidate.id === 'pixellab-stone-rail-r2');
  for (const direction of ['E', 'S']) {
    const expected = PIXELLAB_STONE_PINS.find((pin) => pin.role === direction);
    const actual = acceptedStone?.rails?.[direction];
    if (actual?.path !== expected?.path || actual?.sha256 !== expected?.sha256) {
      failures.push(`pixellab-stone-rail-r2 must use the exact frozen old ${direction} rail bytes`);
    }
  }
  if (manifest.owner_decisions?.pixellab_stone_post_trials?.decision !== 'rejected_all' || frozen?.post !== null) {
    failures.push('PixelLab stone must record the owner decision to keep the accepted rail and reject every post trial');
  }
  for (const retiredOutput of ['pixellab-stone-post-pale-r2-post.png', 'pixellab-stone-post-compact-r2-post.png']) {
    if (fs.existsSync(path.join(ASSETS, 'candidates', '2026-07-10-realignment', retiredOutput))) {
      failures.push(`rejected PixelLab stone post output remains live: ${retiredOutput}`);
    }
    if (builder.includes(retiredOutput.replace('-post.png', '')) || builder.includes(retiredOutput)) {
      failures.push(`realignment builder still produces rejected PixelLab stone post output: ${retiredOutput}`);
    }
  }

  const pixelLabWood = manifest.pixellab?.wood_canonical;
  if (pixelLabWood?.spatial_resampling !== false || assets.find((entry) => entry.id === 'pixellab-wood-canonical-r2')?.spatial_resampling !== false) {
    failures.push('PixelLab wood canonical must declare no spatial resampling in both generation and selected-kit metadata');
  }
  for (const expected of PIXELLAB_WOOD_OUTPUT_PINS) {
    const recorded = pixelLabWood?.outputs?.find((output) => output.role === expected.role);
    if (recorded?.path !== expected.path || recorded?.sha256 !== expected.sha256) {
      failures.push(`PixelLab wood canonical ${expected.role} output identity changed`);
    }
    verifyPinnedFile(expected, `PixelLab wood canonical ${expected.role}`);
  }
  const woodBuilderBody = builder.match(/def write_pixellab_material_wood\([\s\S]*?(?=\ndef |\n\nif __name__)/)?.[0] ?? '';
  if (!woodBuilderBody || woodBuilderBody.includes('.resize(')) {
    failures.push('PixelLab wood canonical builder must not spatially resize its generated material pixels');
  }

  const codexEntries = assets.filter((entry) => entry.id.startsWith('codex-'));
  const codexBuilderResamples = builder.includes('rail.resize(rail_size, Image.Resampling.LANCZOS)')
    && builder.includes('post.resize(post_size, Image.Resampling.LANCZOS)');
  if (manifest.codex?.spatial_resampling !== true || manifest.codex?.resampling_scope !== 'shown_game_surface_previews' || manifest.codex?.production_status !== 'calibration_only' || !codexBuilderResamples) {
    failures.push('Codex realignment shown previews must disclose LANCZOS spatial resampling and remain calibration-only');
  }
  if (codexEntries.some((entry) => entry.shown_preview_spatial_resampling !== true || entry.production_eligibility !== false)) {
    failures.push('both active Codex canonical kits must declare resampled, non-production shown previews');
  }
}

if (fs.existsSync(REALIGNMENT_RUN) && fs.existsSync(REALIGNMENT_MANIFEST)) {
  const run = JSON.parse(fs.readFileSync(REALIGNMENT_RUN, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(REALIGNMENT_MANIFEST, 'utf8'));
  const expectedDocumentId = '5d04d83f-474e-4d76-a49e-094bbe26ec0d';
  const expectedLevelId = 'l6';
  const selectedCandidateId = 'pixellab-stone-rail-r2';
  const expectedRoute = `/editor/level?document=${expectedDocumentId}&levelId=${expectedLevelId}&from=studio&layer=fence&kind=fence&artReview=fence-native-candidates-2026-07-10&fenceArt=${selectedCandidateId}`;
  const screenshotExists = (recordedPath) => {
    if (typeof recordedPath !== 'string' || recordedPath.length === 0) return false;
    const resolved = path.resolve(ROOT, recordedPath);
    return resolved.startsWith(`${ROOT}${path.sep}`) && fs.existsSync(resolved);
  };
  failures.push(...validateFenceRealignmentLiveProof({
    run,
    manifestActiveIds: manifest.active_kits,
    expected: {
      candidateManifest: path.relative(ROOT, REALIGNMENT_MANIFEST).replaceAll('\\', '/'),
      route: expectedRoute,
      documentId: expectedDocumentId,
      levelId: expectedLevelId,
      selectedCandidateId,
    },
    screenshotExists,
  }));
}

for (const prefix of ['blender-stone', 'pixellab-wood', 'pixellab-stone', 'codex-wood', 'codex-stone']) {
  for (const suffix of ['rail-e', 'rail-s', 'post']) {
    const file = path.join(CANDIDATE_ASSETS, `${prefix}-${suffix}.png`);
    if (!fs.existsSync(file)) failures.push(`missing game-surface candidate asset: ${prefix}-${suffix}.png`);
  }
}

function inspectAsset(name, { anchored = false } = {}) {
  const file = path.join(ASSETS, name);
  if (!fs.existsSync(file)) {
    failures.push(`missing fence asset: ${name}`);
    return;
  }
  const png = PNG.sync.read(fs.readFileSync(file));
  if (png.width !== 96 || png.height !== 180) failures.push(`${name} is ${png.width}x${png.height}, expected 96x180`);
  const colors = new Set();
  const alphaValues = new Set();
  let maxOpaqueY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const alpha = png.data[offset + 3];
      alphaValues.add(alpha);
      if (!alpha) continue;
      colors.add(`${png.data[offset]},${png.data[offset + 1]},${png.data[offset + 2]}`);
      maxOpaqueY = y;
    }
  }
  if ([...alphaValues].some((alpha) => alpha !== 0 && alpha !== 255)) failures.push(`${name} must use hard runtime alpha`);
  if (colors.size < 12) failures.push(`${name} has only ${colors.size} opaque colors — likely a flat/code-drawn regression`);
  if (anchored && maxOpaqueY !== 68) failures.push(`${name} ends at y=${maxOpaqueY}, expected post anchor y=68`);
}

for (const material of ['wood', 'stone']) {
  for (const mask of [2, 4, 6]) inspectAsset(`fence-${material}-${mask}.png`);
  inspectAsset(`fence-${material}-post.png`, { anchored: true });
  if (fs.existsSync(path.join(ASSETS, `fence-${material}-terminal.png`))) {
    failures.push(`legacy terminal runtime asset still exists for ${material}; use the canonical post asset`);
  }
}

if (failures.length) {
  console.error('Fence art pipeline guard FAILED:');
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log('Fence ADR-0040 provenance guard OK; ADR-0076 native-size status remains a non-production calibration bridge.');
