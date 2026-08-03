'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
const {
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
  runShopWrapSlotId,
  sfxSampleMediaIssue,
  sfxSampleOwnerProofIssue,
  sfxSampleSlot,
  strategikonBackgroundMediaIssue,
  strategikonBackgroundOwnerProofIssue,
  strategikonBackgroundSlot,
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
  assert.match(runResourceIconMediaIssue(runResourceIcon({ height: 63 })), /64x64/);
  assert.match(runResourceIconMediaIssue(runResourceIcon({
    metadata: { runtime: { ...row.metadata.runtime, variant: 'favor' } },
  })), /variant/);
  assert.match(runResourceIconMediaIssue(runResourceIcon({
    metadata: { runtime: { ...row.metadata.runtime, altText: 'Gold' } },
  })), /altText/);
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
