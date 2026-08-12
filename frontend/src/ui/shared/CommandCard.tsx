import type { ReactElement } from 'react';
import { ChromeSeatGrid, type ChromeSeat } from './ChromeSeatGrid';
import { SkirmishShortcutIcon, type SkirmishShortcutIconVariant } from './SkirmishShortcutIcon';

/**
 * The Battle command card: ONE box of fifteen compartments, not fifteen buttons.
 *
 * It shipped first as a CSS grid of framed keys, and between one mark and the next the rail
 * showed three edges — a frame, a strip of panel, another frame. That is the exact shape
 * `ChromeSeatGrid` was written for (ADR-0242): the frame is the box's, drawn once around
 * all of them; every separation is one of the box's own rails, capped where it meets that
 * frame by a junction the topology places; and a command is a COMPARTMENT rather than a
 * control standing inside one.
 *
 * The card is painted in two places — the Controls tab a player uses, and the Studio review
 * that composes its marks — and a review that paints a lookalike proves nothing about the
 * thing it is judging. So both ask for this.
 *
 * A compartment carries NO label. Ten labels were what made the card a wall of type; a mark
 * plus a tip says the same thing in half the height, and what the label used to say is the
 * tip's title.
 */
export interface CommandCardCommand {
  /** The physical key this compartment sits on. Empty cells are open slots, not gaps. */
  key: string;
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
}

/** The physical 3x5 keyboard block the card maps onto. */
export const COMMAND_CARD_KEY_ROWS: readonly (readonly string[])[] = Object.freeze([
  Object.freeze(['q', 'w', 'e', 'r', 't']),
  Object.freeze(['a', 's', 'd', 'f', 'g']),
  Object.freeze(['z', 'x', 'c', 'v', 'b']),
]);

function commandSeat(command: CommandCardCommand): ChromeSeat {
  const cap = <kbd className="skirmish-grid-cap">{command.key.toUpperCase()}</kbd>;
  if (!command.label || !command.icon) {
    return {
      id: command.key,
      className: 'skirmish-grid-key is-empty',
      content: cap,
      disabled: true,
      testId: command.testId,
      ariaLabel: `${command.key.toUpperCase()}: unassigned`,
    };
  }
  // The mark is the only thing on the compartment, so the name a screen reader speaks is
  // stated rather than read off the face — in the same order the tip shows it, name first.
  const spoken = command.hint ? `${command.label}. ${command.hint}` : command.label;
  return {
    id: command.key,
    className: 'skirmish-grid-key',
    content: (
      <>
        {cap}
        <SkirmishShortcutIcon variant={command.icon} src={command.iconSrc} />
      </>
    ),
    ariaLabel: spoken,
    testId: command.testId,
    tip: { title: command.label, body: <span>{command.hint}</span> },
    selected: command.pressed,
    onPress: command.onPress,
    // The review paints the card to be LOOKED at, so its compartments press nothing. They
    // are still the card's own compartments — a preview built from something else would be
    // a review of a lookalike.
    disabled: !command.onPress,
  };
}

/** The whole card, as the box that holds it. */
export function CommandCard({
  commands,
  ariaLabel,
  className = '',
}: {
  /** Every cell of the 3x5 block, in reading order. */
  commands: readonly CommandCardCommand[];
  ariaLabel: string;
  className?: string;
}): ReactElement {
  const rows = COMMAND_CARD_KEY_ROWS.map((row) => row.map((key) => {
    const command = commands.find((entry) => entry.key === key) ?? { key };
    return commandSeat(command);
  }));
  return (
    <ChromeSeatGrid
      className={`skirmish-grid ${className}`.trim()}
      seatClassName="skirmish-grid-seat"
      rows={rows}
      // The card fills the rail it lives in rather than being a pad of fixed squares: the
      // opening is what is left of that width once the four internal rails are paid for.
      opening="calc((100% - 4 * var(--le-chrome-inner-rail-w, 7px)) / 5)"
      rowOpening="var(--command-card-row-opening)"
      ariaLabel={ariaLabel}
    />
  );
}
