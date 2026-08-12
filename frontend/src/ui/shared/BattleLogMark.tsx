import type { ReactElement } from 'react';
import type { LogEntry, LogMark } from '../../game/store';
import { moveNumberFor } from '../../game/moveReview';
import { installedUiMedia, installedUiMediaIfPresent } from '../installedUiMedia';
import { RunGoldIcon } from '../RunResources';

/**
 * The mark one Event Log prose line wears, drawn in the column the move numbers take.
 *
 * The log is a score sheet, and a score sheet is scanned before it is read. A move row is
 * already named by its notation; a prose row was three shades of the same grey, so "you lost
 * on time" and "that fork paid" looked identical at arm's length. These say which is which.
 *
 * None of the three is new art invented for this seat — each is the mark the game ALREADY
 * uses for that fact, so the log agrees with the screen it sits beside (ADR-0059):
 *
 * - `clock` is the persistent title bar's hourglass, the same glyph the battle clock wears
 *   two inches above this row.
 * - `gold` is the Run's own coin, resolved through `RunGoldIcon` — the same component the
 *   board's rising +gold marker draws, so the number that floats off a square and the line
 *   that records it cannot show two different coins.
 * - `defeat` is the one mark with no existing home, so it gets its own slot in the kit's
 *   game-icon family.
 *
 * The defeat seat is RESERVED rather than fail-closed (ADR-0318): it holds its geometry
 * before any art decision exists, so installing one later cannot shift the line beside it.
 * The other two resolve required roles and fail closed, because they are already installed
 * chrome and a Battle log quietly missing the clock is worse than a Battle log that says so.
 */
export const BATTLE_LOG_MARK_MEDIA_ROLE = 'ui-kit-icons-game-defeat-png';

/** The live-media slot behind the defeat mark, named for review and installation. */
export const BATTLE_LOG_MARK_SLOT = 'ui/kit/icons/game/defeat.png';

/** The title bar's hourglass, reused verbatim rather than forged a second time. */
const CLOCK_MEDIA_ROLE = 'ui-kit-icons-game-wait-png';

/** The installed defeat mark, or null while the seat is still reserved. */
export function battleLogDefeatMarkUrl(): string | null {
  return installedUiMediaIfPresent(BATTLE_LOG_MARK_MEDIA_ROLE);
}

/** What each mark means, for the row's accessible name. The words a screen reader says
 *  here are the words the line already says, so the mark adds emphasis, not vocabulary. */
const MARK_LABEL: Readonly<Record<LogMark, string>> = Object.freeze({
  defeat: 'Defeat',
  clock: 'Clock',
  gold: 'Gold',
});

function markMedia(mark: LogMark, defeatSrc: string | null): ReactElement | null {
  if (mark === 'gold') return <RunGoldIcon />;
  if (mark === 'clock') return <img src={installedUiMedia(CLOCK_MEDIA_ROLE)} alt="" draggable={false} />;
  return defeatSrc ? <img src={defeatSrc} alt="" draggable={false} /> : null;
}

/**
 * The marks for one log row, in the order they were written.
 *
 * A row may wear two, because outcome and cause are different facts: a flag fall is a defeat
 * AND it is the clock. They share the number column rather than pushing the text across,
 * so a marked prose row and an unmarked one start at the same place.
 *
 * `defeatSrc` is how the Studio review surface paints exact candidate bytes in the real seat
 * without installing them. A play route never passes it and resolves the installed role only
 * — review state has no business on a player route (ADR-0058).
 */
export function BattleLogMarks({
  marks,
  defeatSrc,
}: {
  marks: readonly LogMark[] | undefined;
  /** Review-only: the exact candidate bytes to paint in the defeat seat. */
  defeatSrc?: string;
}): ReactElement | null {
  if (!marks?.length) return null;
  const defeat = defeatSrc ?? battleLogDefeatMarkUrl();
  return (
    <span className="skirmish-log-marks" aria-label={marks.map((mark) => MARK_LABEL[mark]).join(', ')}>
      {marks.map((mark) => (
        <span key={mark} className={`skirmish-log-mark is-${mark}`} data-battle-log-mark={mark}>
          {markMedia(mark, defeat)}
        </span>
      ))}
    </span>
  );
}

/**
 * The score sheet's move number for one row: `12.` for the half-move that opens a full move
 * and `12…` for the reply, which is how a score sheet says whose move it was without a second
 * column. Rows that are not moves carry no number and spend that column on their marks.
 */
export function moveNumberLabel(entry: LogEntry): string {
  if (entry.ply === undefined) return '';
  return moveNumberFor(entry.ply);
}

/**
 * ONE Event Log row — `[side rail][move number or marks][notation or prose]`.
 *
 * It lives here rather than inline in the HUD because the Studio review surface has to mount
 * the row the player actually gets. A review page that re-types the markup is a page that can
 * agree with itself while disagreeing with the log ([ADR-0059](../../../../docs/adr/0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)),
 * and the thing being judged there is exactly how a mark sits in this row.
 *
 * `seat` is the recorded position this row can take the player back to, or null when there is
 * nothing to show — a prose row, or a move from a match resumed without its history.
 */
export function EventLogRow({
  entry,
  seat = null,
  showing = false,
  onReview,
  defeatSrc,
}: {
  entry: LogEntry;
  seat?: number | null;
  showing?: boolean;
  onReview?: (seat: number) => void;
  /** Review-only: the exact candidate bytes to paint in the defeat seat. */
  defeatSrc?: string;
}): ReactElement {
  const className = `${entry.side ? `is-move is-${entry.side}` : 'is-note'}${showing ? ' is-showing' : ''}`;
  // A prose row spends the move-number column on its marks, so the score sheet stays one
  // grid and the text after either starts in the same place.
  const lead = entry.marks?.length
    ? <BattleLogMarks marks={entry.marks} defeatSrc={defeatSrc} />
    : moveNumberLabel(entry);
  return (
    <li className={className}>
      <span aria-hidden="true" />
      {seat === null || !onReview ? (
        <>
          <strong>{lead}</strong>
          <em>{entry.text}</em>
        </>
      ) : (
        <button
          type="button"
          className="skirmish-log-move"
          aria-current={showing ? 'true' : undefined}
          onClick={() => onReview(seat)}
        >
          <strong>{lead}</strong>
          <em>{entry.text}</em>
        </button>
      )}
    </li>
  );
}
