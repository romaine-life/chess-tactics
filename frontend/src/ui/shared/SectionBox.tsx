import { type ReactElement, type ReactNode } from 'react';
import { InnerChromeBox } from './ChromeBox';
import { CHROME_STRUCTURAL_FILL_ROLE } from './chromeSurfacePolicy';

/**
 * A named group of controls: a box with its own name across the top and its members under it.
 *
 * Both surfaces that needed one had reached for a heading instead, and a heading owns its controls
 * by proximity alone. On screens that are stacks of framed slabs standing on live artwork, that
 * left the one label naming the group as the only thing with nothing behind it — Run preparation's
 * Ataraxia copy sat on board art, and Settings' eyebrows sat on the night vista. The box states the
 * same ownership with a frame, and ADR-0433 already has a seat for it: a STRUCTURAL box wearing the
 * marble, holding members that wear their own material.
 *
 * It lives here rather than being reproduced per surface — two hand-rolled boxes that merely happen
 * to match is the bespoke parallel ADR-0059 forbids.
 *
 * A section is a disclosure only when it is given one. Run's Rule options is: its name row is the
 * button, the whole slab is pressable when closed, and opening it grows this same box downward
 * around the choices. Ataraxia and Settings' groups are not, so their name rows are inert and carry
 * no chevron — the chevron is what says a section opens, and putting one on a section that never
 * closes would spend the only mark that distinguishes them.
 */
export function SectionBox({
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
      <span className="section-box-title" id={titleId}>{title}</span>
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
      className={`section-box ${className}`.trim()}
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
          {heading}
        </button>
      ) : (
        <div className="section-box-head">{heading}</div>
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
