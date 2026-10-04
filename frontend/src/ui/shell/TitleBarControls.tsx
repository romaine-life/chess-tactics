import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { useTitleBarPortalTarget } from './TitleBarPortalContext';
import { ChromeButton, ChromeNavButton } from '../shared/ChromeButton';
import { NavButton } from '../shared/NavButton';
import { CHROME_LEAF_FILL_SURFACE, leafSurfacePhase } from '../shared/chromeSurfacePolicy';
import { Tooltip } from '../shared/InfoTip';
import { useSceneActivation } from './SceneBoundary';

type TitleBarControlVariant = 'label' | 'return' | 'icon';

/**
 * Leaf-surface phases for the ONE title-bar control lane (ADR-0433). Every control in
 * the bar is a terminal action, so every control wears the oak — and no two of these
 * identical squares may start the plank at the same origin. The phase is owned by the
 * data, never read off DOM position (ADR-0063).
 *
 * The invariant trailing cluster is a fixed named set, so it takes the first phases: the
 * music button (bgm.js) rides the CSS default 0, then the Settings gear and the account
 * control. A route's contributions carry their own array index and continue AFTER the
 * cluster, so a lane holding a single contributed control never repeats the cluster's
 * grain across the persistent divider.
 */
export const TITLE_BAR_CLUSTER_LEAF_PHASE = { music: 0, settings: 1, account: 2 } as const;
const CONTRIBUTED_LEAF_PHASE_BASE = 3;

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function TitleBarStatus({
  as: Tag = 'div',
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  /** `span` when the box is seated inside inline content — a tooltip trigger. */
  as?: 'div' | 'span';
  children: ReactNode;
}): ReactElement {
  return (
    <Tag
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames('inner-box', 'titlebar-status', className)}
      {...props}
    >
      {children}
    </Tag>
  );
}

/**
 * A title-bar box that IS its own hover/focus tooltip.
 *
 * The box is not decoration and is not free: every framed element in the bar costs
 * width on a row that has none to spare, so a box has to be earned. What earns it is
 * being one target — hovering anywhere on the frame names the thing inside it. That
 * is the whole rule for the persistent bar, and it is why the Run's measures, which
 * were bare marks, are boxed now: they were already tooltips, so the frame states
 * where each target begins and ends instead of leaving the reader to guess.
 *
 * The box is the trigger, not a wrapper around one — the tip is positioned from the
 * frame's own rect, so it hangs off the box rather than off some span inside it.
 */
export function TitleBarStatusTip({
  children,
  className,
  detail,
  explainMechanics,
  fillSurface,
  label,
  name,
  popupClassName,
}: {
  children: ReactNode;
  className?: string;
  /** The explanation. */
  detail: ReactNode;
  explainMechanics?: boolean;
  /** Installed leaf fill for a box that ends a containment level (ADR-0433). */
  fillSurface?: string;
  /** What a screen reader hears in place of the marks. */
  label: string;
  /** The named thing the tip is about. */
  name?: ReactNode;
  popupClassName?: string;
}): ReactElement {
  return (
    <Tooltip
      className="titlebar-status-tip"
      triggerClassName="titlebar-status-trigger"
      label={label}
      title={name}
      explainMechanics={explainMechanics}
      popupClassName={popupClassName}
      trigger={(
        <TitleBarStatus as="span" className={className} data-chrome-fill-surface={fillSurface}>
          {children}
        </TitleBarStatus>
      )}
    >
      {detail}
    </Tooltip>
  );
}

/**
 * `style` is deliberately unavailable: the one thing a caller has to say about this
 * button's paint is which seat it occupies, and `surfacePhase` is the whole vocabulary
 * for saying it. Anything else would be a route reaching into the bar's own material.
 */
