import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode } from 'react';
// Every menu-language rail button in the app is this component. `check-rail-tab-primitive.mjs`
// fails the build on any other file that names `settings-tab` / `main-menu-mode-tab` in markup,
// because FOUR surfaces had each hand-assembled their own and drifted: the Run choice list
// stepped by a different gap and grew a different seat than the rail beside it (ADR-0556), and
// a mark that arrived by class name once painted itself under another surface's sizing rules.
// New states belong HERE as props — `disabled`, `locked`, `trailing`, `onSelect`, `ariaLabel`
// and the non-navigating host all arrived by converting a lookalike back in. ADR-0558.
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { FittedTabLabel } from './FittedTabLabel';
import { ChromeNavButton } from './ChromeButton';
import { CHROME_LEAF_FILL_SURFACE } from './chromeSurfacePolicy';
import { isRailTabAddress, railTabRoutePath, useLocationIntentPath } from './railOpenIntent';

export interface ApparatusRailTabProps {
  label: string;
  /** Where the tab goes. Omit only for a tab that selects in place; then `onSelect` is required. */
  to?: string;
  index: number;
  active?: boolean;
  /**
   * The installed media URL of this tab's mark — REQUIRED, and the only way a rail tab
   * can carry one. A class-name escape hatch used to sit beside it, and every tab that
   * took it painted a CSS background under different sizing rules than the shared <img>:
   * the Strategikon's Enchiridion tab drew the SAME installed icon as the main menu's,
   * cropped to a 30px window of its 64px source, which is how one destination ended up
   * with two marks. Resolve the URL at the call site (menuModeIcon, installedUiMedia).
   */
  iconSrc: string;
  /** Set when the mark needs a treatment the shared seat does not assume — the card
   *  back is a painting among sprites and must be filtered, not point-sampled. */
  iconClassName?: string;
  /**
   * How the mark's SOURCE CANVAS is authored, which decides the drawn size — not a
   * per-tab style knob. The kit icons this rail was built for reserve canvas margin
   * (their glyph fills 62-84% of a 64px square), so the seat's own size is their
   * optical size. The Run's marks — Ataraxia's emblem, Conflict, Battle — are authored
   * edge-to-edge for the title bar's tight measure seat, so drawing one at the same
   * seat size lands a glyph a third larger than its neighbours and spills the button's
   * frame. 'bleed' supplies the canvas margin the art does not carry.
   */
  markCanvas?: 'inset' | 'bleed';
  title?: string;
  testId?: string;
  detail?: string;
  /**
   * A tab that exists but cannot be taken right now — Run preparation's Current Run with no Run
   * to resume. It keeps its seat and its place in the stone (ADR-0289's visible-but-disabled
   * language, ADR-0334); only its interaction goes.
   */
  disabled?: boolean;
  /**
   * Content permanently unavailable to this account, as opposed to momentarily unavailable:
   * the Campaign Editor's locked campaigns. Drawn dimmer than `disabled` and, like it,
   * unreachable — a separate word because the two say different things to the player.
   */
  locked?: boolean;
  /** A badge or control seated at the tab's trailing edge (a lock, a favourite toggle). */
  trailing?: ReactNode;
  /**
   * OVERRIDE for a rail whose panel can be COLLAPSED while its tab stays active — the main menu
   * pressing an open tab again to shut it. Leave it unset and the tab derives the `›` open mark
   * itself: from its own address where it has one, from its selected state where it selects in
   * place. Only pass it when the rail knows something the address does not.
   *
   * Deliberately not folded into `active`. `active` is the committed scene's identity and
   * lights a beat late, after the destination's crossfade; the open mark is the player's
   * intent and appears on the press — which is why the derivation reads the ADDRESS
   * (shared/railOpenIntent.ts) rather than the committed state.
   */
  expanded?: boolean;
  /**
   * What taking the tab does. Beside `to` it is a side effect; without `to` it IS the take,
   * and the tab renders on a role="button" host instead of the nav control.
   */
  onSelect?: () => void;
  /** Surface-specific layout for this tab's own row (the Campaign Editor's trailing column). */
  className?: string;
  /** Spoken name, when the visible label alone does not identify the tab (a count, a badge). */
  ariaLabel?: string;
}

export interface ApparatusRailColumnProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  placement?: 'open' | 'framed';
}

/**
 * The registered chrome fill surface every menu-language rail button is painted with.
 * ONE declaration for the whole family: the rail column below stamps it, so the Main
 * Menu, Settings, Editor, Play, Enchiridion, and Strategikon rails cannot diverge and
 * re-skinning the menu buttons is a single edit here. (The Strategikon rails were a
 * lookalike for exactly as long as this literal sat on the main-menu screen alone.)
 * The id is a CHROME_FILL_SURFACES entry; chromeFamilyRuntime emits the matching
 * `[data-chrome-tab-fill-surface="<id>"] .settings-tab` fill rule.
 */
export const APPARATUS_RAIL_FILL_SURFACE = CHROME_LEAF_FILL_SURFACE;

