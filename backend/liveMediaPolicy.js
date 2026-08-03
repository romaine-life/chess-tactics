'use strict';

const { createHash } = require('node:crypto');

const SHA256 = /^[0-9a-f]{64}$/;
const PREDRAWN_BOARD_SLOT = /^boards\/([a-z0-9][a-z0-9._-]{0,119})\/plate\.png$/;
const PREDRAWN_BOARD_COMPONENT = 'predrawn-board-plate';
const PREDRAWN_BOARD_PROOF_SCHEMA = 'predrawn-board-canonical-level-proof-v1';
const PREDRAWN_BOARD_PROOF_RENDERER = 'LevelEditor/PredrawnBoardLayer';
const RUN_RELIC_ICON_COMPONENT = 'run-relic-icon';
const RUN_RELIC_ICON_SLOT = /^ui\/run\/relics\/([a-z][a-z0-9-]{0,79})\.png$/;
const RUN_RELIC_RESIZED_PRODUCTION_EXCEPTION_SCHEMA = 'run-relic-resized-production-exception-v1';
const RUN_RELIC_RESIZED_PRODUCTION_EXCEPTION_SHA_BY_SLOT = Object.freeze({
  'ui/run/relics/congressional-approval.png': '928f9ceb7a5612ff0d2216b70422b972b04492a4c9ed277e5122721b390c52d0',
  'ui/run/relics/deployment-vehicle.png': 'd004c0f5be36094ebc137a9cdbebfe69d847636a7c8ddaff50bac8b687aac0bc',
  'ui/run/relics/inspirational-record.png': 'b6d18510fcff3e374a1899421b2928fb16cd79c0108ad00179059cca539e309d',
  'ui/run/relics/mercenary-boat.png': '9e5945cc9c200d1e3818e10f3f6e3494150ce83f30aa95c7e499daa4462ae1e8',
  'ui/run/relics/mercenarys-rifle.png': 'afe1a1f718a4406a60ae85adb002af846ef4a9c6000c20b97d67a0b57c06fa60',
  'ui/run/relics/merchants-shopkey.png': 'c8e0e45f9b863e42401c8e72cf0c42364a3c70c0c8dfb7362978b79e9b5adfa0',
  'ui/run/relics/occult-dagger.png': 'bc7984ccbabf45e39e672957d7ed1e2716c7e82e14b671fcbed38a7f82b9208d',
  'ui/run/relics/training-linens.png': 'e1349bd32f7bcaccbd706dbc55a6f97df8a0dd96533f309d1e2c0ea38aabf461',
});
// ADR-0360. Two generated card frames painted their card at a different SHAPE
// from the other three, so the same 5:7 element rendered visibly different card
// sizes. Normalising them to the shared 1009x1402 painted box means resampling,
// which is not native 1x — admitted only for these exact slots, bytes and
// transform, exactly as ADR-0332 admits the resized relic icons.
const RUN_CARD_FRAME_NORMALISED_EXCEPTION_SCHEMA = 'run-card-frame-normalised-production-exception-v1';
const RUN_CARD_FRAME_NORMALISED_EXCEPTION_TRANSFORM = 'painted-card-box-normalise-lanczos-1009x1402';
const RUN_CARD_FRAME_NORMALISED_EXCEPTION_BY_SLOT = Object.freeze({
  'ui/run/card-prototypes/concinnous-frame-v1.png': Object.freeze({
    outputSha256: '310629d033eebd8f2b1227de1b8a42e1a6b86087327111c145b8f715d4481bcb',
    sourceSha256: '38b1290df1067dfa3562b874478b29c3f47341d8a065c90d426cec2cdaa32cc7',
    sourcePaintedHeight: 1420,
  }),
  'ui/run/card-prototypes/hieratic-frame-v1.png': Object.freeze({
    outputSha256: '6552cae59d0d1b404a466b2d37fb6d0a0e6dcdcd60b171ec4979f8a50c610348',
    sourceSha256: '7ae3b1945da8fefa46a264b696b0fc5695454c80c7256f879fd465a06a2d1152',
    sourcePaintedHeight: 1427,
  }),
});
const RUN_RESOURCE_ICON_COMPONENT = 'run-resource-icon';
const RUN_RESOURCE_ICON_SLOT = /^ui\/run\/resources\/([a-z][a-z0-9-]{0,79})\.png$/;
const RUN_SHOP_WRAP_COMPONENT = 'run-shop-wrap';
const RUN_SHOP_WRAP_SLOT = /^ui\/run\/shop-wrap\/([a-z][a-z0-9-]{0,79})\.png$/;
// A wrap frames live cards rather than replacing them, so the only geometry the
// runtime needs is where the card row sits inside the painted canvas.
const RUN_SHOP_WRAP_KINDS = Object.freeze(['seat', 'band', 'slots', 'screen']);
const GAME_CONDITION_ICON_BY_SLOT = Object.freeze({
  'ui/kit/icons/game/plagued.png': Object.freeze({ component: 'unit-ability-icon', variant: 'plagued' }),
  'ui/kit/icons/game/positioned.png': Object.freeze({ component: 'unit-ability-icon', variant: 'positioned' }),
  'ui/kit/icons/game/discipline.png': Object.freeze({ component: 'unit-ability-icon', variant: 'discipline' }),
  'ui/kit/icons/game/marshalled.png': Object.freeze({ component: 'unit-ability-icon', variant: 'marshalled' }),
  'ui/kit/icons/card-properties/pestiferous.png': Object.freeze({ component: 'card-property-icon', variant: 'pestiferous' }),
  'ui/kit/icons/card-properties/concinnous.png': Object.freeze({ component: 'card-property-icon', variant: 'concinnous' }),
  'ui/kit/icons/card-properties/tactical.png': Object.freeze({ component: 'card-property-icon', variant: 'tactical' }),
  'ui/kit/icons/card-properties/hieratic.png': Object.freeze({ component: 'card-property-icon', variant: 'hieratic' }),
});
const CARD_TYPE_ROW_TEXTURE_COMPONENT = 'card-type-row-texture';
const CARD_TYPE_ROW_TEXTURE_GROUP_ID = 'card-type-row-textures-pixen-v1';
const CARD_TYPE_ROW_TEXTURE_BY_SLOT = Object.freeze({
  'ui/surfaces/card-type-pestiferous.png': Object.freeze({ variant: 'pestiferous', width: 128, height: 64 }),
  'ui/surfaces/card-type-concinnous.png': Object.freeze({ variant: 'concinnous', width: 512, height: 64 }),
  'ui/surfaces/card-type-tactical.png': Object.freeze({ variant: 'tactical', width: 128, height: 64 }),
  'ui/surfaces/card-type-hieratic.png': Object.freeze({ variant: 'hieratic', width: 128, height: 64 }),
});
const CARD_TYPE_ROW_TEXTURE_REQUIRED_SLOTS = Object.freeze(Object.keys(CARD_TYPE_ROW_TEXTURE_BY_SLOT).sort());
const LEVEL_EDITOR_BRUSH_ICON_SLOT = 'ui/kit/icons/brush.png';
const LEVEL_EDITOR_BRUSH_ICON_COMPONENT = 'level-editor-tool-icon';
const LEVEL_EDITOR_BRUSH_ICON_PROOF_SCHEMA = 'level-editor-brush-icon-exact-byte-proof-v1';
const LEVEL_EDITOR_BRUSH_ICON_PROOF_RENDERER = 'LevelEditorControlsPanel/inner-brush-tool';
const LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SCHEMA = 'level-editor-brush-option-01-scaled-production-exception-v1';
const LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SHA256 = 'abaf1ab5e8f34531864e4e9e9d52cb15a0e7b944e84a79dea98939013267074a';
const SFX_SAMPLE_COMPONENT = 'sfx-sample';
const SFX_SAMPLE_PROOF_RENDERER = 'SfxViewer/ExactCandidateAudition';
const SFX_SAMPLE_PROOF_SCHEMA = 'sfx-sample-exact-byte-proof-v1';
const SFX_SAMPLE_SLOT = /^sfx\/([a-z0-9][a-z0-9_-]{0,63})\/v([0-9]+)\.(aac|flac|m4a|mp3|oga|ogg|wav|webm)$/;
const SFX_MEDIA_TYPE_BY_EXTENSION = Object.freeze({
  aac: 'audio/aac',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
});
const STRATEGIKON_BACKGROUND_COMPONENT = 'strategikon-background';
const STRATEGIKON_BACKGROUND_PROOF_RENDERER = 'ShellWorkspace/StrategikonBackgroundArtwork';
const STRATEGIKON_BACKGROUND_PROOF_SCHEMA = 'strategikon-background-cover-exception-v1';
const STRATEGIKON_BACKGROUND_SLOT = 'ui/workspaces/strategikon/background.png';
const STRATEGIKON_BACKGROUND_SHA256 = '8084f009cae79d3eaaa64bb2c0f5df6e26fc8dfe7d9f0547f24135102d41ffe7';
// Full-screen artwork behind one workspace. The Strategikon keeps its own stricter,
// byte-pinned projection (ADR-0336) and is dispatched before this one; these are the
// screens whose backdrop is chosen from generated candidates in Studio > Screen Art.
const WORKSPACE_BACKGROUND_COMPONENT = 'workspace-background';
const WORKSPACE_BACKGROUND_SLOT = /^ui\/workspaces\/([a-z][a-z0-9-]{0,63})\/background\.png$/;
const WORKSPACE_BACKGROUND_IDS = Object.freeze(['run-victory', 'level-editor-events']);
// Perimeter walls live in the terrain domain but are NOT board tiles: they carry their own
// full-height frame geometry (ADR-0086) instead of the 96x180 tile projection, so they are
// dispatched before the tile rules the way the brush icon and SFX takes are.
const WALL_MATERIAL_COMPONENT = 'wall-material';
const WALL_MATERIAL_PROOF_SCHEMA = 'wall-material-canonical-board-proof-v1';
const WALL_MATERIAL_PROOF_RENDERER = 'BoardLabBoard/BoardBarrierSceneLayer';
const WALL_MATERIAL_FRAME_SLOT = /^tiles\/feature\/wall-([a-z][a-z0-9-]{0,63})-(1|8|9)\.png$/;
const WALL_MATERIAL_THUMB_SLOT = /^tiles\/feature\/wall-([a-z][a-z0-9-]{0,63})-thumb\.png$/;
const WALL_MATERIAL_FRAME_WIDTH = 128;
const WALL_MATERIAL_FRAME_HEIGHT = 336;
const WALL_MATERIAL_THUMB_MAX = 512;

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizedSha(value) {
  const sha = String(value || '').trim().toLowerCase();
  return SHA256.test(sha) ? sha : null;
}

