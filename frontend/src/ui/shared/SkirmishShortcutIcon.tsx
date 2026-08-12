import type { ReactElement } from 'react';
import { installedUiMediaIfPresent } from '../installedUiMedia';

/**
 * The mark of one in-match COMMAND-CARD action, drawn on the key that performs it.
 *
 * The card is a 3x5 grid of tiny buttons where every neighbour is a size reference, so
 * these are judged and installed as one SET fitted to one ink box — the rule ADR-0560
 * states for the main-menu rail, for the same reason.
 *
 * Two members are not new drawings. "Your attacks" and "Your moves" turn on exactly the
 * board overlays the game already draws the `attack` and `move` verbs for, so they are
 * those installed marks fitted to this card's box rather than a second drawing of the
 * same idea (ADR-0059) — and their opponent halves are the same drawings again in the
 * enemy's red livery, which is the relationship the board's own red and blue sides
 * already state. They take their own slots only because the card's shared ink box is
 * what makes ten marks read as one size, and the board's marks are not fitted to it.
 */
export type SkirmishShortcutIconVariant =
  | 'enemy-attacks'
  | 'enemy-moves'
  | 'grid'
  | 'deselect'
  | 'clear-overlays'
  | 'player-attacks'
  | 'player-moves'
  | 'promotion-zones'
  | 'zoom-in'
  | 'zoom-out';

/** The `app-ui` media role each mark resolves through. ONE lookup per variant, so a
 *  second seat for the same command cannot answer to different art (ADR-0059). */
export const SKIRMISH_SHORTCUT_MEDIA_ROLE: Readonly<Record<SkirmishShortcutIconVariant, string>> = Object.freeze({
  'enemy-attacks': 'ui-kit-icons-shortcuts-enemy-attacks-png',
  'enemy-moves': 'ui-kit-icons-shortcuts-enemy-moves-png',
  grid: 'ui-kit-icons-shortcuts-grid-png',
  deselect: 'ui-kit-icons-shortcuts-deselect-png',
  'clear-overlays': 'ui-kit-icons-shortcuts-clear-overlays-png',
  'player-attacks': 'ui-kit-icons-shortcuts-player-attacks-png',
  'player-moves': 'ui-kit-icons-shortcuts-player-moves-png',
  'promotion-zones': 'ui-kit-icons-shortcuts-promotion-zones-png',
  'zoom-in': 'ui-kit-icons-shortcuts-zoom-in-png',
  'zoom-out': 'ui-kit-icons-shortcuts-zoom-out-png',
});

/** The live-media slot behind each role — one namespace, because the set's shared ink
 *  box is a property of this card and not of the marks it was derived from. */
export const SKIRMISH_SHORTCUT_ICON_SLOT: Readonly<Record<SkirmishShortcutIconVariant, string>> = Object.freeze({
  'enemy-attacks': 'ui/kit/icons/shortcuts/enemy-attacks.png',
  'enemy-moves': 'ui/kit/icons/shortcuts/enemy-moves.png',
  grid: 'ui/kit/icons/shortcuts/grid.png',
  deselect: 'ui/kit/icons/shortcuts/deselect.png',
  'clear-overlays': 'ui/kit/icons/shortcuts/clear-overlays.png',
  'player-attacks': 'ui/kit/icons/shortcuts/player-attacks.png',
  'player-moves': 'ui/kit/icons/shortcuts/player-moves.png',
  'promotion-zones': 'ui/kit/icons/shortcuts/promotion-zones.png',
  'zoom-in': 'ui/kit/icons/shortcuts/zoom-in.png',
  'zoom-out': 'ui/kit/icons/shortcuts/zoom-out.png',
});

/** The command card in the order it is painted, so the review surface and the match
 *  card cannot disagree about which key wears which mark. */
export const SKIRMISH_SHORTCUT_CARD: readonly { key: string; variant: SkirmishShortcutIconVariant; label: string }[] =
  Object.freeze([
    { key: 'q', variant: 'enemy-attacks', label: 'Opp. attacks' },
    { key: 'w', variant: 'enemy-moves', label: 'Opp. moves' },
    { key: 'e', variant: 'grid', label: 'Grid' },
    { key: 'r', variant: 'deselect', label: 'Deselect all' },
    { key: 't', variant: 'clear-overlays', label: 'Clear all' },
    { key: 'a', variant: 'player-attacks', label: 'Your attacks' },
    { key: 's', variant: 'player-moves', label: 'Your moves' },
    { key: 'd', variant: 'promotion-zones', label: 'Promotion zones' },
    { key: 'z', variant: 'zoom-in', label: 'Zoom in' },
    { key: 'x', variant: 'zoom-out', label: 'Zoom out' },
  ] as const);

/**
 * A match route resolves the INSTALLED role and nothing else. There is deliberately no
 * `?shortcutIconCandidate=<sha256>` seam here: a dev surface is a Studio category reached
 * by clicking, never review state smuggled onto a player route (ADR-0058). Candidates are
 * judged in Studio -> Command Card Marks, which mounts every one of them in this same
 * component inside the real button; `src` is how that surface passes one in.
 */
export function skirmishShortcutIconUrl(variant: SkirmishShortcutIconVariant): string | null {
  return installedUiMediaIfPresent(SKIRMISH_SHORTCUT_MEDIA_ROLE[variant]);
}

/**
 * The shared command-card mark seat. The seat keeps its geometry whether or not the
 * variant's art decision exists yet, so installing one later cannot move the key cap
 * above it or the label below it — a seat with no decision is reserved rather than
 * fail-closed (ADR-0318).
 */
export function SkirmishShortcutIcon({
  variant,
  className = '',
  src,
}: {
  variant: SkirmishShortcutIconVariant;
  className?: string;
  src?: string;
}): ReactElement {
  const resolved = src ?? skirmishShortcutIconUrl(variant);
  return (
    <span
      className={`skirmish-shortcut-icon${resolved ? '' : ' is-unavailable'} ${className}`.trim()}
      data-skirmish-shortcut-icon={variant}
      aria-hidden="true"
    >
      {resolved ? <img src={resolved} alt="" draggable={false} /> : null}
    </span>
  );
}
