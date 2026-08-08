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
  seatIndex,
  children,
}: {
  backMediaUrl: string;
  /**
   * The pile's place in the row, which makes it drift and glow on its own clock. The WHOLE
   * pile carries that life rather than the face alone: the back is registered exactly beneath
   * the face, so a face that drifted by itself would show a sliver of the back it is meant to
   * be hiding. A pile that has been bought from has nothing left to offer and goes still.
   */
  seatIndex?: number;
  children?: ReactNode;
}): ReactElement {
  const covered = children !== null && children !== undefined;
  const alive = covered && typeof seatIndex === 'number';
  return (
    <span
      className={`run-card-pile${covered ? ' is-covered' : ' is-revealed'}${alive ? ' run-card-alive' : ''}`}
      data-run-card-pile={covered ? 'covered' : 'revealed'}
      style={alive ? runCardFloatClock(seatIndex) : undefined}
    >
      <span className="run-card-pile-back" aria-hidden="true">
        <RunCardBack mediaUrl={backMediaUrl} />
      </span>
      {children}
    </span>
  );
}
