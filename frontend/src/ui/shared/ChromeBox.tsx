import type { ComponentPropsWithoutRef, CSSProperties, HTMLAttributes, ReactElement, ReactNode } from 'react';
import type { ChromeRole } from '../chromeCandidateSources';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import {
  GameplayWorkspaceActivation,
  gameplayWorkspaceTransitionTarget,
} from '../shell/AuthoredSceneSlot';
import { useLayoutEffect, useState } from 'react';
import { ControlsDockToggle } from './ControlsDockToggle';
import { controlsMobileLayout } from './controlsMobileLayout';
import { useIsMobileLayout } from '../shell/layoutMode';
import { KitScroll } from '../KitScroll';
// Cyclic with ChromeDividedGrid on purpose and safely: the grid needs this module's box and fill,
// and the Controls panel's head IS a divided block. Every reference on both sides is inside a
// component body, so neither module touches the other while it is still evaluating.
import {
  CHROME_DIVIDED_GRID_RAIL_HALF,
  ChromeDividedGridRow,
  DividedInnerChromeBox,
  chromeDividedSeatAxis,
} from './ChromeDividedGrid';
import { CHROME_LEAF_FILL_SURFACE } from './chromeSurfacePolicy';

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
  framed = true,
  contentClassName = '',
  className = '',
  children,
  ...props
}: ComponentPropsWithoutRef<'aside'> & {
  as?: 'aside' | 'div';
  chromeConsumer: string;
  titled?: boolean;
  /**
   * Whether this panel wears the outer frame. It stays the registered outer unit either way —
   * same box, same installed surface, same content contract — it simply has no rails.
   *
   * Unframed is a COMPOSITION, not a correction: style.css skips the frame rules entirely for
   * `[data-chrome-frame="none"]` rather than drawing them and subtracting them afterwards. The
   * difference is not cosmetic. The frame was previously removed by a media-query override, and
   * media queries add no specificity — so the offscreen-rails contract thousands of lines later
   * won on source order and put the rails back. Declared here, there is nothing to win against.
   */
  framed?: boolean | 'top';
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
      data-chrome-frame={framed === true ? undefined : framed === 'top' ? 'top' : 'none'}
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
 * The head — the name and whatever strip sits under it — is ONE divided block, laid here, built
 * exactly like the title bar's invariant cluster (ADR-0569): the inner-box frame is the block's,
 * every separation is the block's own rail, and each member is a COMPARTMENT rather than a control
 * standing inside one. The name spans the whole block, so the strip's verticals begin at the rail
 * under it rather than ruling a line through the title.
 *
 * The block is unframed on its inline axis because it reaches the panel's own side rails: those are
 * its left and right edges, and drawing a second pair a rail-width inside them would put a strip of
 * marble between two frames.
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
  const mobileLayout = controlsMobileLayout();
  // Stacked full width under a board, this panel has no interior edge for a frame to describe,
  // and width is what the view has least of. So on a phone it is the same registered outer box
  // wearing the same installed surface, with no rails — decided HERE, in the tree, rather than
  // by a stylesheet trying to take rails back off a panel that already drew them.
  const mobile = useIsMobileLayout();
  // Collapse belongs to the DOCK, not to any workflow: it is what the rail does when the
  // screen it shares is worth more than its own body. So it lives here with placement, and
  // every host gets the same affordance rather than the Battle growing a private one.
  // Only the docked strip can collapse — on the desktop rail there is nothing to reclaim,
  // which is why the control is rendered solely for that layout and hidden above the narrow
  // band by the same media query that docks it.
  const [collapsed, setCollapsed] = useState(false);
  // What the docked strip actually occupies, published for the screen behind it to reserve.
  // A hard-coded number cannot be right: the strip's height depends on the host's own head
  // and on whether the body is collapsed or the rail has yielded to a workspace, so the page
  // either left a gap under the board or ran the board behind the strip. Measured, it is
  // simply correct in every one of those states.
  useLayoutEffect(() => {
    if (mobileLayout !== 'sheet') return undefined;
    const panel = document.querySelector<HTMLElement>('[data-shell-controls-panel]');
    if (!panel) return undefined;
    const publish = (): void => {
      document.documentElement.style.setProperty('--controls-dock-height', `${Math.round(panel.getBoundingClientRect().height)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(panel);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--controls-dock-height');
    };
  }, [mobileLayout, collapsed]);
  return (
    <OuterChromeBox
      {...props}
      chromeConsumer="shell-controls"
      titled
      framed={mobile ? 'top' : true}
      data-shell-controls-panel=""
      data-controls-collapsed={mobileLayout === 'sheet' && collapsed ? '' : undefined}
      // Narrow-width placement is this primitive's business, not each workflow's — the same
      // reason the title, outer role and placement class are supplied here. Every host reads
      // one answer, so the rail cannot grow a different mobile behaviour per screen.
      data-controls-mobile={mobileLayout}
      // Every trigger in the panel wears the oak, borrowed components included (ADR-0555).
      data-chrome-leaf-surface=""
      className={`shell-controls-panel skirmish-hud ${className}`.trim()}
    >
      <ShellControlsHead
        // The toggle rides the head's existing actions row rather than taking a row of its
        // own: that row is already right-aligned and already clears the frame, and a
        // collapse control that costs a row of board to offer you a row of board back is
        // not worth having.
        actions={mobileLayout === 'sheet' ? (
          <>
            {titleActions}
            <ControlsDockToggle collapsed={collapsed} onToggle={() => setCollapsed((open) => !open)} />
          </>
        ) : titleActions}
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
      {/* Stacked, the panel's body is the app's own scroller rather than a native one. The frozen
          screen caps this panel, so its body has to scroll — and scrolling it with `overflow-y`
          gave it the BROWSER's scrollbar down the inside of a marble panel. KitScroll is what
          every other scrollable surface here uses: a carved rail and thumb drawn from the kit.
          Only the body is wrapped, so the head stays locked above it. */}
      {mobile ? <KitScroll className="shell-controls-scroll">{children}</KitScroll> : children}
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
  // One undivided row of ordinary controls is the same block with a single column: the rule under
  // the name is still the block's own row boundary, so both heads draw the same line. It closes
  // there rather than at a foot, because a foot rail exists to terminate the verticals BETWEEN
  // compartments and a single column has none — a second line under one control would divide a
  // strip with nothing on the other side of it.
  const members: readonly ShellControlsHeadSection[] = sections.length
    ? sections
    : content
      ? [{ id: 'head-content', content, className: 'shell-controls-head-row' }]
      : [];
  if (!members.length) return name;
  const divided = members.length > 1;
  // Equal tracks do not give equal compartments (ADR-0569). Two different things are taken off a
  // cell here, and both have to be given back or the openings are not equal:
  //
  //   - A RAIL is drawn ON a grid line and covers half its width from the cell on each side, so a
  //     middle compartment pays that twice and an outer one once.
  //   - The PANEL'S FRAME sits on top of the block's outer edges, because the block runs edge to
  //     edge so its rails can reach that frame. That is the bigger bite by far: the first
  //     compartment measured 42px of visible oak against 64px ones until this was stated.
  //
  // So the opening is the share of the strip left over once BOTH have had their width, and each
  // track adds back exactly what is taken from it. `insets` do the same to the seat's content, so a
  // mark centres in what can be SEEN rather than in the cell.
  const coverStart = 'var(--shell-controls-frame-cover-start, 0px)';
  const coverEnd = 'var(--shell-controls-frame-cover-end, 0px)';
  const lane = `(100% - ${coverStart} - ${coverEnd} - ${members.length - 1} * var(--le-chrome-inner-rail-w, 7px))`;
  const axis = chromeDividedSeatAxis(
    members.length,
    `calc(${lane} / ${members.length})`,
    CHROME_DIVIDED_GRID_RAIL_HALF,
  );
  // A cell's covers are independent: the only cell of a single-column head has BOTH.
  const coversFor = (index: number): { start: string | null; end: string | null } => ({
    start: index === 0 ? coverStart : null,
    end: index === members.length - 1 ? coverEnd : null,
  });
  const tracks = axis.tracks.map((track, index) => {
    const cover = coversFor(index);
    const added = [cover.start, cover.end].filter(Boolean);
    return added.length ? `calc(${track} + ${added.join(' + ')})` : track;
  });
  return (
    <DividedInnerChromeBox
      className="shell-controls-head"
      columns={tracks}
      framed={false}
    >
      <ChromeDividedGridRow spans="all" className="shell-controls-head-title-row">
        {name}
      </ChromeDividedGridRow>
      <ChromeDividedGridRow
        className={divided ? 'shell-controls-head-strip' : 'shell-controls-head-single'}
        role={strip?.role}
        aria-label={strip?.ariaLabel}
      >
        {members.map((section, index) => {
          // A compartment is deliberately NOT a registered chrome unit: the unit is what brings the
          // frame, and the block has already drawn every edge this thing has. A PRESSABLE one wears
          // the leaf oak, because a trigger wears the oak wherever it sits (ADR-0433); one that
          // merely holds other people's controls stays the block's own field, so those controls
          // read against marble like every other framed control in the panel.
          //
          // The inline inset comes from the SAME axis that laid the tracks, not from a positional
          // CSS rule beside it: the row's last child is the grid's own rail layer, so `:last-child`
          // is not the last seat, and a rule stated twice is a rule that can drift.
          const inset = axis.insets[index];
          const cover = coversFor(index);
          // Only a SEAT gives the taken width back as padding, so its mark centres in the opening.
          // A compartment that holds other people's controls is a lane, not an opening: it takes
          // the panel's own content inset like every other control in the column, and that inset is
          // wider than the frame's cover anyway.
          const seatPadding = section.press ? {
            paddingInlineStart: cover.start ? `calc(${inset.start} + ${cover.start})` : inset.start,
            paddingInlineEnd: cover.end ? `calc(${inset.end} + ${cover.end})` : inset.end,
          } : undefined;
          const seat = {
            className: `shell-controls-head-section${section.press?.active ? ' active' : ''} ${section.className ?? ''}`.trim(),
            'data-chrome-fill-surface': section.press ? CHROME_LEAF_FILL_SURFACE : undefined,
            style: { ...seatPadding, ...section.style },
            ...section.attrs,
          };
          return section.press ? (
            <button
              key={section.id}
              type="button"
              {...seat}
              aria-label={section.press.ariaLabel}
              title={section.press.title}
              onClick={section.press.onPress}
            >
              {section.content}
            </button>
          ) : (
            <div key={section.id} {...seat}>{section.content}</div>
          );
        })}
      </ChromeDividedGridRow>
      {/* The block's foot. It carries nothing and takes no height; what it is for is the row
          BOUNDARY above it, which is the head's rail against the panel body and the thing that
          closes the strip's verticals. Left off, four rails ended in mid-air at the last
          compartment — the exact failure this module exists to prevent — and the strip read as
          an open-bottomed comb rather than a block of sections. */}
      {divided ? <ChromeDividedGridRow spans="all" className="shell-controls-head-foot" /> : null}
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
