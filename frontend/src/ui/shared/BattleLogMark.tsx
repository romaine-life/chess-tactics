import type { ReactElement } from 'react';
import type { LogEntry, LogMark } from '../../game/store';
import { moveNumberFor } from '../../game/moveReview';
import { installedUiMedia, installedUiMediaIfPresent } from '../installedUiMedia';

/**
 * The marks an Event Log prose line wears, drawn in the column the move numbers take.
 *
 * A reader takes a glyph faster than a word, so a mark here REPLACES the word that classified
 * the line rather than sitting next to it: "Checkmate — defeat." is the grave and the word
 * *Checkmate*, and "Check!" is the mark alone. What is left in the text is only what the mark
 * cannot say.
 *
 * Two marks are borrowed rather than forged, because the game already draws those exact facts
 * and two drawings of one fact is the defect (ADR-0059): `clock` is the persistent title bar's
 * hourglass, the same glyph the battle clock wears two inches above this row, and `objective`
 * is that bar's objective flag.
 *
 * **The two gold marks are forged, and the reason is a distinction that caused a real bug.**
 * The Run's `RunGoldIcon` is a RESOURCE mark: it means "gold", with no direction. What a log
 * row needs is a TRANSACTION mark: gold arriving, or gold leaving. Drawing the neutral coin on
 * a payout put a bare number under an undirected glyph and left the reader to work out whether
 * five gold was won or spent. The Run does own a loss transaction mark — coins scattering
 * behind a red arrow — but it is a different composition from anything that could pair with it,
 * and a log row wants the PAIR to differ in one stroke rather than in their whole silhouette.
 * So both are one drawing: the coin stack the game already uses, carrying a green plus or a red
 * minus. Same stack, same seat, opposite sign — which is the fastest possible read.
 *
 * Every forged seat is RESERVED rather than fail-closed (ADR-0318): it holds its geometry
 * before any art decision exists, so installing one later cannot shift the line beside it. The
 * borrowed marks resolve required roles and fail closed, because a Battle log quietly missing
 * the clock is worse than one that says so.
 */

/** The marks that need art of their own, and the `app-ui` role each resolves through. ONE
 *  lookup per mark, so a second seat for the same fact cannot answer to different art. */
export const BATTLE_LOG_MARK_MEDIA_ROLE = Object.freeze({
  check: 'ui-kit-icons-game-check-png',
  victory: 'ui-kit-icons-game-victory-png',
  defeat: 'ui-kit-icons-game-defeat-png',
  draw: 'ui-kit-icons-game-draw-png',
  checkmate: 'ui-kit-icons-game-checkmate-png',
  resign: 'ui-kit-icons-game-resign-png',
  gold: 'ui-kit-icons-game-gold-png',
  'gold-loss': 'ui-kit-icons-game-gold-loss-png',
} as const);

/** The live-media slot behind each, named for review and installation. */
export const BATTLE_LOG_MARK_SLOT = Object.freeze({
  check: 'ui/kit/icons/game/check.png',
  victory: 'ui/kit/icons/game/victory.png',
  defeat: 'ui/kit/icons/game/defeat.png',
  draw: 'ui/kit/icons/game/draw.png',
  checkmate: 'ui/kit/icons/game/checkmate.png',
  resign: 'ui/kit/icons/game/resign.png',
  gold: 'ui/kit/icons/game/gold.png',
  'gold-loss': 'ui/kit/icons/game/gold-loss.png',
} as const);

/** A mark whose art this seat owns, as opposed to one it borrows from elsewhere. */
export type BattleLogForgedMark = keyof typeof BATTLE_LOG_MARK_SLOT;

/** Outcome marks first, then the causes they pair with — the order a row wears them, and the
 *  order the review page offers the decisions in. */
export const BATTLE_LOG_FORGED_MARKS: readonly BattleLogForgedMark[] =
  Object.freeze(['victory', 'defeat', 'draw', 'checkmate', 'resign', 'check', 'gold', 'gold-loss'] as const);