function predrawnBoardSlotSlug(slot) {
  const match = PREDRAWN_BOARD_SLOT.exec(String(slot || ''));
  return match ? match[1] : null;
}

function runRelicIconSlotId(slot) {
  const match = RUN_RELIC_ICON_SLOT.exec(String(slot || ''));
  return match ? match[1] : null;
}

function runResourceIconSlotId(slot) {
  const match = RUN_RESOURCE_ICON_SLOT.exec(String(slot || ''));
  return match ? match[1] : null;
}

function runShopWrapSlotId(slot) {
  const match = RUN_SHOP_WRAP_SLOT.exec(String(slot || ''));
  return match ? match[1] : null;
}

/** A whole-pixel rectangle that must lie inside the painted canvas. */
function containedRect(value, canvasWidth, canvasHeight) {
  if (!isObjectRecord(value)) return null;
  const { x, y, w, h } = value;
  const whole = [x, y, w, h].every((entry) => Number.isSafeInteger(entry));
  if (!whole || w <= 0 || h <= 0 || x < 0 || y < 0) return null;
  if (x + w > canvasWidth || y + h > canvasHeight) return null;
  return { x, y, w, h };
}

function gameConditionIconSlot(slot) {
  return GAME_CONDITION_ICON_BY_SLOT[String(slot || '')] ?? null;
}

function cardTypeRowTextureSlot(slot) {
  return CARD_TYPE_ROW_TEXTURE_BY_SLOT[String(slot || '')] ?? null;
}

function levelEditorBrushIconSlot(slot) {
  return String(slot || '') === LEVEL_EDITOR_BRUSH_ICON_SLOT;
}

function sfxSampleSlot(slot) {
  const match = SFX_SAMPLE_SLOT.exec(String(slot || ''));
  if (!match) return null;
  const variantIndex = Number(match[2]);
  if (!Number.isSafeInteger(variantIndex) || variantIndex < 0 || variantIndex > 9999) return null;
  return { soundSetKey: match[1], variantIndex, extension: match[3] };
}

function strategikonBackgroundSlot(slot) {
  return String(slot || '') === STRATEGIKON_BACKGROUND_SLOT;
}

/**
 * The wall material and face a `tiles/feature/wall-<material>-<mask|thumb>.png` slot names, or
 * null. `mask` is the N(1)/W(8) face bitmask the frame paints; `thumb` is its picker card.
 */
function wallMaterialSlot(slot) {
  const raw = String(slot || '');
  const frame = WALL_MATERIAL_FRAME_SLOT.exec(raw);
  if (frame) return { material: frame[1], mask: Number(frame[2]), thumb: false };
  const thumb = WALL_MATERIAL_THUMB_SLOT.exec(raw);
  return thumb ? { material: thumb[1], mask: null, thumb: true } : null;
}

/** The workspace id a `ui/workspaces/<id>/background.png` slot names, or null. */
function workspaceBackgroundSlotId(slot) {
  const match = WORKSPACE_BACKGROUND_SLOT.exec(String(slot || ''));
  const id = match ? match[1] : null;
  return id && WORKSPACE_BACKGROUND_IDS.includes(id) ? id : null;
}

function mediaVersionMetadata(row) {
  return isObjectRecord(row.version_metadata) ? row.version_metadata
    : isObjectRecord(row.metadata) ? row.metadata : {};
}

function predrawnBoardAlignmentIssue(value, frameWidth, frameHeight) {
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    return 'pre-drawn board proof requires a canonical serialized alignment';
  }
  const sections = value.split(';');
  if (sections.length !== 6 || sections[0] !== 'v4') {
    return 'pre-drawn board alignment must use the canonical v4 payload';
  }
  const numbers = (text, count) => {
    const tokens = text.split(',');
    if (tokens.length !== count || tokens.some((token) => !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(token))) return null;
    const parsed = tokens.map(Number);
    return parsed.every(Number.isFinite) ? parsed : null;
  };
  const frameAndCorners = numbers(sections[1], 10);
  const grid = numbers(sections[2], 2);
  if (!frameAndCorners || !grid) return 'pre-drawn board alignment geometry is malformed';
  if (
    frameAndCorners[0] !== Number(frameWidth) || frameAndCorners[1] !== Number(frameHeight)
    || !Number.isInteger(grid[0]) || !Number.isInteger(grid[1])
    || grid[0] < 1 || grid[0] > 64 || grid[1] < 1 || grid[1] > 64
  ) return 'pre-drawn board alignment does not match the reviewed frame/grid';
  const columnGuides = numbers(sections[3], grid[0] + 1);
  const rowGuides = numbers(sections[4], grid[1] + 1);
  const boundary = numbers(sections[5], 8);
  if (!columnGuides || !rowGuides || !boundary) return 'pre-drawn board alignment guides or boundary are malformed';
  const monotonicUnitGuides = (guides) => (
    guides[0] === 0 && guides.at(-1) === 1
    && guides.every((guide, index) => guide >= 0 && guide <= 1 && (index === 0 || guide > guides[index - 1]))
  );
  if (!monotonicUnitGuides(columnGuides) || !monotonicUnitGuides(rowGuides)) {
    return 'pre-drawn board alignment guides must be strictly monotonic from 0 to 1';
  }
  const allPoints = [...frameAndCorners.slice(2), ...boundary];
  for (let index = 0; index < allPoints.length; index += 2) {
    if (
      allPoints[index] < 0 || allPoints[index] > Number(frameWidth)
      || allPoints[index + 1] < 0 || allPoints[index + 1] > Number(frameHeight)
    ) return 'pre-drawn board alignment points must lie inside the reviewed frame';
  }
  return null;
}