interface TitleBarButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'style'> {
  active?: boolean;
  replace?: boolean;
  scroll?: boolean;
  /**
   * This control is a COMPARTMENT of a divided box rather than a framed box of its own.
   *
   * The invariant trailing cluster is one divided box now, so the frame around its members and
   * the rails between them belong to that box (ADR-0242). A registered inner-box unit in here
   * would draw a second frame a few pixels inside the first — the doubled edge this replaced,
   * where two adjacent controls put two rails and a strip of bar between one glyph and the next.
   * A seat therefore fills its cell and paints nothing: the box's frame is its outer edge and
   * the box's rail is the edge it shares with the seat beside it.
   *
   * Contributed route controls are NOT seats. They stand on the bar before the persistent
   * divider, each its own framed box, and keep the registered unit.
   */
  seated?: boolean;
  /** This control's seat in the lane; see TITLE_BAR_CLUSTER_LEAF_PHASE. */
  surfacePhase?: number;
  to?: string | (() => string);
  variant?: TitleBarControlVariant;
}

/**
 * App-shell internal. Routed screens contribute TitleBarControlSpec values instead.
 *
 * The registered inner-box role owns the frame; the button names the leaf material on
 * itself (ADR-0433) because a title-bar control ends the interaction tree rather than
 * establishing a region — the bar behind it is the structural field.
 */
export function TitleBarButtonPrimitive({
  active,
  children,
  className,
  replace,
  scroll,
  seated = false,
  surfacePhase = 0,
  to,
  variant = 'label',
  ...props
}: TitleBarButtonProps): ReactElement {
  const stateClasses: Array<string | false | undefined> = [
    'titlebar-control',
    `titlebar-control--${variant}`,
    active && 'active titlebar-control--active',
    className,
  ];
  // A seat is deliberately NOT a registered unit: the unit is what brings the frame, and the
  // divided box around it already drew one. Same shape as every other compartment control in
  // the app (LevelPreviewColumn's verbs, SectionBox's members) — the leaf material stays,
  // because a trigger wears the oak wherever it sits (ADR-0433).
  const controlClassName = seated
    ? cx('titlebar-control--seat', ...stateClasses)
    : chromeUnitClassNames('inner-box', ...stateClasses);
  const surface = {
    'data-chrome-fill-surface': CHROME_LEAF_FILL_SURFACE,
    style: leafSurfacePhase(surfacePhase),
  };

  if (to) {
    return seated ? (
      <NavButton className={controlClassName} {...surface} to={to} replace={replace} scroll={scroll} {...props}>
        {children}
      </NavButton>
    ) : (
      <ChromeNavButton
        unit="inner-box"
        className={controlClassName}
        {...surface}
        to={to}
        replace={replace}
        scroll={scroll}
        {...props}
      >
        {children}
      </ChromeNavButton>
    );
  }

  return seated ? (
    <button type="button" className={controlClassName} {...surface} {...props}>
      {children}
    </button>
  ) : (
    <ChromeButton unit="inner-box" className={controlClassName} {...surface} {...props}>
      {children}
    </ChromeButton>
  );
}

interface TitleBarIconButtonProps extends Omit<TitleBarButtonProps, 'aria-label' | 'children' | 'variant'> {
  iconClassName?: string;
  iconSrc: string;
  label: string;
}

/** App-shell internal. Routed screens contribute TitleBarControlSpec values instead. */
export function TitleBarIconButtonPrimitive({
  iconClassName,
  iconSrc,
  label,
  title = label,
  ...props
}: TitleBarIconButtonProps): ReactElement {
  return (
    <TitleBarButtonPrimitive aria-label={label} title={title} variant="icon" {...props}>
      <img className={cx('titlebar-control-glyph', iconClassName)} src={iconSrc} alt="" aria-hidden="true" />
    </TitleBarButtonPrimitive>
  );
}

type TitleBarTextPresentation = {
  presentation?: 'label' | 'return';
  iconSrc?: never;
};

type TitleBarIconPresentation = {
  presentation: 'icon';
  iconSrc: string;
};

