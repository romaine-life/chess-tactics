import { type ReactElement, type ReactNode } from 'react';
import { InnerChromeBox } from './ChromeBox';
import { CHROME_STRUCTURAL_FILL_ROLE } from './chromeSurfacePolicy';

/**
 * One section of Run preparation: a box with its own name across the top and its controls under
 * it.
 *
 * Start New Run had two answers to the same question. Ataraxia was a heading on the backdrop with
 * a picker and a line of copy loose beneath it; Rule options was a box. A heading owns its
 * controls by proximity alone, and this column is a stack of framed slabs — so the loose copy sat
 * on live board artwork with nothing behind it to read against, no closer to the picker above it
 * than to the warning below. The box states the same ownership with a frame, and ADR-0433 already
 * has a seat for it: a STRUCTURAL box wearing the marble, holding leaf controls that wear the oak.
 * So the box won, and it lives here rather than being reproduced per section — two hand-rolled
 * boxes that merely happen to match is the bespoke parallel ADR-0059 forbids.
 *
 * A section is a disclosure only when it is given one. Rule options is: its name row is the
 * button, the whole slab is pressable when closed, and opening it grows this same box downward
 * around the choices. Ataraxia is not, so its name row is inert and carries no chevron — the
 * chevron is what says a section opens, and putting one on a section that never closes would
 * spend the only mark that distinguishes them.
 */
export function RunPrepSection({
  title,
  titleId,
  className = '',
  contentId,
  disclosure,
  children,
}: {
  title: string;
  titleId: string;
  className?: string;
  contentId?: string;
  /** Present only for a section that opens and closes. Its name row becomes the trigger. */
  disclosure?: { open: boolean; onToggle: () => void; testId?: string };
  children: ReactNode;
}): ReactElement {
  const heading = (
    <>
      <span className="run-prep-section-title" id={titleId}>{title}</span>
      {disclosure ? (
        <span
          className={`stepper-glyph stepper-chevron stepper-chevron-${disclosure.open ? 'up' : 'down'}`}
          aria-hidden="true"
        />
      ) : null}
    </>
  );

  return (
    <InnerChromeBox
      as="section"
      className={`run-prep-section ${className}`.trim()}
      fillRole={CHROME_STRUCTURAL_FILL_ROLE}
      aria-labelledby={titleId}
    >
      {/* Not a ChromeButton: a registered unit brings its own frame, and a second frame inside
          this one would draw a control sitting IN the box rather than the box being the control.
          The box's frame is this trigger's edge, so the trigger fills it and paints nothing. */}
      {disclosure ? (
        <button
          type="button"
          className="run-prep-section-head"
          aria-expanded={disclosure.open}
          aria-controls={contentId}
          data-testid={disclosure.testId}
          onClick={disclosure.onToggle}
        >
          {heading}
        </button>
      ) : (
        <div className="run-prep-section-head">{heading}</div>
      )}
      <div
        id={contentId}
        className="run-prep-section-body"
        hidden={disclosure ? !disclosure.open : undefined}
      >
        {children}
      </div>
    </InnerChromeBox>
  );
}
