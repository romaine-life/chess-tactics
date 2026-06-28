import { type ReactElement } from 'react';

// The single brand lockup used in the top-left of every screen. Same mark, same
// structure, same spot everywhere — only `screenName` changes. On the home/entry
// route, pass variant="brand-hero": the entry screen IS the title screen, so the
// game title becomes the dominant line and the screen name ("Main Menu") drops to
// the small subordinate slot. Same slots/structure either way; only the
// size/weight/colour ratio of the two lines flips. This is the one source; do not
// hand-roll a per-screen brand mark. Links home, like a logo should.
export function BrandLockup({
  screenName,
  variant = 'default',
}: {
  screenName: string;
  variant?: 'default' | 'brand-hero';
}): ReactElement {
  const className = variant === 'brand-hero' ? 'brand-lockup brand-lockup--brand-hero' : 'brand-lockup';
  return (
    <a className={className} href="/" aria-label={`${screenName} — Chess Tactics home`}>
      <img className="brand-lockup-mark" src="/assets/ui/kit/icons/brand-shield.png" alt="" aria-hidden="true" />
      <span className="brand-lockup-copy">
        <strong>{screenName}</strong>
        <em>Chess Tactics</em>
      </span>
    </a>
  );
}