/**
 * Domain-owned runtime projection for one complete pre-drawn level plate.
 * Dimensions are candidate-declared native geometry, not a global preset.
 */
function predrawnBoardMediaIssue(row, projectedRuntime = null) {
  const slug = predrawnBoardSlotSlug(row.slot);
  if (!slug) return 'pre-drawn board slots must match boards/<board-slug>/plate.png';
  if (row.domain !== 'background') return 'pre-drawn board plates require the background domain';
  if (row.role !== 'media') return 'pre-drawn board plates require the media role';
  if (row.media_type !== 'image/png') return 'pre-drawn board plates require image/png';
  if (
    !Number.isInteger(Number(row.width)) || Number(row.width) < 1
    || !Number.isInteger(Number(row.height)) || Number(row.height) < 1
  ) return 'pre-drawn board plates require decoded positive raster dimensions';

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'pre-drawn board plates require metadata.runtime';
  const allowed = new Set(['component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `pre-drawn board runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== PREDRAWN_BOARD_COMPONENT) {
    return `pre-drawn board metadata.runtime.component must be ${PREDRAWN_BOARD_COMPONENT}`;
  }
  if (runtime.variant !== slug) return 'pre-drawn board runtime variant must match its semantic slot slug';
  if (runtime.frameWidth !== Number(row.width) || runtime.frameHeight !== Number(row.height)) {
    return 'pre-drawn board runtime frame dimensions must equal the uploaded PNG dimensions';
  }
  if (runtime.frameCount !== 1) return 'pre-drawn board runtime frameCount must be 1';
  return null;
}

/**
 * Domain-owned runtime projection for one native Run relic icon. Relic
 * membership remains in the drawable catalog; the semantic slot only carries
 * the exact reviewed pixels for that installed record.
 */
function runRelicIconMediaIssue(row, projectedRuntime = null) {
  const relicId = runRelicIconSlotId(row.slot);
  if (!relicId) return 'Run relic icon slots must match ui/run/relics/<relic-id>.png';
  if (row.domain !== 'ui-kit') return 'Run relic icons require the ui-kit domain';
  if (row.role !== 'icon') return 'Run relic icons require the icon role';
  if (row.media_type !== 'image/png') return 'Run relic icons require image/png';
  if (Number(row.width) !== 64 || Number(row.height) !== 64) {
    return 'Run relic icons must be native 64x64 rasters';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Run relic icons require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Run relic icon runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== RUN_RELIC_ICON_COMPONENT) {
    return `Run relic icon metadata.runtime.component must be ${RUN_RELIC_ICON_COMPONENT}`;
  }
  if (runtime.variant !== relicId) return 'Run relic icon variant must match its semantic slot id';
  if (runtime.frameWidth !== 64 || runtime.frameHeight !== 64 || runtime.frameCount !== 1) {
    return 'Run relic icon runtime geometry must describe one native 64x64 frame';
  }
  if (runtime.nativeRole !== RUN_RELIC_ICON_COMPONENT) {
    return `Run relic icon metadata.runtime.nativeRole must be ${RUN_RELIC_ICON_COMPONENT}`;
  }
  if (runtime.altText !== '') {
    return 'Run relic icon metadata.runtime.altText must be empty because the relic label owns its accessible name';
  }
  return null;
}

/**
 * Domain-owned runtime projection for one Run shop wrap: generated art that
 * frames the live shop's card row. The wrap is decorative chrome around real
 * cards, so it never carries text and never supplies an accessible name; the
 * runtime contract is purely the card window measured on the painted canvas.
 */
function runShopWrapMediaIssue(row, projectedRuntime = null) {
  const wrapId = runShopWrapSlotId(row.slot);
  if (!wrapId) return 'Run shop wrap slots must match ui/run/shop-wrap/<wrap-id>.png';
  if (row.domain !== 'ui-kit') return 'Run shop wraps require the ui-kit domain';
  if (row.role !== 'shop-wrap') return 'Run shop wraps require the shop-wrap role';
  if (row.media_type !== 'image/png') return 'Run shop wraps require image/png';
  const width = Number(row.width);
  const height = Number(row.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    return 'Run shop wraps require decoded raster dimensions';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Run shop wraps require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'kind', 'canvasWidth', 'canvasHeight', 'window', 'slots', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Run shop wrap runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== RUN_SHOP_WRAP_COMPONENT) {
    return `Run shop wrap metadata.runtime.component must be ${RUN_SHOP_WRAP_COMPONENT}`;
  }
  if (runtime.nativeRole !== RUN_SHOP_WRAP_COMPONENT) {
    return `Run shop wrap metadata.runtime.nativeRole must be ${RUN_SHOP_WRAP_COMPONENT}`;
  }
  if (runtime.variant !== wrapId) return 'Run shop wrap variant must match its semantic slot id';
  if (!RUN_SHOP_WRAP_KINDS.includes(runtime.kind)) {
    return `Run shop wrap kind must be one of ${RUN_SHOP_WRAP_KINDS.join(', ')}`;
  }
  // The canvas is the acceptance-time contract against the uploaded raster, so a
  // re-crop can never silently move every measured window.
  if (runtime.canvasWidth !== width || runtime.canvasHeight !== height) {
    return 'Run shop wrap canvas metadata must match the uploaded raster dimensions';
  }
  const window = containedRect(runtime.window, width, height);
  if (!window) return 'Run shop wrap metadata.runtime.window must be a whole-pixel rect inside the canvas';
  const slots = Array.isArray(runtime.slots)
    ? runtime.slots.map((entry) => containedRect(entry, width, height))
    : [];
  if (slots.some((entry) => entry === null)) {
    return 'Run shop wrap metadata.runtime.slots must all be whole-pixel rects inside the canvas';
  }
  if (runtime.kind === 'slots' && slots.length < 2) {
    return 'Run shop wrap slots kind requires at least two measured card openings';
  }
  if (runtime.kind !== 'slots' && slots.length) {
    return 'Run shop wrap slots are only meaningful for the slots kind';
  }
  if (runtime.altText !== '') {
    return 'Run shop wrap metadata.runtime.altText must be empty because the live cards own the accessible content';
  }
  return null;
}

/**
 * Domain-owned runtime projection for one native Run resource icon. The
 * surrounding live number owns the accessible currency value.
 */
function runResourceIconMediaIssue(row, projectedRuntime = null) {
  const resourceId = runResourceIconSlotId(row.slot);
  if (!resourceId) return 'Run resource icon slots must match ui/run/resources/<resource-id>.png';
  if (row.domain !== 'ui-kit') return 'Run resource icons require the ui-kit domain';
  if (row.role !== 'icon') return 'Run resource icons require the icon role';
  if (row.media_type !== 'image/png') return 'Run resource icons require image/png';
  if (Number(row.width) !== 64 || Number(row.height) !== 64) {
    return 'Run resource icons must be native 64x64 rasters';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Run resource icons require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Run resource icon runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== RUN_RESOURCE_ICON_COMPONENT) {
    return `Run resource icon metadata.runtime.component must be ${RUN_RESOURCE_ICON_COMPONENT}`;
  }
  if (runtime.variant !== resourceId) return 'Run resource icon variant must match its semantic slot id';
  if (runtime.frameWidth !== 64 || runtime.frameHeight !== 64 || runtime.frameCount !== 1) {
    return 'Run resource icon runtime geometry must describe one native 64x64 frame';
  }
  if (runtime.nativeRole !== RUN_RESOURCE_ICON_COMPONENT) {
    return `Run resource icon metadata.runtime.nativeRole must be ${RUN_RESOURCE_ICON_COMPONENT}`;
  }
  if (runtime.altText !== '') {
    return 'Run resource icon metadata.runtime.altText must be empty because the live value owns its accessible name';
  }
  return null;
}

/**
 * Domain-owned runtime projection for the native icons that distinguish a
 * unit condition from the card property that grants it. Their exact semantic
 * slots are closed so an arbitrary ui-kit candidate cannot become runtime UI.
 */
function gameConditionIconMediaIssue(row, projectedRuntime = null) {
  const contract = gameConditionIconSlot(row.slot);
  if (!contract) return 'game condition icons require a registered semantic slot';
  if (row.domain !== 'ui-kit') return 'game condition icons require the ui-kit domain';
  if (row.role !== 'icon') return 'game condition icons require the icon role';
  if (row.media_type !== 'image/png') return 'game condition icons require image/png';
  if (Number(row.width) !== 64 || Number(row.height) !== 64) {
    return 'game condition icons must be native 64x64 rasters';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'game condition icons require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `game condition icon runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== contract.component) {
    return `game condition icon metadata.runtime.component must be ${contract.component}`;
  }
  if (runtime.variant !== contract.variant) return 'game condition icon variant must match its semantic slot';
  if (runtime.frameWidth !== 64 || runtime.frameHeight !== 64 || runtime.frameCount !== 1) {
    return 'game condition icon runtime geometry must describe one native 64x64 frame';
  }
  if (runtime.nativeRole !== contract.component) {
    return `game condition icon metadata.runtime.nativeRole must be ${contract.component}`;
  }
  if (runtime.altText !== '') {
    return 'game condition icon metadata.runtime.altText must be empty because the adjacent label owns its accessible name';
  }
  return null;
}

/**
 * Closed production contract for the four decorative materials behind the
 * Enchiridion's card-type rows. The semantic slot fixes both the card property
 * and native tile geometry so arbitrary ui-kit media cannot enter this seat.
 */
function cardTypeRowTextureMediaIssue(row, projectedRuntime = null) {
  const contract = cardTypeRowTextureSlot(row.slot);
  if (!contract) return 'card-type row textures require a registered semantic slot';
  if (row.domain !== 'ui-kit') return 'card-type row textures require the ui-kit domain';
  if (row.role !== 'media') return 'card-type row textures require the media role';
  if (row.media_type !== 'image/png') return 'card-type row textures require image/png';
  if (Number(row.width) !== contract.width || Number(row.height) !== contract.height) {
    return `card-type row texture geometry must be native ${contract.width}x${contract.height}`;
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'card-type row textures require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'family', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `card-type row texture runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== CARD_TYPE_ROW_TEXTURE_COMPONENT) {
    return `card-type row texture metadata.runtime.component must be ${CARD_TYPE_ROW_TEXTURE_COMPONENT}`;
  }
  if (runtime.nativeRole !== CARD_TYPE_ROW_TEXTURE_COMPONENT) {
    return `card-type row texture metadata.runtime.nativeRole must be ${CARD_TYPE_ROW_TEXTURE_COMPONENT}`;
  }
  if (runtime.variant !== contract.variant) return 'card-type row texture variant must match its semantic slot';
  if (runtime.family !== 'card-type-row-textures') return 'card-type row texture family must identify the complete material set';
  if (
    runtime.frameWidth !== contract.width || runtime.frameHeight !== contract.height
    || runtime.frameCount !== 1
  ) return 'card-type row texture runtime geometry must describe its one native tile';
  if (runtime.altText !== '') {
    return 'card-type row texture metadata.runtime.altText must be empty because the row label owns its accessible name';
  }
  return null;
}

function cardTypeRowTextureAcceptanceGroupIssue(rows, contract) {
  if (!Array.isArray(rows) || !contract || contract.groupId !== CARD_TYPE_ROW_TEXTURE_GROUP_ID) {
    return 'card-type row textures require their registered atomic acceptance group';
  }
  const requiredSlots = Array.isArray(contract.requiredSlots) ? [...contract.requiredSlots].sort() : [];
  if (JSON.stringify(requiredSlots) !== JSON.stringify(CARD_TYPE_ROW_TEXTURE_REQUIRED_SLOTS)) {
    return 'card-type row texture acceptance must contain all four semantic slots';
  }
  const rowSlots = rows.map((row) => row?.slot).sort();
  if (JSON.stringify(rowSlots) !== JSON.stringify(CARD_TYPE_ROW_TEXTURE_REQUIRED_SLOTS)) {
    return 'card-type row texture acceptance rows must match all four semantic slots';
  }
  return null;
}

/** Closed production contract for the Level Editor's actual 20px Brush seat. */
function levelEditorBrushIconMediaIssue(row, projectedRuntime = null) {
  if (!levelEditorBrushIconSlot(row.slot)) return 'Level Editor brush icons require their registered semantic slot';
  if (row.domain !== 'ui-kit') return 'Level Editor brush icons require the ui-kit domain';
  if (row.role !== 'icon') return 'Level Editor brush icons require the icon role';
  if (row.media_type !== 'image/png') return 'Level Editor brush icons require image/png';
  const evidence = isObjectRecord(row.native_evidence) ? row.native_evidence : {};
  const scaledOption01 = evidence.schema === LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SCHEMA;
  if (scaledOption01) {
    if (
      normalizedSha(row.blob_sha256) !== LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SHA256
      || Number(row.width) !== 64 || Number(row.height) !== 64
    ) return 'The ADR-0337 Brush exception is restricted to the exact owner-selected 64px Option 01 bytes';
  } else if (Number(row.width) !== 18 || Number(row.height) !== 18) {
    return 'Level Editor brush icons must be native 18x18 rasters unless they are the exact ADR-0337 Option 01 exception';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Level Editor brush icons require metadata.runtime';
  const allowed = new Set([
    'component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole',
  ]);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Level Editor brush runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== LEVEL_EDITOR_BRUSH_ICON_COMPONENT) {
    return `Level Editor brush metadata.runtime.component must be ${LEVEL_EDITOR_BRUSH_ICON_COMPONENT}`;
  }
  if (runtime.variant !== 'brush') return 'Level Editor brush runtime variant must be brush';
  const expectedFrame = scaledOption01 ? 64 : 18;
  if (runtime.frameWidth !== expectedFrame || runtime.frameHeight !== expectedFrame || runtime.frameCount !== 1) {
    return `Level Editor brush runtime geometry must describe one ${expectedFrame}x${expectedFrame} frame`;
  }
  if (runtime.nativeRole !== LEVEL_EDITOR_BRUSH_ICON_COMPONENT) {
    return `Level Editor brush metadata.runtime.nativeRole must be ${LEVEL_EDITOR_BRUSH_ICON_COMPONENT}`;
  }
  if (runtime.altText !== '') {
    return 'Level Editor brush metadata.runtime.altText must be empty because the tool button owns its accessible name';
  }

  if (scaledOption01) {
    if (
      evidence.decision !== 'ADR-0337'
      || evidence.status !== 'owner-approved-production-exception'
      || evidence.native1x !== false || evidence.spatialResampling !== true
      || Number(evidence.sourceWidth) !== 64 || Number(evidence.sourceHeight) !== 64
      || normalizedSha(evidence.sourceSha256) !== LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SHA256
      || Number(evidence.drawWidth) !== 20 || Number(evidence.drawHeight) !== 20
      || evidence.transform !== 'css-background-size-contain-64-to-20'
    ) return 'The ADR-0337 Brush exception evidence is incomplete';
    return null;
  }
  if (evidence.schema !== 'level-editor-brush-icon-native-v1') {
    return 'Level Editor brush native evidence requires level-editor-brush-icon-native-v1';
  }
  if (
    evidence.productionRole !== 'inner-brush-tool'
    || Number(evidence.drawWidth) !== 18 || Number(evidence.drawHeight) !== 18
    || Number(evidence.generatorOutputWidth) !== 32 || Number(evidence.generatorOutputHeight) !== 32
    || evidence.transform !== 'center-crop-18x18-no-spatial-resampling'
  ) return 'Level Editor brush native evidence does not match its exact 18px production role';
  const bounds = evidence.opaqueBounds;
  if (
    !isObjectRecord(bounds)
    || !Number.isSafeInteger(bounds.x) || !Number.isSafeInteger(bounds.y)
    || !Number.isSafeInteger(bounds.width) || !Number.isSafeInteger(bounds.height)
    || bounds.x < 2 || bounds.y < 2 || bounds.width < 1 || bounds.height < 1
    || bounds.x + bounds.width > 16 || bounds.y + bounds.height > 16
  ) return 'Level Editor brush opaque bounds must preserve a two-pixel transparent gutter on every edge';
  if (
    evidence.edgeAlphaMax !== 0 || !Number.isSafeInteger(evidence.opaquePixelCount)
    || evidence.opaquePixelCount < 16 || evidence.opaquePixelCount > 256
  ) return 'Level Editor brush alpha evidence is incomplete or implausible';
  return null;
}

function levelEditorBrushIconOwnerProofIssue(row, proof, surfaceUrl = null) {
  if (!levelEditorBrushIconSlot(row.slot)) return 'Level Editor brush proof requires the registered semantic slot';
  if (!isObjectRecord(proof) || proof.schema !== LEVEL_EDITOR_BRUSH_ICON_PROOF_SCHEMA) {
    return `Level Editor brush review requires ${LEVEL_EDITOR_BRUSH_ICON_PROOF_SCHEMA}`;
  }
  const scaledOption01 = row.native_evidence?.schema === LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SCHEMA;
  const expected = scaledOption01
    ? { assetLocalScale: 0.3125, spatialResampling: true, frame: 64, draw: 20 }
    : { assetLocalScale: 1, spatialResampling: false, frame: 18, draw: 18 };
  if (
    proof.renderer !== LEVEL_EDITOR_BRUSH_ICON_PROOF_RENDERER
    || proof.canonicalScale !== 1 || proof.assetLocalScale !== expected.assetLocalScale
    || proof.spatialResampling !== expected.spatialResampling
    || proof.frameWidth !== expected.frame || proof.frameHeight !== expected.frame
    || proof.drawWidth !== expected.draw || proof.drawHeight !== expected.draw
  ) return 'Level Editor brush proof does not match the exact reviewed tool renderer';
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'Level Editor brush proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'Level Editor brush proof surfaceUrl is invalid'; }
  if (
    parsedSurface.pathname !== '/editor/level'
    || parsedSurface.searchParams.get('brushIconReviewVersion') !== String(row.id)
  ) return 'Level Editor brush proof must identify its exact candidate in the real Level Editor';
  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256 || !Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'Level Editor brush proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'Level Editor brush proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'Level Editor brush proof must snapshot exactly one semantic slot';
  }
  const snapshot = proof.slotSnapshots[0];
  if (!isObjectRecord(snapshot) || snapshot.slot !== row.slot) {
    return 'Level Editor brush proof slot snapshot is invalid';
  }
  const bounds = row.native_evidence?.opaqueBounds;
  if (
    !isObjectRecord(bounds) || !isObjectRecord(proof.opaqueBounds)
    || proof.opaqueBounds.x !== bounds.x || proof.opaqueBounds.y !== bounds.y
    || proof.opaqueBounds.width !== bounds.width || proof.opaqueBounds.height !== bounds.height
  ) {
    return 'Level Editor brush proof opaque bounds do not match the validated candidate evidence';
  }
  return null;
}

