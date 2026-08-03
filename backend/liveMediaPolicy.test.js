'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
const {
  ATARAXIA_NUMERAL_COMPONENT,
  ATARAXIA_NUMERAL_PROOF_RENDERER,
  ATARAXIA_NUMERAL_PROOF_SCHEMA,
  ataraxiaNumeralMediaIssue,
  ataraxiaNumeralOwnerProofIssue,
  ataraxiaNumeralSlot,
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
  RUN_CARD_COST_COIN_COMPONENT,
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
  runCardCostCoinMediaIssue,
  runCardCostCoinSlot,
  runResourceIconMediaIssue,
  runResourceIconSlotId,
  runShopWrapMediaIssue,
  runShopWrapSlotId,
  sfxSampleMediaIssue,
  sfxSampleOwnerProofIssue,
  sfxSampleSlot,
  strategikonBackgroundMediaIssue,
  strategikonBackgroundOwnerProofIssue,
  strategikonBackgroundSlot,
  WALL_MATERIAL_COMPONENT,
  WALL_MATERIAL_FRAME_HEIGHT,
  WALL_MATERIAL_FRAME_WIDTH,
  WALL_MATERIAL_PROOF_RENDERER,
  WALL_MATERIAL_PROOF_SCHEMA,
  wallMaterialMediaIssue,
  wallMaterialOwnerProofIssue,
  wallMaterialSlot,
} = require('./liveMediaPolicy');

const originalSha = 'a'.repeat(64);
const replacementSha = 'b'.repeat(64);
const raster = (overrides = {}) => ({
  media_type: 'image/png',
  blob_sha256: originalSha,
  width: 96,
  height: 180,
  native_evidence: {
    native1x: true,
    spatialResampling: false,
    sourceWidth: 96,
    sourceHeight: 180,
    sourceSha256: originalSha,
  },
  ...overrides,
});

test('raster native evidence is required to identify the exact uploaded bytes', () => {
  const missingSha = raster({ native_evidence: { ...raster().native_evidence } });
  delete missingSha.native_evidence.sourceSha256;
  assert.match(nativeMediaEvidenceIssue(missingSha), /sourceSha256 is required/);
  assert.equal(nativeMediaEvidenceIssue(raster()), null);
});

test('card-type row textures have a closed semantic-slot and native-geometry runtime contract', () => {
  const runtime = {
    component: CARD_TYPE_ROW_TEXTURE_COMPONENT,
    variant: 'pestiferous',
    family: 'card-type-row-textures',
    frameWidth: 128,
    frameHeight: 64,
    frameCount: 1,
    nativeRole: CARD_TYPE_ROW_TEXTURE_COMPONENT,
    altText: '',
  };
  const row = {
    slot: 'ui/surfaces/card-type-pestiferous.png',
    domain: 'ui-kit',
    role: 'media',
    media_type: 'image/png',
    width: 128,
    height: 64,
    metadata: { runtime },
  };

  assert.deepEqual(cardTypeRowTextureSlot(row.slot), { variant: 'pestiferous', width: 128, height: 64 });
  assert.equal(cardTypeRowTextureMediaIssue(row, runtime), null);
  assert.match(cardTypeRowTextureMediaIssue({ ...row, width: 512 }, runtime), /native 128x64/);
  assert.match(cardTypeRowTextureMediaIssue({
    ...row,
    slot: 'ui/surfaces/card-type-tactical.png',
  }, runtime), /variant must match/);
  assert.equal(cardTypeRowTextureSlot('ui/surfaces/card-type-unknown.png'), null);
});

test('card-type row textures accept their intentionally mixed-width tiles only as one exact group', () => {
  const rows = CARD_TYPE_ROW_TEXTURE_REQUIRED_SLOTS.map((slot) => ({ slot }));
  const contract = {
    groupId: CARD_TYPE_ROW_TEXTURE_GROUP_ID,
    requiredSlots: CARD_TYPE_ROW_TEXTURE_REQUIRED_SLOTS,
  };
  assert.equal(cardTypeRowTextureAcceptanceGroupIssue(rows, contract), null);
  assert.match(cardTypeRowTextureAcceptanceGroupIssue(rows.slice(1), contract), /rows must match all four/);
  assert.match(cardTypeRowTextureAcceptanceGroupIssue(rows, {
    ...contract,
    groupId: 'arbitrary-ui-kit-group',
  }), /registered atomic acceptance group/);
});

test('same-dimension replacement bytes clear stale native evidence', () => {
  const current = raster();
  assert.equal(preservesNativeEvidenceForUpload(current, {
    sha256: replacementSha,
    mediaType: 'image/png',
    width: 96,
    height: 180,
  }), false);
  assert.equal(preservesNativeEvidenceForUpload(current, {
    sha256: originalSha,
    mediaType: 'image/png',
    width: 96,
    height: 180,
  }), true);
});

test('only the eight exact ADR-0332 resized Run relic outputs pass the production evidence gate', () => {
  const outputSha256 = '928f9ceb7a5612ff0d2216b70422b972b04492a4c9ed277e5122721b390c52d0';
  const evidence = {
    schema: RUN_RELIC_RESIZED_PRODUCTION_EXCEPTION_SCHEMA,
    decision: 'ADR-0332',
    status: 'owner-approved-production-exception',
    native1x: false,
    spatialResampling: true,
    sourceWidth: 1254,
    sourceHeight: 1254,
    outputWidth: 64,
    outputHeight: 64,
    sourceVersionId: '4da37b19-21ec-4bbd-9e9d-d66d15326075',
    sourceSha256: '0ca350bc34522afa1d2c8e276c1e6f8c845f132c3011b24101bbf6a3f623fc07',
    outputSha256,
    transform: 'chroma-key-crop-nearest-neighbor-fit-52-alpha-threshold-96',
  };
  const approved = raster({
    slot: 'ui/run/relics/congressional-approval.png',
    blob_sha256: outputSha256,
    width: 64,
    height: 64,
    native_evidence: evidence,
  });
  assert.equal(nativeMediaEvidenceIssue(approved), null);
  assert.equal(preservesNativeEvidenceForUpload(approved, {
    sha256: outputSha256,
    mediaType: 'image/png',
    width: 64,
    height: 64,
  }), true);
  assert.match(nativeMediaEvidenceIssue({
    ...approved,
    slot: 'ui/run/relics/conscription-notice.png',
  }), /restricted to its eight Run relic slots/);
  assert.match(nativeMediaEvidenceIssue({
    ...approved,
    blob_sha256: replacementSha,
  }), /does not authorize these uploaded bytes/);
  assert.match(nativeMediaEvidenceIssue({
    ...approved,
    native_evidence: { ...evidence, transform: 'lanczos' },
  }), /exact transform/);
  assert.match(nativeMediaEvidenceIssue(raster({
    slot: 'ui/run/relics/congressional-approval.png',
    width: 64,
    height: 64,
    native_evidence: { native1x: false, spatialResampling: true },
  })), /native1x must be true/);
});