export function isBattleLogForgedMark(mark: LogMark): mark is BattleLogForgedMark {
  return (BATTLE_LOG_FORGED_MARKS as readonly string[]).includes(mark);
}

/** Marks the game already draws elsewhere. The log borrows the exact installed bytes rather
 *  than forging a lookalike, so a row and the screen beside it cannot disagree (ADR-0059). */
const CLOCK_MEDIA_ROLE = 'ui-kit-icons-game-wait-png';
const OBJECTIVE_MEDIA_ROLE = 'ui-kit-icons-game-objective-png';

/** The installed art for one forged mark, or null while that seat is still reserved. */
export function battleLogForgedMarkUrl(mark: BattleLogForgedMark): string | null {
  return installedUiMediaIfPresent(BATTLE_LOG_MARK_MEDIA_ROLE[mark]);
}

/**
 * What each mark means, for the row's accessible name.
 *
 * These are not decoration: a mark REPLACES the word that classified the line, so for several
 * rows this label is the only place that word still exists. A screen reader reading
 * "Defeat, Clock — Out of time" gets the sentence the sighted reader assembles from the glyphs.
 */
const MARK_LABEL: Readonly<Record<LogMark, string>> = Object.freeze({
  objective: 'Objective',
  check: 'Check',
  victory: 'Victory',
  defeat: 'Defeat',
  draw: 'Draw',
  checkmate: 'Checkmate',
  resign: 'Resigned',
  clock: 'Out of time',
  gold: 'Gold claimed',
  'gold-loss': 'Gold paid',
});

function markMedia(mark: LogMark, forgedSrc: Partial<Record<BattleLogForgedMark, string>>): ReactElement | null {
  if (mark === 'clock') return <img src={installedUiMedia(CLOCK_MEDIA_ROLE)} alt="" draggable={false} />;
  if (mark === 'objective') return <img src={installedUiMedia(OBJECTIVE_MEDIA_ROLE)} alt="" draggable={false} />;
  const src = forgedSrc[mark] ?? battleLogForgedMarkUrl(mark);
  return src ? <img src={src} alt="" draggable={false} /> : null;
}

/**
 * The marks for one log row, in the order they were written.
 *
 * A row may wear two, because outcome and cause are different facts: a flag fall is a defeat
 * AND it is the clock. They share the number column rather than pushing the text across,
 * so a marked prose row and an unmarked one start at the same place.
 *
 * `forgedSrc` is how the Studio review surface paints exact candidate bytes in the real seats
 * without installing them. A play route never passes it and resolves the installed roles only
 * — review state has no business on a player route (ADR-0058).
 */
export function BattleLogMarks({
  marks,
  forgedSrc = {},
}: {
  marks: readonly LogMark[] | undefined;
  /** Review-only: exact candidate bytes to paint, per forged mark. */
  forgedSrc?: Partial<Record<BattleLogForgedMark, string>>;
}): ReactElement | null {
  if (!marks?.length) return null;
  return (
    <span className="skirmish-log-marks" aria-label={marks.map((mark) => MARK_LABEL[mark]).join(', ')}>
      {marks.map((mark) => (
        <span key={mark} className={`skirmish-log-mark is-${mark}`} data-battle-log-mark={mark}>
          {markMedia(mark, forgedSrc)}
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
  forgedSrc,
}: {
  entry: LogEntry;
  seat?: number | null;
  showing?: boolean;
  onReview?: (seat: number) => void;
  /** Review-only: exact candidate bytes to paint, per forged mark. */
  forgedSrc?: Partial<Record<BattleLogForgedMark, string>>;
}): ReactElement {
  const className = `${entry.side ? `is-move is-${entry.side}` : 'is-note'}${showing ? ' is-showing' : ''}`;
  // A prose row spends the move-number column on its marks, so the score sheet stays one
  // grid and the text after either starts in the same place.
  const lead = entry.marks?.length
    ? <BattleLogMarks marks={entry.marks} forgedSrc={forgedSrc} />
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