/**
 * Domain-owned runtime projection for one perimeter wall raster. ADR-0086 makes the
 * full-height frame the only wall geometry, so the frame size is the contract: a wall
 * candidate that does not carry it cannot seat on the board's back edges at all.
 */
function wallMaterialMediaIssue(row, projectedRuntime = null) {
  const wall = wallMaterialSlot(row.slot);
  if (!wall) return 'wall slots must match tiles/feature/wall-<material>-<1|8|9|thumb>.png';
  if (row.domain !== 'terrain') return 'wall materials require the terrain domain';
  if (row.media_type !== 'image/png') return 'wall materials require image/png';
  if (wall.thumb) {
    if (row.role !== 'review') return 'wall material thumbnails require the review role';
    const width = Number(row.width);
    const height = Number(row.height);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width !== height) {
      return 'wall material thumbnails must be square';
    }
    if (width < 1 || width > WALL_MATERIAL_THUMB_MAX) {
      return `wall material thumbnails must be 1-${WALL_MATERIAL_THUMB_MAX}px square`;
    }
  } else {
    if (row.role !== 'media') return 'wall material frames require the terrain media role';
    if (Number(row.width) !== WALL_MATERIAL_FRAME_WIDTH || Number(row.height) !== WALL_MATERIAL_FRAME_HEIGHT) {
      return `ADR-0086 wall frames must be native ${WALL_MATERIAL_FRAME_WIDTH}x${WALL_MATERIAL_FRAME_HEIGHT}`;
    }
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime) || !Object.keys(runtime).length) return null;
  const allowed = new Set(['component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `wall material runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== undefined && runtime.component !== WALL_MATERIAL_COMPONENT) {
    return `wall material metadata.runtime.component must be ${WALL_MATERIAL_COMPONENT}`;
  }
  if (runtime.variant !== undefined && runtime.variant !== wall.material) {
    return 'wall material metadata.runtime.variant must name its own material';
  }
  if (runtime.frameCount !== undefined && runtime.frameCount !== 1) {
    return 'wall material frames are single-frame rasters';
  }
  if (runtime.frameWidth !== undefined && runtime.frameWidth !== Number(row.width)) {
    return 'wall material runtime frameWidth does not match uploaded geometry';
  }
  if (runtime.frameHeight !== undefined && runtime.frameHeight !== Number(row.height)) {
    return 'wall material runtime frameHeight does not match uploaded geometry';
  }
  return null;
}