function runRelicIcon(overrides = {}) {
  return {
    slot: 'ui/run/relics/conscription-notice.png',
    domain: 'ui-kit',
    role: 'icon',
    media_type: 'image/png',
    width: 64,
    height: 64,
    metadata: {
      runtime: {
        component: RUN_RELIC_ICON_COMPONENT,
        variant: 'conscription-notice',
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 1,
        nativeRole: RUN_RELIC_ICON_COMPONENT,
        altText: '',
      },
    },
    ...overrides,
  };
}

function runShopWrap(overrides = {}, runtimeOverrides = {}) {
  return {
    slot: 'ui/run/shop-wrap/lantern-market-stall.png',
    domain: 'ui-kit',
    role: 'shop-wrap',
    media_type: 'image/png',
    width: 1471,
    height: 937,
    metadata: {
      runtime: {
        component: RUN_SHOP_WRAP_COMPONENT,
        nativeRole: RUN_SHOP_WRAP_COMPONENT,
        variant: 'lantern-market-stall',
        kind: 'band',
        canvasWidth: 1471,
        canvasHeight: 937,
        window: { x: 147, y: 153, w: 1206, h: 544 },
        altText: '',
        ...runtimeOverrides,
      },
    },
    ...overrides,
  };
}

test('Run shop wrap projection binds a card window to the exact uploaded canvas', () => {
  const row = runShopWrap();
  assert.equal(runShopWrapSlotId(row.slot), 'lantern-market-stall');
  assert.equal(runShopWrapMediaIssue(row), null);
  assert.match(runShopWrapMediaIssue(runShopWrap({ domain: 'review-media' })), /ui-kit domain/);
  assert.match(runShopWrapMediaIssue(runShopWrap({ role: 'icon' })), /shop-wrap role/);
  assert.match(runShopWrapMediaIssue(runShopWrap({ media_type: 'image/webp' })), /image\/png/);
  // The canvas is the contract against the raster: a re-crop must not silently
  // move every measured window.
  assert.match(runShopWrapMediaIssue(runShopWrap({ width: 1470 })), /canvas metadata must match/);
  assert.match(runShopWrapMediaIssue(runShopWrap({}, { variant: 'other' })), /variant must match/);
  assert.match(runShopWrapMediaIssue(runShopWrap({}, { kind: 'mural' })), /kind must be one of/);
  assert.match(runShopWrapMediaIssue(runShopWrap({}, { altText: 'Shop stall' })), /altText must be empty/);
  assert.match(runShopWrapMediaIssue(runShopWrap({}, { extra: 1 })), /unsupported keys: extra/);
});

test('Run shop wrap windows and slot openings must stay inside the painted canvas', () => {
  const outside = { x: 147, y: 153, w: 1400, h: 544 };
  assert.match(runShopWrapMediaIssue(runShopWrap({}, { window: outside })), /whole-pixel rect inside the canvas/);
  assert.match(
    runShopWrapMediaIssue(runShopWrap({}, { window: { x: 1, y: 1, w: 10.5, h: 10 } })),
    /whole-pixel rect inside the canvas/,
  );
  // Slot openings only describe a multi-opening structure.
  assert.match(
    runShopWrapMediaIssue(runShopWrap({}, { slots: [{ x: 0, y: 0, w: 10, h: 10 }] })),
    /only meaningful for the slots kind/,
  );
  assert.match(
    runShopWrapMediaIssue(runShopWrap({}, { kind: 'slots', slots: [{ x: 0, y: 0, w: 10, h: 10 }] })),
    /at least two measured card openings/,
  );
  assert.equal(
    runShopWrapMediaIssue(runShopWrap({}, {
      kind: 'slots',
      slots: [{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 10, h: 10 }],
    })),
    null,
  );
  assert.match(
    runShopWrapMediaIssue(runShopWrap({}, {
      kind: 'slots',
      slots: [{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 900, w: 10, h: 100 }],
    })),
    /slots must all be whole-pixel rects inside the canvas/,
  );
});

test('Run relic icon projection binds one native reviewed icon to its exact relic id', () => {
  const row = runRelicIcon();
  assert.equal(runRelicIconSlotId(row.slot), 'conscription-notice');
  assert.equal(runRelicIconMediaIssue(row), null);
  assert.match(runRelicIconMediaIssue(runRelicIcon({ domain: 'review-media' })), /ui-kit domain/);
  assert.match(runRelicIconMediaIssue(runRelicIcon({ role: 'media' })), /icon role/);
  assert.match(runRelicIconMediaIssue(runRelicIcon({ width: 63 })), /64x64/);
  assert.match(runRelicIconMediaIssue(runRelicIcon({
    metadata: { runtime: { ...row.metadata.runtime, variant: 'royal-decree' } },
  })), /variant/);
  assert.match(runRelicIconMediaIssue(runRelicIcon({
    metadata: { runtime: { ...row.metadata.runtime, altText: 'duplicated accessible text' } },
  })), /altText/);
});

function runResourceIcon(overrides = {}) {
  return {
    slot: 'ui/run/resources/gold.png',
    domain: 'ui-kit',
    role: 'icon',
    media_type: 'image/png',
    width: 64,
    height: 64,
    metadata: {
      runtime: {
        component: RUN_RESOURCE_ICON_COMPONENT,
        variant: 'gold',
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 1,
        nativeRole: RUN_RESOURCE_ICON_COMPONENT,
        altText: '',
      },
    },
    ...overrides,
  };
}

