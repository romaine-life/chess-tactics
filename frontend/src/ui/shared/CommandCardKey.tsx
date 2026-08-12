import type { ReactElement } from 'react';
import { chromeUnitClassNames } from '../chromeUnitRegistry';
import { ChromeButton } from './ChromeButton';
import { Tooltip } from './InfoTip';
import { leafSurfacePhase } from './chromeSurfacePolicy';
import { SkirmishShortcutIcon, type SkirmishShortcutIconVariant } from './SkirmishShortcutIcon';

/**
 * One key of the Battle command card.
 *
 * The card is painted in two places — the Controls tab a player uses, and the Studio
 * review that composes its marks — and a review that paints a lookalike proves nothing
 * about the thing it is judging. So both ask for this, and the key's whole treatment
 * (leaf phase, cap, seat, tip) is stated once.
 *
 * The key carries NO label. Ten labels at `--ds-text-xs` were what made the card a wall
 * of type, and a mark plus a tip says the same thing in half the height. What the label
 * used to say is not lost: it is the tip's title, above the sentence that was already
 * there.
 */
export function CommandCardKey({
  cap,
  index,
  label,
  hint,
  icon,
  iconSrc,
  active = false,
  pressed,
  onPress,
  testId,
}: {
  cap: string;
  /** The key's place in the authored 3x5 grid, which is what phases its wood (ADR-0433)
   *  rather than stamping fifteen identical planks. */
  index: number;
  /** The command this key runs, or undefined for one of the card's open slots. */
  label?: string;
  hint?: string;
  icon?: SkirmishShortcutIconVariant;
  /** A candidate mark, for the review that is choosing one. Omitted, the seat resolves
   *  whatever is installed. */
  iconSrc?: string;
  active?: boolean;
  pressed?: boolean;
  onPress?: () => void;
  testId?: string;
}): ReactElement {
  const surfacePhase = leafSurfacePhase(index);

  if (!label || !icon) {
    return (
      <span
        data-chrome-unit="inner-text-button"
        className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'skirmish-grid-key', 'is-empty')}
        style={surfacePhase}
        aria-hidden="true"
      >
        <kbd className="skirmish-grid-cap">{cap.toUpperCase()}</kbd>
      </span>
    );
  }

  const face = (
    <>
      <kbd className="skirmish-grid-cap">{cap.toUpperCase()}</kbd>
      <SkirmishShortcutIcon variant={icon} src={iconSrc} />
    </>
  );
  // The mark is the only thing on the key, so the name a screen reader speaks has to be
  // stated rather than read off the face — and it is stated in the same order the tip
  // shows it, name first.
  const spoken = hint ? `${label}. ${hint}` : label;

  return (
    <Tooltip
      className="skirmish-grid-key-tip"
      label={spoken}
      title={label}
      triggerIsInteractive={Boolean(onPress)}
      trigger={onPress ? (
        <ChromeButton
          unit="inner-text-button"
          data-testid={testId}
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'skirmish-grid-key', active && 'active is-active')}
          style={surfacePhase}
          aria-label={spoken}
          aria-pressed={pressed}
          onClick={onPress}
        >
          {face}
        </ChromeButton>
      ) : (
        <span
          data-chrome-unit="inner-text-button"
          data-testid={testId}
          className={chromeUnitClassNames('inner-text-button', 'app-header-button', 'skirmish-grid-key', active && 'active is-active')}
          style={surfacePhase}
        >
          {face}
        </span>
      )}
    >
      <span>{hint}</span>
    </Tooltip>
  );
}