interface TitleBarControlBase {
  /** Stable identity for React and geometry diagnostics. */
  id: string;
  /** Visible text for labeled controls; accessible name for icon controls. */
  label: string;
  /**
   * Visible text where the bar has no room for the full one. The ACCESSIBLE NAME stays
   * `label` either way, so a screen reader always hears the whole destination — only the
   * pixels shorten. "‹ Back to Run" is 127px of a 390px row, which is what pushed the brand
   * out of its own bar on a phone.
   */
  shortLabel?: string;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  testId?: string;
}

export type TitleBarControlSpec = TitleBarControlBase & (TitleBarTextPresentation | TitleBarIconPresentation) & (
  | {
      kind: 'navigation';
      destination: string | (() => string);
      replace?: boolean;
      scroll?: boolean;
    }
  | {
      kind: 'action';
      onActivate: () => void;
    }
);

function renderContributedControl(control: TitleBarControlSpec, index: number): ReactElement {
  const common = {
    active: control.active,
    disabled: control.disabled,
    title: control.title ?? control.label,
    // The seat comes from this control's place in the contributed ARRAY, which is the only
    // ordering the screen actually authored — a spec carries no markup or layout of its own.
    surfacePhase: CONTRIBUTED_LEAF_PHASE_BASE + index,
    // With a short form the visible text varies, so the accessible name is pinned to the full
    // label rather than left to whichever span the width happens to display.
    'aria-label': control.shortLabel ? control.label : undefined,
    'aria-pressed': control.pressed,
    'data-testid': control.testId,
    'data-titlebar-control-id': control.id,
  };

  if (control.presentation === 'icon') {
    return control.kind === 'navigation' ? (
      <TitleBarIconButtonPrimitive
        key={control.id}
        {...common}
        to={control.destination}
        replace={control.replace}
        scroll={control.scroll}
        label={control.label}
        iconSrc={control.iconSrc}
      />
    ) : (
      <TitleBarIconButtonPrimitive
        key={control.id}
        {...common}
        onClick={control.onActivate}
        label={control.label}
        iconSrc={control.iconSrc}
      />
    );
  }

  // Both are rendered and one is displayed (see .titlebar-control-label-* in style.css):
  // the label is CONTENT, so it cannot be shortened by CSS, and swapping it in JS on a width
  // query would make the bar's text depend on a second source of layout truth.
  const content = control.shortLabel ? (
    <>
      <span className="titlebar-control-label-full">{control.label}</span>
      <span className="titlebar-control-label-short">{control.shortLabel}</span>
    </>
  ) : control.label;
  return control.kind === 'navigation' ? (
    <TitleBarButtonPrimitive
      key={control.id}
      {...common}
      to={control.destination}
      replace={control.replace}
      scroll={control.scroll}
      variant={control.presentation ?? 'label'}
    >
      {content}
    </TitleBarButtonPrimitive>
  ) : (
    <TitleBarButtonPrimitive
      key={control.id}
      {...common}
      onClick={control.onActivate}
      variant={control.presentation ?? 'label'}
    >
      {content}
    </TitleBarButtonPrimitive>
  );
}

/**
 * The only routed-screen API for ordinary title-bar controls. Callers describe
 * intent; AppTitleBar owns the DOM lane, divider, size, gaps, and edge clearance.
 */
export function TitleBarControlContribution({
  ariaLabel,
  controls,
}: {
  ariaLabel: string;
  controls: readonly TitleBarControlSpec[];
}): ReactElement | null {
  const beforeDividerNode = useTitleBarPortalTarget('before-divider');
  const active = useSceneActivation();
  if (!beforeDividerNode || !active || controls.length === 0) return null;
  return createPortal(
    <div className="app-titlebar-contributed-controls" role="group" aria-label={ariaLabel}>
      {controls.map(renderContributedControl)}
    </div>,
    beforeDividerNode,
  );
}
