import type { ReactElement } from 'react';
import { installedUiMediaIfPresent } from '../installedUiMedia';

/**
 * The Run's position within its War, as the persistent title bar names it. Each
 * one owns its own typed `run-progress-icon` role, so the runtime never
 * substitutes one for another, and never borrows a unit-ability or card-property
 * glyph to stand in for a Run position.
 *
 * Ataraxia's emblem is here too, but it does not carry the tier: the carved rung
 * numeral beside it does (ADR-0363). The emblem says WHICH ladder that rung
 * belongs to, which a bare numeral in a bar with no heading cannot.
 */
export type RunProgressIconVariant = 'ataraxia' | 'conflict' | 'battle';

/**
 * Exported because Ataraxia's emblem is ONE decision with two seats: this title-bar
 * measure and the Enchiridion rail's Ataraxia tab. The rail used to name the shared
 * kit objective flag — the same glyph Start, zones and the Skirmish HUD paint — so the
 * ladder answered to a different symbol in the reference than on the bar. Both seats
 * now read this record, and neither can drift without the other (ADR-0059).
 */
export const RUN_PROGRESS_MEDIA_ROLE: Readonly<Record<RunProgressIconVariant, string>> = Object.freeze({
  ataraxia: 'ui-kit-icons-run-ataraxia-mark-png',
  conflict: 'ui-kit-icons-run-conflict-png',
  battle: 'ui-kit-icons-run-battle-png',
});

const SHA256 = /^[0-9a-f]{64}$/;

/**
 * The exact candidate an owner review is auditioning in the real seat, read from
 * `?<variant>Candidate=<sha256>`. Reviewing never installs anything; the accepted
 * role stays the runtime authority the moment the parameter is dropped. Same
 * review seam the live gold icon uses (ADR-0219).
 */
function reviewedCandidateSrc(variant: RunProgressIconVariant): string | null {
  if (typeof window === 'undefined') return null;
  const sha256 = new URLSearchParams(window.location.search)
    .get(`${variant}Candidate`)?.trim().toLowerCase();
  return sha256 && SHA256.test(sha256) ? `/api/admin/media/${sha256}` : null;
}

export function runProgressIconUrl(variant: RunProgressIconVariant): string | null {
  return reviewedCandidateSrc(variant) ?? installedUiMediaIfPresent(RUN_PROGRESS_MEDIA_ROLE[variant]);
}

/**
 * The shared compact Run-position icon seat. The seat keeps its geometry whether
 * or not the variant's icon decision exists yet, so installing one later cannot
 * move the labels beside it.
 */
export function RunProgressIcon({
  variant,
  className = '',
  src,
}: {
  variant: RunProgressIconVariant;
  className?: string;
  src?: string;
}): ReactElement {
  const resolved = src ?? runProgressIconUrl(variant);
  return (
    <span
      className={`run-progress-icon${resolved ? '' : ' is-unavailable'} ${className}`.trim()}
      data-run-progress-icon={variant}
      aria-hidden="true"
    >
      {resolved ? <img src={resolved} alt="" draggable={false} /> : null}
    </span>
  );
}
