import { useState, type ReactNode } from 'react';
import { RUN_CARD_SPANS, RUN_RARITY_RULE_IDS, type RunRarityRuleId, type RunRules } from '../run/model';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ChromeButton } from './shared/ChromeButton';
import { ChromeDividedGridRow } from './shared/ChromeDividedGrid';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';

// Run preparation's **New** tab → the rules the Run is bound to, behind a disclosure that starts
// closed. (The tab said "Start New Run" until ADR-0582; its column is unchanged.)
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
// These are the LAST CELLS of that one box, and three things follow from being cells
// rather than a box of their own:
//
//   The trigger is a SQUARE KEY, not the slab. A cell has no frame — the box's frame is around all
//   of it and the rails are its edges — so there is no slab here to be the button, and pressing the
//   whole cell would put a press on a region whose boundary belongs to something bigger. The key is
//   the registered tool square, seated where the chevron used to hang.
//
//   Each picker FILLS its own cell, seated rather than framed. A framed picker inside a cell draws
//   a second frame just inside the box's rail and leaves its wood floating on a strip of marble.
//
//   The cells are ALWAYS THERE, empty when closed. A disclosure that grows the box moves the box's
//   own bottom edge and re-seats every rail above it, which is a lot of the screen moving for a
//   control almost nobody presses. Reserved, opening it paints compartments that were already
//   there and nothing else moves at all. The space is held by keeping the choices LAID OUT and
//   hiding only their paint (`visibility`), so what is reserved is exactly what they need rather
//   than a number in the stylesheet that would drift the first time a rule changed.
//
// They seat BELOW Start Run, after the verb rather than before it — see the comment in PlayMenu.

// Each rule is TWO cells: what it is and what the current answer does, then the picker that
// answers it. The two group headings this section used to carry ("Formations", "Pricing") are gone
// with them -- three rules do not need grouping, and each of the three now states its own name,
// which none of them did: on screen they were three unlabelled pickers under one word.
const RULE_NAMES = {
  span: 'Formation size',
  rotation: 'Placement facing',
  pricing: 'Card pricing',
  rarity: 'Card rarity',
} as const;

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

// Rarity is here because ADR-0567 made it a rule a Run is bound to rather than a global property of
// the catalog. The two are not a preference and a fallback: they sort the same 69 cards two
// different ways, and the older one is kept playable because a rule nobody can play is a rule nobody
// can judge. Its effect line says what it does rather than what it is — the repeated row IS the
// thing, and a player who picks it should not be surprised by it.
const RARITY_COPY: Readonly<Record<RunRarityRuleId, { label: string; effect: string }>> = {
  'price-shifts': {
    label: 'Priced',
    effect: 'A card is rare because it is dear, and then a few named exceptions move: a card of nothing but minor pieces is Rare whatever it costs.',
  },
  'material-bands': {
    label: 'By material',
    effect: 'Rarity from raw material, the way it worked before. Under the two-by-two market this leaves six Common cards for sixteen pile seats, so a Sectio row will deal the same card twice.',
  },
};

/**
 * The rule options as CELLS of Run preparation's box — an array rather than a component, because
 * only a direct child of the box is a row it lays a rail around (see ChromeDividedGrid).
 */
