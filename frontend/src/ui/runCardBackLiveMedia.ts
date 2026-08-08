import type {
  AcceptLiveMediaVersionInput,
  AdminLiveMediaCatalog,
  AdminLiveMediaSlot,
  AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { RUN_CARD_BACK_SLOT } from './RunCardBack';
import { RUN_CARD_BACK_SLOT_PREFIX } from '../settings/runCardBack';

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

/** Every slot this surface can review: the universal fallback and each offered back (ADR-0524). */
function isCardBackSlot(slot: string): boolean {
  return slot === RUN_CARD_BACK_SLOT || slot.startsWith(RUN_CARD_BACK_SLOT_PREFIX);
}

export function runCardBackSlotRow(
  catalog: AdminLiveMediaCatalog,
  slot: string = RUN_CARD_BACK_SLOT,
): AdminLiveMediaSlot | null {
  return catalog.slots.find((candidate) => candidate.slot === slot) ?? null;
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
 * What the surface opens on when the address names nothing: the newest candidate
 * if one is waiting, otherwise the published back. Landing on the published card
 * alone would show the reviewer the card they already have and nothing to judge
 * it against, which is the entire reason this screen exists.
 */
export function runCardBackDefaultSelection(
  catalog: AdminLiveMediaCatalog,
): RunCardBackSelection | null {
  // Family-wide, like the candidate list: a candidate for an offered back is as
  // reviewable as one for the universal fallback, so the slot is read off the
  // version that matched rather than assumed (ADR-0524).
  const newestCandidate = catalog.versions
    .filter((row) => typeof row.slot === 'string' && isCardBackSlot(row.slot)
      && row.status === 'candidate' && Boolean(row.media))
    .slice()
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0] ?? null;
  const slot = newestCandidate?.slot ? runCardBackSlotRow(catalog, newestCandidate.slot) : null;
  return newestCandidate && slot
    ? { version: newestCandidate, slot }
    : runCardBackPublished(catalog);
}

/**
 * The card under review: the one the address names, or the default above. The
 * component canonicalizes the address onto whatever this returns, because the
 * acceptance gate reads the reviewed bytes out of the URL — a surface showing a
 * candidate the address does not name cannot have its approval accepted.
 */
export function runCardBackSelection(
  catalog: AdminLiveMediaCatalog,
  search: URLSearchParams,
): RunCardBackSelection | null {
  const requestedSha = runCardBackRequestedSha(search);
  if (!requestedSha) return runCardBackDefaultSelection(catalog);
  // Searched across the whole family, then the slot is read off the version that matched. The
  // address already names exact bytes, and those bytes belong to exactly one row — so a candidate
  // for any offered back is reviewable at the same address shape, with no extra parameter.
  const version = catalog.versions.find((candidate) => (
    typeof candidate.slot === 'string' && isCardBackSlot(candidate.slot)
    && candidate.media?.sha256 === requestedSha
    && (candidate.status === 'candidate' || candidate.status === 'accepted')
  )) ?? null;
  const slot = version?.slot ? runCardBackSlotRow(catalog, version.slot) : null;
  if (!version || !slot) return null;
  if (version.status === 'accepted' && version.id !== slot.activeVersionId) return null;
  return { version, slot };
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
  const activeBySlot = new Map(catalog.slots.map((row) => [row.slot, row.activeVersionId]));
  const rows = catalog.versions
    .filter((candidate) => typeof candidate.slot === 'string'
      && isCardBackSlot(candidate.slot) && Boolean(candidate.media))
    .slice()
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
  const groups: RunCardBackCandidateGroup[] = [];
  const candidates = rows.filter((row) => row.status === 'candidate');
  const published = rows.filter((row) => row.status === 'accepted'
    && row.id === activeBySlot.get(row.slot as string));
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

/**
 * The same address, but keeping whatever Studio state the page already carries.
 * Used in-page so arriving from the catalog does not throw away the surrounding
 * Studio route while still naming the reviewed bytes.
 */
export function runCardBackReviewAddress(sha256: string, currentSearch: string): string {
  const search = new URLSearchParams(currentSearch);
  search.set('mode', 'viewer');
  search.set('vk', 'cardlayout');
  search.set('cardSide', 'back');
  search.set('backCandidate', sha256);
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
    // These describe the reviewed ASSET, not how large it was drawn: the stored
    // bytes are the canonical 1x raster with no resampling applied to produce
    // them. The sibling rarity-frame proof asserts the same values while drawing
    // its specimens at 210px.
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
