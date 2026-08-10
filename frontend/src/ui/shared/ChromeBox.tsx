import type { ComponentPropsWithoutRef, HTMLAttributes, ReactElement, ReactNode } from 'react';
import type { ChromeRole } from '../chromeCandidateSources';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import {
  GameplayWorkspaceActivation,
  gameplayWorkspaceTransitionTarget,
} from '../shell/AuthoredSceneSlot';

export function ChromeSurfaceFill({
  role,
  className = '',
  surface,
}: {
  role?: ChromeRole;
  className?: string;
  /** Name an installed chrome surface directly. A role's own fill may be a TINT,
   *  which is correct on a panel that already has a surface under it and wrong
   *  for chrome that floats over live artwork with nothing behind it. */
  surface?: string;
}): ReactElement {
  return (
    <span
      data-chrome-fill-role={role}
      data-chrome-fill-surface={surface}
      className={`chrome-surface-fill ${className}`.trim()}
      aria-hidden="true"
    />
  );
}

export function ShellWorkspace({
  className = '',
  contentClassName = '',
  bodyClassName = '',
  backgroundArtwork = null,
  edgeAttached = false,
  rail = null,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  contentClassName?: string;
  bodyClassName?: string;
  backgroundArtwork?: ReactNode;
  edgeAttached?: boolean;
  rail?: ReactNode;
}): ReactElement {
  return (
    <section {...props} className={`shell-workspace ${className}`.trim()}>
      <ChromeSurfaceFill role="outer" className="shell-workspace-fill" />
      {backgroundArtwork ? (
        <div className="shell-workspace-background-artwork" aria-hidden="true">
          {backgroundArtwork}
        </div>
      ) : null}
      <div className={`shell-workspace-content ${contentClassName}`.trim()}>
        {rail}
        <div
          data-shell-workspace-body=""
          className="shell-workspace-body"
        >
          <div
            data-shell-workspace-content=""
            data-shell-workspace-content-edge={edgeAttached ? '' : undefined}
            className={`shell-workspace-body-content ${bodyClassName}`.trim()}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * One retained viewport and its optional replacement workspace. Callers choose
 * only the content and whether the replacement is open; this object owns the
 * hidden/inert/accessible state of the retained primary surface.
 */
export function ShellViewportSwap({
  className = '',
  primaryClassName = '',
  primary,
  workspaceOpen,
  persistent = null,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  primaryClassName?: string;
  primary: ReactNode;
  workspaceOpen?: boolean;
  persistent?: ReactNode;
}): ReactElement {
  const covered = workspaceOpen ?? Boolean(children);
  return (
    <section
      {...props}
      {...gameplayWorkspaceTransitionTarget()}
      data-shell-viewport-swap=""
      data-shell-workspace-open={covered ? '' : undefined}
      className={`shell-viewport-swap ${className}`.trim()}
    >
      <GameplayWorkspaceActivation>
        <div
          data-shell-viewport-primary=""
          data-shell-workspace-covered={covered ? '' : undefined}
          className={`shell-viewport-primary ${primaryClassName}`.trim()}
          inert={covered ? true : undefined}
          aria-hidden={covered ? true : undefined}
        >
          {primary}
        </div>
        {persistent}
        {children}
      </GameplayWorkspaceActivation>
    </section>
  );
}

export function OuterChromeBox({
  as: Element = 'aside',
  chromeConsumer,
  titled = false,
  contentClassName = '',
  className = '',
  children,
  ...props
}: ComponentPropsWithoutRef<'aside'> & {
  as?: 'aside' | 'div';
  chromeConsumer: string;
  titled?: boolean;
  contentClassName?: string;
}): ReactElement {
  const contentClasses = [
    'le-outer-panel-content',
    titled ? 'le-outer-panel-content--titled' : '',
    contentClassName,
  ].filter(Boolean).join(' ');

  return (
    <Element
      {...props}
      data-chrome-unit="outer-panel"
      data-chrome-consumer={chromeConsumer}
      className={chromeUnitClassNames('outer-panel', 'le-outer-panel', className)}
    >
      <ChromeSurfaceFill role="outer" className="le-outer-panel-fill" />
      <div className={contentClasses}>{children}</div>
    </Element>
  );
}

export function OuterChromeTitle({
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>): ReactElement {
  return (
    <h2 {...props} className={`kit-panel-title ${className}`.trim()}>
      <span className="kit-panel-title-text">{children}</span>
    </h2>
  );
}

export function OuterChromeHeader({
  title,
  actions,
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { title: ReactNode; actions?: ReactNode }): ReactElement {
  return (
    <section {...props} className={`skirmish-card outer-chrome-header ${className}`.trim()}>
      <OuterChromeTitle>{title}</OuterChromeTitle>
      {actions ? <div className="outer-chrome-header-title-actions">{actions}</div> : null}
      {children}
    </section>
  );
}

/**
 * The one application-shell Controls rail. The title, outer role, placement
 * class, and shell-divider seam marker are invariants supplied here rather than
 * facts each workflow must redeclare.
 */
export function ShellControlsPanel({
  className = '',
  titleActions,
  titleClassName = '',
  titleContent = null,
  children,
  ...props
}: ComponentPropsWithoutRef<'aside'> & {
  titleActions?: ReactNode;
  titleClassName?: string;
  titleContent?: ReactNode;
}): ReactElement {
  return (
    <OuterChromeBox
      {...props}
      chromeConsumer="shell-controls"
      titled
      data-shell-controls-panel=""
      // Every trigger in the panel wears the oak, borrowed components included (ADR-0555).
      data-chrome-leaf-surface=""
      className={`shell-controls-panel skirmish-hud ${className}`.trim()}
    >
      <OuterChromeHeader
        title="Controls"
        actions={titleActions}
        className={titleClassName}
      >
        {titleContent}
      </OuterChromeHeader>
      {children}
    </OuterChromeBox>
  );
}

export function InnerChromeBox({
  as: Element = 'div',
  className = '',
  fillRole,
  fillSurface,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'span' | 'section';
  /** Optional installed fill beneath the inner frame. The frame role stays
   * inner; only the surface material is borrowed from the named role/surface. */
  fillRole?: ChromeRole;
  fillSurface?: string;
}): ReactElement {
  const hasFill = Boolean(fillRole || fillSurface);
  return (
    <Element
      {...props}
      data-chrome-unit="inner-box"
      className={chromeUnitClassNames(
        'inner-box',
        'inner-chrome-box',
        hasFill && 'has-chrome-surface-fill',
        className,
      )}
    >
      {hasFill ? (
        <ChromeSurfaceFill
          role={fillRole}
          surface={fillSurface}
          className="inner-chrome-box-fill"
        />
      ) : null}
      {children}
    </Element>
  );
}

/**
 * A rail, with its own ends capped.
 *
 * There is deliberately NO way to ask for one without its junction atoms. A rail's ends are
 * meetings with the frame around it, and only the element that owns that frame knows where they
 * are — so a caller who could say "no caps" would be deciding something it cannot see. The one
 * consumer that legitimately caps rails itself is DividedInnerChromeBox, which computes the whole
 * junction graph from its grid lines; it draws its rails with the internal parts in
 * `chromeRailInternals`, which nothing else may import (check-chrome-rails.mjs).
 *
 * If you are reaching for this to separate items INSIDE a box, you want the box to do it: give it
 * typed members and it lays the rails and the caps for you. See SectionBox.
 */
export function ChromeDivider({
  role,
  orientation = 'horizontal',
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  role: ChromeRole;
  orientation?: 'horizontal' | 'vertical';
}): ReactElement {
  return (
    <div
      {...props}
      data-chrome-divider-role={role}
      data-chrome-divider-orientation={orientation}
      data-chrome-divider-junctions="endpoints"
      className={`kit-divider chrome-divider ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
