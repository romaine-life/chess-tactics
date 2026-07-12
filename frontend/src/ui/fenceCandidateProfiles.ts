import type { FenceMaterial } from '../core/featureAutotile';

const ARCHIVE_ROOT = '/assets/tiles/feature/candidates/2026-07-10';
const REALIGNMENT_ROOT = '/assets/tiles/feature/candidates/2026-07-10-realignment';

export interface FenceCandidateProfile {
  id: string;
  label: string;
  material: FenceMaterial;
  status: 'native-pass' | 'native-miss' | 'mixed' | 'calibration' | 'rejected';
  statusLabel: string;
  note: string;
  railE: string;
  railS: string;
  /** Omitted for an intentionally rail-only kit. */
  post?: string;
}

export interface FenceArtKit extends FenceCandidateProfile {
  category: 'candidate' | 'archived';
  thumb: string;
}

/** Active judgment set. Archived 2026-07-10 evidence stays out of this list and the cycle. */
export const FENCE_CANDIDATE_PROFILES: readonly FenceCandidateProfile[] = [
  {
    id: 'pixellab-stone-rail-r2',
    label: 'PixelLab · stone rail',
    material: 'stone',
    status: 'native-pass',
    statusLabel: 'Accepted · rail only',
    note: 'Owner-accepted frozen rail for the future bishop-passable fence · intentionally has no post · standard-edge projection not claimed',
    railE: `${ARCHIVE_ROOT}/pixellab-stone-rail-e.png`,
    railS: `${ARCHIVE_ROOT}/pixellab-stone-rail-s.png`,
  },
  {
    id: 'pixellab-wood-canonical-r2',
    label: 'PixelLab · wood canonical',
    material: 'wood',
    status: 'mixed',
    statusLabel: 'Native projection trial',
    note: 'New native-projection rails with the prior 12×28 post · board review pending',
    railE: `${REALIGNMENT_ROOT}/pixellab-wood-canonical-r2-rail-e.png`,
    railS: `${REALIGNMENT_ROOT}/pixellab-wood-canonical-r2-rail-s.png`,
    post: `${ARCHIVE_ROOT}/pixellab-wood-post.png`,
  },
  {
    id: 'codex-wood-canonical-r2',
    label: 'Codex · wood canonical',
    material: 'wood',
    status: 'calibration',
    statusLabel: 'Corrected calibration only',
    note: 'Canonical projection corrected with LANCZOS · non-production calibration under ADR-0076',
    railE: `${REALIGNMENT_ROOT}/codex-wood-canonical-r2-rail-e.png`,
    railS: `${REALIGNMENT_ROOT}/codex-wood-canonical-r2-rail-s.png`,
    post: `${REALIGNMENT_ROOT}/codex-wood-canonical-r2-post.png`,
  },
  {
    id: 'codex-stone-canonical-r2',
    label: 'Codex · stone canonical',
    material: 'stone',
    status: 'calibration',
    statusLabel: 'Corrected calibration only',
    note: 'Canonical projection corrected with LANCZOS · non-production calibration under ADR-0076',
    railE: `${REALIGNMENT_ROOT}/codex-stone-canonical-r2-rail-e.png`,
    railS: `${REALIGNMENT_ROOT}/codex-stone-canonical-r2-rail-s.png`,
    post: `${REALIGNMENT_ROOT}/codex-stone-canonical-r2-post.png`,
  },
] as const;