test('Run resource icon projection binds one native reviewed icon to its resource id', () => {
  const row = runResourceIcon();
  assert.equal(runResourceIconSlotId(row.slot), 'gold');
  assert.equal(runResourceIconMediaIssue(row), null);
  assert.match(runResourceIconMediaIssue(runResourceIcon({ domain: 'review-media' })), /ui-kit domain/);
  assert.match(runResourceIconMediaIssue(runResourceIcon({ role: 'media' })), /icon role/);
  // A trimmed icon ships at its own square side; only a non-square or out-of-range
  // raster is refused, and the runtime frame must equal whatever side it shipped.
  assert.match(runResourceIconMediaIssue(runResourceIcon({ height: 63 })), /square/);
  assert.equal(runResourceIconMediaIssue(runResourceIcon({
    width: 39,
    height: 39,
    metadata: { runtime: { ...row.metadata.runtime, frameWidth: 39, frameHeight: 39 } },
  })), null);
  assert.match(runResourceIconMediaIssue(runResourceIcon({ width: 39, height: 39 })), /39x39 frame/);
  assert.match(runResourceIconMediaIssue(runResourceIcon({
    width: 8,
    height: 8,
    metadata: { runtime: { ...row.metadata.runtime, frameWidth: 8, frameHeight: 8 } },
  })), /16x16/);
  assert.match(runResourceIconMediaIssue(runResourceIcon({
    metadata: { runtime: { ...row.metadata.runtime, variant: 'favor' } },
  })), /variant/);
  assert.match(runResourceIconMediaIssue(runResourceIcon({
    metadata: { runtime: { ...row.metadata.runtime, altText: 'Gold' } },
  })), /altText/);
});

function runCardCostCoin(overrides = {}) {
  return {
    slot: 'ui/run/card-prototypes/cost-coin-v1.png',
    domain: 'ui-kit',
    role: 'icon',
    media_type: 'image/png',
    width: 112,
    height: 112,
    metadata: {
      runtime: {
        component: RUN_CARD_COST_COIN_COMPONENT,
        variant: 'gold',
        frameWidth: 112,
        frameHeight: 112,
        frameCount: 1,
        nativeRole: RUN_CARD_COST_COIN_COMPONENT,
        altText: '',
      },
    },
    ...overrides,
  };
}

test('Run card cost coin projection binds the transparent native coin to its one semantic slot', () => {
  const row = runCardCostCoin();
  assert.equal(runCardCostCoinSlot(row.slot), true);
  assert.equal(runCardCostCoinMediaIssue(row), null);
  assert.match(runCardCostCoinMediaIssue(runCardCostCoin({ domain: 'review-media' })), /ui-kit domain/);
  assert.match(runCardCostCoinMediaIssue(runCardCostCoin({ role: 'media' })), /icon role/);
  assert.match(runCardCostCoinMediaIssue(runCardCostCoin({ width: 111 })), /112x112/);
  assert.match(runCardCostCoinMediaIssue(runCardCostCoin({
    metadata: { runtime: { ...row.metadata.runtime, variant: 'silver' } },
  })), /variant must be gold/);
  assert.match(runCardCostCoinMediaIssue(runCardCostCoin({
    metadata: { runtime: { ...row.metadata.runtime, altText: 'Gold coin' } },
  })), /altText must be empty/);
});

function gameConditionIcon(overrides = {}) {
  return {
    slot: 'ui/kit/icons/game/plagued.png',
    domain: 'ui-kit',
    role: 'icon',
    media_type: 'image/png',
    width: 64,
    height: 64,
    metadata: {
      runtime: {
        component: 'unit-ability-icon',
        variant: 'plagued',
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 1,
        nativeRole: 'unit-ability-icon',
        altText: '',
      },
    },
    ...overrides,
  };
}

test('condition icon projection keeps all four card properties and granted states as separate typed roles', () => {
  const plagued = gameConditionIcon();
  assert.deepEqual(gameConditionIconSlot(plagued.slot), { component: 'unit-ability-icon', variant: 'plagued' });
  assert.equal(gameConditionIconMediaIssue(plagued), null);

  const pestiferous = gameConditionIcon({
    slot: 'ui/kit/icons/card-properties/pestiferous.png',
    metadata: { runtime: {
      ...plagued.metadata.runtime,
      component: 'card-property-icon',
      variant: 'pestiferous',
      nativeRole: 'card-property-icon',
    } },
  });
  assert.deepEqual(gameConditionIconSlot(pestiferous.slot), { component: 'card-property-icon', variant: 'pestiferous' });
  assert.equal(gameConditionIconMediaIssue(pestiferous), null);
  for (const variant of ['positioned', 'discipline', 'marshalled']) {
    const state = gameConditionIcon({
      slot: `ui/kit/icons/game/${variant}.png`,
      metadata: { runtime: { ...plagued.metadata.runtime, variant } },
    });
    assert.deepEqual(gameConditionIconSlot(state.slot), { component: 'unit-ability-icon', variant });
    assert.equal(gameConditionIconMediaIssue(state), null);
  }
  for (const variant of ['concinnous', 'tactical', 'hieratic']) {
    const property = gameConditionIcon({
      slot: `ui/kit/icons/card-properties/${variant}.png`,
      metadata: { runtime: {
        ...plagued.metadata.runtime,
        component: 'card-property-icon',
        variant,
        nativeRole: 'card-property-icon',
      } },
    });
    assert.deepEqual(gameConditionIconSlot(property.slot), { component: 'card-property-icon', variant });
    assert.equal(gameConditionIconMediaIssue(property), null);
  }
  for (const variant of ['ataraxia', 'conflict', 'battle']) {
    const progress = gameConditionIcon({
      slot: `ui/kit/icons/run/${variant}.png`,
      metadata: { runtime: {
        ...plagued.metadata.runtime,
        component: 'run-progress-icon',
        variant,
        nativeRole: 'run-progress-icon',
      } },
    });
    assert.deepEqual(gameConditionIconSlot(progress.slot), { component: 'run-progress-icon', variant });
    assert.equal(gameConditionIconMediaIssue(progress), null);
    // A Run-position mark ships trimmed to its own ink, so its square side is its
    // art rather than a shared frame; the unit-ability icons above keep 64x64.
    assert.equal(gameConditionIconMediaIssue({
      ...progress,
      width: 47,
      height: 47,
      metadata: { runtime: { ...progress.metadata.runtime, frameWidth: 47, frameHeight: 47 } },
    }), null);
    assert.match(gameConditionIconMediaIssue({ ...progress, width: 47 }), /square/);
  }
  assert.match(gameConditionIconMediaIssue(gameConditionIcon({ role: 'media' })), /icon role/);
  assert.match(gameConditionIconMediaIssue(gameConditionIcon({ width: 32 })), /64x64/);
  assert.match(gameConditionIconMediaIssue(gameConditionIcon({
    metadata: { runtime: { ...plagued.metadata.runtime, variant: 'pestiferous' } },
  })), /variant/);
  assert.match(gameConditionIconMediaIssue(pestiferous, {
    ...pestiferous.metadata.runtime,
    component: 'unit-ability-icon',
  }), /card-property-icon/);
});