/**
 * Owner review for a wall candidate is only meaningful mounted on the real board renderer at
 * canonical 1x, seated against live terrain. One proof covers a whole wall batch, so each
 * candidate is checked against its OWN slot entry rather than a single-element proof.
 */
function wallMaterialOwnerProofIssue(row, proof, surfaceUrl = null) {
  const wall = wallMaterialSlot(row.slot);
  if (!wall) return 'wall material proof requires a registered wall slot';
  if (!isObjectRecord(proof) || proof.schema !== WALL_MATERIAL_PROOF_SCHEMA) {
    return `wall material review requires ${WALL_MATERIAL_PROOF_SCHEMA}`;
  }
  if (
    proof.renderer !== WALL_MATERIAL_PROOF_RENDERER
    || proof.canonicalScale !== 1 || proof.assetLocalScale !== 1
    || proof.spatialResampling !== false || proof.deterministicProof !== true
  ) return 'wall material proof must cover exact canonical 1x pixels without resampling';
  if (
    proof.frameWidth !== WALL_MATERIAL_FRAME_WIDTH || proof.frameHeight !== WALL_MATERIAL_FRAME_HEIGHT
  ) return 'wall material proof does not mount the ADR-0086 full-height frame geometry';
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'wall material proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'wall material proof surfaceUrl is invalid'; }
  if (parsedSurface.pathname !== '/studio') {
    return 'wall material proof must come from the game-owned Studio wall surface';
  }
  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256) return 'wall material proof requires uploaded candidate bytes';
  if (!Array.isArray(proof.selectedCandidates) || !Array.isArray(proof.slotSnapshots)) {
    return 'wall material proof is incomplete';
  }
  const selected = proof.selectedCandidates.filter((item) => isObjectRecord(item) && item.slot === row.slot);
  if (
    selected.length !== 1 || selected[0].versionId !== String(row.id)
    || normalizedSha(selected[0].sha256) !== candidateSha256
  ) return 'wall material proof does not identify the reviewed candidate bytes';
  const snapshots = proof.slotSnapshots.filter((item) => isObjectRecord(item) && item.slot === row.slot);
  if (snapshots.length !== 1) return 'wall material proof must snapshot this wall slot exactly once';
  // A wall face is only judged against the walls it will stand beside, so every frame in the
  // batch has to be mounted on the same board — not reviewed one sprite at a time.
  if (!wall.thumb && !proof.mountedSlots?.includes?.(row.slot)) {
    return 'wall material proof must mount this frame on the reviewed board';
  }
  return null;
}

