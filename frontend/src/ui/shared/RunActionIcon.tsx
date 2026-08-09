import type { ReactElement } from 'react';
import { installedUiMediaIfPresent } from '../installedUiMedia';

/**
 * The mark of one Run card ACTION, drawn on the control that performs it.
 *
 * Athetize is the founding member: the transitive verb ADR-0443 gave the
 * card-level act inside Expunctio. The workspace already owns the noun, so the
 * mark belongs to the button, not to the screen — it says what pressing this
 * does, in the family the board actions (move, attack, capture, defend) are
 * already drawn in.
 */
export type RunActionIconVariant = 'athetize';

/** The `app-ui` media role each action's mark resolves through. ONE lookup, so a
 *  second seat for the same action cannot answer to different art (ADR-0059). */
export const RUN_ACTION_MEDIA_ROLE: Readonly<Record<RunActionIconVariant, string>> = Object.freeze({
  athetize: 'ui-kit-icons-game-athetize-png',
});

/** The live-media slot behind each role, named for review and installation. */
export const RUN_ACTION_ICON_SLOT: Readonly<Record<RunActionIconVariant, string>> = Object.freeze({
  athetize: 'ui/kit/icons/game/athetize.png',
});

const SHA256 = /^[0-9a-f]{64}$/;

/**
 * The exact candidate an owner review is auditioning in the real control, read
 * from `?<variant>Candidate=<sha256>`. Reviewing never installs anything; the
 * accepted role stays the runtime authority the moment the parameter is
 * dropped. Same review seam the live gold icon uses (ADR-0219).
 */
function reviewedCandidateSrc(variant: RunActionIconVariant): string | null {
  if (typeof window === 'undefined') return null;
  const sha256 = new URLSearchParams(window.location.search)
    .get(`${variant}Candidate`)?.trim().toLowerCase();
  return sha256 && SHA256.test(sha256) ? `/api/admin/media/${sha256}` : null;
}

export function runActionIconUrl(variant: RunActionIconVariant): string | null {
  return reviewedCandidateSrc(variant) ?? installedUiMediaIfPresent(RUN_ACTION_MEDIA_ROLE[variant]);
}

/**
 * The shared action-mark seat. The seat keeps its geometry whether or not the
 * variant's icon decision exists yet, so installing one later cannot move the
 * label beside it — and a seat with no decision is reserved rather than
 * fail-closed (ADR-0318).
 */
export function RunActionIcon({
  variant,
  className = '',
  src,
}: {
  variant: RunActionIconVariant;
  className?: string;
  src?: string;
}): ReactElement {
  const resolved = src ?? runActionIconUrl(variant);
  return (
    <span
      className={`run-action-icon${resolved ? '' : ' is-unavailable'} ${className}`.trim()}
      data-run-action-icon={variant}
      aria-hidden="true"
    >
      {resolved ? <img src={resolved} alt="" draggable={false} /> : null}
    </span>
  );
}
