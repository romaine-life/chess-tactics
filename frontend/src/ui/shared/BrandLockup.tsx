import { type ReactElement } from 'react';

// The single brand lockup used in the top-left of every screen EXCEPT the main
// menu (which gets its own hero treatment). Same mark, same structure, same spot
// everywhere — only `screenName` changes. This is the one source; do not hand-roll
// a per-screen brand mark. Links home, like a logo should.
export function BrandLockup({ screenName }: { screenName: string }): ReactElement {
  return (
    <a className="brand-lockup" href="/" aria-label={`${screenName} — Chess Tactics home`}>
      <img className="brand-lockup-mark" src="/assets/ui/kit/icons/brand-shield.png" alt="" aria-hidden="true" />
      <span className="brand-lockup-copy">
        <strong>{screenName}</strong>
        <em>Chess Tactics</em>
      </span>
    </a>
  );
}
