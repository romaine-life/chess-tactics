import type { ReactElement } from 'react';
import { installedUiMediaIfPresent } from '../installedUiMedia';

/**
 * The mark one Battle HUD section tab wears.
 *
 * The strip is five compartments of ONE box, so every mark's nearest neighbour is another
 * mark of the same set — the strip IS a size reference, and the set is judged and installed
 * together for the reason [ADR-0560](../../../docs/adr/0560-main-menu-marks-share-one-ink-box-and-one-centre.md)
 * states for the main-menu column.
 *
 * The seat is 20px and draws with `background-size: contain`, which scales the CANVAS. So
 * transparent margin left on a 64x64 frame comes straight off the drawn glyph: `unit-studio`
 * carried 26x40 of ink on its 64px canvas and arrived at the tab roughly 12px tall — a pale
 * smudge beside a gear that fills its own frame. These marks therefore ship TRIMMED to their
 * own ink, like the Run-position, action and Event Log marks (ADR-0637), and the seat needs no
 * per-mark compensation number.
 */
export type SkirmishTabId = 'unit' | 'roster' | 'log' | 'view' | 'controls';

/**
 * The four marks this set decides, and the one it does not.
 *
 * The GEAR is deliberately absent. Most gears in the app are not the Settings destination —
 * this tab, the Settings General section and `.icon-gear` all draw `ui/kit/icons/gear.png` —
 * and ADR-0560 already chose those bytes as the carved iron cog and installed them into both
 * that kit slot and its menu slot. Re-deciding it here would re-open a settled decision and
 * move three unrelated surfaces with it.
 */
export const SKIRMISH_TAB_MARKS = Object.freeze(['unit', 'roster', 'log', 'view'] as const);

/** The four tabs whose mark this set decides — every tab except the gear's. */
export type SkirmishTabMarkSeat = (typeof SKIRMISH_TAB_MARKS)[number];

/** The `app-ui` media role each mark resolves through — ONE lookup per tab (ADR-0059). */
export const SKIRMISH_TAB_MARK_MEDIA_ROLE: Readonly<Record<SkirmishTabId, string>> = Object.freeze({
  unit: 'ui-kit-icons-unit-studio-png',
  roster: 'ui-kit-icons-players-png',
  log: 'ui-kit-icons-info-png',
  view: 'ui-kit-icons-monitor-png',
  controls: 'ui-kit-icons-gear-png',
});

/**
 * The live-media slot behind each role. These are EXISTING kit slots with other consumers, so
 * a mark installed here changes every surface that draws it — which is the point (a mark
 * changes everywhere it is drawn, or it has not changed) and is worth knowing before pressing
 * Install:
 *
 * - `unit-studio.png` — this tab, the Strategikon's Prosopography mark, the Enchiridion's
 *   *units* rules bullet.
 * - `players.png` — this tab, the account menu's player glyph, `.icon-players`.
 * - `info.png` — this tab, the Strategikon's Lipsanotheca mark, the Enchiridion's *lipsana*
 *   bullet, the editor level row's info control.
 * - `monitor.png` — this tab, and nothing else.
 */
export const SKIRMISH_TAB_MARK_SLOT: Readonly<Record<SkirmishTabId, string>> = Object.freeze({
  unit: 'ui/kit/icons/unit-studio.png',
  roster: 'ui/kit/icons/players.png',
  log: 'ui/kit/icons/info.png',
  view: 'ui/kit/icons/monitor.png',
  controls: 'ui/kit/icons/gear.png',
});

/** What the tab paints today, or null while a seat's decision is open (ADR-0318). */
export function skirmishTabIconUrl(tab: SkirmishTabId): string | null {
  return installedUiMediaIfPresent(SKIRMISH_TAB_MARK_MEDIA_ROLE[tab]);
}

/**
 * The shared tab-mark seat.
 *
 * The installed mark arrives through the `--media-*` variable the class already names, so the
 * match route resolves nothing here. `src` is how the Studio review arms a candidate in this
 * exact seat; there is deliberately no candidate seam on a player route (ADR-0058).
 */
export function SkirmishTabIcon({ tab, src }: { tab: SkirmishTabId; src?: string }): ReactElement {
  return (
    <span
      className={`skirmish-tab-icon skirmish-tab-icon-${tab}`}
      style={src ? { backgroundImage: `url("${src}")` } : undefined}
      data-skirmish-tab-icon={tab}
      aria-hidden="true"
    />
  );
}