function levelEditorBrushIcon(overrides = {}) {
  const opaqueBounds = { x: 2, y: 2, width: 14, height: 14 };
  return {
    id: '33333333-3333-4333-8333-333333333333',
    slot: 'ui/kit/icons/brush.png',
    domain: 'ui-kit',
    role: 'icon',
    media_type: 'image/png',
    blob_sha256: originalSha,
    width: 18,
    height: 18,
    metadata: {
      runtime: {
        component: LEVEL_EDITOR_BRUSH_ICON_COMPONENT,
        variant: 'brush',
        frameWidth: 18,
        frameHeight: 18,
        frameCount: 1,
        nativeRole: LEVEL_EDITOR_BRUSH_ICON_COMPONENT,
        altText: '',
      },
    },
    native_evidence: {
      schema: 'level-editor-brush-icon-native-v1',
      native1x: true,
      spatialResampling: false,
      sourceWidth: 18,
      sourceHeight: 18,
      sourceSha256: originalSha,
      productionRole: 'inner-brush-tool',
      drawWidth: 18,
      drawHeight: 18,
      generatorOutputWidth: 32,
      generatorOutputHeight: 32,
      transform: 'center-crop-18x18-no-spatial-resampling',
      opaqueBounds,
      opaquePixelCount: 120,
      edgeAlphaMax: 0,
    },
    ...overrides,
  };
}

function strategikonBackground(overrides = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    slot: STRATEGIKON_BACKGROUND_SLOT,
    domain: 'ui-kit',
    role: 'background',
    media_type: 'image/png',
    blob_sha256: STRATEGIKON_BACKGROUND_SHA256,
    width: 688,
    height: 384,
    metadata: {
      runtime: {
        component: STRATEGIKON_BACKGROUND_COMPONENT,
        variant: 'command-archive',
        state: 'owner-approved-cover-scaling-exception',
        frameWidth: 688,
        frameHeight: 384,
        frameCount: 1,
        nativeRole: STRATEGIKON_BACKGROUND_COMPONENT,
        altText: '',
      },
    },
    ...overrides,
  };
}

test('Level Editor Brush projection defaults to one exact native 18px tool role', () => {
  const row = levelEditorBrushIcon();
  assert.equal(levelEditorBrushIconSlot(row.slot), true);
  assert.equal(levelEditorBrushIconSlot('ui/kit/icons/pencil.png'), false);
  assert.equal(levelEditorBrushIconMediaIssue(row), null);
  assert.match(levelEditorBrushIconMediaIssue(levelEditorBrushIcon({ width: 64 })), /18x18/);
  assert.match(levelEditorBrushIconMediaIssue(levelEditorBrushIcon({ role: 'media' })), /icon role/);
  assert.match(levelEditorBrushIconMediaIssue(levelEditorBrushIcon({
    metadata: { runtime: { ...row.metadata.runtime, variant: 'pencil' } },
  })), /variant must be brush/);
  assert.match(levelEditorBrushIconMediaIssue(levelEditorBrushIcon({
    native_evidence: { ...row.native_evidence, opaqueBounds: { x: 1, y: 2, width: 14, height: 14 } },
  })), /two-pixel transparent gutter/);
});

test('Level Editor Brush projection admits only the exact owner-selected Option 01 scaling exception', () => {
  const option01Sha = 'abaf1ab5e8f34531864e4e9e9d52cb15a0e7b944e84a79dea98939013267074a';
  const row = levelEditorBrushIcon({
    blob_sha256: option01Sha,
    width: 64,
    height: 64,
    metadata: {
      runtime: {
        component: LEVEL_EDITOR_BRUSH_ICON_COMPONENT,
        variant: 'brush',
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 1,
        nativeRole: LEVEL_EDITOR_BRUSH_ICON_COMPONENT,
        altText: '',
      },
    },
    native_evidence: {
      schema: LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_EXCEPTION_SCHEMA,
      decision: 'ADR-0337',
      status: 'owner-approved-production-exception',
      native1x: false,
      spatialResampling: true,
      sourceWidth: 64,
      sourceHeight: 64,
      sourceSha256: option01Sha,
      drawWidth: 20,
      drawHeight: 20,
      transform: 'css-background-size-contain-64-to-20',
      opaqueBounds: { x: 4, y: 3, width: 56, height: 58 },
    },
  });
  assert.equal(nativeMediaEvidenceIssue(row), null);
  assert.equal(levelEditorBrushIconMediaIssue(row), null);
  assert.match(levelEditorBrushIconMediaIssue({ ...row, blob_sha256: originalSha }), /exact owner-selected/);
  const surfaceUrl = `http://brush.chess-tactics.localhost/editor/level?brushIconReviewVersion=${row.id}`;
  const proof = {
    schema: LEVEL_EDITOR_BRUSH_ICON_PROOF_SCHEMA,
    renderer: LEVEL_EDITOR_BRUSH_ICON_PROOF_RENDERER,
    surfaceUrl,
    canonicalScale: 1,
    assetLocalScale: 0.3125,
    spatialResampling: true,
    frameWidth: 64,
    frameHeight: 64,
    drawWidth: 20,
    drawHeight: 20,
    opaqueBounds: row.native_evidence.opaqueBounds,
    selectedCandidates: [{ slot: row.slot, versionId: row.id, sha256: row.blob_sha256, rowRevision: 1 }],
    slotSnapshots: [{ slot: row.slot, rowRevision: 0, activeVersionId: null }],
  };
  assert.equal(levelEditorBrushIconOwnerProofIssue(row, proof, surfaceUrl), null);
});

