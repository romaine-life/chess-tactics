import { type CSSProperties, type ReactElement, type ReactNode } from 'react';
import {
  ChromeDividedGridRow,
  DividedInnerChromeBox,
  chromeDividedSeatAxis,
} from './ChromeDividedGrid';
import {
  CHROME_LEAF_FILL_SURFACE,
  CHROME_STRUCTURAL_FILL_ROLE,
  leafSurfacePhase,
} from './chromeSurfacePolicy';
import { Tooltip } from './InfoTip';

/**
 * A pad of equal compartments — ONE box, with rails instead of gaps.
 *
 * A grid of small square controls is the shape that gets built as N framed buttons in a CSS grid,
 * and then between one glyph and the next the panel shows three edges: a frame rail, a strip of
 * the panel, another frame rail. The 8-way facing compass did it nine times over. Here the frame
 * is the box's, drawn once around all of them; every separation is one of the box's own rails,
 * capped where it meets that frame by a junction the topology places (ADR-0242); and a control is
 * a COMPARTMENT of the box rather than a control standing inside one.
 *
 * The seats are DECLARED as data, in rows. A caller that could pass its own markup could author
 * the space between two of them — which is a rail nothing can cap, because only the box knows
 * where its frame is. Same reason ChromeVerbRow takes verbs rather than children.
 */
export type ChromeSeat = {
  /** Stable identity for the compartment, so React keeps it across content changes. */
  id: string;
  content: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /**
   * Whether this seat is the current choice. `undefined` for a seat that is an ACTION rather than
   * a choice — the compass's rotate key — so it reports no selected state at all.
   */
  selected?: boolean;
  title?: string;
  ariaLabel?: string;
  /**
   * The kit tip for this seat, for a pad whose seats carry only a glyph. `title` is the native
   * attribute, which truncates, delays and vanishes; a seat whose mark IS its whole label needs
   * the tip that appears at once and answers keyboard focus (ADR-0059). Give one or the other.
   */
  tip?: { title: string; body: ReactNode };
  /** The consumer's own mark for this seat; the reset, the material and the geometry stay here. */
  className?: string;
  /** What a live gate presses. A seat is not addressable any other way — it has no element
   *  of the consumer's own to hang a hook on. */
  testId?: string;
};

/**
 * A rectangular pad of seats. `null` is a compartment with nothing in it — the direction menu's
 * hollow centre — which is a real cell of the grid, not a missing one: dropping it would move
 * every seat after it one column to the left.
 */
export function ChromeSeatGrid({
  rows,
  opening = 'var(--chrome-seat-opening)',
  rowOpening,
  className = '',
  rowClassName = '',
  seatClassName = '',
  ariaLabel,
  selection = 'toggle',
}: {
  rows: readonly (readonly (ChromeSeat | null)[])[];
  /**
   * The visible square one compartment presents to its glyph, as a CSS length. Defaults to the
   * pad's own token, which is what a framed tool square gives its glyph — so a seat and a framed
   * control present the same square to the same letter, and no consumer restates the derivation.
   */
  opening?: string;
  /**
   * The visible opening on the BLOCK axis, when a pad is not square. Defaults to `opening`, which
   * is what a pad of square compartments wants and what every consumer wanted until one of them
   * had to fill a fixed-width rail: `opening` is then a share of that width and cannot also be
   * asked of a height, since a percentage block-size against an auto-height grid resolves to
   * nothing. Both axes still go through the one derivation (ADR-0569).
   */
  rowOpening?: string;
  className?: string;
  rowClassName?: string;
  seatClassName?: string;
  ariaLabel: string;
  /**
   * 'radio' when the seats are ONE exclusive choice and the box is the group that holds it;
   * 'toggle' (the default) when each seat reports its own pressed state.
   */
  selection?: 'radio' | 'toggle';
}): ReactElement {
  const columnCount = rows[0]?.length ?? 0;
  if (!columnCount || rows.some((row) => row.length !== columnCount)) {
    throw new Error('A chrome seat grid is rectangular: every row declares the same compartments.');
  }
  // One rule, applied to both axes: a track is the opening plus what the rails on its internal
  // sides take back, and the seat gives the same amount back as padding. Deriving the two halves
  // separately is how unequal compartments shipped (ADR-0569).
  const columns = chromeDividedSeatAxis(columnCount, opening);
  const bands = chromeDividedSeatAxis(rows.length, rowOpening ?? opening);

  return (
    <DividedInnerChromeBox
      className={`chrome-seat-grid ${className}`.trim()}
      columns={columns.tracks}
      fillRole={CHROME_STRUCTURAL_FILL_ROLE}
      role={selection === 'radio' ? 'radiogroup' : 'group'}
      aria-label={ariaLabel}
    >
      {rows.map((seats, rowIndex) => (
        <ChromeDividedGridRow
          key={`row-${rowIndex}`}
          className={`chrome-seat-grid__row ${rowClassName}`.trim()}
          style={{
            blockSize: bands.tracks[rowIndex],
            paddingBlockStart: bands.insets[rowIndex].start,
            paddingBlockEnd: bands.insets[rowIndex].end,
          }}
        >
          {seats.map((seat, columnIndex) => {
            const inset: CSSProperties = {
              paddingInlineStart: columns.insets[columnIndex].start,
              paddingInlineEnd: columns.insets[columnIndex].end,
            };
            if (!seat) {
              return (
                <span
                  key={`empty-${columnIndex}`}
                  className="chrome-seat chrome-seat--empty"
                  style={inset}
                  aria-hidden="true"
                />
              );
            }
            const control = (
              <button
                key={seat.id}
                type="button"
                className={`chrome-seat ${seatClassName} ${seat.className ?? ''} ${seat.selected ? 'is-active' : ''}`.replace(/\s+/g, ' ').trim()}
                // A row of identical controls is cut from one plank run rather than stamping the
                // same grain nine times (ADR-0433); the index is the seat's place in the DATA.
                // With a tip the compartment's inset rides the wrapper instead, because the
                // wrapper is then the grid item and the seat has to fill the opening it leaves.
                style={{ ...(seat.tip ? null : inset), ...leafSurfacePhase(rowIndex * columnCount + columnIndex) }}
                data-chrome-fill-surface={CHROME_LEAF_FILL_SURFACE}
                data-testid={seat.testId}
                disabled={seat.disabled}
                title={seat.title}
                aria-label={seat.ariaLabel}
                role={selection === 'radio' && seat.selected !== undefined ? 'radio' : undefined}
                aria-checked={selection === 'radio' ? seat.selected : undefined}
                aria-pressed={selection === 'radio' ? undefined : seat.selected}
                onClick={seat.onPress}
              >
                {seat.content}
              </button>
            );
            if (!seat.tip) return control;
            return (
              <Tooltip
                key={seat.id}
                className="chrome-seat-tip"
                style={inset}
                label={seat.ariaLabel ?? seat.tip.title}
                title={seat.tip.title}
                triggerIsInteractive
                trigger={control}
              >
                {seat.tip.body}
              </Tooltip>
            );
          })}
        </ChromeDividedGridRow>
      ))}
    </DividedInnerChromeBox>
  );
}