/**
 * Canonical menu-language rail column. The component owns the fixed column
 * width, button-stack gap, the placement-specific main-menu perimeter, and the
 * button fill surface; consumers only provide the ordered buttons and a semantic
 * host class.
 */
export function ApparatusRailColumn({
  children,
  className = '',
  placement = 'open',
  ...props
}: ApparatusRailColumnProps): ReactElement {
  return (
    <aside
      {...props}
      data-apparatus-rail-column=""
      data-apparatus-rail-placement={placement}
      // After the spread: the surface is family-owned, not a per-consumer choice.
      data-chrome-tab-fill-surface={APPARATUS_RAIL_FILL_SURFACE}
      className={`apparatus-rail-column ${className}`.trim()}
    >
      {children}
    </aside>
  );
}

/**
 * Canonical menu-language rail tab. Main Menu, Play, and Strategikon all use
 * this one primitive so size, indentation, surface continuity, focus, and active
 * state cannot drift into lookalike implementations (ADR-0059, ADR-0231).
 */
export function ApparatusRailTab({
  label,
  to,
  index,
  active = false,
  iconSrc,
  iconClassName,
  markCanvas = 'inset',
  title,
  testId,
  detail,
  ariaLabel,
  disabled = false,
  locked = false,
  trailing,
  onSelect,
  expanded,
  className,
}: ApparatusRailTabProps): ReactElement {
  const unavailable = disabled || locked;
  // The mark is DERIVED, not remembered. It used to default to false, so a tab wore it only if
  // its call site passed `expanded` — three rails did and four did not, and the ones that did not
  // are all rails whose tab opens a panel right beside it (Settings, the Play choices, the editor's
  // workspace collections). Being a rail tab that opens something has to be enough; hunting for the
  // ones that forgot is not a review anyone should have to do.
  //
  // A tab that addresses its panel derives the mark from the ADDRESS, which is the player's intent
  // and is already ahead of the committed scene (railOpenIntent.ts) — so the mark still lands on the
  // press rather than a crossfade later. A tab that selects in place has no address to read, so it
  // falls back to its own selected state. A rail whose panel can be COLLAPSED while its tab stays
  // active — the main menu, the Enchiridion, the Strategikon — still passes `expanded` itself,
  // because only it knows the panel shut.
  const intentPath = useLocationIntentPath();
  const marksOpen = expanded ?? (to ? isRailTabAddress(intentPath, railTabRoutePath(to)) : active);
  const classes = chromeUnitClassNames(
    'inner-box',
    'settings-tab main-menu-mode-tab',
    className,
    active && 'is-active',
    disabled && 'is-disabled',
    locked && 'is-locked',
    marksOpen && 'is-expanded',
  );
  const seat = { ['--tab-index' as string]: index } as CSSProperties;
  const body = (
    <>
      <span className="settings-tab-icon" data-mark-canvas={markCanvas} aria-hidden="true">
        <img className={iconClassName} src={iconSrc} alt="" />
      </span>
      {detail ? (
        <span className="apparatus-tab-copy">
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
      ) : <FittedTabLabel>{label}</FittedTabLabel>}
      {/* Placed into the label's own grid cell (see .settings-tab-open-mark), so a tab that
          gains the mark keeps the exact geometry it had without one — no reserved column, no
          relaid label, nothing for the fitter to re-measure. aria-hidden because it restates
          `aria-current`, which already says this to a reader. */}
      {marksOpen ? <span className="settings-tab-open-mark" aria-hidden="true">›</span> : null}
      {trailing}
    </>
  );

  // A tab that selects in place rather than navigating gets a role="button" host instead of the
  // nav control. Two surfaces need it and for different reasons — the Campaign Editor seats an
  // interactive favourite at the tab's trailing edge, which cannot nest inside a button, and the
  // editor collection tabs select a collection without an address. Both hand-rolled the whole
  // tab to get it. It is a HOST choice, not a second tab: identical classes, seat, mark, copy
  // and states, so the two hosts cannot drift the way four hand-assembled tabs did (ADR-0558).
  if (!to) {
    return (
      <div
        role="button"
        tabIndex={unavailable ? -1 : 0}
        data-testid={testId}
        data-chrome-unit="inner-box"
        className={classes}
        aria-current={active && !unavailable ? 'page' : undefined}
        aria-disabled={unavailable || undefined}
        aria-label={ariaLabel}
        title={title}
        style={seat}
        onClick={() => { if (!unavailable) onSelect?.(); }}
        onKeyDown={(event) => {
          if (unavailable) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect?.();
          }
        }}
      >
        {body}
      </div>
    );
  }

  return (
    <ChromeNavButton unit="inner-box"
      data-testid={testId}
      className={classes}
      to={to}
      disabled={unavailable}
      aria-current={active && !unavailable ? 'page' : undefined}
      aria-label={ariaLabel}
      title={title}
      style={seat}
      onClick={onSelect}
    >
      {body}
    </ChromeNavButton>
  );
}
