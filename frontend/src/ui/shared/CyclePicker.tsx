import { type ReactElement, type ReactNode } from 'react';
import { ChromeButton } from './ChromeButton';

function Chevron({ direction }: { direction: 'previous' | 'next' }): ReactElement {
  return (
    <span>
      <span
        className={`stepper-glyph stepper-chevron stepper-chevron-${direction === 'previous' ? 'left' : 'right'}`}
        aria-hidden="true"
      />
    </span>
  );
}

/** Previous/value/next control. Callers provide the value control; this owns both keys. */
export function CyclePicker({
  children,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  previousDisabled = false,
  nextDisabled = false,
  className = '',
  buttonClassName = '',
  ariaLabel,
  previousTestId,
  nextTestId,
}: {
  children: ReactNode;
  onPrevious: () => void;
  onNext: () => void;
  previousLabel: string;
  nextLabel: string;
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  className?: string;
  buttonClassName?: string;
  ariaLabel?: string;
  previousTestId?: string;
  nextTestId?: string;
}): ReactElement {
  return (
    <div className={className} role={ariaLabel ? 'group' : undefined} aria-label={ariaLabel}>
      <ChromeButton
        unit="inner-chevron-key"
        className={`settings-chrome-button settings-chrome-button-neutral ${buttonClassName}`.trim()}
        disabled={previousDisabled}
        aria-label={previousLabel}
        title={previousLabel}
        data-testid={previousTestId}
        onClick={onPrevious}
      >
        <Chevron direction="previous" />
      </ChromeButton>
      {children}
      <ChromeButton
        unit="inner-chevron-key"
        className={`settings-chrome-button settings-chrome-button-neutral ${buttonClassName}`.trim()}
        disabled={nextDisabled}
        aria-label={nextLabel}
        title={nextLabel}
        data-testid={nextTestId}
        onClick={onNext}
      >
        <Chevron direction="next" />
      </ChromeButton>
    </div>
  );
}