/**
 * Domain-owned runtime projection for one authored one-shot take. Sound-set
 * labels, gains, and assignments remain in the DB-owned SFX profile.
 */
function sfxSampleMediaIssue(row, projectedRuntime = null) {
  const slot = sfxSampleSlot(row.slot);
  if (!slot) return 'SFX sample slots must match sfx/<sound-set>/v<n>.<supported-audio-format>';
  if (row.domain !== 'sfx') return 'SFX samples require the sfx domain';
  if (row.role !== 'audio') return 'SFX samples require the audio role';
  if (row.media_type !== SFX_MEDIA_TYPE_BY_EXTENSION[slot.extension]) {
    return 'SFX sample media type must match its slot extension';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'SFX samples require metadata.runtime';
  const allowed = new Set(['component', 'variant', 'state', 'durationMs', 'loop']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `SFX sample runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== SFX_SAMPLE_COMPONENT) {
    return `SFX sample metadata.runtime.component must be ${SFX_SAMPLE_COMPONENT}`;
  }
  if (runtime.variant !== slot.soundSetKey) return 'SFX sample variant must match its sound-set slot key';
  if (runtime.state !== 'one-shot') return 'SFX sample runtime state must be one-shot';
  if (!Number.isSafeInteger(runtime.durationMs) || runtime.durationMs < 1 || runtime.durationMs > 3_600_000) {
    return 'SFX sample runtime durationMs must be a positive bounded integer';
  }
  if (runtime.loop !== false) return 'SFX one-shot runtime loop must be false';
  return null;
}

/**
 * Closed production projection for the exact command-archive artwork approved
 * under ADR-0336. The source PNG remains native and unresampled; the named
 * exception is the ShellWorkspace cover presentation, not rewritten pixels.
 */
function strategikonBackgroundMediaIssue(row, projectedRuntime = null) {
  if (!strategikonBackgroundSlot(row.slot)) return 'Strategikon background requires its canonical semantic slot';
  if (row.domain !== 'ui-kit') return 'Strategikon background requires the ui-kit domain';
  if (row.role !== 'background') return 'Strategikon background requires the background role';
  if (row.media_type !== 'image/png') return 'Strategikon background requires image/png';
  if (Number(row.width) !== 688 || Number(row.height) !== 384) {
    return 'Strategikon background must retain its approved 688x384 source raster';
  }
  if (normalizedSha(row.blob_sha256) !== STRATEGIKON_BACKGROUND_SHA256) {
    return 'ADR-0336 authorizes only the exact owner-approved Strategikon background bytes';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'Strategikon background requires metadata.runtime';
  const allowed = new Set(['component', 'variant', 'state', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `Strategikon background runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== STRATEGIKON_BACKGROUND_COMPONENT) {
    return `Strategikon background metadata.runtime.component must be ${STRATEGIKON_BACKGROUND_COMPONENT}`;
  }
  if (runtime.variant !== 'command-archive') return 'Strategikon background runtime variant must be command-archive';
  if (runtime.state !== 'owner-approved-cover-scaling-exception') {
    return 'Strategikon background runtime state must name the owner-approved cover-scaling exception';
  }
  if (runtime.frameWidth !== 688 || runtime.frameHeight !== 384 || runtime.frameCount !== 1) {
    return 'Strategikon background runtime frame geometry must match the approved PNG';
  }
  if (runtime.nativeRole !== STRATEGIKON_BACKGROUND_COMPONENT) {
    return `Strategikon background nativeRole must be ${STRATEGIKON_BACKGROUND_COMPONENT}`;
  }
  if (runtime.altText !== '') return 'decorative Strategikon background runtime altText must be empty';
  return null;
}

/**
 * Domain-owned runtime projection for one workspace's full-screen backdrop. The art is
 * decorative — it sits behind the workspace's own panels and carries no text — so the
 * contract is the registered workspace id plus frame geometry that matches the uploaded
 * raster, which stops a re-crop from silently changing what the screen paints.
 */
function workspaceBackgroundMediaIssue(row, projectedRuntime = null) {
  const workspaceId = workspaceBackgroundSlotId(row.slot);
  if (!workspaceId) {
    return `workspace backgrounds must match ui/workspaces/<workspace-id>/background.png for a registered workspace (${WORKSPACE_BACKGROUND_IDS.join(', ')})`;
  }
  if (row.domain !== 'ui-kit') return 'workspace backgrounds require the ui-kit domain';
  if (row.role !== 'background') return 'workspace backgrounds require the background role';
  if (row.media_type !== 'image/png') return 'workspace backgrounds require image/png';
  const width = Number(row.width);
  const height = Number(row.height);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    return 'workspace backgrounds require decoded raster dimensions';
  }

  const metadata = mediaVersionMetadata(row);
  const runtime = projectedRuntime ?? (isObjectRecord(metadata.runtime) ? metadata.runtime : null);
  if (!isObjectRecord(runtime)) return 'workspace backgrounds require metadata.runtime';
  const allowed = new Set(['component', 'variant', 'frameWidth', 'frameHeight', 'frameCount', 'altText', 'nativeRole']);
  const unsupported = Object.keys(runtime).filter((key) => !allowed.has(key));
  if (unsupported.length) {
    return `workspace background runtime metadata contains unsupported keys: ${unsupported.sort().join(', ')}`;
  }
  if (runtime.component !== WORKSPACE_BACKGROUND_COMPONENT) {
    return `workspace background metadata.runtime.component must be ${WORKSPACE_BACKGROUND_COMPONENT}`;
  }
  if (runtime.nativeRole !== WORKSPACE_BACKGROUND_COMPONENT) {
    return `workspace background metadata.runtime.nativeRole must be ${WORKSPACE_BACKGROUND_COMPONENT}`;
  }
  if (runtime.variant !== workspaceId) return 'workspace background runtime variant must match its semantic slot id';
  if (runtime.frameWidth !== width || runtime.frameHeight !== height || runtime.frameCount !== 1) {
    return 'workspace background runtime frame geometry must match the uploaded raster';
  }
  if (runtime.altText !== '') return 'decorative workspace background runtime altText must be empty';
  return null;
}