test('Level Editor Brush owner proof binds exact candidate bytes to the exact reviewed editor seat', () => {
  const row = levelEditorBrushIcon();
  const surfaceUrl = `http://brush.chess-tactics.localhost/editor/level?brushIconReviewVersion=${row.id}`;
  const proof = {
    schema: LEVEL_EDITOR_BRUSH_ICON_PROOF_SCHEMA,
    renderer: LEVEL_EDITOR_BRUSH_ICON_PROOF_RENDERER,
    surfaceUrl,
    canonicalScale: 1,
    assetLocalScale: 1,
    spatialResampling: false,
    frameWidth: 18,
    frameHeight: 18,
    drawWidth: 18,
    drawHeight: 18,
    opaqueBounds: row.native_evidence.opaqueBounds,
    selectedCandidates: [{ slot: row.slot, versionId: row.id, sha256: row.blob_sha256, rowRevision: 1 }],
    slotSnapshots: [{ slot: row.slot, rowRevision: 0, activeVersionId: null }],
  };
  assert.equal(levelEditorBrushIconOwnerProofIssue(row, proof, surfaceUrl), null);
  assert.match(levelEditorBrushIconOwnerProofIssue(row, { ...proof, drawWidth: 17 }, surfaceUrl), /exact reviewed tool renderer/);
  assert.match(levelEditorBrushIconOwnerProofIssue(row, {
    ...proof,
    selectedCandidates: [{ ...proof.selectedCandidates[0], sha256: replacementSha }],
  }, surfaceUrl), /candidate bytes/);
  assert.match(levelEditorBrushIconOwnerProofIssue(row, {
    ...proof,
    surfaceUrl: `http://brush.chess-tactics.localhost/studio?brushIconReview=1`,
  }, `http://brush.chess-tactics.localhost/studio?brushIconReview=1`), /real Level Editor/);
});

function strategikonBackgroundProof(row = strategikonBackground()) {
  const surfaceUrl = 'http://sg-bg.chess-tactics.localhost/play/strategikon/enchiridion/units?campaignId=off-c-crown-valoria&levelId=off-l-hold-bridge&strategikonBackgroundReview=1';
  return {
    schema: STRATEGIKON_BACKGROUND_PROOF_SCHEMA,
    renderer: STRATEGIKON_BACKGROUND_PROOF_RENDERER,
    decision: 'ADR-0336',
    surfaceUrl,
    coverScalingApproved: true,
    objectFit: 'cover',
    imageRendering: 'pixelated',
    opacity: 0.68,
    sourceRaster: { width: 688, height: 384, sha256: row.blob_sha256 },
    reviewViewport: { width: 1440, height: 900 },
    selectedCandidates: [{
      slot: row.slot,
      versionId: row.id,
      sha256: row.blob_sha256,
      rowRevision: 1,
    }],
    slotSnapshots: [{ slot: row.slot, rowRevision: 0, activeVersionId: null }],
  };
}

test('Strategikon background projection is closed to the exact ADR-0336 pixels and presentation', () => {
  const row = strategikonBackground();
  assert.equal(strategikonBackgroundSlot(row.slot), true);
  assert.equal(strategikonBackgroundMediaIssue(row), null);
  assert.match(strategikonBackgroundMediaIssue(strategikonBackground({
    blob_sha256: replacementSha,
  })), /exact owner-approved/);
  assert.match(strategikonBackgroundMediaIssue(strategikonBackground({ role: 'media' })), /background role/);
  assert.match(strategikonBackgroundMediaIssue(strategikonBackground({ width: 689 })), /688x384/);
  assert.match(strategikonBackgroundMediaIssue(strategikonBackground({
    metadata: { runtime: { ...row.metadata.runtime, state: 'native' } },
  })), /cover-scaling exception/);
});

test('Strategikon background proof pins the exact approved route, viewport, candidate, and cover treatment', () => {
  const row = strategikonBackground();
  const proof = strategikonBackgroundProof(row);
  assert.equal(strategikonBackgroundOwnerProofIssue(row, proof, proof.surfaceUrl), null);
  assert.match(strategikonBackgroundOwnerProofIssue(row, {
    ...proof,
    coverScalingApproved: false,
  }, proof.surfaceUrl), /cover presentation/);
  assert.match(strategikonBackgroundOwnerProofIssue(row, {
    ...proof,
    reviewViewport: { width: 1280, height: 720 },
  }, proof.surfaceUrl), /1440x900/);
  assert.match(strategikonBackgroundOwnerProofIssue(row, {
    ...proof,
    selectedCandidates: [{ ...proof.selectedCandidates[0], sha256: replacementSha }],
  }, proof.surfaceUrl), /candidate bytes/);
});

function sfxSample(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slot: 'sfx/gold-sell/v0.wav',
    domain: 'sfx',
    role: 'audio',
    media_type: 'audio/wav',
    blob_sha256: originalSha,
    metadata: {
      runtime: {
        component: SFX_SAMPLE_COMPONENT,
        variant: 'gold-sell',
        state: 'one-shot',
        durationMs: 2900,
        loop: false,
      },
    },
    ...overrides,
  };
}

test('SFX projection binds a one-shot take to its sound-set slot', () => {
  const row = sfxSample();
  assert.deepEqual(sfxSampleSlot(row.slot), {
    soundSetKey: 'gold-sell',
    variantIndex: 0,
    extension: 'wav',
  });
  assert.equal(sfxSampleMediaIssue(row), null);
  assert.match(sfxSampleMediaIssue(sfxSample({ role: 'sfx' })), /audio role/);
  assert.match(sfxSampleMediaIssue(sfxSample({ media_type: 'audio/mpeg' })), /slot extension/);
  assert.match(sfxSampleMediaIssue(sfxSample({
    metadata: { runtime: { ...row.metadata.runtime, variant: 'click' } },
  })), /variant/);
  assert.match(sfxSampleMediaIssue(sfxSample({
    metadata: { runtime: { ...row.metadata.runtime, loop: true } },
  })), /loop/);
});

test('SFX review proof pins the decoded exact candidate bytes and slot snapshot', () => {
  const row = sfxSample();
  const surfaceUrl = `http://runs.chess-tactics.localhost/studio?mode=viewer&vk=sfx&sfxReview=${row.id}`;
  const proof = {
    schema: SFX_SAMPLE_PROOF_SCHEMA,
    renderer: SFX_SAMPLE_PROOF_RENDERER,
    surfaceUrl,
    exactByteAudition: true,
    playbackRate: 1,
    decodedAudio: { durationMs: 2900, sampleRate: 48000, channels: 2 },
    selectedCandidates: [{
      slot: row.slot,
      versionId: row.id,
      sha256: row.blob_sha256,
      rowRevision: 1,
    }],
    slotSnapshots: [{ slot: row.slot, rowRevision: 0, activeVersionId: null }],
  };
  assert.equal(sfxSampleOwnerProofIssue(row, proof, surfaceUrl), null);
  assert.match(sfxSampleOwnerProofIssue(row, {
    ...proof,
    decodedAudio: { durationMs: 1000, sampleRate: 48000, channels: 2 },
  }, surfaceUrl), /duration/);
  assert.match(sfxSampleOwnerProofIssue(row, {
    ...proof,
    selectedCandidates: [{ ...proof.selectedCandidates[0], sha256: 'b'.repeat(64) }],
  }, surfaceUrl), /candidate bytes/);
});

