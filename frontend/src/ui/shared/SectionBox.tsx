import { type ReactElement, type ReactNode } from 'react';
import { InnerChromeBox } from './ChromeBox';
import { ChromeDividedGridRow, DividedInnerChromeBox } from './ChromeDividedGrid';
import { CHROME_LEAF_FILL_SURFACE, CHROME_STRUCTURAL_FILL_ROLE } from './chromeSurfacePolicy';

/**
 * A named group of controls: a box with its own name across the top and its contents under it.
 *
 * Both surfaces that needed one had reached for a heading instead, and a heading owns its controls
 * by proximity alone. On screens that are stacks of framed slabs standing on live artwork, that
 * left the one label naming the group as the only thing with nothing behind it. The box states the
 * same ownership with a frame, and ADR-0433 already has a seat for it: a STRUCTURAL box wearing the
 * marble, holding contents that wear their own material.
 *
 * A box comes in exactly two shapes, and the props are a union so they cannot be mixed:
 *
 *   `members` — a LIST of things, each its own row, separated by the kit's rails. The box lays
 *     every rail and every junction cap itself, from the grid lines it owns. This is the whole
 *     reason the type is a member array rather than `children: ReactNode`: a caller that could
 *     author the space BETWEEN members could put a rail there, and a hand-placed rail cannot know
 *     where it meets the frame, so it ships with no caps on its ends. That shipped once. It is now
 *     unsayable — see ChromeDivider, which no longer takes `junctions` at all.
 *
 *   `children` — ONE body, no rails, and optionally a disclosure. Nothing to get wrong, because
 *     there are no internal boundaries to cap.
 *
 * A section is a disclosure only when it is given one. Run's Rule options is: its name row is the
 * button, the whole slab is pressable when closed, and opening it grows this same box downward
 * around the choices. Every other section is not, so its name row is inert and carries no chevron —
 * the chevron is what says a section opens, and putting one on a section that never closes would
 * spend the only mark that distinguishes them.
 */

export type SectionBoxMember = {
  /** Stable identity for the row, so React keeps it across reorders. */
  id: string;
  /**
   * The member's cells — ONE node per declared column, in order. With the default single column
   * that is just the member's content; with more, the box's own vertical rail runs between them
   * and every crossing with a row boundary is a junction the grid places.
   *
   * This is why a compartment inside a member is a COLUMN and never a rule the member draws: a
   * hand-placed rule is outside the topology, so it can only cap its ends as if they met a frame,
   * and it lands that terminator in the middle of the row rail it actually crosses.
   */
  content: ReactNode;
  /**
   * 'all' for a member that is ONE thing across every column — a full-width verb closing the list.
   * It has no internal boundary, so the box breaks its vertical rail there rather than ruling a
   * line through something that is not divided.
   */
  spans?: 'all';
  /**
   * Makes the member ITSELF the control — the row is the button, wearing the leaf oak, pressable
   * edge to edge. Not a button placed inside a row: the box's own frame is already this thing's
   * edge, so a control nested in here draws a second rail a few pixels inside the first and reads
   * as something inserted into the section rather than as the section.
   */
  press?: { onPress: () => void; ariaLabel?: string };
  className?: string;
};

type SectionBoxDisclosure = { open: boolean; onToggle: () => void; testId?: string };

type SectionBoxCommon = {
  title: string;
  titleId: string;
  className?: string;
};

type SectionBoxProps = SectionBoxCommon & (
  | {
    members: readonly SectionBoxMember[];
    /**
     * The box's own columns, when its members are split into compartments — a preview beside its
     * copy. The vertical rail between them belongs to the box, so it crosses every row boundary
     * as a junction instead of terminating against nothing. Defaults to one full-width column.
     */
    columns?: readonly string[];
    children?: never;
    contentId?: never;
    disclosure?: never;
  }
  | {
    children: ReactNode;
    members?: never;
    contentId?: string;
    disclosure?: SectionBoxDisclosure;
  }
);

function SectionBoxHeading({ title, titleId, disclosure }: {
  title: string;
  titleId: string;
  disclosure?: SectionBoxDisclosure;
}): ReactElement {
  return (
    <>
      <span className="section-box-title" id={titleId}>{title}</span>
      {disclosure ? (
        <span
          className={`stepper-glyph stepper-chevron stepper-chevron-${disclosure.open ? 'up' : 'down'}`}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

export function SectionBox({
  title,
  titleId,
  className = '',
  ...shape
}: SectionBoxProps): ReactElement {
  const boxClassName = `section-box ${className}`.trim();

  if (shape.members) {
    // The head is row 0 of the grid, so the rail under it and the rails between members are the
    // same rails, laid and capped by one topology. It spans every column: the box's name is not
    // one of the compartments its members are split into.
    return (
      <DividedInnerChromeBox
        columns={shape.columns ?? ['minmax(0, 1fr)']}
        className={`${boxClassName} section-box-divided`}
        fillRole={CHROME_STRUCTURAL_FILL_ROLE}
        aria-labelledby={titleId}
      >
        <ChromeDividedGridRow spans="all" className="section-box-head section-box-head-row">
          <SectionBoxHeading title={title} titleId={titleId} />
        </ChromeDividedGridRow>
        {shape.members.map((member) => member.press ? (
          <ChromeDividedGridRow
            key={member.id}
            as="button"
            spans={member.spans}
            aria-label={member.press.ariaLabel}
            data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
            onClick={member.press.onPress}
            className={`section-box-member section-box-member-verb ${member.className ?? ''}`.trim()}
          >
            {member.content}
          </ChromeDividedGridRow>
        ) : (
          <ChromeDividedGridRow
            key={member.id}
            spans={member.spans}
            className={`section-box-member ${member.className ?? ''}`.trim()}
          >
            {member.content}
          </ChromeDividedGridRow>
        ))}
      </DividedInnerChromeBox>
    );
  }

  const { children, contentId, disclosure } = shape;
  return (
    <InnerChromeBox
      as="section"
      className={boxClassName}
      fillRole={CHROME_STRUCTURAL_FILL_ROLE}
      aria-labelledby={titleId}
    >
      {/* Not a ChromeButton: a registered unit brings its own frame, and a second frame inside
          this one would draw a control sitting IN the box rather than the box being the control.
          The box's frame is this trigger's edge, so the trigger fills it and paints nothing. */}
      {disclosure ? (
        <button
          type="button"
          className="section-box-head"
          aria-expanded={disclosure.open}
          aria-controls={contentId}
          data-testid={disclosure.testId}
          onClick={disclosure.onToggle}
        >
          <SectionBoxHeading title={title} titleId={titleId} disclosure={disclosure} />
        </button>
      ) : (
        <div className="section-box-head">
          <SectionBoxHeading title={title} titleId={titleId} />
        </div>
      )}
      <div
        id={contentId}
        className="section-box-body"
        hidden={disclosure ? !disclosure.open : undefined}
      >
        {children}
      </div>
    </InnerChromeBox>
  );
}
