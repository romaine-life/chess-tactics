// Owner review for perimeter wall candidates. Walls live in the terrain domain but carry the
// ADR-0628 full-height frame instead of the 96x180 board-tile projection, so they have their
// own typed proof: mounted on the real barrier renderer, at canonical 1x, beside live terrain.
//
// One proof covers the whole wall batch. The backend pins each candidate to its OWN entry, so
// a candidate that is not mounted on the reviewed board cannot ride along on the batch.
import { WALL_FRAME_GEOMETRY } from '@chess-tactics/board-render';
import type {
  AcceptLiveMediaVersionInput,
  AdminLiveMediaCatalog,
  AdminLiveMediaSlot,
  AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';

export const WALL_MATERIAL_PROOF_SCHEMA = 'wall-material-canonical-board-proof-v1';
export const WALL_MATERIAL_PROOF_RENDERER = 'BoardLabBoard/BoardBarrierSceneLayer';
export const WALL_MATERIAL_COMPONENT = 'wall-material';

/** The N(1)/W(8) faces a wall frame paints, plus the corner that carries both. */
export const WALL_FRAME_MASKS = [1, 8, 9] as const;
export type WallFrameMask = typeof WALL_FRAME_MASKS[number];

export interface WallSlotIdentity {
  material: string;
  mask: WallFrameMask | null;
  thumb: boolean;
}

export interface WallReviewCandidate {
  slot: string;
  identity: WallSlotIdentity;
  version: AdminLiveMediaVersion;
  /** The live slot record the candidate would replace, for compare-and-swap acceptance. */
  slotRecord: AdminLiveMediaSlot;
}

export interface WallReviewBatch {
  candidates: WallReviewCandidate[];
  /** Candidates whose bytes cannot be accepted until an uploader records their provenance. */
  missingProvenance: WallReviewCandidate[];
}

const FRAME_SLOT = /^tiles\/feature\/wall-([a-z][a-z0-9-]{0,63})-(1|8|9)\.png$/;
const THUMB_SLOT = /^tiles\/feature\/wall-([a-z][a-z0-9-]{0,63})-thumb\.png$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** The material and face a wall slot names, or null for any other semantic slot. */
export function wallSlotIdentity(slot: string): WallSlotIdentity | null {
  const frame = FRAME_SLOT.exec(slot);
  if (frame) return { material: frame[1], mask: Number(frame[2]) as WallFrameMask, thumb: false };
  const thumb = THUMB_SLOT.exec(slot);
  return thumb ? { material: thumb[1], mask: null, thumb: true } : null;
}

/** True when a candidate's uploaded bytes already carry the canonical wall geometry. */
export function hasCanonicalWallGeometry(version: AdminLiveMediaVersion, identity: WallSlotIdentity): boolean {
  const media = version.media;
  if (!media) return false;
  if (identity.thumb) return media.width === media.height && (media.width ?? 0) > 0;
  return media.width === WALL_FRAME_GEOMETRY.width && media.height === WALL_FRAME_GEOMETRY.height;
}

/**
 * Every wall slot's newest candidate that already carries the canonical geometry. Selection is
 * geometry-driven rather than keyed to one historical upload label, so a later bake is
 * reviewable without editing this instrument.
 */
export function wallReviewBatch(catalog: AdminLiveMediaCatalog | null): WallReviewBatch {
  if (!catalog) return { candidates: [], missingProvenance: [] };
  const slotRecords = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
  const newestBySlot = new Map<string, AdminLiveMediaVersion>();
  for (const version of catalog.versions) {
    if (!version.slot || version.status !== 'candidate' || !version.media) continue;
    const identity = wallSlotIdentity(version.slot);
    if (!identity || !hasCanonicalWallGeometry(version, identity)) continue;
    const held = newestBySlot.get(version.slot);
    const newer = !held
      || String(version.updatedAt ?? '').localeCompare(String(held.updatedAt ?? '')) > 0
      || (version.updatedAt === held.updatedAt && version.id.localeCompare(held.id) > 0);
    if (newer) newestBySlot.set(version.slot, version);
  }

  const candidates: WallReviewCandidate[] = [];
  for (const [slot, version] of newestBySlot) {
    const identity = wallSlotIdentity(slot);
    const slotRecord = slotRecords.get(slot);
    if (!identity || !slotRecord) continue;
    candidates.push({ slot, identity, version, slotRecord });
  }
  candidates.sort((a, b) => a.slot.localeCompare(b.slot));
  return {
    candidates,
    // Provenance describes how bytes were produced, so it belongs to whoever uploaded them.
    // The reviewer is told which candidates lack it rather than having one invented for them.
    missingProvenance: candidates.filter((candidate) => (
      !isRecord(candidate.version.provenance) || Object.keys(candidate.version.provenance).length === 0
    )),
  };
}

/** Native-1x evidence a candidate is missing, derived from its own uploaded bytes. */
export function wallNativeEvidence(version: AdminLiveMediaVersion): Record<string, unknown> | null {
  const media = version.media;
  if (!media || media.width == null || media.height == null) return null;
  const evidence = version.nativeEvidence;
  const complete = isRecord(evidence)
    && evidence.native1x === true
    && evidence.spatialResampling === false
    && evidence.sourceWidth === media.width
    && evidence.sourceHeight === media.height
    && evidence.sourceSha256 === media.sha256;
  if (complete) return null;
  return {
    native1x: true,
    spatialResampling: false,
    sourceWidth: media.width,
    sourceHeight: media.height,
    sourceSha256: media.sha256,
  };
}

export function wallReviewProofEvidence({
  surfaceUrl,
  candidates,
  mountedSlots,
}: {
  surfaceUrl: string;
  candidates: readonly WallReviewCandidate[];
  /** Frame slots actually painted by the barrier renderer in the reviewed capture. */
  mountedSlots: readonly string[];
}): Record<string, unknown> {
  return {
    schema: WALL_MATERIAL_PROOF_SCHEMA,
    renderer: WALL_MATERIAL_PROOF_RENDERER,
    surfaceUrl,
    canonicalScale: 1,
    assetLocalScale: 1,
    spatialResampling: false,
    deterministicProof: true,
    frameWidth: WALL_FRAME_GEOMETRY.width,
    frameHeight: WALL_FRAME_GEOMETRY.height,
    anchorX: WALL_FRAME_GEOMETRY.anchorX,
    anchorY: WALL_FRAME_GEOMETRY.anchorY,
    mountedSlots: [...mountedSlots].sort(),
    selectedCandidates: candidates.map((candidate) => ({
      slot: candidate.slot,
      versionId: candidate.version.id,
      sha256: candidate.version.media?.sha256,
      rowRevision: candidate.version.rowRevision,
      role: 'top',
    })),
    slotSnapshots: candidates.map((candidate) => ({
      slot: candidate.slotRecord.slot,
      rowRevision: candidate.slotRecord.rowRevision,
      activeVersionId: candidate.slotRecord.activeVersionId,
      lifecycleState: candidate.slotRecord.lifecycleState,
    })),
  };
}

export function wallAcceptanceItems(candidates: readonly WallReviewCandidate[]): AcceptLiveMediaVersionInput[] {
  return candidates.map((candidate) => ({
    id: candidate.version.id,
    expectedRevision: candidate.version.rowRevision,
    expectedSlotRevision: candidate.slotRecord.rowRevision,
    expectedActiveVersionId: candidate.slotRecord.activeVersionId,
  }));
}

/** A review is spent once the reviewed bytes or the slot pointer it was taken against move. */
export function isWallReviewCurrent(candidate: WallReviewCandidate): boolean {
  const evidence = candidate.version.reviewEvidence;
  if (
    !isRecord(evidence) || evidence.approved !== true
    || evidence.contentSha256 !== candidate.version.media?.sha256
  ) return false;
  const proof = isRecord(evidence.evidence) ? evidence.evidence : null;
  if (!proof || proof.schema !== WALL_MATERIAL_PROOF_SCHEMA) return false;
  const snapshots = Array.isArray(proof.slotSnapshots) ? proof.slotSnapshots : [];
  const snapshot = snapshots.find((entry) => isRecord(entry) && entry.slot === candidate.slot);
  return Boolean(
    isRecord(snapshot)
    && snapshot.rowRevision === candidate.slotRecord.rowRevision
    && (snapshot.activeVersionId ?? null) === candidate.slotRecord.activeVersionId,
  );
}