test('container-backed readiness requires at least one active critical live slot', () => {
  assert.equal(liveCatalogReadinessIssue({ slots: [] }), null);
  assert.match(liveCatalogReadinessIssue({ slots: [] }, { requireCritical: true }), /no active critical slot/);
  assert.match(liveCatalogReadinessIssue({
    slots: [{ lifecycleState: 'active', availabilityPolicy: 'decorative', media: { sha256: originalSha } }],
  }, { requireCritical: true }), /no active critical slot/);
  assert.equal(liveCatalogReadinessIssue({
    slots: [{ lifecycleState: 'active', availabilityPolicy: 'critical', media: { sha256: originalSha } }],
  }, { requireCritical: true }), null);
});

function predrawn(overrides = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    slot: 'boards/fortress-gate/plate.png',
    domain: 'background',
    role: 'media',
    media_type: 'image/png',
    blob_sha256: originalSha,
    width: 1672,
    height: 941,
    metadata: {
      runtime: {
        component: PREDRAWN_BOARD_COMPONENT,
        variant: 'fortress-gate',
        frameWidth: 1672,
        frameHeight: 941,
        frameCount: 1,
      },
    },
    ...overrides,
  };
}

function predrawnProof(row = predrawn()) {
  const surfaceUrl = 'http://127.0.0.1:5173/editor/level?levelId=off-l-fortress-gate&document=proof-doc';
  const alignment = 'v4;1672,941,1034.223,96.015,1375.402,300.134,611.986,723.847,281.123,532.992;5,11;0,0.2,0.4,0.6,0.8,1;0,0.090909,0.181818,0.272727,0.363636,0.454545,0.545455,0.636364,0.727273,0.818182,0.909091,1;1020.229,112.223,1346.622,295.818,628.558,699.729,302.166,516.133';
  return {
    schema: PREDRAWN_BOARD_PROOF_SCHEMA,
    surfaceUrl,
    renderer: PREDRAWN_BOARD_PROOF_RENDERER,
    canonicalScale: 1,
    assetLocalScale: 1,
    alignmentApplied: true,
    alignment,
    alignmentSha256: createHash('sha256').update(alignment, 'utf8').digest('hex'),
    deterministicProof: true,
    boardSlug: 'fortress-gate',
    levelId: 'off-l-fortress-gate',
    frameWidth: 1672,
    frameHeight: 941,
    previewSha256: row.blob_sha256,
    selectedCandidates: [{
      slot: row.slot,
      versionId: row.id,
      sha256: row.blob_sha256,
      rowRevision: 1,
    }],
    slotSnapshots: [{ slot: row.slot, rowRevision: 0, activeVersionId: null }],
  };
}

test('pre-drawn board projection accepts exact candidate-declared native PNG dimensions', () => {
  const row = predrawn();
  assert.equal(predrawnBoardSlotSlug(row.slot), 'fortress-gate');
  assert.equal(predrawnBoardMediaIssue(row), null);
  assert.match(predrawnBoardMediaIssue(predrawn({ media_type: 'image/webp' })), /image\/png/);
  assert.match(predrawnBoardMediaIssue(predrawn({ height: 940 })), /frame dimensions/);
  assert.match(predrawnBoardMediaIssue(predrawn({ domain: 'terrain' })), /background domain/);
  assert.match(predrawnBoardMediaIssue(predrawn({ role: 'plate' })), /media role/);
  assert.match(predrawnBoardMediaIssue(predrawn({
    metadata: { runtime: { ...row.metadata.runtime, variant: 'another-board' } },
  })), /variant/);
});

test('pre-drawn board owner proof pins the editor level, dimensions, slot, version, and exact bytes', () => {
  const row = predrawn();
  const proof = predrawnProof(row);
  assert.equal(predrawnBoardOwnerProofIssue(row, proof, proof.surfaceUrl), null);
  assert.equal(predrawnBoardAlignmentIssue(proof.alignment, 1672, 941), null);
  assert.match(predrawnBoardOwnerProofIssue(row, {
    ...proof,
    frameHeight: 940,
  }, proof.surfaceUrl), /frame dimensions/);
  assert.match(predrawnBoardOwnerProofIssue(row, {
    ...proof,
    previewSha256: replacementSha,
  }, proof.surfaceUrl), /preview hash/);
  assert.match(predrawnBoardOwnerProofIssue(predrawn({ blob_sha256: null }), {
    ...proof,
    previewSha256: null,
  }, proof.surfaceUrl), /preview hash/);
  assert.match(predrawnBoardOwnerProofIssue(row, {
    ...proof,
    selectedCandidates: [{ ...proof.selectedCandidates[0], sha256: replacementSha }],
  }, proof.surfaceUrl), /candidate bytes/);
  assert.match(predrawnBoardOwnerProofIssue(row, {
    ...proof,
    alignmentSha256: replacementSha,
  }, proof.surfaceUrl), /alignment hash/);
  assert.match(predrawnBoardOwnerProofIssue(row, {
    ...proof,
    surfaceUrl: 'http://127.0.0.1:5173/studio?levelId=off-l-fortress-gate',
  }, 'http://127.0.0.1:5173/studio?levelId=off-l-fortress-gate'), /Level Editor/);
});

test('backend-allocated pre-drawn slot identity is independent of the logical level id', () => {
  const boardSlug = 'ecc0a3cc-a98b-45d4-a8a1-d7388cf36a40';
  const row = predrawn({
    slot: `boards/${boardSlug}/plate.png`,
    metadata: {
      runtime: {
        ...predrawn().metadata.runtime,
        variant: boardSlug,
      },
    },
  });
  const surfaceUrl = 'http://127.0.0.1:5173/editor/level?levelId=off-l-hold-bridge&document=proof-doc';
  const proof = {
    ...predrawnProof(row),
    surfaceUrl,
    boardSlug,
    levelId: 'off-l-hold-bridge',
  };

  assert.equal(predrawnBoardMediaIssue(row), null);
  assert.equal(predrawnBoardOwnerProofIssue(row, proof, surfaceUrl), null);
  assert.match(predrawnBoardMediaIssue({
    ...row,
    metadata: { runtime: { ...row.metadata.runtime, variant: 'hold-bridge' } },
  }), /variant/);
  assert.match(predrawnBoardOwnerProofIssue(row, { ...proof, boardSlug: 'hold-bridge' }, surfaceUrl), /slot slug/);
});


