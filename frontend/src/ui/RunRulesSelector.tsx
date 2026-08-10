import type { ReactElement } from 'react';
import { RUN_CARD_SPANS, type RunRules } from '../run/model';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';

// Start New Run → the rules the Run is bound to. These sit beside Ataraxia because they are the
// same kind of thing: one consequential choice made before the Run exists and never changed
// inside it. The default is the game everyone is steered toward; the rest are here to be played
// with, which is why they are stated plainly rather than hidden behind an advanced flyout.

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

export function RunRulesSelector({
  value,
  onChange,
  fillSurface,
}: {
  value: RunRules;
  onChange: (rules: RunRules) => void;
  fillSurface?: string;
}): ReactElement {
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

  return (
    <section className="run-rules-selector" aria-labelledby="run-rules-title">
      <h3 id="run-rules-title">Formations</h3>

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
    </section>
  );
}
