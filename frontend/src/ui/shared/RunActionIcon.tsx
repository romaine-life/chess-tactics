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

/**
 * A Run route resolves the INSTALLED role and nothing else. There is deliberately no
 * `?athetizeCandidate=<sha256>` seam here: a dev surface is a Studio category reachable
 * by clicking, never review state smuggled onto a player route (ADR-0058). Candidates
 * are judged in Studio → Action Marks, which mounts every one of them at once in this
 * same component; `src` is how that surface passes one in.
 */
export function runActionIconUrl(variant: RunActionIconVariant): string | null {
  return installedUiMediaIfPresent(RUN_ACTION_MEDIA_ROLE[variant]);
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