const NUMERAL_SHA = createHash('sha256').update('ataraxia-rung-i').digest('hex');

function numeralRow(overrides = {}) {
  return {
    id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    slot: 'ui/kit/numerals/stone/i.png',
    domain: 'ui-kit',
    role: 'media',
    media_type: 'image/png',
    width: 64,
    height: 64,
    blob_sha256: NUMERAL_SHA,
    metadata: {
      runtime: {
        component: ATARAXIA_NUMERAL_COMPONENT,
        nativeRole: ATARAXIA_NUMERAL_COMPONENT,
        variant: 'i',
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 1,
        altText: 'Ataraxia I',
      },
    },
    ...overrides,
  };
}

function numeralProof(row, overrides = {}) {
  return {
    schema: ATARAXIA_NUMERAL_PROOF_SCHEMA,
    renderer: ATARAXIA_NUMERAL_PROOF_RENDERER,
    surfaceUrl: 'http://localhost:5191/enchiridion/ataraxia',
    reviewedSet: ['ui/kit/numerals/stone/i.png', 'ui/kit/numerals/stone/zero.png'],
    selectedCandidates: [{ slot: row.slot, versionId: row.id, sha256: row.blob_sha256, rowRevision: 1 }],
    slotSnapshots: [{ slot: row.slot, rowRevision: 1, activeVersionId: null }],
    ...overrides,
  };
}

test('Ataraxia rung slots are typed, so the set is not stuck on the ui-kit bridge default', () => {
  assert.deepEqual(ataraxiaNumeralSlot('ui/kit/numerals/stone/viii.png'), { style: 'stone', rung: 'viii' });
  assert.equal(ataraxiaNumeralSlot('ui/kit/icons/bishop.png'), null);
  assert.equal(ataraxiaNumeralSlot(''), null);

  assert.equal(ataraxiaNumeralMediaIssue(numeralRow()), null);
  assert.match(ataraxiaNumeralMediaIssue(numeralRow({ width: 32, height: 32 })), /native 64x64/);
  assert.match(ataraxiaNumeralMediaIssue(numeralRow({ media_type: 'image/webp' })), /image\/png/);
  // The rung a slot names and the rung its metadata claims cannot drift apart.
  assert.match(ataraxiaNumeralMediaIssue(numeralRow({
    metadata: { runtime: { ...numeralRow().metadata.runtime, variant: 'v' } },
  })), /variant must match/);
  assert.match(ataraxiaNumeralMediaIssue(numeralRow({
    metadata: { runtime: { ...numeralRow().metadata.runtime, extra: 1 } },
  })), /unsupported keys: extra/);
});

test('Ataraxia rung review proof pins the reviewed surface, bytes, and whole set', () => {
  const row = numeralRow();
  const surfaceUrl = 'http://localhost:5191/enchiridion/ataraxia';
  assert.equal(ataraxiaNumeralOwnerProofIssue(row, numeralProof(row), surfaceUrl), null);
  // Both hosts wear the mark, so both are legitimate review surfaces.
  const strategikon = 'http://localhost:5191/run/strategikon/enchiridion/ataraxia';
  assert.equal(
    ataraxiaNumeralOwnerProofIssue(row, numeralProof(row, { surfaceUrl: strategikon }), strategikon),
    null,
  );
  // A surface that does not wear the mark cannot stand in for one that does.
  const elsewhere = 'http://localhost:5191/enchiridion/relics';
  assert.match(
    ataraxiaNumeralOwnerProofIssue(row, numeralProof(row, { surfaceUrl: elsewhere }), elsewhere),
    /live Ataraxia reference rows/,
  );
  assert.match(
    ataraxiaNumeralOwnerProofIssue(row, numeralProof(row, { surfaceUrl }), 'http://localhost:5191/studio'),
    /does not match the reviewed surface/,
  );
  // The proof must name the exact reviewed bytes...
  assert.match(ataraxiaNumeralOwnerProofIssue(row, numeralProof(row, {
    selectedCandidates: [{ slot: row.slot, versionId: row.id, sha256: createHash('sha256').update('other').digest('hex') }],
  }), surfaceUrl), /reviewed candidate bytes/);
  // ...and record that the rung was judged as part of a set, not alone.
  assert.match(ataraxiaNumeralOwnerProofIssue(row, numeralProof(row, { reviewedSet: [row.slot] }), surfaceUrl), /whole reviewed rung set/);
  assert.match(ataraxiaNumeralOwnerProofIssue(row, numeralProof(row, { renderer: 'Studio/Whatever' }), surfaceUrl), /reviewed rung renderer/);
});

const wallVersionId = '11111111-1111-4111-8111-111111111111';
const wallSha = 'c'.repeat(64);
const wallFrame = (overrides = {}) => ({
  id: wallVersionId,
  slot: 'tiles/feature/wall-stone-9.png',
  domain: 'terrain',
  role: 'media',
  media_type: 'image/png',
  blob_sha256: wallSha,
  width: WALL_MATERIAL_FRAME_WIDTH,
  height: WALL_MATERIAL_FRAME_HEIGHT,
  metadata: {},
  ...overrides,
});
const wallProof = (row, overrides = {}) => ({
  schema: WALL_MATERIAL_PROOF_SCHEMA,
  renderer: WALL_MATERIAL_PROOF_RENDERER,
  canonicalScale: 1,
  assetLocalScale: 1,
  spatialResampling: false,
  deterministicProof: true,
  frameWidth: WALL_MATERIAL_FRAME_WIDTH,
  frameHeight: WALL_MATERIAL_FRAME_HEIGHT,
  surfaceUrl: 'http://127.0.0.1:5173/studio?cat=walls&vk=wallcandidates',
  mountedSlots: [row.slot],
  selectedCandidates: [{ slot: row.slot, versionId: row.id, sha256: row.blob_sha256, rowRevision: 1 }],
  slotSnapshots: [{ slot: row.slot, rowRevision: 1, activeVersionId: null }],
  ...overrides,
});

test('wall slots name their material and face apart from board tiles', () => {
  assert.deepEqual(wallMaterialSlot('tiles/feature/wall-mossy-1.png'), { material: 'mossy', mask: 1, thumb: false });
  assert.deepEqual(wallMaterialSlot('tiles/feature/wall-mossy-8.png'), { material: 'mossy', mask: 8, thumb: false });
  assert.deepEqual(wallMaterialSlot('tiles/feature/wall-mossy-thumb.png'), { material: 'mossy', mask: null, thumb: true });
  assert.equal(wallMaterialSlot('tiles/feature/wall-mossy-2.png'), null);
  assert.equal(wallMaterialSlot('tiles/surface/grass-0.png'), null);
});

