import type { AdminLiveMediaCatalog, AdminLiveMediaVersion } from '../net/liveMediaAdmin';

// Grouping and seating rules for the prop candidate board. Kept out of the component so the
// rules that decide what is reviewable — and how an unseated drawing is placed on a tile — are
// testable without mounting a board.

/** The live-media slots one prop's artwork occupies. A flat-contact prop draws one image
 *  through two depth halves, so a candidate is only complete when both carry the same bytes. */
export function propCandidateSlots(propId: string): string[] {
  return [`props/${propId}/back.png`, `props/${propId}/front.png`];
}

/** The single slot a prop's one-shot impact sheet occupies. Unlike still art it is one strip,
 *  not a split pair, so a candidate is complete on its own. */
export function propImpactSlots(propId: string): string[] {
  return [`props/${propId}/impact.png`];
}

export interface PropCandidateGroup {
  /** Stable identity for one candidate across its half slots — its content hash. */
  key: string;
  label: string;
  /** Authenticated URL for the candidate bytes, used for both halves of the preview. */
  previewUrl: string;
  sha256: string;
  /** Every staged version carrying these bytes: one per half slot. */
  versions: AdminLiveMediaVersion[];
  /** True once the owner has approved these exact bytes on every half. */
  reviewed: boolean;
}

function reviewedForBytes(version: AdminLiveMediaVersion): boolean {
  const evidence = version.reviewEvidence;
  return Boolean(
    version.media
    && evidence.approved === true
    && evidence.contentSha256 === version.media.sha256,
  );
}

/**
 * Staged candidates for one prop, grouped by content hash so the two half slots that share an
 * image are reviewed and installed as one thing rather than as two unrelated pictures.
 */
export function propCandidateGroups(
  catalog: AdminLiveMediaCatalog,
  propId: string,
  slotsFor: (id: string) => string[] = propCandidateSlots,
): PropCandidateGroup[] {
  const slots = new Set(slotsFor(propId));
  const byHash = new Map<string, PropCandidateGroup>();
  for (const version of catalog.versions) {
    if (!version.slot || !slots.has(version.slot)) continue;
    if (version.status !== 'candidate' || !version.media?.url || !version.media.sha256) continue;
    const existing = byHash.get(version.media.sha256);
    if (existing) {
      existing.versions.push(version);
      existing.reviewed = existing.reviewed && reviewedForBytes(version);
      continue;
    }
    byHash.set(version.media.sha256, {
      key: version.media.sha256,
      label: version.label || version.media.sha256.slice(0, 8),
      previewUrl: version.media.url,
      sha256: version.media.sha256,
      versions: [version],
      reviewed: reviewedForBytes(version),
    });
  }
  // Only complete candidates are offered: a hash present on one half but not the other would
  // install a prop whose front and back disagree.
  return [...byHash.values()]
    .filter((group) => group.versions.length === slots.size)
    .sort((left, right) => left.label.localeCompare(right.label));
}

/** Props that currently have something staged to look at. */
export function propsWithCandidates(catalog: AdminLiveMediaCatalog): string[] {
  const ids = new Set<string>();
  for (const version of catalog.versions) {
    if (version.status !== 'candidate' || !version.slot || !version.media) continue;
    const match = /^props\/([a-z0-9-]+)\/(back|front)\.png$/.exec(version.slot);
    if (match) ids.add(match[1]);
  }
  return [...ids].sort();
}

export interface PropCandidateSeat {
  key: string;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  scale: number;
}

/**
 * Where an un-installed drawing meets the ground, measured from its own pixels: the contact
 * point is the horizontal centre of its lowest painted rows, and the scale normalizes its widest
 * painted row to the installed art's on-board width. Without the normalization a 56px candidate
 * merely looks bolder than a 40px one and the comparison is about size, not shape.
 */
export function seatFromAlpha(
  key: string,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  targetWidth: number,
): PropCandidateSeat {
  let widest = 0;
  let lastRow = 0;
  const spans: Array<{ y: number; first: number; last: number }> = [];
  for (let y = 0; y < height; y += 1) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] > 24) { if (first < 0) first = x; last = x; }
    }
    if (first >= 0) {
      spans.push({ y, first, last });
      widest = Math.max(widest, last - first + 1);
      lastRow = y;
    }
  }
  const bottom = spans.filter((row) => row.y > lastRow - 4);
  const first = bottom.length ? Math.min(...bottom.map((row) => row.first)) : 0;
  const last = bottom.length ? Math.max(...bottom.map((row) => row.last)) : width;
  return {
    key,
    width,
    height,
    anchorX: Math.round((first + last) / 2),
    anchorY: lastRow,
    scale: widest > 0 ? Number((targetWidth / widest).toFixed(3)) : 1,
  };
}

/** Decode one candidate and measure its seat. Browser-only; the measurement itself is pure. */
export async function candidateSeat(
  group: PropCandidateGroup,
  targetWidth: number,
): Promise<PropCandidateSeat> {
  const image = new Image();
  image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`${group.label} could not load its authenticated media URL.`));
    image.src = group.previewUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('candidate measurement needs a 2d context');
  context.drawImage(image, 0, 0);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return seatFromAlpha(group.key, data, canvas.width, canvas.height, targetWidth);
}
