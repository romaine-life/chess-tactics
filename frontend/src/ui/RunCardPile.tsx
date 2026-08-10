import { type ReactElement, type ReactNode } from 'react';
import { RunCardBack } from './RunCardBack';
import { runCardFloatClock } from './runCardLife';

/**
 * One physical Run-card pile: an optional face registered directly over one
 * face-down card. Removing the face reveals the back without changing the
 * pile's seat or implying that another offer is available.
 */
export function RunCardPile({
  backMediaUrl,
  lockMediaUrl = null,
  locked = false,
  seatIndex,
  children,
}: {
  backMediaUrl: string;
  /**
   * The padlock this pile lays on its face when `locked`. Supplied for the whole visit rather
   * than at the moment of locking, and concealed until then for the same reason the back is: a
   * lock mounted only once it is needed is fetched and decoded only once it is needed, and the
   * survivors of an Adlectio stand there unmarked for the interval.
   */
  lockMediaUrl?: string | null;
  /**
   * Whether the offer on this pile is no longer to be had — a Sectio admits one card, and the
   * rest of the row locks when it is spent. It is a lock on the OFFER, so a revealed back never
   * shows one: it has no offer left to lock.
   */
  locked?: boolean;
  /**
   * The pile's place in the row, which makes it drift and glow on its own clock. The WHOLE
   * pile carries that life rather than the face alone: the back is registered exactly beneath
   * the face, so a face that drifted by itself would show a sliver of the back it is meant to
   * be hiding.
   *
   * A pile that has been bought from has nothing left to offer and goes still.
   *
   * A LOCKED pile keeps the class and is settled by it (`is-locked` in style.css) rather than
   * having it taken away: the life is the card asking to be picked up -- it drifts and it throws
   * gold light -- and a lock has to end both. Dropping the class ends them by deleting the
   * animation, which snaps a mid-drift card back onto its seat. Settling through the class eases
   * it down exactly as a hovered card comes to rest.
   */
  seatIndex?: number;
  children?: ReactNode;
}): ReactElement {
  const covered = children !== null && children !== undefined;
  const alive = covered && typeof seatIndex === 'number';
  // A lock is a statement about an OFFER, so a seat whose face is gone is untouched by one: a
  // host may say the whole row is locked without having to except the seat it just bought from.
  const sealed = covered && locked;
  return (
    <span
      className={`run-card-pile${covered ? ' is-covered' : ' is-revealed'}${alive ? ' run-card-alive' : ''}${sealed ? ' is-locked' : ''}`}
      data-run-card-pile={covered ? 'covered' : 'revealed'}
      style={alive ? runCardFloatClock(seatIndex) : undefined}
    >
      <span className="run-card-pile-back" aria-hidden="true">
        <RunCardBack mediaUrl={backMediaUrl} />
      </span>
      {children}
      {covered && lockMediaUrl ? (
        // Decorative: the offer beneath it is a disabled control, which is what carries the
        // state to assistive technology. The lock is what carries it to the eye.
        <span
          className={`run-card-pile-lock${sealed ? ' is-locked' : ''}`}
          data-run-card-pile-lock={sealed ? 'locked' : 'open'}
          aria-hidden="true"
        >
          <img src={lockMediaUrl} alt="" draggable={false} />
        </span>
      ) : null}
    </span>
  );
}