test('ADR-0086 full-height geometry is the wall frame acceptance contract', () => {
  assert.equal(wallMaterialMediaIssue(wallFrame()), null);
  // The exact regression that shipped short walls floating above the board.
  assert.match(wallMaterialMediaIssue(wallFrame({ height: 240 })), /128x336/);
  assert.match(wallMaterialMediaIssue(wallFrame({ width: 96 })), /128x336/);
  assert.match(wallMaterialMediaIssue(wallFrame({ role: 'top' })), /media role/);
  assert.match(wallMaterialMediaIssue(wallFrame({ domain: 'ui-kit' })), /terrain domain/);
  assert.match(wallMaterialMediaIssue(wallFrame({ media_type: 'image/webp' })), /image\/png/);
});

test('wall frames never fall through to the 96x180 board-tile projection', () => {
  // A wall frame carries no terrain top/side role, so without its own typed projection every
  // wall candidate is unacceptable no matter how it is reviewed.
  assert.equal(wallMaterialMediaIssue(wallFrame({ role: 'media' })), null);
  assert.match(wallMaterialMediaIssue(wallFrame({ role: 'side' })), /media role/);
});

test('wall thumbnails are square picker cards under the review role', () => {
  const thumb = wallFrame({ slot: 'tiles/feature/wall-stone-thumb.png', role: 'review', width: 198, height: 198 });
  assert.equal(wallMaterialMediaIssue(thumb), null);
  assert.match(wallMaterialMediaIssue({ ...thumb, height: 107 }), /square/);
  assert.match(wallMaterialMediaIssue({ ...thumb, role: 'media' }), /review role/);
});

test('wall runtime metadata stays optional but must agree with the uploaded frame', () => {
  const runtime = (value) => wallFrame({ metadata: { runtime: value } });
  assert.equal(wallMaterialMediaIssue(runtime({})), null);
  assert.equal(wallMaterialMediaIssue(runtime({
    component: WALL_MATERIAL_COMPONENT,
    variant: 'stone',
    frameWidth: WALL_MATERIAL_FRAME_WIDTH,
    frameHeight: WALL_MATERIAL_FRAME_HEIGHT,
    frameCount: 1,
  })), null);
  assert.match(wallMaterialMediaIssue(runtime({ component: 'terrain-surface' })), /component/);
  assert.match(wallMaterialMediaIssue(runtime({ variant: 'brick' })), /own material/);
  assert.match(wallMaterialMediaIssue(runtime({ frameHeight: 240 })), /frameHeight/);
  assert.match(wallMaterialMediaIssue(runtime({ logicalTerrain: 'stone' })), /unsupported keys/);
});

test('wall review proof must mount the exact candidate on the real board at canonical 1x', () => {
  const row = wallFrame();
  const surfaceUrl = wallProof(row).surfaceUrl;
  assert.equal(wallMaterialOwnerProofIssue(row, wallProof(row), surfaceUrl), null);
  assert.match(wallMaterialOwnerProofIssue(row, wallProof(row, { renderer: 'BoardLabBoard/BoardTerrainLayer' }), surfaceUrl), /canonical 1x/);
  assert.match(wallMaterialOwnerProofIssue(row, wallProof(row, { spatialResampling: true }), surfaceUrl), /canonical 1x/);
  assert.match(wallMaterialOwnerProofIssue(row, wallProof(row, { frameHeight: 240 }), surfaceUrl), /full-height frame geometry/);
  assert.match(wallMaterialOwnerProofIssue(row, wallProof(row, { mountedSlots: [] }), surfaceUrl), /mount this frame/);
  assert.match(
    wallMaterialOwnerProofIssue(row, wallProof(row, { selectedCandidates: [{ slot: row.slot, versionId: row.id, sha256: 'd'.repeat(64), rowRevision: 1 }] }), surfaceUrl),
    /candidate bytes/,
  );
  assert.match(wallMaterialOwnerProofIssue(row, wallProof(row, { slotSnapshots: [] }), surfaceUrl), /snapshot this wall slot/);
});

test('wall review proof only counts from the game-owned Studio surface', () => {
  const row = wallFrame();
  const bespoke = 'http://127.0.0.1:5173/studio/wall-candidates';
  assert.match(wallMaterialOwnerProofIssue(row, wallProof(row, { surfaceUrl: bespoke }), bespoke), /game-owned Studio/);
  const editor = 'http://127.0.0.1:5173/editor/level';
  assert.match(wallMaterialOwnerProofIssue(row, wallProof(row, { surfaceUrl: editor }), editor), /game-owned Studio/);
  const surfaceUrl = wallProof(row).surfaceUrl;
  assert.match(wallMaterialOwnerProofIssue(row, wallProof(row), `${surfaceUrl}&stale=1`), /does not match the reviewed surface/);
});

test('one wall proof covers a whole batch, each candidate pinned to its own slot entry', () => {
  const stone = wallFrame();
  const brick = wallFrame({ id: '22222222-2222-4222-8222-222222222222', slot: 'tiles/feature/wall-brick-1.png', blob_sha256: 'e'.repeat(64) });
  const batch = wallProof(stone, {
    mountedSlots: [stone.slot, brick.slot],
    selectedCandidates: [
      { slot: stone.slot, versionId: stone.id, sha256: stone.blob_sha256, rowRevision: 1 },
      { slot: brick.slot, versionId: brick.id, sha256: brick.blob_sha256, rowRevision: 1 },
    ],
    slotSnapshots: [
      { slot: stone.slot, rowRevision: 1, activeVersionId: null },
      { slot: brick.slot, rowRevision: 1, activeVersionId: null },
    ],
  });
  assert.equal(wallMaterialOwnerProofIssue(stone, batch, batch.surfaceUrl), null);
  assert.equal(wallMaterialOwnerProofIssue(brick, batch, batch.surfaceUrl), null);
  // A candidate absent from the batch cannot ride along on someone else's review.
  const basalt = wallFrame({ id: '33333333-3333-4333-8333-333333333333', slot: 'tiles/feature/wall-basalt-8.png' });
  assert.match(wallMaterialOwnerProofIssue(basalt, batch, batch.surfaceUrl), /candidate bytes/);
});
