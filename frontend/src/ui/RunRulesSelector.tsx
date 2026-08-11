import { useState, type ReactElement } from 'react';
import { RUN_CARD_SPANS, type RunRules } from '../run/model';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ChromeButton } from './shared/ChromeButton';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';

// Start New Run → the rules the Run is bound to, behind a disclosure that starts closed.
//
// The defaults ARE the game. Everything in here changes what the market deals or what may be done
// with a card, and almost nobody should touch it -- it exists to play the alternatives against
// each other, not to be configured before a normal Run. So it is collapsed, and closed it states
// nothing but its own name: a reassuring subtitle there could only repeat that the defaults are
// the defaults, which is what being closed already says.
//
// Not hidden, though: a Run is bound to these for its whole life, so a player who did change one
// has to be able to see what they are about to start.
//
// This is the LAST CELL of Start New Run's one box, and two things follow from being a cell rather
// than a box of its own:
//
//   The trigger is a SQUARE KEY, not the slab. A cell has no frame — the box's frame is around all
//   of it and the rail above is its edge — so there is no slab here to be the button, and pressing
//   the whole cell would put a press on a region whose boundary belongs to something bigger. The
//   key is the registered tool square, seated where the chevron used to hang.
//
//   The contents' HEIGHT IS ALWAYS RESERVED, empty when closed. A disclosure that grows the box
//   moves the box's own bottom edge and every rail above it settles differently, which is a lot of
//   the screen moving for a control almost nobody presses. Reserved, opening it fills a space that
//   was already there and nothing else on the screen moves at all. The space is held by keeping the
//   choices LAID OUT and only hiding their paint (`visibility`), so what is reserved is exactly
//   what they need — not a number in the stylesheet that would drift the first time a rule changed.
//
// It seats BELOW Start Run in the box, after the verb rather than before it — see the comment at
// its mount in PlayMenu.

const SPAN_COPY: Readonly<Record<2 | 4, { label: string; effect: string }>> = {
  2: {
    label: 'Two by two',
    effect: 'Four shapes: the single, the pair, the L and the square. Nothing longer than two cells.',
  },
  4: {
    label: 'Up to four wide',
    effect: 'Adds the straight runs and the long tetrominoes. A wider market, and wider formations to place.',
  },
};

const ROTATION_COPY: Readonly<Record<'on' | 'off', { label: string; effect: string }>> = {
  on: {
    label: 'Turn at placement',
    effect: 'One card covers all four quarter turns, and who stands in front is decided at the board.',
  },
  off: {
    label: 'Placed as dealt',
    effect: 'A formation is placed facing the way it was dealt. Fewer decisions on the board, and no way back from a poor facing.',
  },
};

const PRICING_COPY: Readonly<Record<'material' | 'density', { label: string; effect: string }>> = {
  density: {
    // Not "by density": density only WEIGHTS the material, it does not replace it. Priced by
    // density alone, one Pawn and four Pawns would cost the same -- both are density 1.
    label: 'Weighted by density',
    effect: 'Still material, scaled by how concentrated it is: the same pieces in fewer squares cost more. A Queen alone is dearer than a Queen with a Pawn beside her.',
  },
  material: {
    label: 'Flat material',
    effect: 'A card costs what its pieces are worth. A Queen is nine whether she arrives alone or beside three Pawns.',
  },
};

export function RunRulesSelector({
  value,
  onChange,
  fillSurface,
}: {
  value: RunRules;
  onChange: (rules: RunRules) => void;
  fillSurface?: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const spanOptions: readonly HouseSelectOption[] = RUN_CARD_SPANS.map((span) => ({
    value: String(span),
    label: (
      <span className="run-rules-option-copy">
        <span>{SPAN_COPY[span].label}</span>
      </span>
    ),
  }));

  const rotationOptions: readonly HouseSelectOption[] = (['on', 'off'] as const).map((key) => ({
    value: key,
    label: (
      <span className="run-rules-option-copy">
        <span>{ROTATION_COPY[key].label}</span>
      </span>
    ),
  }));

  const rotationKey = value.mayRotate ? 'on' : 'off';

  // Default first, as the span and facing lists above are ordered.
  const pricingOptions: readonly HouseSelectOption[] = (['density', 'material'] as const).map((key) => ({
    value: key,
    label: (
      <span className="run-rules-option-copy">
        <span>{PRICING_COPY[key].label}</span>
      </span>
    ),
  }));

  return (
    <>
      <div className="run-prep-cell-head">
        <span className="run-prep-cell-name" id="run-rules-title">Options</span>
        {/* Named BY the cell's own name rather than carrying a second one, so pressing it never
            relabels the control and the screen never says Options twice. What changed is stated
            by aria-expanded and by which way the chevron points. */}
        <ChromeButton
          unit="inner-tool-square"
          className={chromeUnitClassNames('inner-tool-square', 'run-rules-toggle')}
          data-chrome-fill-surface={fillSurface}
          data-testid="run-rules-toggle"
          aria-labelledby="run-rules-title"
          aria-expanded={open}
          aria-controls="run-rules-content"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          <span
            className={`stepper-glyph stepper-chevron stepper-chevron-${open ? 'up' : 'down'}`}
            aria-hidden="true"
          />
        </ChromeButton>
      </div>

      {/* Laid out either way; closed, it is only unpainted. `visibility: hidden` also takes it out
          of the tab order and the accessibility tree, so a closed section is no more reachable than
          it was when it was display:none. */}
      <div
        id="run-rules-content"
        className="run-rules-content"
        data-open={open ? 'true' : 'false'}
      >
        <h4>Formations</h4>

        <HouseSelect
          value={String(value.cardSpan)}
          options={spanOptions}
          onChange={(next) => onChange({ ...value, cardSpan: Number(next) as 2 | 4 })}
          ariaLabel="Formation size"
          className="run-rules-select"
          testId="run-rules-span"
          fillSurface={fillSurface}
        />
        <p className="run-rules-effect">{SPAN_COPY[value.cardSpan].effect}</p>

        <HouseSelect
          value={rotationKey}
          options={rotationOptions}
          onChange={(next) => onChange({ ...value, mayRotate: next === 'on' })}
          ariaLabel="Placement facing"
          className="run-rules-select"
          testId="run-rules-rotation"
          fillSurface={fillSurface}
        />
        <p className="run-rules-effect">{ROTATION_COPY[rotationKey].effect}</p>

        <h4>Pricing</h4>
        <HouseSelect
          value={value.pricing}
          options={pricingOptions}
          onChange={(next) => onChange({ ...value, pricing: next as 'material' | 'density' })}
          ariaLabel="Card pricing"
          className="run-rules-select"
          testId="run-rules-pricing"
          fillSurface={fillSurface}
        />
        <p className="run-rules-effect">{PRICING_COPY[value.pricing].effect}</p>
      </div>
    </>
  );
}
