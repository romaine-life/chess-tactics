import type { AdminLiveMediaCatalog, AdminLiveMediaSlot, AdminLiveMediaVersion } from '../net/liveMediaAdmin';

export const LEVEL_EDITOR_BRUSH_ICON_SLOT = 'ui/kit/icons/brush.png';
export const BRUSH_ICON_EXPLORATION_OBJECT_ID = '1fc78870-e355-4b1f-8012-7c0193bc8121';
export const LEVEL_EDITOR_BRUSH_ICON_PRODUCTION_STAGE = 'role-native-production';
export const LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_STAGE = 'owner-approved-scaled-production';
export const LEVEL_EDITOR_BRUSH_ICON_OPTION_01_SHA256 = 'abaf1ab5e8f34531864e4e9e9d52cb15a0e7b944e84a79dea98939013267074a';
export const LEVEL_EDITOR_BRUSH_ICON_PROOF_SCHEMA = 'level-editor-brush-icon-exact-byte-proof-v1';
export const LEVEL_EDITOR_BRUSH_ICON_PROOF_RENDERER = 'LevelEditorControlsPanel/inner-brush-tool';

export function brushIconProductionCandidate(
  catalog: AdminLiveMediaCatalog,
  requestedVersionId?: string,
): AdminLiveMediaVersion | null {
  return catalog.versions
    .filter((version) => (
      (!requestedVersionId || version.id === requestedVersionId)
      && version.slot === LEVEL_EDITOR_BRUSH_ICON_SLOT
      && version.status === 'candidate'
      && (
        version.metadata.productionStage === LEVEL_EDITOR_BRUSH_ICON_PRODUCTION_STAGE
        || version.metadata.productionStage === LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_STAGE
      )
      && version.media?.mediaType === 'image/png'
      && (
        (version.media.width === 18 && version.media.height === 18)
        || (
          version.metadata.productionStage === LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_STAGE
          && version.media.width === 64 && version.media.height === 64
          && version.media.sha256 === LEVEL_EDITOR_BRUSH_ICON_OPTION_01_SHA256
        )
      )
    ))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] ?? null;
}

export function levelEditorBrushIconReviewHref(versionId: string): string {
  return `/editor/level?brushIconReviewVersion=${encodeURIComponent(versionId)}`;
}

export function levelEditorBrushIconReviewProof(input: {
  version: AdminLiveMediaVersion;
  slot: AdminLiveMediaSlot;
  surfaceUrl: string;
}): Record<string, unknown> {
  const { version, slot, surfaceUrl } = input;
  const scaledOption01 = version.metadata.productionStage === LEVEL_EDITOR_BRUSH_ICON_SCALED_PRODUCTION_STAGE
    && version.media?.sha256 === LEVEL_EDITOR_BRUSH_ICON_OPTION_01_SHA256;
  return {
    schema: LEVEL_EDITOR_BRUSH_ICON_PROOF_SCHEMA,
    renderer: LEVEL_EDITOR_BRUSH_ICON_PROOF_RENDERER,
    surfaceUrl,
    canonicalScale: 1,
    assetLocalScale: scaledOption01 ? 0.3125 : 1,
    spatialResampling: scaledOption01,
    frameWidth: scaledOption01 ? 64 : 18,
    frameHeight: scaledOption01 ? 64 : 18,
    drawWidth: scaledOption01 ? 20 : 18,
    drawHeight: scaledOption01 ? 20 : 18,
    opaqueBounds: version.nativeEvidence.opaqueBounds,
    selectedCandidates: [{
      slot: LEVEL_EDITOR_BRUSH_ICON_SLOT,
      versionId: version.id,
      sha256: version.media?.sha256,
      rowRevision: version.rowRevision,
    }],
    slotSnapshots: [{
      slot: LEVEL_EDITOR_BRUSH_ICON_SLOT,
      rowRevision: slot.rowRevision,
      activeVersionId: slot.activeVersionId,
    }],
  };
}
