import { type ReactElement, type ReactNode } from 'react';
import { RunCardBack } from './RunCardBack';

/**
 * One physical Run-card pile: an optional face registered directly over one
 * face-down card. Removing the face reveals the back without changing the
 * pile's seat or implying that another offer is available.
 */
export function RunCardPile({
  backMediaUrl,
  children,
}: {
  backMediaUrl: string;
  children?: ReactNode;
}): ReactElement {
  const covered = children !== null && children !== undefined;
  return (
    <span
      className={`run-card-pile${covered ? ' is-covered' : ' is-revealed'}`}
      data-run-card-pile={covered ? 'covered' : 'revealed'}
    >
      <span className="run-card-pile-back" aria-hidden="true">
        <RunCardBack mediaUrl={backMediaUrl} />
      </span>
      {children}
    </span>
  );
}
