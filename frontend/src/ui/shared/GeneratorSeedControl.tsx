import { type ReactElement } from 'react';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { MAX_GENERATOR_SEED, randomGeneratorSeed } from '../generatorSeed';
import { SliderRow } from '../dressing/SliderRow';
import { ChromeButton } from './ChromeButton';
import { Toggle } from './Toggle';

/** Shared automatic-by-default seed control for saved placement generators. */
export function GeneratorSeedControl({
  generatorName,
  seedLabel,
  fixed,
  seed,
  defaultSeed,
  onFixedChange,
  onSeedChange,
}: {
  generatorName: string;
  seedLabel: string;
  fixed: boolean;
  seed: number;
  defaultSeed: number;
  onFixedChange: (fixed: boolean) => void;
  onSeedChange: (seed: number) => void;
}): ReactElement {
  return (
    <>
      <div className="le-ctrlrow">
        <span className="le-ctrllabel">Fixed seed</span>
        <Toggle
          checked={fixed}
          label={`Use a fixed seed for ${generatorName}`}
          onChange={onFixedChange}
        />
      </div>
      {fixed ? (
        <>
          <div className="le-ctrlrow">
            <span className="le-ctrllabel">{seedLabel}</span>
            <ChromeButton
              unit="inner-text-button"
              className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
              onClick={() => onSeedChange(randomGeneratorSeed())}
            >Randomize</ChromeButton>
          </div>
          <SliderRow
            label={`Seed · ${seed}`}
            value={seed}
            set={(value) => onSeedChange(Math.round(value))}
            min={1}
            max={MAX_GENERATOR_SEED}
            step={1}
            nudge={1}
            dflt={defaultSeed}
          />
          <p className="le-board-note">Generate reuses this seed until you change it or turn Fixed seed off.</p>
        </>
      ) : (
        <p className="le-board-note">Generate automatically picks a fresh seed each time.</p>
      )}
    </>
  );
}
