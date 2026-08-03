import type { ReactElement } from 'react';
import { installedUiMediaIfPresent } from '../installedUiMedia';

/**
 * The repeatable Run ideas the persistent title bar names on every Run screen.
 * Each one owns its own typed `run-progress-icon` role, so the runtime never
 * substitutes one for another, and never borrows a unit-ability or card-property
 * glyph to stand in for a Run position.
 */
export type RunProgressIconVariant = 'ataraxia' | 'conflict' | 'battle';

const RUN_PROGRESS_MEDIA_ROLE: Readonly<Record<RunProgressIconVariant, string>> = Object.freeze({
  ataraxia: 'ui-kit-icons-run-ataraxia-png',
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