function strategikonBackgroundOwnerProofIssue(row, proof, surfaceUrl = null) {
  if (!strategikonBackgroundSlot(row.slot)) return 'Strategikon background proof requires its canonical semantic slot';
  if (!isObjectRecord(proof) || proof.schema !== STRATEGIKON_BACKGROUND_PROOF_SCHEMA) {
    return `Strategikon background review requires ${STRATEGIKON_BACKGROUND_PROOF_SCHEMA}`;
  }
  if (
    proof.renderer !== STRATEGIKON_BACKGROUND_PROOF_RENDERER
    || proof.decision !== 'ADR-0336'
    || proof.coverScalingApproved !== true
    || proof.objectFit !== 'cover'
    || proof.imageRendering !== 'pixelated'
    || proof.opacity !== 0.68
  ) return 'Strategikon background proof must record the exact owner-approved cover presentation';
  if (
    !isObjectRecord(proof.sourceRaster)
    || proof.sourceRaster.width !== 688 || proof.sourceRaster.height !== 384
    || normalizedSha(proof.sourceRaster.sha256) !== STRATEGIKON_BACKGROUND_SHA256
  ) return 'Strategikon background proof does not identify the approved source raster';
  if (
    !isObjectRecord(proof.reviewViewport)
    || proof.reviewViewport.width !== 1440 || proof.reviewViewport.height !== 900
  ) return 'Strategikon background proof must record the approved 1440x900 review viewport';
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'Strategikon background proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'Strategikon background proof surfaceUrl is invalid'; }
  if (
    parsedSurface.pathname !== '/play/strategikon/enchiridion/units'
    || parsedSurface.searchParams.get('strategikonBackgroundReview') !== '1'
    || parsedSurface.searchParams.get('campaignId') !== 'off-c-crown-valoria'
    || parsedSurface.searchParams.get('levelId') !== 'off-l-hold-bridge'
  ) return 'Strategikon background proof must identify the exact reviewed gameplay surface';

  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256 || !Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'Strategikon background proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'Strategikon background proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'Strategikon background proof must snapshot exactly one semantic slot';
  }
  const snapshot = proof.slotSnapshots[0];
  if (!isObjectRecord(snapshot) || snapshot.slot !== row.slot) {
    return 'Strategikon background proof slot snapshot is invalid';
  }
  return null;
}

function sfxSampleOwnerProofIssue(row, proof, surfaceUrl = null) {
  const slot = sfxSampleSlot(row.slot);
  if (!slot) return 'SFX sample proof requires a typed SFX sample slot';
  if (!isObjectRecord(proof) || proof.schema !== SFX_SAMPLE_PROOF_SCHEMA) {
    return `SFX sample review requires ${SFX_SAMPLE_PROOF_SCHEMA}`;
  }
  if (
    proof.renderer !== SFX_SAMPLE_PROOF_RENDERER
    || proof.exactByteAudition !== true
    || proof.playbackRate !== 1
  ) return 'SFX sample proof must use the exact-byte Studio audition at playback rate 1';
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'SFX sample proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'SFX sample proof surfaceUrl is invalid'; }
  if (
    parsedSurface.pathname !== '/studio'
    || parsedSurface.searchParams.get('mode') !== 'viewer'
    || parsedSurface.searchParams.get('vk') !== 'sfx'
    || parsedSurface.searchParams.get('sfxReview') !== String(row.id)
  ) return 'SFX sample proof must identify its exact Studio candidate audition';

  const runtime = mediaVersionMetadata(row).runtime;
  const decoded = proof.decodedAudio;
  if (
    !isObjectRecord(decoded)
    || !Number.isSafeInteger(decoded.durationMs)
    || Math.abs(decoded.durationMs - Number(runtime?.durationMs)) > 20
    || !Number.isSafeInteger(decoded.sampleRate) || decoded.sampleRate < 8_000 || decoded.sampleRate > 384_000
    || !Number.isSafeInteger(decoded.channels) || decoded.channels < 1 || decoded.channels > 16
  ) return 'SFX sample proof must record valid decoded audio geometry matching the candidate duration';

  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256 || !Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'SFX sample proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'SFX sample proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'SFX sample proof must snapshot exactly one semantic slot';
  }
  const snapshot = proof.slotSnapshots[0];
  if (!isObjectRecord(snapshot) || snapshot.slot !== row.slot) {
    return 'SFX sample proof slot snapshot is invalid';
  }
  return null;
}

function predrawnBoardOwnerProofIssue(row, proof, surfaceUrl = null) {
  const slug = predrawnBoardSlotSlug(row.slot);
  if (!slug) return 'pre-drawn board proof requires a canonical board slot';
  if (!isObjectRecord(proof) || proof.schema !== PREDRAWN_BOARD_PROOF_SCHEMA) {
    return `pre-drawn board review requires ${PREDRAWN_BOARD_PROOF_SCHEMA}`;
  }
  if (
    proof.renderer !== PREDRAWN_BOARD_PROOF_RENDERER
    || proof.canonicalScale !== 1 || proof.assetLocalScale !== 1
    || proof.alignmentApplied !== true || proof.deterministicProof !== true
  ) return 'pre-drawn board proof must use the Level Editor renderer at exact canonical 1x';
  if (proof.boardSlug !== slug) return 'pre-drawn board proof does not match the semantic slot slug';
  if (proof.frameWidth !== Number(row.width) || proof.frameHeight !== Number(row.height)) {
    return 'pre-drawn board proof frame dimensions do not match the candidate bytes';
  }
  const candidateSha256 = normalizedSha(row.blob_sha256);
  if (!candidateSha256 || normalizedSha(proof.previewSha256) !== candidateSha256) {
    return 'pre-drawn board proof preview hash does not match the candidate bytes';
  }
  const alignmentIssue = predrawnBoardAlignmentIssue(proof.alignment, row.width, row.height);
  if (alignmentIssue) return alignmentIssue;
  const alignmentSha256 = createHash('sha256').update(proof.alignment, 'utf8').digest('hex');
  if (normalizedSha(proof.alignmentSha256) !== alignmentSha256) {
    return 'pre-drawn board proof alignment hash does not match its canonical payload';
  }
  if (typeof proof.levelId !== 'string' || !proof.levelId.trim()) {
    return 'pre-drawn board proof requires the reviewed canonical level id';
  }
  if (surfaceUrl !== null && proof.surfaceUrl !== surfaceUrl) {
    return 'pre-drawn board proof surfaceUrl does not match the reviewed surface';
  }
  let parsedSurface;
  try { parsedSurface = new URL(proof.surfaceUrl); } catch { return 'pre-drawn board proof surfaceUrl is invalid'; }
  if (parsedSurface.pathname !== '/editor/level' || parsedSurface.searchParams.get('levelId') !== proof.levelId) {
    return 'pre-drawn board proof must identify the reviewed Level Editor level';
  }
  if (!Array.isArray(proof.selectedCandidates) || proof.selectedCandidates.length !== 1) {
    return 'pre-drawn board proof must identify exactly one candidate';
  }
  const selected = proof.selectedCandidates[0];
  if (
    !isObjectRecord(selected) || selected.slot !== row.slot || selected.versionId !== String(row.id)
    || normalizedSha(selected.sha256) !== candidateSha256
  ) return 'pre-drawn board proof does not identify the reviewed candidate bytes';
  if (!Array.isArray(proof.slotSnapshots) || proof.slotSnapshots.length !== 1) {
    return 'pre-drawn board proof must snapshot exactly one semantic slot';
  }
  const snapshot = proof.slotSnapshots[0];
  if (!isObjectRecord(snapshot) || snapshot.slot !== row.slot) {
    return 'pre-drawn board proof slot snapshot is invalid';
  }
  return null;
}

