import { type ReactElement, type ReactNode } from 'react';
import { InnerChromeBox } from './ChromeBox';
import { ChromeDividedGridRow, DividedInnerChromeBox } from './ChromeDividedGrid';
import { CHROME_STRUCTURAL_FILL_ROLE } from './chromeSurfacePolicy';

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
  content: ReactNode;
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
    // same rails, laid and capped by one topology.
    return (
      <DividedInnerChromeBox
        columns={['minmax(0, 1fr)']}
        className={`${boxClassName} section-box-divided`}
        fillRole={CHROME_STRUCTURAL_FILL_ROLE}
        aria-labelledby={titleId}
      >
        <ChromeDividedGridRow className="section-box-head">
          <SectionBoxHeading title={title} titleId={titleId} />
        </ChromeDividedGridRow>
        {shape.members.map((member) => (
          <ChromeDividedGridRow key={member.id} className={`section-box-member ${member.className ?? ''}`.trim()}>
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
