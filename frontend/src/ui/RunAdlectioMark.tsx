import type { ReactElement } from 'react';
import { installedUiMediaIfPresent } from './installedUiMedia';

/**
 * The mark for a record THIS Sectio visit admitted — the line Expunctio prints above a
 * just-admitted formation's fee (ADR-0553).
 *
 * The seat is named for what it marks rather than for what it draws, because what it should draw
 * is still an open question: a hand handing over the gold, or a hand taking the card that gold
 * bought. Both audition in this one seat, so choosing between them is choosing an image and not a
 * code path.
 *
 * Until a candidate is installed the seat draws NOTHING — an empty reserved box would shove the
 * coin beside it sideways for a mark that says nothing yet (ADR-0318). Candidates are auditioned
 * in the Studio's **Adlectio Mark** category, which mounts every one of them in this exact line
 * (ADR-0058): a review surface is a Studio category reached by clicking, never a review parameter
 * bolted onto a player route.
 */
/** The role `ui/run/sectio/adlectio-mark.png` binds once a candidate is installed. */
export const ADLECTIO_MARK_MEDIA_ROLE = 'ui-run-sectio-adlectio-mark-png';
export const ADLECTIO_MARK_SLOT = 'ui/run/sectio/adlectio-mark.png';

export function runAdlectioMarkUrl(): string | null {
  return installedUiMediaIfPresent(ADLECTIO_MARK_MEDIA_ROLE);
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

/**
 * The whole line, so the Studio review mounts the real thing rather than a lookalike: the mark and
 * the words — one component, two seats (ADR-0059).
 *
 * No coin beside it. The coin stood in while the mark was undecided, saying only that gold was
 * involved — which the fee below the line already says. The installed mark is a hand taking the
 * card, which says the thing the coin could not.
 */
export function RunAdlectioMarkLine({ src }: { src?: string }): ReactElement {
  return (
    <span className="run-expunctio-visit-mark">
      <RunAdlectioMarkIcon className="run-expunctio-visit-mark-icon" {...(src === undefined ? {} : { src })} />
      Adlected this Sectio
    </span>
  );
}