function nativeMediaEvidenceIssue(row) {
  const isRaster = String(row.media_type || '').startsWith('image/') && row.media_type !== 'image/svg+xml';
  if (!isRaster) return null;
  const evidence = isObjectRecord(row.native_evidence) ? row.native_evidence : {};
  if (evidence.schema === LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SCHEMA) {
    if (
      String(row.slot || '') !== LEVEL_EDITOR_BRUSH_ICON_SLOT
      || normalizedSha(row.blob_sha256) !== LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SHA256
      || normalizedSha(evidence.sourceSha256) !== LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SHA256
    ) return 'ADR-0337 scaled Brush evidence is restricted to the exact owner-selected Option 01 bytes';
    if (
      evidence.decision !== 'ADR-0337'
      || evidence.status !== 'owner-approved-production-exception'
      || evidence.native1x !== false || evidence.spatialResampling !== true
      || Number(row.width) !== 64 || Number(row.height) !== 64
      || Number(evidence.sourceWidth) !== 64 || Number(evidence.sourceHeight) !== 64
      || Number(evidence.drawWidth) !== 20 || Number(evidence.drawHeight) !== 20
      || evidence.transform !== 'css-background-size-contain-64-to-20'
    ) return 'ADR-0337 scaled Brush evidence is incomplete';
    return null;
  }
  if (evidence.schema === RUN_RELIC_RESIZED_PRODUCTION_EXCEPTION_SCHEMA) {
    const expectedSha256 = RUN_RELIC_RESIZED_PRODUCTION_EXCEPTION_SHA_BY_SLOT[String(row.slot || '')];
    if (!expectedSha256) return 'ADR-0332 resized production evidence is restricted to its eight Run relic slots';
    if (normalizedSha(row.blob_sha256) !== expectedSha256 || normalizedSha(evidence.outputSha256) !== expectedSha256) {
      return 'ADR-0332 resized production evidence does not authorize these uploaded bytes';
    }
    if (
      evidence.decision !== 'ADR-0332'
      || evidence.status !== 'owner-approved-production-exception'
      || evidence.native1x !== false
      || evidence.spatialResampling !== true
    ) return 'ADR-0332 resized production evidence is incomplete';
    if (
      Number(row.width) !== 64 || Number(row.height) !== 64
      || Number(evidence.outputWidth) !== 64 || Number(evidence.outputHeight) !== 64
      || Number(evidence.sourceWidth) !== 1254 || Number(evidence.sourceHeight) !== 1254
    ) return 'ADR-0332 resized production evidence has invalid source or output dimensions';
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(evidence.sourceVersionId || ''))
      || !normalizedSha(evidence.sourceSha256)
      || evidence.transform !== 'chroma-key-crop-nearest-neighbor-fit-52-alpha-threshold-96'
    ) return 'ADR-0332 resized production evidence is missing its archived source or exact transform';
    return null;
  }
  if (evidence.schema === RUN_CARD_FRAME_NORMALISED_EXCEPTION_SCHEMA) {
    const expected = RUN_CARD_FRAME_NORMALISED_EXCEPTION_BY_SLOT[String(row.slot || '')];
    if (!expected) return 'ADR-0360 normalised card-frame evidence is restricted to its two Run card frame slots';
    if (
      normalizedSha(row.blob_sha256) !== expected.outputSha256
      || normalizedSha(evidence.outputSha256) !== expected.outputSha256
    ) return 'ADR-0360 normalised card-frame evidence does not authorize these uploaded bytes';
    if (normalizedSha(evidence.sourceSha256) !== expected.sourceSha256) {
      return 'ADR-0360 normalised card-frame evidence does not name the frame it was normalised from';
    }
    if (
      evidence.decision !== 'ADR-0360'
      || evidence.status !== 'owner-approved-production-exception'
      || evidence.native1x !== false
      || evidence.spatialResampling !== true
    ) return 'ADR-0360 normalised card-frame evidence is incomplete';
    if (Number(row.width) !== 1060 || Number(row.height) !== 1484) {
      return 'ADR-0360 normalised card-frame evidence requires the native 1060x1484 canvas';
    }
    if (
      Number(evidence.paintedWidth) !== 1009 || Number(evidence.paintedHeight) !== 1402
      || Number(evidence.sourcePaintedHeight) !== expected.sourcePaintedHeight
      || evidence.transform !== RUN_CARD_FRAME_NORMALISED_EXCEPTION_TRANSFORM
    ) return 'ADR-0360 normalised card-frame evidence is missing its painted box or exact transform';
    return null;
  }
  if (evidence.native1x !== true) return 'nativeEvidence.native1x must be true';
  if (evidence.spatialResampling !== false) return 'nativeEvidence.spatialResampling must be false';
  if (row.width !== null || row.height !== null) {
    if (Number(evidence.sourceWidth) !== Number(row.width) || Number(evidence.sourceHeight) !== Number(row.height)) {
      return 'nativeEvidence source dimensions must equal the uploaded image dimensions';
    }
  }
  if (!normalizedSha(evidence.sourceSha256) || normalizedSha(evidence.sourceSha256) !== normalizedSha(row.blob_sha256)) {
    return 'nativeEvidence.sourceSha256 is required and must equal the uploaded content hash';
  }
  return null;
}

function preservesNativeEvidenceForUpload(current, { sha256, mediaType, width, height }) {
  return nativeMediaEvidenceIssue({
    ...current,
    blob_sha256: normalizedSha(sha256),
    media_type: mediaType,
    width,
    height,
  }) === null;
}

function liveCatalogReadinessIssue(catalog, { requireCritical = false } = {}) {
  if (!catalog || !Array.isArray(catalog.slots)) return 'live media catalog is missing slots';
  if (!requireCritical) return null;
  const hasCritical = catalog.slots.some((slot) => (
    slot?.lifecycleState === 'active'
    && slot?.availabilityPolicy === 'critical'
    && slot?.media?.sha256
  ));
  return hasCritical ? null : 'live media catalog has no active critical slot';
}

module.exports = {
  CARD_TYPE_ROW_TEXTURE_COMPONENT,
  CARD_TYPE_ROW_TEXTURE_GROUP_ID,
  CARD_TYPE_ROW_TEXTURE_REQUIRED_SLOTS,
  PREDRAWN_BOARD_COMPONENT,
  PREDRAWN_BOARD_PROOF_RENDERER,
  PREDRAWN_BOARD_PROOF_SCHEMA,
  LEVEL_EDITOR_BRUSH_ICON_COMPONENT,
  LEVEL_EDITOR_BRUSH_ICON_PROOF_RENDERER,
  LEVEL_EDITOR_BRUSH_ICON_PROOF_SCHEMA,
  LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SCHEMA,
  RUN_RELIC_ICON_COMPONENT,
  RUN_RELIC_RESIZED_PRODUCTION_EXCEPTION_SCHEMA,
  RUN_RESOURCE_ICON_COMPONENT,
  RUN_SHOP_WRAP_COMPONENT,
  SFX_SAMPLE_COMPONENT,
  SFX_SAMPLE_PROOF_RENDERER,
  SFX_SAMPLE_PROOF_SCHEMA,
  STRATEGIKON_BACKGROUND_COMPONENT,
  STRATEGIKON_BACKGROUND_PROOF_RENDERER,
  STRATEGIKON_BACKGROUND_PROOF_SCHEMA,
  STRATEGIKON_BACKGROUND_SHA256,
  STRATEGIKON_BACKGROUND_SLOT,
  WALL_MATERIAL_COMPONENT,
  WALL_MATERIAL_FRAME_HEIGHT,
  WALL_MATERIAL_FRAME_WIDTH,
  WALL_MATERIAL_PROOF_RENDERER,
  WALL_MATERIAL_PROOF_SCHEMA,
  liveCatalogReadinessIssue,
  cardTypeRowTextureAcceptanceGroupIssue,
  cardTypeRowTextureMediaIssue,
  cardTypeRowTextureSlot,
  gameConditionIconMediaIssue,
  gameConditionIconSlot,
  levelEditorBrushIconMediaIssue,
  levelEditorBrushIconOwnerProofIssue,
  levelEditorBrushIconSlot,
  nativeMediaEvidenceIssue,
  predrawnBoardAlignmentIssue,
  predrawnBoardMediaIssue,
  predrawnBoardOwnerProofIssue,
  predrawnBoardSlotSlug,
  preservesNativeEvidenceForUpload,
  runRelicIconMediaIssue,
  runRelicIconSlotId,
  runResourceIconMediaIssue,
  runResourceIconSlotId,
  runShopWrapMediaIssue,
  workspaceBackgroundSlotId,
  workspaceBackgroundMediaIssue,
  WORKSPACE_BACKGROUND_IDS,
  runShopWrapSlotId,
  sfxSampleMediaIssue,
  sfxSampleOwnerProofIssue,
  sfxSampleSlot,
  strategikonBackgroundMediaIssue,
  strategikonBackgroundOwnerProofIssue,
  strategikonBackgroundSlot,
  wallMaterialMediaIssue,
  wallMaterialOwnerProofIssue,
  wallMaterialSlot,
};