export function useRunRulesCells({
  value,
  onChange,
  fillSurface,
}: {
  value: RunRules;
  onChange: (rules: RunRules) => void;
  fillSurface?: string;
}): ReactNode[] {
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

  const rarityOptions: readonly HouseSelectOption[] = RUN_RARITY_RULE_IDS.map((key) => ({
    value: key,
    label: (
      <span className="run-rules-option-copy">
        <span>{RARITY_COPY[key].label}</span>
      </span>
    ),
  }));

  // Default first, as the span and facing lists above are ordered.
  const pricingOptions: readonly HouseSelectOption[] = (['density', 'material'] as const).map((key) => ({
    value: key,
    label: (
      <span className="run-rules-option-copy">
        <span>{PRICING_COPY[key].label}</span>
      </span>
    ),
  }));

  // Every cell below the name carries the closed state on itself rather than being wrapped in one
  // element: a wrapper around them would be a single row of the box, and the rails between the
  // choices would go with it.
  const hidden = { 'data-open': open ? 'true' : 'false' } as const;

  return [
    <ChromeDividedGridRow key="rules-name" spans="all" className="run-prep-cell run-prep-name">
      <span className="run-prep-cell-name" id="run-rules-title">Options</span>
      {/* Named BY the cell's own name rather than carrying a second one, so pressing it never
          relabels the control and the screen never says Options twice. What changed is stated by
          aria-expanded and by which way the chevron points. */}
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
    </ChromeDividedGridRow>,

    <ChromeDividedGridRow key="rules-span-copy" spans="all" className="run-prep-cell run-rules-cell" id="run-rules-content" {...hidden}>
      <h4>{RULE_NAMES.span}</h4>
      <p className="run-rules-effect">{SPAN_COPY[value.cardSpan].effect}</p>
    </ChromeDividedGridRow>,
    <ChromeDividedGridRow key="rules-span" spans="all" className="run-prep-plate run-rules-cell" {...hidden}>
      <HouseSelect
        seated
        value={String(value.cardSpan)}
        options={spanOptions}
        onChange={(next) => onChange({ ...value, cardSpan: Number(next) as 2 | 4 })}
        ariaLabel={RULE_NAMES.span}
        className="run-rules-select"
        testId="run-rules-span"
        fillSurface={fillSurface}
      />
    </ChromeDividedGridRow>,

    <ChromeDividedGridRow key="rules-rotation-copy" spans="all" className="run-prep-cell run-rules-cell" {...hidden}>
      <h4>{RULE_NAMES.rotation}</h4>
      <p className="run-rules-effect">{ROTATION_COPY[rotationKey].effect}</p>
    </ChromeDividedGridRow>,
    <ChromeDividedGridRow key="rules-rotation" spans="all" className="run-prep-plate run-rules-cell" {...hidden}>
      <HouseSelect
        seated
        value={rotationKey}
        options={rotationOptions}
        onChange={(next) => onChange({ ...value, mayRotate: next === 'on' })}
        ariaLabel={RULE_NAMES.rotation}
        className="run-rules-select"
        testId="run-rules-rotation"
        fillSurface={fillSurface}
      />
    </ChromeDividedGridRow>,

    <ChromeDividedGridRow key="rules-pricing-copy" spans="all" className="run-prep-cell run-rules-cell" {...hidden}>
      <h4>{RULE_NAMES.pricing}</h4>
      <p className="run-rules-effect">{PRICING_COPY[value.pricing].effect}</p>
    </ChromeDividedGridRow>,
    <ChromeDividedGridRow key="rules-pricing" spans="all" className="run-prep-plate run-rules-cell" {...hidden}>
      <HouseSelect
        seated
        value={value.pricing}
        options={pricingOptions}
        onChange={(next) => onChange({ ...value, pricing: next as 'material' | 'density' })}
        ariaLabel={RULE_NAMES.pricing}
        className="run-rules-select"
        testId="run-rules-pricing"
        fillSurface={fillSurface}
      />
    </ChromeDividedGridRow>,

    <ChromeDividedGridRow key="rules-rarity-copy" spans="all" className="run-prep-cell run-rules-cell" {...hidden}>
      <h4>{RULE_NAMES.rarity}</h4>
      <p className="run-rules-effect">{RARITY_COPY[value.rarity].effect}</p>
    </ChromeDividedGridRow>,
    <ChromeDividedGridRow key="rules-rarity" spans="all" className="run-prep-plate run-rules-cell" {...hidden}>
      <HouseSelect
        seated
        value={value.rarity}
        options={rarityOptions}
        onChange={(next) => onChange({ ...value, rarity: next as RunRarityRuleId })}
        ariaLabel={RULE_NAMES.rarity}
        className="run-rules-select"
        testId="run-rules-rarity"
        fillSurface={fillSurface}
      />
    </ChromeDividedGridRow>,
  ];
}
