import type { ComponentPropsWithoutRef, CSSProperties, HTMLAttributes, ReactElement, ReactNode } from 'react';
import type { ChromeRole } from '../chromeCandidateSources';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import {
  GameplayWorkspaceActivation,
  gameplayWorkspaceTransitionTarget,
} from '../shell/AuthoredSceneSlot';
// Cyclic with ChromeDividedGrid on purpose and safely: the grid needs this module's box and fill,
// and the Controls panel's head IS a divided block. Every reference on both sides is inside a
// component body, so neither module touches the other while it is still evaluating.
import {
  ChromeDividedGridCell,
  ChromeDividedGridRow,
  DividedInnerChromeBox,
} from './ChromeDividedGrid';

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

/** One compartment of the Controls head's divided strip. */
export type ShellControlsHeadSection = {
  /** Stable identity for the compartment, so React keeps it across reorders. */
  id: string;
  content: ReactNode;
  /** Makes the compartment ITSELF the control — pressable edge to edge, wearing the leaf oak. */
  press?: { onPress: () => void; ariaLabel?: string; title?: string; active?: boolean };
  className?: string;
  /** Attributes the compartment carries as a tab or nav mark. */
  attrs?: Record<string, string | boolean | undefined>;
  style?: CSSProperties;
};

/**
 * The one application-shell Controls rail. The title, outer role, placement
 * class, and shell-divider seam marker are invariants supplied here rather than
 * facts each workflow must redeclare.
 *
 * The head — the name and whatever strip sits under it — is ONE divided block, laid here.
 * Its inline edges are the panel's own outer rails, so its rails tee into them exactly as the
 * break under a fixed section does; both are section rails of this panel and neither is a caller's
 * to place. The name spans the whole block, so the strip's verticals begin at that break rather
 * than ruling a line through the title.
 */
export function ShellControlsPanel({
  className = '',
  titleActions,
  titleClassName = '',
  titleSections = [],
  titleStrip,
  titleContent = null,
  fixed = null,
  children,
  ...props
}: ComponentPropsWithoutRef<'aside'> & {
  titleActions?: ReactNode;
  titleClassName?: string;
  /**
   * The head's compartments — one per column of the block under the name. The panel owns the
   * rails between them and the caps at every crossing, which is why this is a member list and
   * not a node: a caller that could author the space between compartments could put a rail
   * there, and a hand-placed rail cannot know what it meets (see ChromeDivider).
   */
  titleSections?: readonly ShellControlsHeadSection[];
  /** What the strip of compartments IS, when it is more than a row of controls — a tab list. */
  titleStrip?: { role?: string; ariaLabel?: string };
  /** One undivided row under the name, for a head whose strip is a single control. */
  titleContent?: ReactNode;
  /**
   * Content pinned above the scrolling body. The panel lays the rail between the two itself,
   * because the rail's ends are meetings with THIS panel's frame and nothing inside the panel
   * can see where those are. A caller that placed its own got a bar stopping in mid-air.
   */
  fixed?: ReactNode;
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
      <ShellControlsHead
        actions={titleActions}
        className={titleClassName}
        sections={titleSections}
        strip={titleStrip}
        content={titleContent}
      />
      {fixed}
      {fixed ? (
        <div className="le-control-divider-host shell-controls-break" aria-hidden="true">
          <ChromeDivider role="outer" />
        </div>
      ) : null}
      {children}
    </OuterChromeBox>
  );
}

function ShellControlsHead({
  actions,
  className,
  sections,
  strip,
  content,
}: {
  actions?: ReactNode;
  className: string;
  sections: readonly ShellControlsHeadSection[];
  strip?: { role?: string; ariaLabel?: string };
  content?: ReactNode;
}): ReactElement {
  const name = (
    <OuterChromeHeader
      title="Controls"
      actions={actions}
      className={`shell-controls-head-name ${className}`.trim()}
    />
  );
  // No strip of sections: the name simply closes with the panel's own section rail, the same one
  // that closes a fixed dock. A single control under the head is a control, not a compartment —
  // ruling a second line under it would divide a strip with nothing on the other side of it.
  if (!sections.length) {
    return (
      <>
        {name}
        <div className="le-control-divider-host shell-controls-break shell-controls-head-break" aria-hidden="true">
          <ChromeDivider role="outer" />
        </div>
        {content}
      </>
    );
  }
  return (
    <DividedInnerChromeBox
      className="shell-controls-head"
      columns={sections.map(() => 'minmax(0, 1fr)')}
      framed={false}
      hostFrame="outer"
    >
      <ChromeDividedGridRow spans="all" className="shell-controls-head-title-row">
        {name}
      </ChromeDividedGridRow>
      <ChromeDividedGridRow
        className="shell-controls-head-strip"
        role={strip?.role}
        aria-label={strip?.ariaLabel}
      >
        {sections.map((section) => section.press ? (
          <ChromeDividedGridCell
            key={section.id}
            as="button"
            {...section.attrs}
            aria-label={section.press.ariaLabel}
            title={section.press.title}
            style={section.style}
            onClick={section.press.onPress}
            className={`shell-controls-head-section${section.press.active ? ' active' : ''} ${section.className ?? ''}`.trim()}
          >
            {section.content}
          </ChromeDividedGridCell>
        ) : (
          <ChromeDividedGridCell
            key={section.id}
            {...section.attrs}
            style={section.style}
            className={`shell-controls-head-section ${section.className ?? ''}`.trim()}
          >
            {section.content}
          </ChromeDividedGridCell>
        ))}
      </ChromeDividedGridRow>
      {/* The block's foot. It carries nothing and takes no height; what it is for is the row
          BOUNDARY above it, which is the head's rail against the panel body and the thing that
          closes the strip's verticals. Left off, four rails ended in mid-air at the last
          compartment — the exact failure this module exists to prevent — and the strip read as
          an open-bottomed comb rather than a block of sections. */}
      <ChromeDividedGridRow spans="all" className="shell-controls-head-foot" />
    </DividedInnerChromeBox>
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
