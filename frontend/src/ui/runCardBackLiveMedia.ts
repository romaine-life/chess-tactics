import type {
  AcceptLiveMediaVersionInput,
  AdminLiveMediaCatalog,
  AdminLiveMediaSlot,
  AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { RUN_CARD_BACK_SLOT } from './RunCardBack';

/**
 * The Card Layout review surface for the universal face-down card.
 *
 * The backend already refuses to accept a card back without an owner proof
 * captured here (`liveMediaPolicy.runCardBackOwnerProofIssue`), and it pins the
 * exact address that proof must name. These helpers are the one place that
 * address is built, so the surface the owner reviews on and the surface the
 * proof claims cannot drift apart.
 */
export const RUN_CARD_BACK_PROOF_SCHEMA = 'run-card-back-card-layout-proof-v1';
export const RUN_CARD_BACK_PROOF_RENDERER = 'RunCardBack/CardLayout';

/** The back is one complete card printed at the same native raster as every face. */
export const RUN_CARD_BACK_NATIVE_WIDTH = 1060;
export const RUN_CARD_BACK_NATIVE_HEIGHT = 1484;

const SHA256 = /^[0-9a-f]{64}$/;

export type RunCardBackSelection = Readonly<{
  version: AdminLiveMediaVersion;
  slot: AdminLiveMediaSlot;
}>;

export function runCardBackRequestedSha(search: URLSearchParams): string | null {
  const value = search.get('backCandidate');
  return value && SHA256.test(value) ? value : null;
}

export function runCardBackSlotRow(catalog: AdminLiveMediaCatalog): AdminLiveMediaSlot | null {
  return catalog.slots.find((candidate) => candidate.slot === RUN_CARD_BACK_SLOT) ?? null;
}

/** The bytes the game is serving right now. */
export function runCardBackPublished(catalog: AdminLiveMediaCatalog): RunCardBackSelection | null {
  const slot = runCardBackSlotRow(catalog);
  if (!slot) return null;
  const version = catalog.versions.find((candidate) => (
    candidate.slot === RUN_CARD_BACK_SLOT
    && candidate.id === slot.activeVersionId
    && candidate.status === 'accepted'
    && Boolean(candidate.media)
  )) ?? null;
  return version ? { version, slot } : null;
}

/**
 * The card under review: the requested candidate when the address names one,
 * otherwise the published back so the surface always has something to show.
 */
export function runCardBackSelection(
  catalog: AdminLiveMediaCatalog,
  search: URLSearchParams,
): RunCardBackSelection | null {
  const slot = runCardBackSlotRow(catalog);
  if (!slot) return null;
  const requestedSha = runCardBackRequestedSha(search);
  if (!requestedSha) return runCardBackPublished(catalog);
  const version = catalog.versions.find((candidate) => (
    candidate.slot === RUN_CARD_BACK_SLOT
    && candidate.media?.sha256 === requestedSha
    && (candidate.status === 'candidate'
      || (candidate.status === 'accepted' && candidate.id === slot.activeVersionId))
  )) ?? null;
  return version ? { version, slot } : null;
}

export type RunCardBackCandidateGroup = Readonly<{
  key: 'candidate' | 'published';
  label: string;
  note: string;
  versions: readonly AdminLiveMediaVersion[];
}>;

/**
 * Everything reviewable for this slot, newest first. Candidates come first
 * because they are the only rows an approval can act on.
 */
export function runCardBackCandidateGroups(
  catalog: AdminLiveMediaCatalog,
): readonly RunCardBackCandidateGroup[] {
  const slot = runCardBackSlotRow(catalog);
  const rows = catalog.versions
    .filter((candidate) => candidate.slot === RUN_CARD_BACK_SLOT && Boolean(candidate.media))
    .slice()
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const groups: RunCardBackCandidateGroup[] = [];
  const candidates = rows.filter((row) => row.status === 'candidate');
  const published = rows.filter((row) => row.status === 'accepted' && row.id === slot?.activeVersionId);
  if (candidates.length) {
    groups.push({
      key: 'candidate',
      label: 'Awaiting review',
      note: `${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`,
      versions: candidates,
    });
  }
  if (published.length) {
    groups.push({ key: 'published', label: 'Published', note: 'Serving now', versions: published });
  }
  return groups;
}

/**
 * The address the acceptance gate demands, and the one the surface actually
 * runs at. Built from the reviewed bytes so the two can never disagree.
 */
export function runCardBackReviewHref(sha256?: string | null): string {
  const search = new URLSearchParams({ mode: 'viewer', vk: 'cardlayout', cardSide: 'back' });
  if (sha256 && SHA256.test(sha256)) search.set('backCandidate', sha256);
  return `/studio?${search.toString()}`;
}

export function runCardBackReviewProof(input: {
  version: AdminLiveMediaVersion;
  slot: AdminLiveMediaSlot;
  surfaceUrl: string;
}): Record<string, unknown> {
  const { version, slot, surfaceUrl } = input;
  return {
    schema: RUN_CARD_BACK_PROOF_SCHEMA,
    renderer: RUN_CARD_BACK_PROOF_RENDERER,
    surfaceUrl,
    // The surface prints both cards at their decoded native raster, so the
    // reviewed pixels are the stored pixels rather than a scaled preview.
    canonicalScale: 1,
    assetLocalScale: 1,
    spatialResampling: false,
    decodedNativeRaster: { width: RUN_CARD_BACK_NATIVE_WIDTH, height: RUN_CARD_BACK_NATIVE_HEIGHT },
    selectedCandidates: [{
      slot: slot.slot,
      versionId: version.id,
      sha256: version.media?.sha256,
      rowRevision: version.rowRevision,
    }],
    slotSnapshots: [{
      slot: slot.slot,
      rowRevision: slot.rowRevision,
      activeVersionId: slot.activeVersionId,
    }],
  };
}

export function runCardBackAcceptanceItem(
  reviewed: AdminLiveMediaVersion,
  slot: AdminLiveMediaSlot,
): AcceptLiveMediaVersionInput {
  return {
    id: reviewed.id,
    expectedRevision: reviewed.rowRevision,
    expectedSlotRevision: slot.rowRevision,
    expectedActiveVersionId: slot.activeVersionId,
  };
}