/** Historical evidence remains addressable by its original deep-link id, but is not cycled. */
export const FENCE_ARCHIVED_CANDIDATE_PROFILES: readonly FenceCandidateProfile[] = [
  {
    id: 'blender-stone',
    label: 'Blender · stone',
    material: 'stone',
    status: 'rejected',
    statusLabel: 'Archived · rejected',
    note: 'Native-size render rejected for its noisy photoscan/shader read',
    railE: `${ARCHIVE_ROOT}/blender-stone-rail-e.png`,
    railS: `${ARCHIVE_ROOT}/blender-stone-rail-s.png`,
    post: `${ARCHIVE_ROOT}/blender-stone-post.png`,
  },
  {
    id: 'pixellab-wood',
    label: 'PixelLab · wood',
    material: 'wood',
    status: 'rejected',
    statusLabel: 'Archived · superseded',
    note: 'Original 40 px rail and 12×28 post footprint-miss evidence',
    railE: `${ARCHIVE_ROOT}/pixellab-wood-rail-e.png`,
    railS: `${ARCHIVE_ROOT}/pixellab-wood-rail-s.png`,
    post: `${ARCHIVE_ROOT}/pixellab-wood-post.png`,
  },
  {
    id: 'pixellab-stone',
    label: 'PixelLab · stone',
    material: 'stone',
    status: 'rejected',
    statusLabel: 'Archived · post rejected',
    note: 'Frozen rail retained; original oversized post kept only as review evidence',
    railE: `${ARCHIVE_ROOT}/pixellab-stone-rail-e.png`,
    railS: `${ARCHIVE_ROOT}/pixellab-stone-rail-s.png`,
    post: `${ARCHIVE_ROOT}/pixellab-stone-post.png`,
  },
  {
    id: 'codex-wood',
    label: 'Codex · wood',
    material: 'wood',
    status: 'calibration',
    statusLabel: 'Archived calibration',
    note: 'Original high-resolution concept reduction · never promotable',
    railE: `${ARCHIVE_ROOT}/codex-wood-rail-e.png`,
    railS: `${ARCHIVE_ROOT}/codex-wood-rail-s.png`,
    post: `${ARCHIVE_ROOT}/codex-wood-post.png`,
  },
  {
    id: 'codex-stone',
    label: 'Codex · stone',
    material: 'stone',
    status: 'calibration',
    statusLabel: 'Archived calibration',
    note: 'Original high-resolution concept reduction · never promotable',
    railE: `${ARCHIVE_ROOT}/codex-stone-rail-e.png`,
    railS: `${ARCHIVE_ROOT}/codex-stone-rail-s.png`,
    post: `${ARCHIVE_ROOT}/codex-stone-post.png`,
  },
] as const;

export const FENCE_CANDIDATE_PROFILE_REGISTRY: readonly FenceCandidateProfile[] = [
  ...FENCE_CANDIDATE_PROFILES,
  ...FENCE_ARCHIVED_CANDIDATE_PROFILES,
];

export const FENCE_ART_KITS: readonly FenceArtKit[] = [
  ...FENCE_CANDIDATE_PROFILES.map((profile): FenceArtKit => ({
    ...profile,
    category: 'candidate',
    thumb: profile.railE,
  })),
] as const;

export const FENCE_ARCHIVED_ART_KITS: readonly FenceArtKit[] = FENCE_ARCHIVED_CANDIDATE_PROFILES.map(
  (profile): FenceArtKit => ({
    ...profile,
    category: 'archived',
    thumb: profile.railE,
  }),
);

/** Full addressable registry. Only FENCE_ART_KITS is offered by normal selection and cycling. */
export const FENCE_ART_KIT_REGISTRY: readonly FenceArtKit[] = [
  ...FENCE_ART_KITS,
  ...FENCE_ARCHIVED_ART_KITS,
];

export function fenceCandidateProfile(id: string): FenceCandidateProfile | undefined {
  return FENCE_CANDIDATE_PROFILE_REGISTRY.find((profile) => profile.id === id);
}

export function fenceArtKit(id: string | null | undefined): FenceArtKit | undefined {
  return FENCE_ART_KIT_REGISTRY.find((kit) => kit.id === id);
}

export function cycleFenceArtKit(id: string, delta: -1 | 1): FenceArtKit {
  const index = FENCE_ART_KITS.findIndex((kit) => kit.id === id);
  if (index < 0) return delta > 0 ? FENCE_ART_KITS[0] : FENCE_ART_KITS[FENCE_ART_KITS.length - 1];
  return FENCE_ART_KITS[(index + delta + FENCE_ART_KITS.length) % FENCE_ART_KITS.length];
}
