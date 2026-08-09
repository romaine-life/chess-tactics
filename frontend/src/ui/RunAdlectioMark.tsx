import type { ReactElement } from 'react';
import { installedUiMediaIfPresent } from './installedUiMedia';

/**
 * The mark for a record THIS Sectio visit admitted — the seat beside Expunctio's
 * "Adlected this visit" line (ADR-0549).
 *
 * The seat is named for what it marks rather than for what it draws, because what it should draw
 * is still an open question: a hand handing over the gold, or a hand taking the card that gold
 * bought. Both audition in this one seat instead of each owning a slot named after its own
 * metaphor, so choosing between them is choosing an image and not a code path.
 *
 * Until a candidate is installed the seat draws NOTHING at all — an empty reserved box would
 * shove the coin beside it sideways for a mark that says nothing yet (ADR-0318). Candidates are
 * auditioned in the real seat through `?adlectioMarkCandidate=<sha256>`, the review seam the live
 * gold icon already uses (ADR-0219); installing binds the role.
 */
const ADLECTIO_MARK_CANDIDATE_QUERY = 'adlectioMarkCandidate';
/** The role `ui/run/sectio/adlectio-mark.png` binds once a candidate is installed. */
const ADLECTIO_MARK_MEDIA_ROLE = 'ui-run-sectio-adlectio-mark-png';
const SHA256 = /^[0-9a-f]{64}$/;

function reviewedAdlectioMarkSrc(): string | null {
  if (typeof window === 'undefined') return null;
  const sha256 = new URLSearchParams(window.location.search)
    .get(ADLECTIO_MARK_CANDIDATE_QUERY)?.trim().toLowerCase();
  return sha256 && SHA256.test(sha256) ? `/api/admin/media/${sha256}` : null;
}

export function runAdlectioMarkUrl(): string | null {
  return reviewedAdlectioMarkSrc() ?? installedUiMediaIfPresent(ADLECTIO_MARK_MEDIA_ROLE);
}

export function RunAdlectioMarkIcon({
  className = '',
  src: override,
}: {
  className?: string;
  /** Review-only: paint exact candidate bytes in the real seat without installing them. */
  src?: string;
}): ReactElement | null {
  const src = override ?? runAdlectioMarkUrl();
  if (!src) return null;
  return (
    <span className={`run-adlectio-mark-icon ${className}`.trim()} aria-hidden="true">
      <img src={src} alt="" draggable={false} />
    </span>
  );
}
